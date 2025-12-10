using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace BluePDM.SolidWorks
{
    /// <summary>
    /// Service for communicating with BluePDM's Supabase backend
    /// </summary>
    public class SupabaseService : IDisposable
    {
        private readonly HttpClient _httpClient;
        private string? _supabaseUrl;
        private string? _supabaseKey;
        private string? _accessToken;
        private string? _userId;
        private string? _orgId;
        private string? _vaultId;
        private string? _vaultPath;

        private const string SettingsPath = "BluePDM\\settings.json";

        public bool IsConnected => !string.IsNullOrEmpty(_accessToken);
        public string? UserId => _userId;
        public string? OrgId => _orgId;
        public string? VaultPath => _vaultPath;

        public SupabaseService()
        {
            _httpClient = new HttpClient();
            _httpClient.Timeout = TimeSpan.FromMinutes(5);
            
            LoadSettings();
        }

        #region Settings

        private void LoadSettings()
        {
            try
            {
                var settingsFile = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    SettingsPath
                );

                if (File.Exists(settingsFile))
                {
                    var json = File.ReadAllText(settingsFile);
                    var settings = JsonConvert.DeserializeObject<Dictionary<string, string>>(json);

                    if (settings != null)
                    {
                        settings.TryGetValue("supabaseUrl", out var supabaseUrl);
                        settings.TryGetValue("supabaseKey", out var supabaseKey);
                        settings.TryGetValue("accessToken", out var accessToken);
                        settings.TryGetValue("userId", out var userId);
                        settings.TryGetValue("orgId", out var orgId);
                        settings.TryGetValue("vaultId", out var vaultId);
                        settings.TryGetValue("vaultPath", out var vaultPath);
                        
                        _supabaseUrl = supabaseUrl;
                        _supabaseKey = supabaseKey;
                        _accessToken = accessToken;
                        _userId = userId;
                        _orgId = orgId;
                        _vaultId = vaultId;
                        _vaultPath = vaultPath;

                        if (!string.IsNullOrEmpty(_supabaseUrl) && !string.IsNullOrEmpty(_supabaseKey))
                        {
                            _httpClient.DefaultRequestHeaders.Clear();
                            _httpClient.DefaultRequestHeaders.Add("apikey", _supabaseKey);
                            if (!string.IsNullOrEmpty(_accessToken))
                            {
                                _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {_accessToken}");
                            }
                        }
                    }
                }
            }
            catch
            {
                // Ignore settings load errors
            }
        }

        public void SaveSettings()
        {
            try
            {
                var settingsDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "BluePDM"
                );
                Directory.CreateDirectory(settingsDir);

                var settingsFile = Path.Combine(settingsDir, "settings.json");
                var settings = new Dictionary<string, string?>
                {
                    ["supabaseUrl"] = _supabaseUrl,
                    ["supabaseKey"] = _supabaseKey,
                    ["accessToken"] = _accessToken,
                    ["userId"] = _userId,
                    ["orgId"] = _orgId,
                    ["vaultId"] = _vaultId,
                    ["vaultPath"] = _vaultPath
                };

                File.WriteAllText(settingsFile, JsonConvert.SerializeObject(settings, Formatting.Indented));
            }
            catch
            {
                // Ignore settings save errors
            }
        }

        public void Connect(string supabaseUrl, string supabaseKey)
        {
            _supabaseUrl = supabaseUrl.TrimEnd('/');
            _supabaseKey = supabaseKey;

            _httpClient.DefaultRequestHeaders.Clear();
            _httpClient.DefaultRequestHeaders.Add("apikey", _supabaseKey);
            
            SaveSettings();
        }

        public async Task<(bool Success, string? Error)> SignIn(string email, string password)
        {
            if (string.IsNullOrEmpty(_supabaseUrl) || string.IsNullOrEmpty(_supabaseKey))
            {
                return (false, "Supabase not configured. Please set URL and API key in settings.");
            }

            try
            {
                var response = await _httpClient.PostAsync(
                    $"{_supabaseUrl}/auth/v1/token?grant_type=password",
                    new StringContent(
                        JsonConvert.SerializeObject(new { email, password }),
                        Encoding.UTF8,
                        "application/json"
                    )
                );

                var content = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    var error = JsonConvert.DeserializeObject<JObject>(content);
                    return (false, error?["error_description"]?.ToString() ?? "Sign in failed");
                }

                var result = JsonConvert.DeserializeObject<JObject>(content);
                _accessToken = result?["access_token"]?.ToString();
                _userId = result?["user"]?["id"]?.ToString();

                _httpClient.DefaultRequestHeaders.Remove("Authorization");
                _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {_accessToken}");

                // Get user's organization
                await LoadUserOrganization();

                SaveSettings();
                return (true, null);
            }
            catch (Exception ex)
            {
                return (false, ex.Message);
            }
        }

        private async Task LoadUserOrganization()
        {
            if (string.IsNullOrEmpty(_userId)) return;

            try
            {
                var response = await _httpClient.GetAsync(
                    $"{_supabaseUrl}/rest/v1/users?id=eq.{_userId}&select=org_id"
                );

                if (response.IsSuccessStatusCode)
                {
                    var content = await response.Content.ReadAsStringAsync();
                    var users = JsonConvert.DeserializeObject<JArray>(content);
                    if (users?.Count > 0)
                    {
                        _orgId = users[0]?["org_id"]?.ToString();
                    }
                }
            }
            catch
            {
                // Ignore
            }
        }

        public void SetVault(string vaultId, string vaultPath)
        {
            _vaultId = vaultId;
            _vaultPath = vaultPath;
            SaveSettings();
        }

        #endregion

        #region File Operations

        /// <summary>
        /// Get file status from the database
        /// </summary>
        public async Task<FileStatus?> GetFileStatus(string localPath)
        {
            if (!IsConnected || string.IsNullOrEmpty(_vaultPath)) return null;

            try
            {
                // Convert local path to relative path
                var relativePath = GetRelativePath(localPath);
                if (relativePath == null) return null;

                var encodedPath = Uri.EscapeDataString(relativePath);
                var response = await _httpClient.GetAsync(
                    $"{_supabaseUrl}/rest/v1/files?file_path=eq.{encodedPath}&vault_id=eq.{_vaultId}&select=*,checked_out_user:users!checked_out_by(full_name,email)"
                );

                if (!response.IsSuccessStatusCode) return null;

                var content = await response.Content.ReadAsStringAsync();
                var files = JsonConvert.DeserializeObject<JArray>(content);

                if (files == null || files.Count == 0)
                {
                    // File not in database yet
                    return new FileStatus
                    {
                        FilePath = localPath,
                        RelativePath = relativePath,
                        IsTracked = false,
                        CanCheckOut = false,
                        IsCheckedOutByMe = false
                    };
                }

                var file = files[0];
                var checkedOutBy = file["checked_out_by"]?.ToString();
                var checkedOutUser = file["checked_out_user"];

                return new FileStatus
                {
                    FileId = file["id"]?.ToString(),
                    FilePath = localPath,
                    RelativePath = relativePath,
                    IsTracked = true,
                    Version = file["version"]?.Value<int>() ?? 1,
                    Revision = file["revision"]?.ToString() ?? "A",
                    State = file["state"]?.ToString() ?? "wip",
                    PartNumber = file["part_number"]?.ToString(),
                    Description = file["description"]?.ToString(),
                    CheckedOutBy = checkedOutUser?["full_name"]?.ToString() 
                        ?? checkedOutUser?["email"]?.ToString(),
                    CheckedOutAt = file["checked_out_at"]?.Value<DateTime>(),
                    IsCheckedOutByMe = checkedOutBy == _userId,
                    CanCheckOut = string.IsNullOrEmpty(checkedOutBy),
                    ContentHash = file["content_hash"]?.ToString()
                };
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Check out a file for editing
        /// </summary>
        public async Task<OperationResult> CheckOutFile(string localPath, string? message = null)
        {
            if (!IsConnected) return new OperationResult { Success = false, Error = "Not connected" };

            try
            {
                var status = await GetFileStatus(localPath);
                if (status == null) return new OperationResult { Success = false, Error = "Could not get file status" };

                if (!status.IsTracked)
                {
                    // Need to add the file first
                    var addResult = await AddFile(localPath);
                    if (!addResult.Success) return addResult;
                    status = await GetFileStatus(localPath);
                }

                if (status?.IsCheckedOutByMe == true)
                {
                    return new OperationResult { Success = true, Message = "Already checked out by you" };
                }

                if (!string.IsNullOrEmpty(status?.CheckedOutBy))
                {
                    return new OperationResult 
                    { 
                        Success = false, 
                        Error = $"File is checked out by {status.CheckedOutBy}" 
                    };
                }

                // Perform checkout
                var updateData = new
                {
                    checked_out_by = _userId,
                    checked_out_at = DateTime.UtcNow.ToString("o"),
                    lock_message = message
                };

                var response = await SendPatchAsync(
                    $"{_supabaseUrl}/rest/v1/files?id=eq.{status?.FileId}",
                    JsonConvert.SerializeObject(updateData)
                );

                if (response.IsSuccessStatusCode)
                {
                    return new OperationResult { Success = true, Message = "Checked out successfully" };
                }

                return new OperationResult { Success = false, Error = "Failed to check out" };
            }
            catch (Exception ex)
            {
                return new OperationResult { Success = false, Error = ex.Message };
            }
        }

        /// <summary>
        /// Check in a file after editing
        /// </summary>
        public async Task<CheckInResult> CheckInFile(
            string localPath,
            string? comment = null,
            bool incrementRevision = false,
            string? newState = null,
            Dictionary<string, object?>? customProperties = null)
        {
            if (!IsConnected) return new CheckInResult { Success = false, Error = "Not connected" };

            try
            {
                var status = await GetFileStatus(localPath);
                if (status == null || !status.IsCheckedOutByMe)
                {
                    return new CheckInResult { Success = false, Error = "File is not checked out by you" };
                }

                // Read file content and compute hash
                var fileBytes = File.ReadAllBytes(localPath);
                var hash = ComputeHash(fileBytes);

                // Upload to storage
                var uploadResult = await UploadFile(fileBytes, hash);
                if (!uploadResult.Success)
                {
                    return new CheckInResult { Success = false, Error = uploadResult.Error };
                }

                // Calculate new version/revision
                var newVersion = status.Version + 1;
                var newRevision = incrementRevision ? GetNextRevision(status.Revision) : status.Revision;

                // Create version record
                var versionData = new
                {
                    file_id = status.FileId,
                    version = newVersion,
                    revision = newRevision,
                    content_hash = hash,
                    file_size = fileBytes.Length,
                    comment,
                    state = newState ?? status.State,
                    created_by = _userId
                };

                var versionResponse = await _httpClient.PostAsync(
                    $"{_supabaseUrl}/rest/v1/file_versions",
                    new StringContent(
                        JsonConvert.SerializeObject(versionData),
                        Encoding.UTF8,
                        "application/json"
                    )
                );

                if (!versionResponse.IsSuccessStatusCode)
                {
                    return new CheckInResult { Success = false, Error = "Failed to create version record" };
                }

                // Update file record
                var updateData = new Dictionary<string, object?>
                {
                    ["version"] = newVersion,
                    ["revision"] = newRevision,
                    ["content_hash"] = hash,
                    ["file_size"] = fileBytes.Length,
                    ["checked_out_by"] = null,
                    ["checked_out_at"] = null,
                    ["lock_message"] = null,
                    ["updated_at"] = DateTime.UtcNow.ToString("o"),
                    ["updated_by"] = _userId
                };

                if (newState != null)
                {
                    updateData["state"] = newState;
                    updateData["state_changed_at"] = DateTime.UtcNow.ToString("o");
                    updateData["state_changed_by"] = _userId;
                }

                if (customProperties != null && customProperties.Count > 0)
                {
                    updateData["custom_properties"] = customProperties;
                }

                var updateResponse = await SendPatchAsync(
                    $"{_supabaseUrl}/rest/v1/files?id=eq.{status.FileId}",
                    JsonConvert.SerializeObject(updateData)
                );

                if (updateResponse.IsSuccessStatusCode)
                {
                    return new CheckInResult 
                    { 
                        Success = true, 
                        Version = newVersion,
                        Revision = newRevision,
                        Message = $"Checked in as version {newVersion}" 
                    };
                }

                return new CheckInResult { Success = false, Error = "Failed to update file record" };
            }
            catch (Exception ex)
            {
                return new CheckInResult { Success = false, Error = ex.Message };
            }
        }

        /// <summary>
        /// Undo checkout (discard changes, release lock)
        /// </summary>
        public async Task<OperationResult> UndoCheckOut(string localPath)
        {
            if (!IsConnected) return new OperationResult { Success = false, Error = "Not connected" };

            try
            {
                var status = await GetFileStatus(localPath);
                if (status == null || !status.IsCheckedOutByMe)
                {
                    return new OperationResult { Success = false, Error = "File is not checked out by you" };
                }

                var updateData = new
                {
                    checked_out_by = (string?)null,
                    checked_out_at = (string?)null,
                    lock_message = (string?)null
                };

                var response = await SendPatchAsync(
                    $"{_supabaseUrl}/rest/v1/files?id=eq.{status.FileId}",
                    JsonConvert.SerializeObject(updateData)
                );

                if (response.IsSuccessStatusCode)
                {
                    return new OperationResult { Success = true, Message = "Check out undone" };
                }

                return new OperationResult { Success = false, Error = "Failed to undo check out" };
            }
            catch (Exception ex)
            {
                return new OperationResult { Success = false, Error = ex.Message };
            }
        }

        /// <summary>
        /// Get the latest version of a file from the server
        /// </summary>
        public async Task<GetVersionResult> GetLatestVersion(string localPath)
        {
            if (!IsConnected) return new GetVersionResult { Success = false, Error = "Not connected" };

            try
            {
                var status = await GetFileStatus(localPath);
                if (status == null || !status.IsTracked)
                {
                    return new GetVersionResult { Success = false, Error = "File is not tracked" };
                }

                if (string.IsNullOrEmpty(status.ContentHash))
                {
                    return new GetVersionResult { Success = false, Error = "No content hash found" };
                }

                // Download from storage
                var downloadResult = await DownloadFile(status.ContentHash);
                if (!downloadResult.Success || downloadResult.Data == null)
                {
                    return new GetVersionResult { Success = false, Error = downloadResult.Error ?? "Download failed" };
                }

                // Write to local file
                File.WriteAllBytes(localPath, downloadResult.Data);

                return new GetVersionResult 
                { 
                    Success = true, 
                    Version = status.Version,
                    Message = $"Downloaded version {status.Version}" 
                };
            }
            catch (Exception ex)
            {
                return new GetVersionResult { Success = false, Error = ex.Message };
            }
        }

        /// <summary>
        /// Get version history for a file
        /// </summary>
        public async Task<List<VersionInfo>> GetFileHistory(string localPath)
        {
            var result = new List<VersionInfo>();
            if (!IsConnected) return result;

            try
            {
                var status = await GetFileStatus(localPath);
                if (status == null || string.IsNullOrEmpty(status.FileId)) return result;

                var response = await _httpClient.GetAsync(
                    $"{_supabaseUrl}/rest/v1/file_versions?file_id=eq.{status.FileId}&select=*,created_by_user:users!created_by(email,full_name)&order=version.desc"
                );

                if (!response.IsSuccessStatusCode) return result;

                var content = await response.Content.ReadAsStringAsync();
                var versions = JsonConvert.DeserializeObject<JArray>(content);

                if (versions == null) return result;

                foreach (var v in versions)
                {
                    result.Add(new VersionInfo
                    {
                        Version = v["version"]?.Value<int>() ?? 0,
                        Revision = v["revision"]?.ToString() ?? "",
                        State = v["state"]?.ToString() ?? "",
                        Comment = v["comment"]?.ToString(),
                        CreatedAt = v["created_at"]?.Value<DateTime>() ?? DateTime.MinValue,
                        CreatedBy = v["created_by_user"]?["full_name"]?.ToString() 
                            ?? v["created_by_user"]?["email"]?.ToString() ?? "",
                        ContentHash = v["content_hash"]?.ToString() ?? "",
                        FileSize = v["file_size"]?.Value<long>() ?? 0
                    });
                }
            }
            catch
            {
                // Ignore
            }

            return result;
        }

        /// <summary>
        /// Add a new file to the vault
        /// </summary>
        private async Task<OperationResult> AddFile(string localPath)
        {
            if (!IsConnected || string.IsNullOrEmpty(_vaultId) || string.IsNullOrEmpty(_orgId))
            {
                return new OperationResult { Success = false, Error = "Not connected or no vault selected" };
            }

            try
            {
                var relativePath = GetRelativePath(localPath);
                if (relativePath == null)
                {
                    return new OperationResult { Success = false, Error = "File is not in vault path" };
                }

                var fileBytes = File.ReadAllBytes(localPath);
                var hash = ComputeHash(fileBytes);

                // Upload content
                var uploadResult = await UploadFile(fileBytes, hash);
                if (!uploadResult.Success)
                {
                    return new OperationResult { Success = false, Error = uploadResult.Error };
                }

                var fileName = Path.GetFileName(localPath);
                var extension = Path.GetExtension(localPath).ToLowerInvariant();
                var fileType = GetFileType(extension);

                var fileData = new
                {
                    org_id = _orgId,
                    vault_id = _vaultId,
                    file_path = relativePath,
                    file_name = fileName,
                    extension,
                    file_type = fileType,
                    revision = "A",
                    version = 1,
                    state = "wip",
                    content_hash = hash,
                    file_size = fileBytes.Length,
                    created_by = _userId,
                    updated_by = _userId
                };

                var response = await _httpClient.PostAsync(
                    $"{_supabaseUrl}/rest/v1/files",
                    new StringContent(
                        JsonConvert.SerializeObject(fileData),
                        Encoding.UTF8,
                        "application/json"
                    )
                );

                if (response.IsSuccessStatusCode)
                {
                    // Create initial version
                    var versionData = new
                    {
                        file_id = "", // Will get from response
                        version = 1,
                        revision = "A",
                        content_hash = hash,
                        file_size = fileBytes.Length,
                        state = "wip",
                        created_by = _userId,
                        comment = "Initial version"
                    };

                    return new OperationResult { Success = true, Message = "File added to vault" };
                }

                var errorContent = await response.Content.ReadAsStringAsync();
                return new OperationResult { Success = false, Error = $"Failed to add file: {errorContent}" };
            }
            catch (Exception ex)
            {
                return new OperationResult { Success = false, Error = ex.Message };
            }
        }

        #endregion

        #region Storage

        private async Task<OperationResult> UploadFile(byte[] data, string hash)
        {
            try
            {
                // Check if content already exists (content-addressable storage)
                var checkResponse = await _httpClient.GetAsync(
                    $"{_supabaseUrl}/storage/v1/object/info/vault/{_orgId}/{hash}"
                );

                if (checkResponse.IsSuccessStatusCode)
                {
                    // File already exists with this hash
                    return new OperationResult { Success = true };
                }

                // Upload new content
                var content = new ByteArrayContent(data);
                content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");

                var response = await _httpClient.PostAsync(
                    $"{_supabaseUrl}/storage/v1/object/vault/{_orgId}/{hash}",
                    content
                );

                if (response.IsSuccessStatusCode || response.StatusCode == System.Net.HttpStatusCode.Conflict)
                {
                    return new OperationResult { Success = true };
                }

                var error = await response.Content.ReadAsStringAsync();
                return new OperationResult { Success = false, Error = error };
            }
            catch (Exception ex)
            {
                return new OperationResult { Success = false, Error = ex.Message };
            }
        }

        private async Task<DownloadResult> DownloadFile(string hash)
        {
            try
            {
                var response = await _httpClient.GetAsync(
                    $"{_supabaseUrl}/storage/v1/object/vault/{_orgId}/{hash}"
                );

                if (response.IsSuccessStatusCode)
                {
                    var data = await response.Content.ReadAsByteArrayAsync();
                    return new DownloadResult { Success = true, Data = data };
                }

                return new DownloadResult { Success = false, Error = "Download failed" };
            }
            catch (Exception ex)
            {
                return new DownloadResult { Success = false, Error = ex.Message };
            }
        }

        #endregion

        #region Helpers

        /// <summary>
        /// Sends a PATCH request (not available in .NET Framework 4.8's HttpClient)
        /// </summary>
        private async Task<HttpResponseMessage> SendPatchAsync(string requestUri, string jsonContent)
        {
            var request = new HttpRequestMessage(new HttpMethod("PATCH"), requestUri)
            {
                Content = new StringContent(jsonContent, Encoding.UTF8, "application/json")
            };
            return await _httpClient.SendAsync(request);
        }

        private string? GetRelativePath(string localPath)
        {
            if (string.IsNullOrEmpty(_vaultPath)) return null;

            var normalizedLocal = localPath.Replace('/', '\\').TrimEnd('\\');
            var normalizedVault = _vaultPath.Replace('/', '\\').TrimEnd('\\');

            if (!normalizedLocal.StartsWith(normalizedVault, StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            var relative = normalizedLocal.Substring(normalizedVault.Length).TrimStart('\\');
            return relative.Replace('\\', '/');
        }

        private static string ComputeHash(byte[] data)
        {
            using var sha256 = SHA256.Create();
            var hash = sha256.ComputeHash(data);
            return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
        }

        private static string GetNextRevision(string current)
        {
            if (string.IsNullOrEmpty(current) || current == "-") return "A";

            var chars = current.ToCharArray();
            for (int i = chars.Length - 1; i >= 0; i--)
            {
                if (chars[i] == 'Z')
                {
                    chars[i] = 'A';
                }
                else
                {
                    chars[i]++;
                    return new string(chars);
                }
            }

            return "A" + new string(chars);
        }

        private static string GetFileType(string extension)
        {
            return extension switch
            {
                ".sldprt" or ".prt" or ".ipt" or ".catpart" => "part",
                ".sldasm" or ".asm" or ".iam" or ".catproduct" => "assembly",
                ".slddrw" or ".dwg" or ".dxf" or ".idw" => "drawing",
                ".pdf" or ".step" or ".stp" or ".iges" or ".igs" => "document",
                _ => "other"
            };
        }

        #endregion

        public void Dispose()
        {
            _httpClient?.Dispose();
        }
    }

    #region Data Classes

    public class FileStatus
    {
        public string? FileId { get; set; }
        public string FilePath { get; set; } = "";
        public string RelativePath { get; set; } = "";
        public bool IsTracked { get; set; }
        public int Version { get; set; }
        public string Revision { get; set; } = "A";
        public string State { get; set; } = "wip";
        public string? PartNumber { get; set; }
        public string? Description { get; set; }
        public string? CheckedOutBy { get; set; }
        public DateTime? CheckedOutAt { get; set; }
        public bool IsCheckedOutByMe { get; set; }
        public bool CanCheckOut { get; set; }
        public string? ContentHash { get; set; }
    }

    public class OperationResult
    {
        public bool Success { get; set; }
        public string? Message { get; set; }
        public string? Error { get; set; }
    }

    public class CheckInResult : OperationResult
    {
        public int Version { get; set; }
        public string? Revision { get; set; }
    }

    public class GetVersionResult : OperationResult
    {
        public int Version { get; set; }
    }

    public class DownloadResult : OperationResult
    {
        public byte[]? Data { get; set; }
    }

    public class VersionInfo
    {
        public int Version { get; set; }
        public string Revision { get; set; } = "";
        public string State { get; set; } = "";
        public string? Comment { get; set; }
        public DateTime CreatedAt { get; set; }
        public string CreatedBy { get; set; } = "";
        public string ContentHash { get; set; } = "";
        public long FileSize { get; set; }
    }

    #endregion
}

