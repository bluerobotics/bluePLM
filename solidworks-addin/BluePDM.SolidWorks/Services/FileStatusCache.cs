using System;
using System.Collections.Concurrent;
using System.Threading;
using System.Threading.Tasks;

namespace BluePLM.SolidWorks
{
    /// <summary>
    /// Cache for file status to avoid repeated API calls
    /// </summary>
    public class FileStatusCache
    {
        private readonly SupabaseService _supabaseService;
        private readonly ConcurrentDictionary<string, CachedStatus> _cache;
        private readonly TimeSpan _cacheExpiry = TimeSpan.FromSeconds(30);

        public FileStatusCache(SupabaseService supabaseService)
        {
            _supabaseService = supabaseService;
            _cache = new ConcurrentDictionary<string, CachedStatus>(StringComparer.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Get cached status for a file, fetching from server if needed
        /// </summary>
        public FileStatus? GetStatus(string filePath)
        {
            if (_cache.TryGetValue(filePath, out var cached))
            {
                if (DateTime.UtcNow - cached.FetchedAt < _cacheExpiry)
                {
                    return cached.Status;
                }
            }

            // Fetch synchronously (not ideal but needed for enable callbacks)
            try
            {
                var status = Task.Run(() => _supabaseService.GetFileStatus(filePath)).Result;
                if (status != null)
                {
                    _cache[filePath] = new CachedStatus { Status = status, FetchedAt = DateTime.UtcNow };
                }
                return status;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Preload status for a file asynchronously
        /// </summary>
        public async void PreloadStatus(string filePath)
        {
            try
            {
                var status = await _supabaseService.GetFileStatus(filePath);
                if (status != null)
                {
                    _cache[filePath] = new CachedStatus { Status = status, FetchedAt = DateTime.UtcNow };
                }
            }
            catch
            {
                // Ignore preload errors
            }
        }

        /// <summary>
        /// Invalidate cached status for a file
        /// </summary>
        public void Invalidate(string filePath)
        {
            _cache.TryRemove(filePath, out _);
        }

        /// <summary>
        /// Clear all cached status
        /// </summary>
        public void Clear()
        {
            _cache.Clear();
        }

        private class CachedStatus
        {
            public FileStatus? Status { get; set; }
            public DateTime FetchedAt { get; set; }
        }
    }
}

