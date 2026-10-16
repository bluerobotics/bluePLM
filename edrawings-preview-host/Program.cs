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
        var options = ParseOptions(args);
        if (options is null || !File.Exists(options.DocumentPath))
        {
            if (options is not null) HostStatusFile.Write(options.StatusFilePath, "failed", 0);
            Environment.ExitCode = 2;
            return;
        }
        try
        {
            Application.Run(new PreviewHostForm(options));
        }
        catch
        {
            HostStatusFile.Write(options.StatusFilePath, "failed", 0);
            Environment.ExitCode = 3;
        }
    }

    private static PreviewHostOptions? ParseOptions(IReadOnlyList<string> args)
    {
        string? documentPath = null;
        string? statusFilePath = null;
        nint parentWindow = 0;
        var x = 0;
        var y = 0;
        var width = 1;
        var height = 1;
        for (var index = 0; index + 1 < args.Count; index++)
        {
            if (string.Equals(args[index], "--file", StringComparison.OrdinalIgnoreCase)) documentPath = Path.GetFullPath(args[index + 1]);
            else if (string.Equals(args[index], "--status-file", StringComparison.OrdinalIgnoreCase)) statusFilePath = Path.GetFullPath(args[index + 1]);
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
        return documentPath is null || statusFilePath is null
            ? null
            : new PreviewHostOptions(documentPath, statusFilePath, parentWindow, x, y, Math.Max(1, width), Math.Max(1, height));
    }
}

internal sealed class PreviewHostForm : Form
{
    private readonly PreviewHostOptions _options;
    private readonly EDrawingsAxHost _control;
    private Delegate? _finishedLoadingHandler;
    private Delegate? _failedLoadingHandler;
    private int _terminalStatusWritten;
    private string _openDocumentResult = "not-called";

    public PreviewHostForm(PreviewHostOptions options)
    {
        _options = options;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        Bounds = new System.Drawing.Rectangle(-32000, -32000, 1, 1);
        BackColor = System.Drawing.Color.Black;
        _control = new EDrawingsAxHost(EDrawingsRegistration.ResolveControlClassId()) { Dock = DockStyle.Fill };
        Controls.Add(_control);
        Shown += OnShown;
    }

    protected override void OnHandleCreated(EventArgs args)
    {
        base.OnHandleCreated(args);
        HostStatusFile.Write(_options.StatusFilePath, "handshake", Handle);
    }

    private void OnShown(object? sender, EventArgs args)
    {
        try
        {
            NativeWindow.OwnAndPosition(Handle, _options.ParentWindow, _options.X, _options.Y, _options.Width, _options.Height);
            BeginInvoke(OpenDocument);
        }
        catch
        {
            PublishTerminalStatus("failed");
            BeginInvoke(Close);
        }
    }

    private void OpenDocument()
    {
        try
        {
            _control.CreateControl();
            var activeX = _control.ActiveXInstance ?? throw new COMException("The eDrawings ActiveX instance was not created.");
            SubscribeToLoadEvents(activeX);
            // IEModelViewControl.OpenDoc(file, isTemp, promptToSave, readOnly,
            // commandString): keep the source, suppress save prompts, request a
            // read-only view, and pass the documented empty command string.
            var openDocumentResult = activeX.GetType().InvokeMember("OpenDoc", BindingFlags.InvokeMethod, null, activeX,
                [_options.DocumentPath, false, false, true, string.Empty]);
            _openDocumentResult = DescribeOpenDocumentResult(openDocumentResult);
        }
        catch
        {
            PublishTerminalStatus("failed");
            BeginInvoke(Close);
        }
    }

    private void SubscribeToLoadEvents(object activeX)
    {
        const int finishedLoadingDocument = 3;
        const int failedLoadingDocument = 5;
        var eventsInterface = new Guid("FAF8BA5F-B123-4A1D-BF3A-237038BB35E7");
        _finishedLoadingHandler = (Action<string>)(_ => PublishTerminalStatus("ready"));
        _failedLoadingHandler = (Action<string, int, string>)((_, _, _) =>
        {
            PublishTerminalStatus("failed");
            BeginInvoke(Close);
        });
        ComEventsHelper.Combine(activeX, eventsInterface, finishedLoadingDocument, _finishedLoadingHandler);
        ComEventsHelper.Combine(activeX, eventsInterface, failedLoadingDocument, _failedLoadingHandler);
    }

    private void PublishTerminalStatus(string status)
    {
        if (Interlocked.Exchange(ref _terminalStatusWritten, 1) != 0) return;
        HostStatusFile.Write(_options.StatusFilePath, status, Handle, _openDocumentResult);
    }

    private static string DescribeOpenDocumentResult(object? result)
    {
        if (result is null) return "null";
        if (result is bool or byte or sbyte or short or ushort or int or uint or long or ulong or float or double or decimal)
            return string.Format(CultureInfo.InvariantCulture, "{0}:{1}", result.GetType().Name, result);
        return result.GetType().Name;
    }
}

internal sealed record PreviewHostOptions(string DocumentPath, string StatusFilePath, nint ParentWindow, int X, int Y, int Width, int Height);

internal sealed class EDrawingsAxHost(Guid classId) : AxHost(classId.ToString("B"))
{
    public object? ActiveXInstance => GetOcx();
}

internal static class NativeWindow
{
    private const int GwlHwndParent = -8;
    private const uint SwpNoActivate = 0x0010;
    private const uint SwpNoZOrder = 0x0004;
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)] private static extern nint SetWindowLongPtr(nint window, int index, nint value);
    [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowPos(nint window, nint insertAfter, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ClientToScreen(nint window, ref System.Drawing.Point point);

    public static void OwnAndPosition(nint ownedWindow, nint ownerWindow, int x, int y, int width, int height)
    {
        if (ownerWindow == 0) throw new Win32Exception("The BluePLM preview owner window is unavailable.");
        var point = new System.Drawing.Point(x, y);
        if (!ClientToScreen(ownerWindow, ref point)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Windows could not resolve the BluePLM preview position.");
        Marshal.SetLastPInvokeError(0);
        _ = SetWindowLongPtr(ownedWindow, GwlHwndParent, ownerWindow);
        var ownershipError = Marshal.GetLastPInvokeError();
        if (ownershipError != 0) throw new Win32Exception(ownershipError, "Windows could not assign the BluePLM preview owner.");
        // The process starts hidden. Electron shows it only after document readiness
        // and after the renderer confirms that no menu, dialog, or tooltip covers it.
        if (!SetWindowPos(ownedWindow, 0, point.X, point.Y, width, height, SwpNoActivate | SwpNoZOrder))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Windows could not position the eDrawings preview.");
    }
}

internal static class EDrawingsRegistration
{
    public static Guid ResolveControlClassId()
    {
        var controlType = Type.GetTypeFromProgID("EModelView.EModelViewControl", throwOnError: false);
        if (controlType is null || controlType.GUID == Guid.Empty)
            throw new COMException("The registered eDrawings ActiveX control could not be located.", unchecked((int)0x80040154));
        return controlType.GUID;
    }
}
