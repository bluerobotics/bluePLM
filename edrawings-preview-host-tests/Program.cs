using System.Collections.Concurrent;
using BluePLM.EDrawingsPreviewHost;

var testDirectory = Path.Combine(Path.GetTempPath(), $"blueplm-status-{Guid.NewGuid():N}");
Directory.CreateDirectory(testDirectory);

try
{
    var statusPath = Path.Combine(testDirectory, "preview.status");
    const string firstStatus = "handshake 12345";
    const string secondStatus = "ready 12345 Boolean:True";
    File.WriteAllText(statusPath, firstStatus);

    var unexpectedReads = new ConcurrentQueue<string>();
    using var stopReading = new CancellationTokenSource();
    var reader = Task.Run(() =>
    {
        while (!stopReading.IsCancellationRequested)
        {
            try
            {
                using var stream = new FileStream(
                    statusPath,
                    FileMode.Open,
                    FileAccess.Read,
                    FileShare.ReadWrite | FileShare.Delete);
                using var reader = new StreamReader(stream);
                var content = reader.ReadToEnd();
                if (content != firstStatus && content != secondStatus)
                {
                    unexpectedReads.Enqueue(content);
                }
            }
            catch (FileNotFoundException)
            {
                // Replacement can make the path briefly unavailable; the native poller retries it.
            }
            catch (IOException error) when ((error.HResult & 0xFFFF) == 32)
            {
                // ReplaceFile can briefly hold the path exclusively; the native poller retries it.
            }
        }
    });

    for (var index = 0; index < 500; index++)
    {
        HostStatusFile.Write(
            statusPath,
            index % 2 == 0 ? "ready" : "handshake",
            12345,
            index % 2 == 0 ? "Boolean:True" : null);
    }

    stopReading.Cancel();
    reader.GetAwaiter().GetResult();
    if (!unexpectedReads.IsEmpty)
    {
        throw new InvalidOperationException(
            $"A reader observed a partial status value: {unexpectedReads.FirstOrDefault()}");
    }

    var temporaryFiles = Directory.GetFiles(testDirectory, ".preview.status.*.tmp");
    if (temporaryFiles.Length != 0)
    {
        throw new InvalidOperationException("Atomic status publication left a sibling temporary file behind.");
    }

    var missingDirectoryPath = Path.Combine(testDirectory, "missing", "preview.status");
    try
    {
        HostStatusFile.Write(missingDirectoryPath, "ready", 12345);
        throw new InvalidOperationException("Status publication unexpectedly swallowed its write failure.");
    }
    catch (DirectoryNotFoundException)
    {
        // Expected: publication errors remain observable by the host.
    }
}
finally
{
    Directory.Delete(testDirectory, recursive: true);
}

Console.WriteLine("Atomic status-file harness passed.");
