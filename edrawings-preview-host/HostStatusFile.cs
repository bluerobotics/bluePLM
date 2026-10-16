using System.Globalization;
using System.Text;

namespace BluePLM.EDrawingsPreviewHost;

internal static class HostStatusFile
{
    public static void Write(string path, string status, nint window, string? detail = null)
    {
        var destinationPath = Path.GetFullPath(path);
        var directory = Path.GetDirectoryName(destinationPath)
            ?? throw new IOException("The eDrawings status-file directory is unavailable.");
        var temporaryPath = Path.Combine(
            directory,
            $".{Path.GetFileName(destinationPath)}.{Guid.NewGuid():N}.tmp");
        var content = string.IsNullOrEmpty(detail)
            ? string.Format(CultureInfo.InvariantCulture, "{0} {1}", status, window.ToInt64())
            : string.Format(
                CultureInfo.InvariantCulture,
                "{0} {1} {2}",
                status,
                window.ToInt64(),
                detail);

        try
        {
            File.WriteAllText(temporaryPath, content, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            if (File.Exists(destinationPath))
            {
                File.Replace(temporaryPath, destinationPath, destinationBackupFileName: null, ignoreMetadataErrors: true);
            }
            else
            {
                File.Move(temporaryPath, destinationPath);
            }
        }
        catch
        {
            TryDeleteTemporaryFile(temporaryPath);
            throw;
        }
    }

    private static void TryDeleteTemporaryFile(string path)
    {
        try
        {
            File.Delete(path);
        }
        catch
        {
            // Preserve the original write/replace failure for the native handshake timeout.
        }
    }
}
