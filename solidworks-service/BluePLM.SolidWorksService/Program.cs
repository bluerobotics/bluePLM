using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace BluePLM.SolidWorksService
{
    /// <summary>
    /// BluePLM SolidWorks Service
    /// 
    /// A command-line service that processes JSON commands from the Electron app
    /// to interact with SolidWorks files.
    /// 
    /// KEY ARCHITECTURE:
    /// 
    /// FAST operations (Document Manager API - NO SolidWorks launch!):
    ///   - getBom, getProperties, setProperties, getConfigurations, getReferences, getPreview
    ///   - Requires a DM license key (free with SW subscription)
    /// 
    /// SLOW operations (Full SolidWorks API - launches SW):
    ///   - getMassProperties (needs rebuild)
    ///   - exportPdf, exportStep, exportIges, exportDxf, exportImage
    ///   - replaceComponent, packAndGo
    /// 
    /// Communication protocol:
    /// - Input: JSON commands on stdin, one per line
    /// - Output: JSON responses on stdout, one per line
    /// </summary>
    class Program
    {
        private static DocumentManagerAPI? _dmApi;
        private static SolidWorksAPI? _swApi;

        static int Main(string[] args)
        {
            // Catch ALL unhandled exceptions to prevent silent crashes
            AppDomain.CurrentDomain.UnhandledException += (sender, e) =>
            {
                var ex = e.ExceptionObject as Exception;
                Console.Error.WriteLine($"[FATAL] Unhandled exception: {ex?.Message}");
                Console.Error.WriteLine($"[FATAL] Stack trace: {ex?.StackTrace}");
                if (ex?.InnerException != null)
                {
                    Console.Error.WriteLine($"[FATAL] Inner exception: {ex.InnerException.Message}");
                }
                Console.Error.Flush();
            };

            bool keepSwRunning = true;
            bool singleCommand = false;
            string? commandJson = null;
            string? dmLicenseKey = null;

            for (int i = 0; i < args.Length; i++)
            {
                switch (args[i])
                {
                    case "--close-sw-after":
                        keepSwRunning = false;
                        break;
                    case "--command":
                        singleCommand = true;
                        if (i + 1 < args.Length)
                            commandJson = args[++i];
                        break;
                    case "--dm-license":
                        if (i + 1 < args.Length)
                            dmLicenseKey = args[++i];
                        break;
                    case "--help":
                        PrintUsage();
                        return 0;
                }
            }

            // Initialize Document Manager API (for FAST operations - no SW launch!)
            Console.Error.WriteLine("=== BluePLM SolidWorks Service Startup ===");
            Console.Error.WriteLine($"[Startup] DM License key from command line: {(dmLicenseKey == null ? "not provided" : "provided")}");

            
            Console.Error.WriteLine("[Startup] Creating DocumentManagerAPI instance...");
            _dmApi = new DocumentManagerAPI(dmLicenseKey);
            
            Console.Error.WriteLine("[Startup] Calling Initialize()...");
            var initResult = _dmApi.Initialize(); // Try to init, may fail if no license key
            Console.Error.WriteLine($"[Startup] Initialize() returned: {initResult}");
            Console.Error.WriteLine($"[Startup] IsAvailable: {_dmApi.IsAvailable}");
            Console.Error.WriteLine($"[Startup] InitializationError: {_dmApi.InitializationError ?? "(none)"}");
            
            // Initialize SolidWorks API handler (for exports - launches SW on demand)
            Console.Error.WriteLine("[Startup] Creating SolidWorksAPI instance...");
            _swApi = new SolidWorksAPI(keepSwRunning);
            Console.Error.WriteLine($"[Startup] SolidWorks available: {_swApi.IsSolidWorksAvailable()}");

            // Single command mode
            if (singleCommand && commandJson != null && commandJson.Length > 0)
            {
                var result = ProcessCommand(commandJson);
                Console.WriteLine(JsonConvert.SerializeObject(result));
                return result.Success ? 0 : 1;
            }

            // Interactive mode - read commands from stdin
            var dmStatus = _dmApi.IsAvailable ? "✓ READY (fast mode enabled)" : $"✗ {_dmApi.InitializationError}";
            Console.Error.WriteLine("=== Service Ready ===");
            Console.Error.WriteLine("BluePLM SolidWorks Service v1.0.0");
            Console.Error.WriteLine($"  Document Manager API: {dmStatus}");
            Console.Error.WriteLine("  Full SolidWorks API: launches on demand for exports");
            Console.Error.WriteLine("Ready for commands...");
            
            string? line;
            try
            {
                while ((line = Console.ReadLine()) != null)
                {
                    Console.Error.WriteLine($"[Service] Received command: {line.Substring(0, Math.Min(50, line.Length))}...");
                    
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    
                    try
                    {
                        var result = ProcessCommand(line);
                        var response = JsonConvert.SerializeObject(result);
                        Console.Error.WriteLine($"[Service] Sending response ({response.Length} chars)");
                        Console.WriteLine(response);
                        Console.Out.Flush();
                        Console.Error.WriteLine("[Service] Response sent, waiting for next command...");
                    }
                    catch (Exception ex)
                    {
                        Console.Error.WriteLine($"[Service] Exception processing command: {ex.Message}");
                        var error = new CommandResult
                        {
                            Success = false,
                            Error = $"Unhandled error: {ex.Message}",
                            ErrorDetails = ex.ToString()
                        };
                        Console.WriteLine(JsonConvert.SerializeObject(error));
                        Console.Out.Flush();
                    }
                }
                Console.Error.WriteLine("[Service] stdin closed (ReadLine returned null), exiting...");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[Service] Exception in main loop: {ex.Message}");
                Console.Error.WriteLine($"[Service] Stack: {ex.StackTrace}");
            }

            Console.Error.WriteLine("[Service] Cleaning up...");
            _dmApi?.Dispose();
            _swApi?.Dispose();
            Console.Error.WriteLine("[Service] Cleanup complete, exiting with code 0");

            return 0;
        }

        static CommandResult ProcessCommand(string json)
        {
            int? requestId = null;
            try
            {
                var command = JsonConvert.DeserializeObject<JObject>(json);
                if (command == null)
                    return new CommandResult { Success = false, Error = "Invalid JSON" };

                // Extract requestId for response correlation
                requestId = command["requestId"]?.Value<int>();

                var action = command["action"]?.ToString();
                var filePath = command["filePath"]?.ToString();

                if (string.IsNullOrEmpty(action))
                    return new CommandResult { Success = false, Error = "Missing 'action' field", RequestId = requestId };

                var result = action switch
                {
                    // ========================================
                    // FAST operations (Document Manager API)
                    // NO SolidWorks launch - instant!
                    // ========================================
                    
                    "getBom" => GetBomFast(filePath, command),
                    "getProperties" => GetPropertiesFast(filePath, command),
                    "getConfigurations" => GetConfigurationsFast(filePath),
                    "getReferences" => GetReferencesFast(filePath),
                    "getPreview" => GetPreviewFast(filePath, command["configuration"]?.ToString()),
                    "getShellThumbnail" => WindowsShellThumbnail.GetThumbnail(filePath!, 
                        command["size"]?.Value<int>() ?? 256),
                    
                    // ========================================
                    // Open Document Management
                    // Control documents open in running SolidWorks
                    // ========================================
                    
                    "getOpenDocuments" => _swApi!.GetOpenDocuments(),
                    "isDocumentOpen" => _swApi!.IsDocumentOpen(filePath),
                    "getDocumentInfo" => _swApi!.GetDocumentInfo(filePath),
                    "setDocumentReadOnly" => _swApi!.SetDocumentReadOnly(filePath,
                        command["readOnly"]?.Value<bool>() ?? true),
                    "saveDocument" => _swApi!.SaveDocument(filePath),
                    "setDocumentProperties" => _swApi!.SetDocumentProperties(filePath,
                        command["properties"]?.ToObject<System.Collections.Generic.Dictionary<string, string>>(),
                        command["configuration"]?.ToString()),
                    
                    // ========================================
                    // SLOW operations (Full SolidWorks API)
                    // Launches SolidWorks when needed
                    // ========================================
                    
                    "setProperties" => SetPropertiesFast(filePath, 
                        command["properties"]?.ToObject<System.Collections.Generic.Dictionary<string, string>>(),
                        command["configuration"]?.ToString()),
                    "setPropertiesBatch" => SetPropertiesBatchFast(filePath,
                        command["configProperties"]?.ToObject<System.Collections.Generic.Dictionary<string, System.Collections.Generic.Dictionary<string, string>>>()),
                    "getMassProperties" => _swApi!.GetMassProperties(filePath,
                        command["configuration"]?.ToString()),
                    
                    // Exports (need full SW)
                    "exportPdf" => _swApi!.ExportToPdf(filePath, 
                        command["outputPath"]?.ToString(),
                        command["filenamePattern"]?.ToString(),
                        command["pdmMetadata"]?.ToObject<PdmMetadata>()),
                    "exportStep" => _swApi!.ExportToStep(filePath,
                        command["outputPath"]?.ToString(),
                        command["configuration"]?.ToString(),
                        command["exportAllConfigs"]?.Value<bool>() ?? false,
                        command["configurations"]?.ToObject<string[]>(),
                        command["filenamePattern"]?.ToString(),
                        command["pdmMetadata"]?.ToObject<PdmMetadata>()),
                    "exportStl" => _swApi!.ExportToStl(filePath,
                        command["outputPath"]?.ToString(),
                        command["configuration"]?.ToString(),
                        command["exportAllConfigs"]?.Value<bool>() ?? false,
                        command["configurations"]?.ToObject<string[]>(),
                        command["resolution"]?.ToString() ?? "fine",
                        command["binaryFormat"]?.Value<bool>() ?? true,
                        command["customDeviation"]?.Value<double>(),
                        command["customAngle"]?.Value<double>(),
                        command["filenamePattern"]?.ToString(),
                        command["pdmMetadata"]?.ToObject<PdmMetadata>()),
                    "exportIges" => _swApi!.ExportToIges(filePath,
                        command["outputPath"]?.ToString()),
                    "exportDxf" => _swApi!.ExportToDxf(filePath,
                        command["outputPath"]?.ToString()),
                    "exportImage" => _swApi!.ExportToImage(filePath,
                        command["outputPath"]?.ToString(),
                        command["width"]?.Value<int>() ?? 800,
                        command["height"]?.Value<int>() ?? 600),
                    
                    // Document creation (need full SW)
                    "createDocumentFromTemplate" => _swApi!.CreateDocumentFromTemplate(
                        command["templatePath"]?.ToString(),
                        command["outputPath"]?.ToString()),
                    
                    // Assembly operations (need full SW)
                    "replaceComponent" => _swApi!.ReplaceComponent(filePath,
                        command["oldComponent"]?.ToString(),
                        command["newComponent"]?.ToString()),
                    "packAndGo" => _swApi!.PackAndGo(filePath,
                        command["outputFolder"]?.ToString(),
                        command["prefix"]?.ToString(),
                        command["suffix"]?.ToString()),
                    "addComponent" => _swApi!.AddComponent(filePath,
                        command["componentPath"]?.ToString(),
                        command["coordinates"]?.ToObject<double[]>()),
                    
                    // Service control
                    "ping" => Ping(),
                    "setDmLicense" => SetDmLicense(command["licenseKey"]?.ToString()),
                    "quit" => Quit(),
                    
                    _ => new CommandResult { Success = false, Error = $"Unknown action: {action}" }
                };

                // Set requestId on result for response correlation
                result.RequestId = requestId;
                return result;
            }
            catch (JsonException ex)
            {
                return new CommandResult { Success = false, Error = $"JSON parse error: {ex.Message}", RequestId = requestId };
            }
        }

        // ========================================
        // FAST operations - use DM API, fall back to SW API
        // ========================================

        static CommandResult GetBomFast(string? filePath, JObject command)
        {
            // Try Document Manager first (NO SW launch!)
            if (_dmApi != null && _dmApi.IsAvailable)
            {
                var result = _dmApi.GetBillOfMaterials(filePath, command["configuration"]?.ToString());
                if (result.Success) return result;
            }
            
            // Fall back to full SW API (will launch SW - slower)
            return _swApi!.GetBillOfMaterials(filePath, 
                command["includeChildren"]?.Value<bool>() ?? true,
                command["configuration"]?.ToString());
        }

        static CommandResult GetPropertiesFast(string? filePath, JObject command)
        {
            // ONLY use Document Manager API - NEVER fall back to full SolidWorks!
            // Opening SolidWorks just for property extraction can take 20-30+ seconds.
            // If Document Manager fails, the user can manually use "Refresh Metadata" 
            // which intentionally uses full SW API.
            
            if (_dmApi == null || !_dmApi.IsAvailable)
            {
                Console.Error.WriteLine($"[Service] Document Manager not available for: {Path.GetFileName(filePath)}");
                return new CommandResult 
                { 
                    Success = false, 
                    Error = "Document Manager not available. Configure DM license in Settings → Integrations → SOLIDWORKS, or use 'Refresh Metadata' for manual extraction." 
                };
            }
            
            Console.Error.WriteLine($"[Service] Using Document Manager API for: {Path.GetFileName(filePath)}");
            var result = _dmApi.GetCustomProperties(filePath, command["configuration"]?.ToString());
            
            if (result.Success)
            {
                // Log property count for debugging
                try
                {
                    dynamic data = result.Data!;
                    var fileProps = data.fileProperties as Dictionary<string, string>;
                    Console.Error.WriteLine($"[Service] DM returned {fileProps?.Count ?? 0} file properties");
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"[Service] Error checking DM result: {ex.Message}");
                }
            }
            else
            {
                Console.Error.WriteLine($"[Service] DM failed: {result.Error}");
            }
            
            // Always return DM result - no fallback to slow SW API!
            return result;
        }

        static CommandResult GetConfigurationsFast(string? filePath)
        {
            // Try Document Manager first (NO SW launch!)
            if (_dmApi != null && _dmApi.IsAvailable)
            {
                var result = _dmApi.GetConfigurations(filePath);
                if (result.Success) return result;
            }
            
            // Fall back to full SW API (will launch SW - slower)
            return _swApi!.GetConfigurations(filePath);
        }

        static CommandResult GetReferencesFast(string? filePath)
        {
            // Try Document Manager first (NO SW launch!)
            if (_dmApi != null && _dmApi.IsAvailable)
            {
                var result = _dmApi.GetExternalReferences(filePath);
                if (result.Success) return result;
            }
            
            // Fall back to full SW API (will launch SW - slower)
            return _swApi!.GetExternalReferences(filePath);
        }

        // Track if Document Manager previews work (they don't for newer SW file formats)
        static bool _dmPreviewWorks = true;
        
        static CommandResult GetPreviewFast(string? filePath, string? configuration)
        {
            // Strategy:
            // 1. Try Document Manager API (fastest, no SW launch)
            // 2. If DM fails, try Windows Shell thumbnail (uses SW's shell extension)
            // 3. NEVER fall back to full SolidWorks API (too slow/disruptive)
            
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "File path is required" };
            
            // Try Document Manager first (if it's working)
            if (_dmPreviewWorks && _dmApi != null && _dmApi.IsAvailable)
            {
                var result = _dmApi.GetPreviewImage(filePath, configuration);
                if (result.Success)
                {
                    return result;
                }
                
                // If DM fails with certain errors, disable it for future calls
                if (result.Error?.Contains("E_UNEXPECTED") == true || 
                    result.Error?.Contains("Method not found") == true ||
                    result.Error?.Contains("Catastrophic") == true)
                {
                    Console.Error.WriteLine("[Service] Document Manager preview doesn't work for this file format.");
                    Console.Error.WriteLine("[Service] Falling back to Windows Shell thumbnails.");
                    _dmPreviewWorks = false;
                }
            }
            
            // Fall back to Windows Shell thumbnail extraction
            // This uses SolidWorks' shell extension to generate thumbnails
            Console.Error.WriteLine("[Service] Trying Windows Shell thumbnail extraction...");
            var shellResult = WindowsShellThumbnail.GetThumbnail(filePath, 256);
            if (shellResult.Success)
            {
                Console.Error.WriteLine("[Service] SUCCESS! Got thumbnail via Windows Shell.");
                return shellResult;
            }
            
            Console.Error.WriteLine($"[Service] Shell thumbnail also failed: {shellResult.Error}");
            return new CommandResult 
            { 
                Success = false, 
                Error = "Preview extraction failed (DM API and Shell both unavailable)" 
            };
        }

        static CommandResult SetPropertiesFast(string? filePath, System.Collections.Generic.Dictionary<string, string>? properties, string? configuration)
        {
            // Try Document Manager first (NO SW launch!)
            if (_dmApi != null && _dmApi.IsAvailable)
            {
                var result = _dmApi.SetCustomProperties(filePath, properties, configuration);
                if (result.Success) return result;
            }
            
            // Fall back to full SW API (will launch SW - slower)
            return _swApi!.SetCustomProperties(filePath, properties, configuration);
        }

        static CommandResult SetPropertiesBatchFast(string? filePath, System.Collections.Generic.Dictionary<string, System.Collections.Generic.Dictionary<string, string>>? configProperties)
        {
            // Try Document Manager first (NO SW launch!)
            if (_dmApi != null && _dmApi.IsAvailable)
            {
                var result = _dmApi.SetCustomPropertiesBatch(filePath, configProperties);
                if (result.Success) return result;
            }
            
            // Fall back to doing it one at a time with SW API (slower)
            if (configProperties == null)
                return new CommandResult { Success = false, Error = "Missing configProperties" };
                
            int success = 0;
            foreach (var kvp in configProperties)
            {
                var result = _swApi!.SetCustomProperties(filePath, kvp.Value, kvp.Key);
                if (result.Success) success++;
            }
            
            return new CommandResult 
            { 
                Success = success > 0,
                Data = new { configurationsProcessed = success }
            };
        }

        // ========================================
        // Service control
        // ========================================

        static CommandResult Ping()
        {
            Console.Error.WriteLine("[Service] Ping received");
            Console.Error.WriteLine($"[Service] DM API instance: {(_dmApi != null ? "exists" : "null")}");
            Console.Error.WriteLine($"[Service] DM API IsAvailable: {_dmApi?.IsAvailable ?? false}");
            Console.Error.WriteLine($"[Service] DM API InitError: {_dmApi?.InitializationError ?? "(none)"}");
            Console.Error.WriteLine($"[Service] SW API IsSolidWorksAvailable: {_swApi?.IsSolidWorksAvailable() ?? false}");
            
            return new CommandResult 
            { 
                Success = true, 
                Data = new 
                { 
                    message = "pong", 
                    version = "1.0.0",
                    documentManagerAvailable = _dmApi?.IsAvailable ?? false,
                    documentManagerError = _dmApi?.IsAvailable == false ? _dmApi?.InitializationError : null,
                    swInstalled = _swApi!.IsSolidWorksAvailable(),
                    fastModeEnabled = _dmApi?.IsAvailable ?? false
                } 
            };
        }

        static CommandResult SetDmLicense(string? licenseKey)
        {
            Console.Error.WriteLine("[Service] SetDmLicense command received");
            Console.Error.WriteLine($"[Service] License key provided: {!string.IsNullOrEmpty(licenseKey)}");
            
            if (licenseKey == null || licenseKey.Length == 0)
                return new CommandResult { Success = false, Error = "Missing 'licenseKey'" };

            Console.Error.WriteLine("[Service] License key provided for update");

            if (_dmApi == null)
            {
                Console.Error.WriteLine("[Service] Creating new DocumentManagerAPI instance");
                _dmApi = new DocumentManagerAPI();
            }

            Console.Error.WriteLine("[Service] Calling SetLicenseKey...");
            var success = _dmApi.SetLicenseKey(licenseKey);
            Console.Error.WriteLine($"[Service] SetLicenseKey result: {(success ? "SUCCESS" : "FAILED")}");
            if (!success)
            {
                Console.Error.WriteLine($"[Service] Error: {_dmApi.InitializationError}");
            }

            return new CommandResult
            {
                Success = success,
                Data = success ? new { message = "Document Manager license key set successfully! Fast mode now enabled." } : null,
                Error = success ? null : _dmApi.InitializationError
            };
        }

        static CommandResult Quit()
        {
            _dmApi?.Dispose();
            _swApi?.Dispose();
            Environment.Exit(0);
            return new CommandResult { Success = true };
        }

        static void PrintUsage()
        {
            Console.WriteLine(@"
BluePLM SolidWorks Service v1.0.0
=================================

FAST operations (Document Manager API - NO SolidWorks launch!):
  getBom, getProperties, setProperties, getConfigurations, getReferences, getPreview
  Requires a DM license key (free with SW subscription)

Open Document Management (control documents in running SolidWorks):
  getOpenDocuments, isDocumentOpen, getDocumentInfo, setDocumentReadOnly, saveDocument
  Allows checkout/checkin without closing files!

SLOW operations (Full SolidWorks API - launches SW):
  getMassProperties, exports, createDocumentFromTemplate, replaceComponent, packAndGo

Usage:
  BluePLM.SolidWorksService.exe [options]

Options:
  --dm-license <key>   Document Manager API license key for fast mode
  
  --close-sw-after     Close SolidWorks after each operation
  
  --command <json>     Execute a single command and exit
  
  --help               Show this help message

Getting a Document Manager License Key (FREE with SW subscription):
  1. Go to https://customerportal.solidworks.com/
  2. Log in with your SolidWorks subscription
  3. Navigate to 'API Support' → 'Request Document Manager Key'
  4. Copy the key and use with --dm-license or setDmLicense command

Commands:
  {""action"": ""ping""}
  {""action"": ""setDmLicense"", ""licenseKey"": ""YOUR_KEY_HERE""}
  
  -- FAST (no SW launch with DM key) --
  {""action"": ""getBom"", ""filePath"": ""...""}
  {""action"": ""getProperties"", ""filePath"": ""..."", ""configuration"": ""Default""}
  {""action"": ""setProperties"", ""filePath"": ""..."", ""properties"": {""PartNumber"": ""BR-12345""}}
  {""action"": ""getConfigurations"", ""filePath"": ""...""}
  {""action"": ""getReferences"", ""filePath"": ""...""}
  {""action"": ""getPreview"", ""filePath"": ""..."", ""configuration"": ""Default""}
  
  -- Open Document Management (checkout/checkin without closing SW!) --
  {""action"": ""getOpenDocuments""}
  {""action"": ""isDocumentOpen"", ""filePath"": ""...""}
  {""action"": ""getDocumentInfo"", ""filePath"": ""...""}
  {""action"": ""setDocumentReadOnly"", ""filePath"": ""..."", ""readOnly"": false}
  {""action"": ""saveDocument"", ""filePath"": ""...""}
  
  -- SLOW (launches SolidWorks) --
  {""action"": ""getMassProperties"", ""filePath"": ""...""}
  {""action"": ""exportPdf"", ""filePath"": ""...""}
  {""action"": ""exportStep"", ""filePath"": ""...""}
  {""action"": ""createDocumentFromTemplate"", ""templatePath"": ""C:\\templates\\Part.prtdot"", ""outputPath"": ""C:\\output\\NewPart.sldprt""}
  {""action"": ""replaceComponent"", ""filePath"": ""..."", ""oldComponent"": ""..."", ""newComponent"": ""...""}
  {""action"": ""packAndGo"", ""filePath"": ""..."", ""outputFolder"": ""...""}
");
        }
    }

    public class CommandResult
    {
        [JsonProperty("success")]
        public bool Success { get; set; }

        [JsonProperty("data", NullValueHandling = NullValueHandling.Ignore)]
        public object? Data { get; set; }

        [JsonProperty("error", NullValueHandling = NullValueHandling.Ignore)]
        public string? Error { get; set; }

        [JsonProperty("errorDetails", NullValueHandling = NullValueHandling.Ignore)]
        public string? ErrorDetails { get; set; }

        [JsonProperty("requestId", NullValueHandling = NullValueHandling.Ignore)]
        public int? RequestId { get; set; }
    }
    
    /// <summary>
    /// PDM metadata passed from the frontend as fallback for file properties
    /// </summary>
    public class PdmMetadata
    {
        [JsonProperty("partNumber")]
        public string? PartNumber { get; set; }
        
        [JsonProperty("tabNumber")]
        public string? TabNumber { get; set; }
        
        [JsonProperty("revision")]
        public string? Revision { get; set; }
        
        [JsonProperty("description")]
        public string? Description { get; set; }
    }
}
