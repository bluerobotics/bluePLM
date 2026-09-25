using System.ComponentModel;
using System.Globalization;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace BluePLM.EDrawingsPreviewHost;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        HostDiagnostics.Write("Host process started.");
        var options = ParseOptions(args);
        if (options is null || !File.Exists(options.DocumentPath))
        {
            HostDiagnostics.Write("The requested document path is unavailable.");
            Environment.ExitCode = 2;
            return;
        }
        try { Application.Run(new PreviewHostForm(options)); }
        catch (Exception exception)
        {
            HostDiagnostics.Write($"Host startup failed: {exception}");
            Environment.ExitCode = 3;
        }
    }

    private static PreviewHostOptions? ParseOptions(IReadOnlyList<string> args)
    {
        string? documentPath = null;
        string? handleFilePath = null;
        // eDrawings completes document loading in an owned top-level preview
        // window. Re-parenting it as a Chromium child produces a blank GPU
        // surface even after OnFinishedLoadingDocument, so this is the normal
        // production path; the alternatives are diagnostic-only.
        var mode = PreviewHostMode.Direct;
        var embedding = PreviewHostEmbedding.Owned;
        nint parentWindow = 0;
        var x = 0; var y = 0; var width = 1; var height = 1;
        for (var index = 0; index + 1 < args.Count; index++)
        {
            if (string.Equals(args[index], "--file", StringComparison.OrdinalIgnoreCase)) documentPath = Path.GetFullPath(args[index + 1]);
            else if (string.Equals(args[index], "--handle-file", StringComparison.OrdinalIgnoreCase)) handleFilePath = Path.GetFullPath(args[index + 1]);
            else if (string.Equals(args[index], "--mode", StringComparison.OrdinalIgnoreCase)) mode = string.Equals(args[index + 1], "browser", StringComparison.OrdinalIgnoreCase) ? PreviewHostMode.Browser : PreviewHostMode.Direct;
            else if (string.Equals(args[index], "--embedding", StringComparison.OrdinalIgnoreCase)) embedding = string.Equals(args[index + 1], "child", StringComparison.OrdinalIgnoreCase) ? PreviewHostEmbedding.Child : PreviewHostEmbedding.Owned;
            else if (string.Equals(args[index], "--parent", StringComparison.OrdinalIgnoreCase))
            {
                _ = long.TryParse(args[index + 1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var value);
                parentWindow = (nint)value;
            }
            else if (string.Equals(args[index], "--bounds", StringComparison.OrdinalIgnoreCase) && index + 4 < args.Count)
            {
                _ = int.TryParse(args[index + 1], NumberStyles.Integer, CultureInfo.InvariantCulture, out x);
                _ = int.TryParse(args[index + 2], NumberStyles.Integer, CultureInfo.InvariantCulture, out y);
                _ = int.TryParse(args[index + 3], NumberStyles.Integer, CultureInfo.InvariantCulture, out width);
                _ = int.TryParse(args[index + 4], NumberStyles.Integer, CultureInfo.InvariantCulture, out height);
                index += 3;
            }
        }
        return documentPath is null ? null : new PreviewHostOptions(documentPath, handleFilePath, mode, embedding, parentWindow, x, y, Math.Max(1, width), Math.Max(1, height));
    }
}

/// <summary>Isolated legacy eDrawings experiment; it always has an external fallback.</summary>
internal enum PreviewHostMode { Browser, Direct }
internal enum PreviewHostEmbedding { Child, Owned }

internal sealed class PreviewHostForm : Form
{
    private readonly string _documentPath;
    private readonly PreviewHostOptions _options;
    private readonly WebBrowser? _browser;
    private readonly EDrawingsAxHost? _directControl;
    private Delegate? _finishedLoadingHandler;
    private Delegate? _failedLoadingHandler;
    private bool _documentLoadScheduled;

    public PreviewHostForm(PreviewHostOptions options)
    {
        _documentPath = options.DocumentPath;
        _options = options;
        Text = "BluePLM eDrawings Preview Host";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        Bounds = new System.Drawing.Rectangle(-32000, -32000, 1, 1);
        BackColor = System.Drawing.Color.Black;
        var controlClassId = EDrawingsRegistration.ResolveControlClassId();
        if (_options.Mode == PreviewHostMode.Direct)
        {
            _directControl = new EDrawingsAxHost(controlClassId) { Dock = DockStyle.Fill };
            Controls.Add(_directControl);
        }
        else
        {
            _browser = new WebBrowser { Dock = DockStyle.Fill, AllowWebBrowserDrop = false, IsWebBrowserContextMenuEnabled = false, ScriptErrorsSuppressed = true, WebBrowserShortcutsEnabled = false };
            _browser.DocumentCompleted += OnBrowserDocumentCompleted;
            Controls.Add(_browser);
        }
        Shown += OnShown;
    }

    protected override void OnHandleCreated(EventArgs args)
    {
        base.OnHandleCreated(args);
        HostDiagnostics.Write($"Host form handle created: {Handle}.");
        WriteHandleFile();
    }

    private void OnShown(object? sender, EventArgs args)
    {
        if (_options.ParentWindow != 0 && _options.Embedding == PreviewHostEmbedding.Owned)
        {
            NativeWindow.OwnAndPosition(Handle, _options.ParentWindow, _options.X, _options.Y, _options.Width, _options.Height);
            HostDiagnostics.Write("Host form positioned as an owned preview window.");
        }
        else if (_options.ParentWindow != 0)
        {
            NativeWindow.EmbedChild(Handle, _options.ParentWindow, _options.X, _options.Y, _options.Width, _options.Height);
            HostDiagnostics.Write("Host form embedded by its own UI process.");
        }
        BeginInvoke(_options.Mode == PreviewHostMode.Direct ? OpenDirectDocument : CreateBrowserDocument);
    }

    private void WriteHandleFile()
    {
        if (string.IsNullOrWhiteSpace(_options.HandleFilePath)) return;
        try
        {
            File.WriteAllText(_options.HandleFilePath, Handle.ToInt64().ToString(CultureInfo.InvariantCulture));
            HostDiagnostics.Write("Host window handle handshake completed.");
        }
        catch (Exception exception)
        {
            HostDiagnostics.Write($"Host window handle handshake failed: {exception.Message}");
        }
    }

    private void CreateBrowserDocument()
    {
        var controlClassId = EDrawingsRegistration.ResolveControlClassId();
        _browser!.DocumentText = $$"""
            <!DOCTYPE html><html><body style="margin:0;overflow:hidden;background:#111">
            <object id="edrawings" classid="CLSID:{{controlClassId:B}}" style="width:100%;height:100%"></object>
            <script>function blueplmOpen(path){document.getElementById('edrawings').OpenDoc(path,false,false,true,'');}</script>
            </body></html>
            """;
    }

    private void OnBrowserDocumentCompleted(object? sender, WebBrowserDocumentCompletedEventArgs args)
    {
        if (_documentLoadScheduled || _browser?.Document?.GetElementById("edrawings") is null) return;
        _documentLoadScheduled = true;
        BeginInvoke(OpenDocument);
    }

    private void OpenDocument()
    {
        try
        {
            var document = _browser?.Document ?? throw new COMException("The eDrawings browser document was not created.");
            HostDiagnostics.Write("Calling eDrawings OpenDoc through the browser script path.");
            _ = document.InvokeScript("blueplmOpen", [_documentPath]);
            HostDiagnostics.Write("eDrawings OpenDoc returned.");
        }
        catch (Exception exception)
        {
            HostDiagnostics.Write($"eDrawings OpenDoc failed: {exception}");
            Text = "BluePLM eDrawings Preview Host (failed)";
        }
    }

    private void OpenDirectDocument()
    {
        try
        {
            var control = _directControl ?? throw new COMException("The direct eDrawings control was not created.");
            control.CreateControl();
            var activeX = control.ActiveXInstance ?? throw new COMException("The direct eDrawings ActiveX instance was not created.");
            SubscribeToDirectLoadEvents(activeX);
            HostDiagnostics.Write("Calling eDrawings OpenDoc through the direct AxHost path.");
            _ = activeX.GetType().InvokeMember("OpenDoc", BindingFlags.InvokeMethod, null, activeX, [_documentPath, false, false, true, string.Empty]);
            HostDiagnostics.Write("Direct eDrawings OpenDoc returned.");
        }
        catch (Exception exception)
        {
            HostDiagnostics.Write($"Direct eDrawings OpenDoc failed: {exception}");
            Text = "BluePLM eDrawings Preview Host (failed)";
        }
    }

    private void SubscribeToDirectLoadEvents(object activeX)
    {
        const int finishedLoadingDocument = 3;
        const int failedLoadingDocument = 5;
        var eventsInterface = new Guid("FAF8BA5F-B123-4A1D-BF3A-237038BB35E7");
        _finishedLoadingHandler = (Action<string>)(fileName => HostDiagnostics.Write($"eDrawings event: finished loading '{fileName}'."));
        _failedLoadingHandler = (Action<string, int, string>)((fileName, errorCode, message) => HostDiagnostics.Write($"eDrawings event: failed loading '{fileName}' ({errorCode}): {message}"));
        ComEventsHelper.Combine(activeX, eventsInterface, finishedLoadingDocument, _finishedLoadingHandler);
        ComEventsHelper.Combine(activeX, eventsInterface, failedLoadingDocument, _failedLoadingHandler);
        HostDiagnostics.Write("Subscribed to eDrawings document-load events.");
    }
}

internal sealed record PreviewHostOptions(string DocumentPath, string? HandleFilePath, PreviewHostMode Mode, PreviewHostEmbedding Embedding, nint ParentWindow, int X, int Y, int Width, int Height);

internal sealed class EDrawingsAxHost(Guid classId) : AxHost(classId.ToString("B"))
{
    public object? ActiveXInstance => GetOcx();
}

internal static class HostDiagnostics
{
    private static readonly string LogPath = Path.Combine(Path.GetTempPath(), $"BluePLM-eDrawings-host-{Environment.ProcessId}.log");
    public static void Write(string message)
    {
        try { File.AppendAllText(LogPath, $"{DateTimeOffset.Now:O} {message}{Environment.NewLine}"); } catch { }
    }
}

internal static class NativeWindow
{
    private const int GwlStyle = -16;
    private const int GwlHwndParent = -8;
    private const nint WsChild = 0x40000000;
    private static readonly nint WsPopup = unchecked((nint)(long)0x80000000);
    private const uint SwpNoActivate = 0x0010;
    private const uint SwpNoZOrder = 0x0004;
    private const uint SwpShowWindow = 0x0040;
    [DllImport("user32.dll", SetLastError = true)] private static extern nint SetParent(nint childWindow, nint newParent);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)] private static extern nint GetWindowLongPtr(nint window, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)] private static extern nint SetWindowLongPtr(nint window, int index, nint value);
    [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowPos(nint window, nint insertAfter, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ClientToScreen(nint window, ref System.Drawing.Point point);
    public static void EmbedChild(nint childWindow, nint parentWindow, int x, int y, int width, int height)
    {
        var style = GetWindowLongPtr(childWindow, GwlStyle);
        _ = SetWindowLongPtr(childWindow, GwlStyle, (style & ~WsPopup) | WsChild);
        if (SetParent(childWindow, parentWindow) == 0) throw new Win32Exception(Marshal.GetLastWin32Error(), "Windows rejected the eDrawings host parent window.");
        if (!SetWindowPos(childWindow, 0, x, y, width, height, SwpNoActivate | SwpNoZOrder | SwpShowWindow)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Windows could not size the eDrawings host.");
    }
    public static void OwnAndPosition(nint ownedWindow, nint ownerWindow, int x, int y, int width, int height)
    {
        var point = new System.Drawing.Point(x, y);
        if (!ClientToScreen(ownerWindow, ref point)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Windows could not resolve the BluePLM preview position.");
        Marshal.SetLastPInvokeError(0);
        _ = SetWindowLongPtr(ownedWindow, GwlHwndParent, ownerWindow);
        var ownershipError = Marshal.GetLastPInvokeError();
        if (ownershipError != 0) throw new Win32Exception(ownershipError, "Windows could not assign the BluePLM preview owner.");
        // HWND_TOPMOST made the preview outlive/minimize independently from
        // BluePLM and cover unrelated applications.  A normal owned window is
        // kept above its owner without becoming globally always-on-top.
        if (!SetWindowPos(ownedWindow, 0, point.X, point.Y, width, height, SwpNoActivate | SwpShowWindow)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Windows could not position the owned eDrawings preview.");
    }
}

internal static class EDrawingsRegistration
{
    public static Guid ResolveControlClassId()
    {
        var controlType = Type.GetTypeFromProgID("EModelView.EModelViewControl", throwOnError: false);
        if (controlType is null || controlType.GUID == Guid.Empty) throw new COMException("The registered eDrawings ActiveX control could not be located.", unchecked((int)0x80040154));
        return controlType.GUID;
    }
}
