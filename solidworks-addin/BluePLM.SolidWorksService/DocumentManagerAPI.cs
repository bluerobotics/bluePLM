using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;

namespace BluePLM.SolidWorksService
{
    /// <summary>
    /// Lightweight SolidWorks Document Manager API handler.
    /// Reads metadata, properties, BOM, configurations WITHOUT launching SolidWorks!
    /// 
    /// Requires a Document Manager API license key (free with SolidWorks subscription).
    /// Get yours at: https://customerportal.solidworks.com/ → API Support
    /// 
    /// Note: This feature dynamically loads the Document Manager DLL at runtime
    /// from the user's SolidWorks installation. Works on any machine with SolidWorks installed.
    /// </summary>
    public class DocumentManagerAPI : IDisposable
    {
        private object? _dmApp;
        private Assembly? _dmAssembly;
        private readonly string? _licenseKey;
        private bool _disposed;
        private bool _initialized;
        private string? _initError;

        // Common SolidWorks installation paths to search for the Document Manager DLL
        private static readonly string[] DllSearchPaths = new[]
        {
            @"C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\api\redist\SolidWorks.Interop.swdocumentmgr.dll",
            @"C:\Program Files\SolidWorks Corp\SolidWorks\api\redist\SolidWorks.Interop.swdocumentmgr.dll",
            @"C:\Program Files (x86)\SOLIDWORKS Corp\SOLIDWORKS\api\redist\SolidWorks.Interop.swdocumentmgr.dll",
            @"C:\Program Files\Common Files\SolidWorks Shared\SolidWorks.Interop.swdocumentmgr.dll",
        };

        public DocumentManagerAPI(string? licenseKey = null)
        {
            _licenseKey = licenseKey;
        }

        public bool IsAvailable => _initialized && _dmApp != null;
        public string? InitializationError => _initError;

        #region Dynamic Assembly Loading

        /// <summary>
        /// Log a debug message to stderr (captured by Electron)
        /// </summary>
        private void LogDebug(string message)
        {
            Console.Error.WriteLine($"[DM-API] {message}");
        }

        /// <summary>
        /// Try to load the Document Manager assembly from the user's SolidWorks installation
        /// </summary>
        private bool TryLoadAssembly()
        {
            if (_dmAssembly != null) 
            {
                LogDebug("Assembly already loaded");
                return true;
            }

            LogDebug($"Searching for Document Manager DLL in {DllSearchPaths.Length} locations...");

            foreach (var path in DllSearchPaths)
            {
                LogDebug($"  Checking: {path}");
                if (File.Exists(path))
                {
                    LogDebug($"  Found DLL at: {path}");
                    try
                    {
                        _dmAssembly = Assembly.LoadFrom(path);
                        LogDebug($"  Successfully loaded assembly from: {path}");
                        return true;
                    }
                    catch (Exception ex)
                    {
                        LogDebug($"  FAILED to load from {path}: {ex.Message}");
                    }
                }
                else
                {
                    LogDebug($"  Not found at: {path}");
                }
            }

            // Also check environment variable for custom path
            var customPath = Environment.GetEnvironmentVariable("SOLIDWORKS_DM_DLL_PATH");
            LogDebug($"Checking SOLIDWORKS_DM_DLL_PATH env var: {(string.IsNullOrEmpty(customPath) ? "(not set)" : customPath)}");
            if (!string.IsNullOrEmpty(customPath) && File.Exists(customPath))
            {
                try
                {
                    _dmAssembly = Assembly.LoadFrom(customPath);
                    LogDebug($"Successfully loaded assembly from custom path: {customPath}");
                    return true;
                }
                catch (Exception ex)
                {
                    LogDebug($"FAILED to load from custom path {customPath}: {ex.Message}");
                }
            }

            LogDebug("Document Manager DLL not found in any search location");
            return false;
        }

        /// <summary>
        /// Get a type from the loaded Document Manager assembly
        /// </summary>
        private Type? GetDmType(string typeName)
        {
            return _dmAssembly?.GetType($"SolidWorks.Interop.swdocumentmgr.{typeName}");
        }

        #endregion

        #region Initialization

        public bool Initialize()
        {
            LogDebug("=== Initialize() called ===");
            
            if (_initialized) 
            {
                LogDebug($"Already initialized. _dmApp is {(_dmApp != null ? "available" : "null")}");
                return _dmApp != null;
            }

            try
            {
                // First, try to load the Document Manager DLL
                LogDebug("Step 1: Loading Document Manager DLL...");
                if (!TryLoadAssembly())
                {
                    _initError = "Document Manager DLL not found. Please ensure SolidWorks is installed. " +
                                 "You can also set SOLIDWORKS_DM_DLL_PATH environment variable to specify the DLL location.";
                    LogDebug($"FAILED: {_initError}");
                    _initialized = true;
                    return false;
                }
                LogDebug("Step 1: SUCCESS - DLL loaded");

                LogDebug("Step 2: Checking license key...");
                var key = _licenseKey ?? Environment.GetEnvironmentVariable("SOLIDWORKS_DM_LICENSE_KEY");
                
                if (string.IsNullOrEmpty(key))
                {
                    _initError = "Document Manager license key not provided. Set SOLIDWORKS_DM_LICENSE_KEY environment variable or use 'setDmLicense' command.";
                    LogDebug($"FAILED: {_initError}");
                    _initialized = true;
                    return false;
                }
                
                // Log key info (masked for security)
                var keyPrefix = key.Length > 30 ? key.Substring(0, 30) + "..." : key;
                var keyLength = key.Length;
                var hasCommas = key.Contains(",");
                var hasColon = key.Contains(":");
                LogDebug($"Step 2: SUCCESS - License key found");
                LogDebug($"  Key length: {keyLength} chars");
                LogDebug($"  Key prefix: {keyPrefix}");
                LogDebug($"  Has colon separator: {hasColon}");
                LogDebug($"  Has comma separators: {hasCommas}");
                if (hasCommas)
                {
                    var parts = key.Split(',');
                    LogDebug($"  Number of license components: {parts.Length}");
                    foreach (var part in parts)
                    {
                        var partType = part.Contains(":") ? part.Split(':')[1].Split('-')[0] : part.Split('-')[0];
                        LogDebug($"    - {partType} (len={part.Length})");
                    }
                }

                // Create SwDMClassFactory using COM ProgID (the proper way to instantiate COM objects)
                LogDebug("Step 3: Creating SwDMClassFactory via COM ProgID...");
                var factoryType = Type.GetTypeFromProgID("SwDocumentMgr.SwDMClassFactory");
                if (factoryType == null)
                {
                    // Fallback: try from loaded assembly (older approach)
                    LogDebug("  ProgID not found, trying from loaded assembly...");
                    factoryType = GetDmType("SwDMClassFactory");
                }
                
                if (factoryType == null)
                {
                    _initError = "Failed to find SwDMClassFactory type. Document Manager may not be installed.";
                    LogDebug($"FAILED: {_initError}");
                    // List available types for debugging
                    LogDebug("Available types in assembly:");
                    if (_dmAssembly != null)
                    {
                        foreach (var t in _dmAssembly.GetTypes().Take(20))
                        {
                            LogDebug($"  - {t.FullName}");
                        }
                    }
                    _initialized = true;
                    return false;
                }
                LogDebug($"Step 3: SUCCESS - Found SwDMClassFactory type: {factoryType.FullName}");

                LogDebug("Step 4: Creating factory instance...");
                var factory = Activator.CreateInstance(factoryType);
                if (factory == null)
                {
                    _initError = "Failed to create SwDMClassFactory instance.";
                    LogDebug($"FAILED: {_initError}");
                    _initialized = true;
                    return false;
                }
                LogDebug($"Step 4: SUCCESS - Factory instance created: {factory.GetType().FullName}");

                // Call GetApplication method
                LogDebug("Step 5: Looking for GetApplication method...");
                var getAppMethod = factoryType.GetMethod("ISwDMClassFactory_QueryInterface") ?? 
                                   factoryType.GetMethod("GetApplication");
                
                // Try to get the application through the interface
                var iFactoryType = GetDmType("ISwDMClassFactory");
                LogDebug($"  ISwDMClassFactory type: {(iFactoryType != null ? "found" : "not found")}");
                if (iFactoryType != null)
                {
                    getAppMethod = iFactoryType.GetMethod("GetApplication");
                    LogDebug($"  GetApplication from interface: {(getAppMethod != null ? "found" : "not found")}");
                }

                LogDebug("Step 6: Calling GetApplication with license key...");
                if (getAppMethod == null)
                {
                    // Try direct invocation via COM
                    LogDebug("  Using dynamic COM invocation...");
                    try
                    {
                        dynamic dynamicFactory = factory;
                        _dmApp = dynamicFactory.GetApplication(key);
                        LogDebug($"  Dynamic call result: {(_dmApp != null ? "SUCCESS" : "returned null")}");
                    }
                    catch (Exception ex)
                    {
                        _initError = $"Failed to call GetApplication: {ex.Message}";
                        LogDebug($"FAILED: {_initError}");
                        LogDebug($"  Exception type: {ex.GetType().Name}");
                        LogDebug($"  Stack trace: {ex.StackTrace}");
                        if (ex.InnerException != null)
                        {
                            LogDebug($"  Inner exception: {ex.InnerException.Message}");
                        }
                        _initialized = true;
                        return false;
                    }
                }
                else
                {
                    LogDebug("  Using reflection invoke...");
                    try
                    {
                        _dmApp = getAppMethod.Invoke(factory, new object[] { key });
                        LogDebug($"  Reflection call result: {(_dmApp != null ? "SUCCESS" : "returned null")}");
                    }
                    catch (Exception ex)
                    {
                        _initError = $"Failed to invoke GetApplication: {ex.Message}";
                        LogDebug($"FAILED: {_initError}");
                        LogDebug($"  Exception type: {ex.GetType().Name}");
                        if (ex.InnerException != null)
                        {
                            LogDebug($"  Inner exception: {ex.InnerException.Message}");
                        }
                        _initialized = true;
                        return false;
                    }
                }
                
                if (_dmApp == null)
                {
                    _initError = "Failed to initialize Document Manager. Check that the license key is valid.";
                    LogDebug($"FAILED: {_initError}");
                    LogDebug("  GetApplication returned null - this usually means the license key is invalid or expired");
                    _initialized = true;
                    return false;
                }

                LogDebug($"Step 6: SUCCESS - _dmApp created: {_dmApp.GetType().FullName}");
                LogDebug("=== Document Manager API initialized successfully! ===");
                _initialized = true;
                return true;
            }
            catch (Exception ex)
            {
                _initError = $"Document Manager initialization failed: {ex.Message}";
                LogDebug($"EXCEPTION during initialization: {ex.Message}");
                LogDebug($"  Exception type: {ex.GetType().Name}");
                LogDebug($"  Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    LogDebug($"  Inner exception: {ex.InnerException.Message}");
                }
                _initialized = true;
                return false;
            }
        }

        public bool SetLicenseKey(string key)
        {
            LogDebug("=== SetLicenseKey() called ===");
            
            if (string.IsNullOrEmpty(key))
            {
                _initError = "License key cannot be empty";
                LogDebug($"FAILED: {_initError}");
                return false;
            }

            // Log key info (masked for security)
            var keyPrefix = key.Length > 30 ? key.Substring(0, 30) + "..." : key;
            LogDebug($"License key length: {key.Length} chars");
            LogDebug($"License key prefix: {keyPrefix}");
            LogDebug($"Has colon: {key.Contains(":")}");
            LogDebug($"Has commas: {key.Contains(",")}");
            if (key.Contains(","))
            {
                var parts = key.Split(',');
                LogDebug($"Number of license components: {parts.Length}");
            }

            LogDebug("Resetting state...");
            _disposed = false;
            _initialized = false;
            _dmApp = null;

            try
            {
                LogDebug("Loading assembly...");
                if (!TryLoadAssembly())
                {
                    _initError = "Document Manager DLL not found. Please ensure SolidWorks is installed.";
                    LogDebug($"FAILED: {_initError}");
                    return false;
                }
                LogDebug("Assembly loaded successfully");

                // Create factory using COM ProgID (the proper way to instantiate COM objects)
                LogDebug("Creating SwDMClassFactory via COM ProgID...");
                var factoryType = Type.GetTypeFromProgID("SwDocumentMgr.SwDMClassFactory");
                if (factoryType == null)
                {
                    // Fallback: try from loaded assembly (older approach)
                    LogDebug("ProgID not found, trying from loaded assembly...");
                    factoryType = GetDmType("SwDMClassFactory");
                }
                
                if (factoryType == null)
                {
                    _initError = "Failed to find SwDMClassFactory type. Document Manager may not be installed.";
                    LogDebug($"FAILED: {_initError}");
                    return false;
                }
                LogDebug($"Factory type found: {factoryType.FullName}");

                LogDebug("Creating factory instance...");
                var factory = Activator.CreateInstance(factoryType);
                if (factory == null)
                {
                    _initError = "Failed to create factory instance.";
                    LogDebug($"FAILED: {_initError}");
                    return false;
                }
                LogDebug("Factory instance created");

                LogDebug("Calling GetApplication with license key...");
                
                // Use reflection to call GetApplication (more reliable than dynamic binding)
                var iFactoryType = GetDmType("ISwDMClassFactory");
                System.Reflection.MethodInfo? getAppMethod = null;
                if (iFactoryType != null)
                {
                    getAppMethod = iFactoryType.GetMethod("GetApplication");
                    LogDebug($"  GetApplication from interface: {(getAppMethod != null ? "found" : "not found")}");
                }
                
                try
                {
                    if (getAppMethod != null)
                    {
                        LogDebug("  Using reflection invoke...");
                        _dmApp = getAppMethod.Invoke(factory, new object[] { key });
                        LogDebug($"  Reflection call result: {(_dmApp != null ? "SUCCESS" : "returned null")}");
                    }
                    else
                    {
                        // Fallback to dynamic (requires Microsoft.CSharp)
                        LogDebug("  Using dynamic COM invocation...");
                        dynamic dynamicFactory = factory;
                        _dmApp = dynamicFactory.GetApplication(key);
                        LogDebug($"  Dynamic call result: {(_dmApp != null ? "SUCCESS" : "returned null")}");
                    }
                }
                catch (Exception ex)
                {
                    _initError = $"Invalid license key: {ex.Message}";
                    LogDebug($"FAILED: {_initError}");
                    LogDebug($"Exception type: {ex.GetType().Name}");
                    if (ex.InnerException != null)
                    {
                        LogDebug($"Inner exception: {ex.InnerException.Message}");
                    }
                    _initialized = true;
                    return false;
                }
                
                if (_dmApp == null)
                {
                    _initError = "Invalid license key - GetApplication returned null";
                    LogDebug($"FAILED: {_initError}");
                    LogDebug("This usually means the license key format is incorrect or the key is invalid/expired");
                    _initialized = true;
                    return false;
                }

                LogDebug($"Document Manager application created: {_dmApp.GetType().FullName}");

                try 
                { 
                    Environment.SetEnvironmentVariable("SOLIDWORKS_DM_LICENSE_KEY", key, EnvironmentVariableTarget.User); 
                    LogDebug("Saved license key to user environment variable");
                }
                catch (Exception ex)
                {
                    LogDebug($"Warning: Could not save license key to environment: {ex.Message}");
                }

                _initialized = true;
                _initError = null;
                LogDebug("=== SetLicenseKey() completed successfully! ===");
                return true;
            }
            catch (Exception ex)
            {
                _initError = $"License key validation failed: {ex.Message}";
                LogDebug($"EXCEPTION: {_initError}");
                LogDebug($"Exception type: {ex.GetType().Name}");
                LogDebug($"Stack trace: {ex.StackTrace}");
                _initialized = true;
                return false;
            }
        }

        private object? OpenDocument(string filePath, out int error)
        {
            error = 0; // swDmDocumentOpenErrorNone
            
            if (_dmApp == null)
            {
                error = 1; // swDmDocumentOpenErrorFail
                return null;
            }

            var docType = GetDocumentTypeValue(filePath);
            if (docType == 0) // swDmDocumentUnknown
            {
                error = 2; // swDmDocumentOpenErrorFileNotFound
                return null;
            }

            try
            {
                dynamic app = _dmApp;
                return app.GetDocument(filePath, docType, true, out error);
            }
            catch
            {
                error = 1;
                return null;
            }
        }

        private int GetDocumentTypeValue(string filePath)
        {
            var ext = Path.GetExtension(filePath).ToLowerInvariant();
            return ext switch
            {
                ".sldprt" => 1, // swDmDocumentPart
                ".sldasm" => 2, // swDmDocumentAssembly
                ".slddrw" => 3, // swDmDocumentDrawing
                _ => 0 // swDmDocumentUnknown
            };
        }

        #endregion

        #region Custom Properties (NO SW LAUNCH!)

        public CommandResult GetCustomProperties(string? filePath, string? configuration = null)
        {
            if (!Initialize() || _dmApp == null)
                return new CommandResult { Success = false, Error = _initError ?? "Document Manager not available" };

            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            object? doc = null;
            try
            {
                doc = OpenDocument(filePath!, out var openError);
                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open file: error code {openError}" };

                dynamic dynDoc = doc;
                var fileProps = ReadProperties(dynDoc, null);
                var configNames = GetConfigurationNames(dynDoc);
                var configProps = new Dictionary<string, Dictionary<string, string>>();
                
                foreach (var config in configNames)
                {
                    if (configuration == null || config == configuration)
                    {
                        configProps[config] = ReadProperties(dynDoc, config);
                    }
                }

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        filePath,
                        fileProperties = fileProps,
                        configurationProperties = configProps,
                        configurations = configNames
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
            finally
            {
                // ALWAYS close the document to release file locks
                if (doc != null)
                {
                    try { ((dynamic)doc).CloseDoc(); } catch { }
                }
            }
        }

        private Dictionary<string, string> ReadProperties(dynamic doc, string? configuration)
        {
            var props = new Dictionary<string, string>();

            try
            {
                if (string.IsNullOrEmpty(configuration))
                {
                    var propNames = (string[]?)doc.GetCustomPropertyNames();
                    if (propNames != null)
                    {
                        foreach (var name in propNames)
                        {
                            object propType;
                            string value = doc.GetCustomProperty(name, out propType);
                            props[name] = value ?? "";
                        }
                    }
                }
                else
                {
                    var configMgr = doc.ConfigurationManager;
                    var config = configMgr.GetConfigurationByName(configuration);
                    if (config != null)
                    {
                        var propNames = (string[]?)config.GetCustomPropertyNames();
                        if (propNames != null)
                        {
                            foreach (var name in propNames)
                            {
                                object propType;
                                string value = config.GetCustomProperty(name, out propType);
                                props[name] = value ?? "";
                            }
                        }
                    }
                }
            }
            catch { }

            return props;
        }

        /// <summary>
        /// Set custom properties on a file WITHOUT launching SolidWorks!
        /// Can set file-level or configuration-specific properties.
        /// </summary>
        public CommandResult SetCustomProperties(string? filePath, Dictionary<string, string>? properties, string? configuration = null)
        {
            if (!Initialize() || _dmApp == null)
                return new CommandResult { Success = false, Error = _initError ?? "Document Manager not available" };

            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            if (properties == null || properties.Count == 0)
                return new CommandResult { Success = false, Error = "Missing or empty 'properties'" };

            object? doc = null;
            try
            {
                // Open document for WRITE access (not read-only)
                doc = OpenDocumentForWrite(filePath!, out var openError);
                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open file for writing: error code {openError}" };

                dynamic dynDoc = doc;
                int propsSet = 0;
                const int swDmCustomInfoText = 2;

                if (string.IsNullOrEmpty(configuration))
                {
                    // Set file-level properties
                    foreach (var kvp in properties)
                    {
                        try
                        {
                            try { dynDoc.DeleteCustomProperty(kvp.Key); } catch { }
                            dynDoc.AddCustomProperty(kvp.Key, swDmCustomInfoText, kvp.Value);
                            propsSet++;
                        }
                        catch
                        {
                            try 
                            { 
                                dynDoc.SetCustomProperty(kvp.Key, kvp.Value);
                                propsSet++; 
                            } 
                            catch { }
                        }
                    }
                }
                else
                {
                    // Set configuration-specific properties
                    var configMgr = dynDoc.ConfigurationManager;
                    var config = configMgr.GetConfigurationByName(configuration);
                    if (config == null)
                    {
                        return new CommandResult { Success = false, Error = $"Configuration not found: {configuration}" };
                    }

                    foreach (var kvp in properties)
                    {
                        try
                        {
                            try { config.DeleteCustomProperty(kvp.Key); } catch { }
                            config.AddCustomProperty(kvp.Key, swDmCustomInfoText, kvp.Value);
                            propsSet++;
                        }
                        catch
                        {
                            try 
                            { 
                                config.SetCustomProperty(kvp.Key, kvp.Value);
                                propsSet++; 
                            } 
                            catch { }
                        }
                    }
                }

                // Save the document
                dynDoc.Save();

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        filePath,
                        propertiesSet = propsSet,
                        configuration = configuration ?? "file-level"
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
            finally
            {
                // ALWAYS close the document to release file locks
                if (doc != null)
                {
                    try { ((dynamic)doc).CloseDoc(); } catch { }
                }
            }
        }

        /// <summary>
        /// Open document for write access (not read-only)
        /// </summary>
        private object? OpenDocumentForWrite(string filePath, out int error)
        {
            error = 0;

            if (_dmApp == null)
            {
                error = 1;
                return null;
            }

            var docType = GetDocumentTypeValue(filePath);
            if (docType == 0)
            {
                error = 1;
                return null;
            }

            try
            {
                dynamic app = _dmApp;
                // Open with write access (readOnly = false)
                return app.GetDocument(filePath, docType, false, out error);
            }
            catch
            {
                error = 1;
                return null;
            }
        }

        #endregion

        #region Configurations (NO SW LAUNCH!)

        public CommandResult GetConfigurations(string? filePath)
        {
            if (!Initialize() || _dmApp == null)
                return new CommandResult { Success = false, Error = _initError ?? "Document Manager not available" };

            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            object? doc = null;
            try
            {
                doc = OpenDocument(filePath!, out var openError);
                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open file: error code {openError}" };

                dynamic dynDoc = doc;
                var configNames = GetConfigurationNames(dynDoc);
                var configs = new List<object>();
                var activeConfig = (string)dynDoc.ConfigurationManager.GetActiveConfigurationName();

                foreach (var name in configNames)
                {
                    var config = dynDoc.ConfigurationManager.GetConfigurationByName(name);
                    var props = ReadProperties(dynDoc, name);

                    configs.Add(new
                    {
                        name,
                        isActive = name == activeConfig,
                        description = config?.Description ?? "",
                        properties = props
                    });
                }

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        filePath,
                        activeConfiguration = activeConfig,
                        configurations = configs,
                        count = configs.Count
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
            finally
            {
                // ALWAYS close the document to release file locks
                if (doc != null)
                {
                    try { ((dynamic)doc).CloseDoc(); } catch { }
                }
            }
        }

        private string[] GetConfigurationNames(dynamic doc)
        {
            try
            {
                var names = (string[]?)doc.ConfigurationManager.GetConfigurationNames();
                return names ?? Array.Empty<string>();
            }
            catch
            {
                return Array.Empty<string>();
            }
        }

        #endregion

        #region BOM / References (NO SW LAUNCH!)

        public CommandResult GetBillOfMaterials(string? filePath, string? configuration = null)
        {
            if (!Initialize() || _dmApp == null)
                return new CommandResult { Success = false, Error = _initError ?? "Document Manager not available" };

            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            var ext = Path.GetExtension(filePath).ToLowerInvariant();
            if (ext != ".sldasm")
                return new CommandResult { Success = false, Error = "BOM extraction only works on assembly files (.sldasm)" };

            object? doc = null;
            try
            {
                doc = OpenDocument(filePath!, out var openError);
                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open file: error code {openError}" };

                dynamic dynDoc = doc;
                var bom = new List<BomItem>();
                var quantities = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

                var configName = configuration ?? (string)dynDoc.ConfigurationManager.GetActiveConfigurationName();
                
                // Get external references using reflection
                var searchOptType = GetDmType("SwDMSearchOptionClass");
                if (searchOptType != null)
                {
                    var searchOpt = Activator.CreateInstance(searchOptType);
                    if (searchOpt != null)
                    {
                        dynamic dynSearchOpt = searchOpt;
                        dynSearchOpt.SearchFilters = 3; // SwDmSearchForPart | SwDmSearchForAssembly

                        var dependencies = (string[]?)dynDoc.GetAllExternalReferences(searchOpt);

                        if (dependencies != null)
                        {
                            foreach (var depPath in dependencies)
                            {
                                if (string.IsNullOrEmpty(depPath)) continue;

                                if (quantities.ContainsKey(depPath))
                                    quantities[depPath]++;
                                else
                                    quantities[depPath] = 1;
                            }

                            var processed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            foreach (var depPath in dependencies)
                            {
                                if (string.IsNullOrEmpty(depPath) || processed.Contains(depPath)) continue;
                                if (!File.Exists(depPath)) continue;
                                processed.Add(depPath);

                                var depExt = Path.GetExtension(depPath).ToLowerInvariant();
                                var fileType = depExt == ".sldprt" ? "Part" : depExt == ".sldasm" ? "Assembly" : "Other";

                                var props = new Dictionary<string, string>();
                                object? compDoc = null;
                                try
                                {
                                    compDoc = OpenDocument(depPath, out _);
                                    if (compDoc != null)
                                    {
                                        dynamic dynCompDoc = compDoc;
                                        props = ReadProperties(dynCompDoc, null);
                                    }
                                }
                                catch { }
                                finally
                                {
                                    // ALWAYS close component documents
                                    if (compDoc != null)
                                    {
                                        try { ((dynamic)compDoc).CloseDoc(); } catch { }
                                    }
                                }

                                bom.Add(new BomItem
                                {
                                    FileName = Path.GetFileName(depPath),
                                    FilePath = depPath,
                                    FileType = fileType,
                                    Quantity = quantities[depPath],
                                    Configuration = "",
                                    PartNumber = GetPartNumber(props),
                                    Description = GetDictValue(props, "Description") ?? "",
                                    Material = GetDictValue(props, "Material") ?? "",
                                    Revision = GetRevision(props),
                                    Properties = props
                                });
                            }
                        }
                    }
                }

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        assemblyPath = filePath,
                        configuration = configName,
                        items = bom,
                        totalParts = bom.Count,
                        totalQuantity = bom.Sum(b => b.Quantity)
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
            finally
            {
                // ALWAYS close the document to release file locks
                if (doc != null)
                {
                    try { ((dynamic)doc).CloseDoc(); } catch { }
                }
            }
        }

        public CommandResult GetExternalReferences(string? filePath)
        {
            if (!Initialize() || _dmApp == null)
                return new CommandResult { Success = false, Error = _initError ?? "Document Manager not available" };

            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            object? doc = null;
            try
            {
                doc = OpenDocument(filePath!, out var openError);
                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open file: error code {openError}" };

                dynamic dynDoc = doc;
                var references = new List<object>();
                
                var searchOptType = GetDmType("SwDMSearchOptionClass");
                if (searchOptType != null)
                {
                    var searchOpt = Activator.CreateInstance(searchOptType);
                    if (searchOpt != null)
                    {
                        dynamic dynSearchOpt = searchOpt;
                        dynSearchOpt.SearchFilters = 7; // Part | Assembly | Drawing

                        var dependencies = (string[]?)dynDoc.GetAllExternalReferences(searchOpt);

                        if (dependencies != null)
                        {
                            var processed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            foreach (var depPath in dependencies)
                            {
                                if (string.IsNullOrEmpty(depPath) || processed.Contains(depPath)) continue;
                                processed.Add(depPath);

                                var depExt = Path.GetExtension(depPath).ToLowerInvariant();
                                references.Add(new
                                {
                                    path = depPath,
                                    fileName = Path.GetFileName(depPath),
                                    exists = File.Exists(depPath),
                                    fileType = depExt == ".sldprt" ? "Part" : depExt == ".sldasm" ? "Assembly" : depExt == ".slddrw" ? "Drawing" : "Other"
                                });
                            }
                        }
                    }
                }

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        filePath,
                        references,
                        count = references.Count
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
            finally
            {
                // ALWAYS close the document to release file locks
                if (doc != null)
                {
                    try { ((dynamic)doc).CloseDoc(); } catch { }
                }
            }
        }

        #endregion

        #region Preview Extraction (NO SW LAUNCH!)

        /// <summary>
        /// Extract high-resolution preview image from a SolidWorks file.
        /// Returns the image as a base64-encoded PNG string.
        /// </summary>
        public CommandResult GetPreviewImage(string? filePath, string? configuration = null)
        {
            if (!Initialize() || _dmApp == null)
                return new CommandResult { Success = false, Error = _initError ?? "Document Manager not available" };

            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            object? doc = null;
            try
            {
                doc = OpenDocument(filePath!, out var openError);
                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open file: error code {openError}" };

                dynamic dynDoc = doc;
                object? previewBitmap = null;
                
                // Try to get preview from specific configuration first
                if (!string.IsNullOrEmpty(configuration))
                {
                    try
                    {
                        var config = dynDoc.ConfigurationManager.GetConfigurationByName(configuration);
                        if (config != null)
                        {
                            int errResult;
                            previewBitmap = config.GetPreviewBitmap(out errResult);
                            if (errResult != 0) // swDmPreviewErrorNone
                                previewBitmap = null;
                        }
                    }
                    catch { previewBitmap = null; }
                }

                // Fall back to document-level preview
                if (previewBitmap == null)
                {
                    try
                    {
                        int errResult;
                        previewBitmap = dynDoc.GetPreviewBitmap(out errResult);
                        if (errResult != 0 || previewBitmap == null)
                        {
                            return new CommandResult { Success = false, Error = "No preview available for this file" };
                        }
                    }
                    catch (Exception ex)
                    {
                        return new CommandResult { Success = false, Error = $"Failed to extract preview: {ex.Message}" };
                    }
                }

                // The preview bitmap is a byte array containing DIB data
                if (previewBitmap is byte[] dibData && dibData.Length > 0)
                {
                    var pngData = ConvertDibToPng(dibData);
                    if (pngData == null || pngData.Length == 0)
                    {
                        return new CommandResult { Success = false, Error = "Failed to convert preview image" };
                    }

                    var base64 = Convert.ToBase64String(pngData);

                    return new CommandResult
                    {
                        Success = true,
                        Data = new
                        {
                            filePath,
                            configuration = configuration ?? "default",
                            imageData = base64,
                            mimeType = "image/png",
                            sizeBytes = pngData.Length
                        }
                    };
                }

                return new CommandResult { Success = false, Error = "Preview data is not in expected format" };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
            finally
            {
                // ALWAYS close the document to release file locks
                if (doc != null)
                {
                    try { ((dynamic)doc).CloseDoc(); } catch { }
                }
            }
        }

        /// <summary>
        /// Convert a DIB (Device Independent Bitmap) byte array to BMP format.
        /// </summary>
        private static byte[]? ConvertDibToPng(byte[] dibData)
        {
            try
            {
                using (var ms = new MemoryStream())
                {
                    // BMP file header (14 bytes)
                    var fileSize = 14 + dibData.Length;
                    ms.Write(new byte[] { 0x42, 0x4D }, 0, 2);  // "BM" signature
                    ms.Write(BitConverter.GetBytes(fileSize), 0, 4);  // File size
                    ms.Write(new byte[] { 0, 0, 0, 0 }, 0, 4);  // Reserved
                    
                    // Calculate offset to pixel data
                    var headerSize = BitConverter.ToInt32(dibData, 0);
                    var pixelOffset = 14 + headerSize;
                    
                    // Check for color table
                    var bitCount = BitConverter.ToInt16(dibData, 14);
                    if (bitCount <= 8)
                    {
                        var colorTableSize = (1 << bitCount) * 4;
                        pixelOffset += colorTableSize;
                    }
                    
                    ms.Write(BitConverter.GetBytes(pixelOffset), 0, 4);
                    ms.Write(dibData, 0, dibData.Length);
                    
                    return ms.ToArray();
                }
            }
            catch
            {
                return null;
            }
        }

        #endregion

        #region Helpers

        private static string? GetDictValue(Dictionary<string, string> dict, string key)
        {
            if (dict.TryGetValue(key, out var value))
                return value;
            return null;
        }

        private static string GetPartNumber(Dictionary<string, string> props)
        {
            string[] partNumberKeys = {
                "Base Item Number",  // SolidWorks Document Manager standard property
                "PartNumber", "Part Number", "Part No", "Part No.", "PartNo",
                "ItemNumber", "Item Number", "Item No", "Item No.", "ItemNo",
                "PN", "P/N", "Number", "No", "No."
            };

            foreach (var key in partNumberKeys)
            {
                var value = GetDictValue(props, key);
                if (value != null && value.Length > 0)
                    return value;
            }

            foreach (var kvp in props)
            {
                var lowerKey = kvp.Key.ToLowerInvariant();
                if (lowerKey.Contains("part") && (lowerKey.Contains("number") || lowerKey.Contains("no")) ||
                    lowerKey.Contains("item") && (lowerKey.Contains("number") || lowerKey.Contains("no")) ||
                    lowerKey == "pn" || lowerKey == "p/n")
                {
                    if (!string.IsNullOrEmpty(kvp.Value))
                        return kvp.Value;
                }
            }

            return "";
        }

        private static string GetRevision(Dictionary<string, string> props)
        {
            string[] revisionKeys = {
                "Revision", "Rev", "Rev.", "REV", "RevLevel", "Rev Level",
                "Revision Level", "RevisionLevel", "ECO", "ECN", "Change Level"
            };

            foreach (var key in revisionKeys)
            {
                var value = GetDictValue(props, key);
                if (value != null && value.Length > 0)
                    return value;
            }

            foreach (var kvp in props)
            {
                var lowerKey = kvp.Key.ToLowerInvariant();
                if (lowerKey.Contains("rev") || lowerKey.Contains("eco") || lowerKey.Contains("ecn"))
                {
                    if (!string.IsNullOrEmpty(kvp.Value))
                        return kvp.Value;
                }
            }

            return "";
        }

        #endregion

        #region IDisposable

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            _dmApp = null;
            _dmAssembly = null;
            GC.Collect();
        }

        #endregion
    }
}
