using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

namespace BluePLM.SolidWorksService
{
    /// <summary>
    /// Extracts thumbnails using Windows Shell API (IShellItemImageFactory).
    /// This works for any file type that has a registered thumbnail handler,
    /// including SolidWorks files which have their own shell extension.
    /// </summary>
    public static class WindowsShellThumbnail
    {
        // COM interface IShellItemImageFactory
        [ComImport]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        [Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b")]
        private interface IShellItemImageFactory
        {
            [PreserveSig]
            int GetImage(
                [In, MarshalAs(UnmanagedType.Struct)] SIZE size,
                [In] SIIGBF flags,
                [Out] out IntPtr phbm);
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct SIZE
        {
            public int cx;
            public int cy;
        }

        [Flags]
        private enum SIIGBF
        {
            SIIGBF_RESIZETOFIT = 0x00000000,
            SIIGBF_BIGGERSIZEOK = 0x00000001,
            SIIGBF_MEMORYONLY = 0x00000002,
            SIIGBF_ICONONLY = 0x00000004,
            SIIGBF_THUMBNAILONLY = 0x00000008,
            SIIGBF_INCACHEONLY = 0x00000010,
            SIIGBF_CROPTOSQUARE = 0x00000020,
            SIIGBF_WIDETHUMBNAILS = 0x00000040,
            SIIGBF_ICONBACKGROUND = 0x00000080,
            SIIGBF_SCALEUP = 0x00000100,
        }

        [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
        private static extern void SHCreateItemFromParsingName(
            [In] string pszPath,
            [In] IntPtr pbc,
            [In, MarshalAs(UnmanagedType.LPStruct)] Guid riid,
            [Out, MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory ppv);

        [DllImport("gdi32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool DeleteObject(IntPtr hObject);

        private static readonly Guid IShellItemImageFactoryGuid = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");

        /// <summary>
        /// Extract a thumbnail from a file using Windows Shell.
        /// </summary>
        /// <param name="filePath">Full path to the file</param>
        /// <param name="size">Desired thumbnail size (width and height)</param>
        /// <returns>Result with base64-encoded PNG image data, or error</returns>
        public static CommandResult GetThumbnail(string filePath, int size = 256)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "File path is required" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            IntPtr hBitmap = IntPtr.Zero;
            try
            {
                Console.Error.WriteLine($"[ShellThumb] Getting thumbnail for: {Path.GetFileName(filePath)}, size: {size}");

                // Get IShellItemImageFactory for the file
                SHCreateItemFromParsingName(filePath, IntPtr.Zero, IShellItemImageFactoryGuid, out var factory);

                var thumbnailSize = new SIZE { cx = size, cy = size };

                // Try to get thumbnail only (not icon fallback)
                // SIIGBF_THUMBNAILONLY will fail if no thumbnail is available (won't fall back to icon)
                int hr = factory.GetImage(thumbnailSize, SIIGBF.SIIGBF_THUMBNAILONLY | SIIGBF.SIIGBF_BIGGERSIZEOK, out hBitmap);

                if (hr != 0 || hBitmap == IntPtr.Zero)
                {
                    Console.Error.WriteLine($"[ShellThumb] No thumbnail available, trying with resize flag. HR=0x{hr:X8}");
                    
                    // Try again with resize flag (allows shell to generate thumbnail)
                    hr = factory.GetImage(thumbnailSize, SIIGBF.SIIGBF_RESIZETOFIT | SIIGBF.SIIGBF_BIGGERSIZEOK, out hBitmap);
                    
                    if (hr != 0 || hBitmap == IntPtr.Zero)
                    {
                        Console.Error.WriteLine($"[ShellThumb] Failed to get thumbnail. HR=0x{hr:X8}");
                        return new CommandResult { Success = false, Error = $"Shell thumbnail extraction failed with HR=0x{hr:X8}" };
                    }
                }

                // Convert HBITMAP to Bitmap
                using var bitmap = Image.FromHbitmap(hBitmap);
                
                // Convert to PNG
                using var ms = new MemoryStream();
                bitmap.Save(ms, ImageFormat.Png);
                var pngBytes = ms.ToArray();

                Console.Error.WriteLine($"[ShellThumb] SUCCESS! Got thumbnail: {pngBytes.Length} bytes");

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        filePath,
                        imageData = Convert.ToBase64String(pngBytes),
                        mimeType = "image/png",
                        sizeBytes = pngBytes.Length,
                        width = bitmap.Width,
                        height = bitmap.Height,
                        source = "windows_shell"
                    }
                };
            }
            catch (COMException comEx)
            {
                Console.Error.WriteLine($"[ShellThumb] COM exception: 0x{comEx.ErrorCode:X8} - {comEx.Message}");
                return new CommandResult { Success = false, Error = $"Shell COM error: {comEx.Message}" };
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[ShellThumb] Exception: {ex.GetType().Name} - {ex.Message}");
                return new CommandResult { Success = false, Error = $"Shell thumbnail failed: {ex.Message}" };
            }
            finally
            {
                if (hBitmap != IntPtr.Zero)
                    DeleteObject(hBitmap);
            }
        }
    }
}
