using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace BluePLM.SolidWorksService
{
    /// <summary>
    /// Unified SolidWorks API handler.
    /// Uses the full SolidWorks API for all operations.
    /// SolidWorks runs in background (hidden) when needed.
    /// </summary>
    public class SolidWorksAPI : IDisposable
    {
        private ISldWorks? _swApp;
        private bool _weStartedSW;
        private bool _keepRunning;
        private bool _disposed;
        private readonly ComStabilityLayer? _comStability;

        /// <summary>
        /// Creates a new SolidWorksAPI instance.
        /// </summary>
        /// <param name="keepRunning">Whether to keep SolidWorks running after operations.</param>
        /// <param name="comStability">Optional COM stability layer for retry logic and health checks.</param>
        public SolidWorksAPI(bool keepRunning = true, ComStabilityLayer? comStability = null)
        {
            _keepRunning = keepRunning;
            _comStability = comStability;
            
            if (_comStability != null)
            {
                Console.Error.WriteLine("[SW-API] ComStabilityLayer integration enabled");
            }
        }

        #region Connection Management

        /// <summary>
        /// Check if SolidWorks is available on this machine
        /// </summary>
        public bool IsSolidWorksAvailable()
        {
            try
            {
                var swType = Type.GetTypeFromProgID("SldWorks.Application");
                return swType != null;
            }
            catch
            {
                return false;
            }
        }

        private ISldWorks GetSolidWorks()
        {
            if (_swApp != null)
            {
                // Check if still running
                try
                {
                    var version = _swApp.RevisionNumber();
                    return _swApp;
                }
                catch
                {
                    Console.Error.WriteLine("[SW-API] Existing SolidWorks connection lost, will reconnect");
                    _swApp = null;
                }
            }

            // Try to connect to running instance
            try
            {
                _swApp = (ISldWorks)Marshal.GetActiveObject("SldWorks.Application");
                _weStartedSW = false;
                Console.Error.WriteLine("[SW-API] Connected to existing SolidWorks instance");
                return _swApp;
            }
            catch
            {
                // No running instance, start one
                Console.Error.WriteLine("[SW-API] No running SolidWorks instance found");
            }

            // *** CRITICAL: About to launch SolidWorks! ***
            // This should only happen for explicit user actions that require full SW API
            // (e.g., creating new files from templates, explicit metadata refresh)
            // NEVER for background operations like preview/references/BOM extraction
            Console.Error.WriteLine("[SW-API] *** LAUNCHING SOLIDWORKS ***");
            Console.Error.WriteLine($"[SW-API] Called from: {new System.Diagnostics.StackTrace().GetFrame(1)?.GetMethod()?.Name ?? "unknown"}");

            // Start SolidWorks
            var swType = Type.GetTypeFromProgID("SldWorks.Application");
            if (swType == null)
                throw new Exception("SolidWorks is not installed on this machine");

            _swApp = (ISldWorks)Activator.CreateInstance(swType)!;
            _weStartedSW = true;

            // Run hidden
            _swApp.Visible = false;
            _swApp.UserControl = false;

            Console.Error.WriteLine("[SW-API] Waiting for SolidWorks startup to complete...");

            // Wait for SolidWorks to be ready
            int attempts = 0;
            while (!_swApp.StartupProcessCompleted && attempts < 120)
            {
                Thread.Sleep(500);
                attempts++;
            }

            if (!_swApp.StartupProcessCompleted)
                throw new Exception("SolidWorks failed to start within 60 seconds");

            Console.Error.WriteLine($"[SW-API] SolidWorks started successfully (took {attempts * 500}ms)");

            return _swApp;
        }

        private void CloseSolidWorksIfWeStartedIt()
        {
            if (!_keepRunning && _weStartedSW && _swApp != null)
            {
                try
                {
                    _swApp.ExitApp();
                    _swApp = null;
                    _weStartedSW = false;
                }
                catch { }
            }
        }

        private ModelDoc2? OpenDocument(string filePath, out int errors, out int warnings, out bool wasAlreadyOpen, bool readOnly = true)
        {
            errors = 0;
            warnings = 0;
            wasAlreadyOpen = false;

            // IMPORTANT: Initialize _swApp FIRST via GetSolidWorks()
            // Then check if document is already open (requires _swApp to be set)
            var sw = GetSolidWorks();
            
            // Now check if document is already open - this ensures _swApp is initialized
            // so IsDocumentAlreadyOpen can actually check the running SolidWorks instance
            wasAlreadyOpen = IsDocumentAlreadyOpen(filePath);
            
            var docType = GetDocumentType(filePath);

            if (docType == swDocumentTypes_e.swDocNONE)
                return null;

            var options = readOnly
                ? swOpenDocOptions_e.swOpenDocOptions_ReadOnly | swOpenDocOptions_e.swOpenDocOptions_Silent
                : swOpenDocOptions_e.swOpenDocOptions_Silent;

            return (ModelDoc2)sw.OpenDoc6(
                filePath,
                (int)docType,
                (int)options,
                "",
                ref errors,
                ref warnings
            );
        }

        private void CloseDocument(string filePath)
        {
            try
            {
                _swApp?.CloseDoc(filePath);
            }
            catch { }
        }

        /// <summary>
        /// Check if a document is already open in SolidWorks.
        /// Used to avoid closing documents that the user had open before we touched them.
        /// </summary>
        private bool IsDocumentAlreadyOpen(string filePath)
        {
            if (_swApp == null) return false;
            try
            {
                var docs = (object[])_swApp.GetDocuments();
                if (docs == null) return false;
                
                foreach (ModelDoc2 doc in docs)
                {
                    if (string.Equals(doc.GetPathName(), filePath, StringComparison.OrdinalIgnoreCase))
                        return true;
                }
            }
            catch { }
            return false;
        }

        /// <summary>
        /// Check if a file is currently open in a running SolidWorks instance.
        /// Used to decide whether to use DM API (if file not open) or SW API (if file is open).
        /// This avoids the DM API conflict where accessing a file open in SW causes SW to close it.
        /// </summary>
        public bool IsFileOpenInSolidWorks(string filePath)
        {
            Console.Error.WriteLine($"[SW-API] IsFileOpenInSolidWorks: Checking {Path.GetFileName(filePath)}");
            try
            {
                // Try to get running SolidWorks instance (don't start a new one)
                ISldWorks? swApp = null;
                try
                {
                    swApp = (ISldWorks)Marshal.GetActiveObject("SldWorks.Application");
                    Console.Error.WriteLine($"[SW-API] IsFileOpenInSolidWorks: Got SolidWorks instance");
                }
                catch (Exception ex)
                {
                    // SolidWorks not running or not accessible
                    Console.Error.WriteLine($"[SW-API] IsFileOpenInSolidWorks: SolidWorks not accessible - {ex.Message}");
                    return false;
                }
                
                if (swApp == null)
                {
                    Console.Error.WriteLine($"[SW-API] IsFileOpenInSolidWorks: swApp is null");
                    return false;
                }
                
                // Check if this file is open
                var docs = (object[])swApp.GetDocuments();
                if (docs == null || docs.Length == 0)
                {
                    Console.Error.WriteLine($"[SW-API] IsFileOpenInSolidWorks: No documents open in SolidWorks");
                    return false;
                }
                
                Console.Error.WriteLine($"[SW-API] IsFileOpenInSolidWorks: Found {docs.Length} open documents");
                
                foreach (ModelDoc2 doc in docs)
                {
                    var openPath = doc.GetPathName();
                    Console.Error.WriteLine($"[SW-API] IsFileOpenInSolidWorks: Open doc: {Path.GetFileName(openPath)}");
                    if (string.Equals(openPath, filePath, StringComparison.OrdinalIgnoreCase))
                    {
                        Console.Error.WriteLine($"[SW-API] IsFileOpenInSolidWorks: MATCH FOUND - file is open!");
                        return true;
                    }
                }
                
                Console.Error.WriteLine($"[SW-API] IsFileOpenInSolidWorks: File not found in open documents");
                return false;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[SW-API] IsFileOpenInSolidWorks: Exception - {ex.Message}");
                return false; // Any error means we can't confirm it's open
            }
        }

        private swDocumentTypes_e GetDocumentType(string filePath)
        {
            var ext = Path.GetExtension(filePath).ToLowerInvariant();
            return ext switch
            {
                ".sldprt" => swDocumentTypes_e.swDocPART,
                ".sldasm" => swDocumentTypes_e.swDocASSEMBLY,
                ".slddrw" => swDocumentTypes_e.swDocDRAWING,
                _ => swDocumentTypes_e.swDocNONE
            };
        }

        #endregion

        #region Document Creation

        /// <summary>
        /// Create a new SOLIDWORKS document from a template file.
        /// This properly converts template files (.prtdot, .asmdot, .drwdot) to 
        /// document files (.sldprt, .sldasm, .slddrw) by using the SolidWorks API.
        /// Simply copying and renaming template files does NOT work because they
        /// contain internal metadata that marks them as templates.
        /// </summary>
        /// <param name="templatePath">Path to the template file (.prtdot, .asmdot, .drwdot)</param>
        /// <param name="outputPath">Path where the new document should be saved (.sldprt, .sldasm, .slddrw)</param>
        /// <returns>CommandResult with success/error status</returns>
        public CommandResult CreateDocumentFromTemplate(string? templatePath, string? outputPath)
        {
            if (string.IsNullOrEmpty(templatePath))
                return new CommandResult { Success = false, Error = "Missing 'templatePath'" };

            if (string.IsNullOrEmpty(outputPath))
                return new CommandResult { Success = false, Error = "Missing 'outputPath'" };

            if (!File.Exists(templatePath))
                return new CommandResult { Success = false, Error = $"Template file not found: {templatePath}" };

            // Validate template extension
            var templateExt = Path.GetExtension(templatePath).ToLowerInvariant();
            if (templateExt != ".prtdot" && templateExt != ".asmdot" && templateExt != ".drwdot")
                return new CommandResult { Success = false, Error = $"Invalid template extension: {templateExt}. Expected .prtdot, .asmdot, or .drwdot" };

            // Validate output extension matches template type
            var outputExt = Path.GetExtension(outputPath).ToLowerInvariant();
            var expectedOutputExt = templateExt switch
            {
                ".prtdot" => ".sldprt",
                ".asmdot" => ".sldasm",
                ".drwdot" => ".slddrw",
                _ => ""
            };

            if (outputExt != expectedOutputExt)
                return new CommandResult { Success = false, Error = $"Output extension mismatch: expected {expectedOutputExt} for template type {templateExt}, got {outputExt}" };

            // Ensure output directory exists
            var outputDir = Path.GetDirectoryName(outputPath);
            if (!string.IsNullOrEmpty(outputDir) && !Directory.Exists(outputDir))
            {
                try
                {
                    Directory.CreateDirectory(outputDir);
                }
                catch (Exception ex)
                {
                    return new CommandResult { Success = false, Error = $"Failed to create output directory: {ex.Message}" };
                }
            }

            ModelDoc2? doc = null;
            try
            {
                var sw = GetSolidWorks();

                // Use NewDocument to create a new document from the template
                // NewDocument properly handles the template-to-document conversion
                // Parameters: templatePath, paperSize (0 = default), width (0 = default), height (0 = default)
                doc = (ModelDoc2)sw.NewDocument(templatePath, 0, 0, 0);

                if (doc == null)
                    return new CommandResult { Success = false, Error = "Failed to create document from template. SolidWorks returned null." };

                // Save the new document to the output path
                int errors = 0, warnings = 0;
                bool saveSuccess = doc.Extension.SaveAs3(
                    outputPath,
                    (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                    (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                    null,
                    null,
                    ref errors,
                    ref warnings
                );

                if (!saveSuccess)
                    return new CommandResult { Success = false, Error = $"Failed to save document: errors={errors}, warnings={warnings}" };

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        templatePath,
                        outputPath,
                        message = "Document created successfully from template"
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
            finally
            {
                // Close the document to release file locks
                // IMPORTANT: Use doc.GetTitle() instead of outputPath because after SaveAs3,
                // SolidWorks's internal document name is the FILENAME (not full path).
                // CloseDoc requires the exact document title or full path to match.
                if (doc != null)
                {
                    try 
                    { 
                        var sw = _swApp;
                        if (sw != null)
                        {
                            // Get the actual document title (filename after SaveAs)
                            var docTitle = doc.GetTitle();
                            
                            // Explicitly close by title
                            sw.CloseDoc(docTitle);
                        }
                    } 
                    catch { }
                    finally
                    {
                        // Release COM reference to ensure file lock is freed
                        // This is critical - without releasing, the file can remain locked
                        try { Marshal.ReleaseComObject(doc); } catch { }
                        doc = null;
                    }
                }
                CloseSolidWorksIfWeStartedIt();
            }
        }

        #endregion

        #region BOM / References

        /// <summary>
        /// Get Bill of Materials from an assembly
        /// </summary>
        public CommandResult GetBillOfMaterials(string? filePath, bool includeChildren = true, string? configuration = null)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            var ext = Path.GetExtension(filePath).ToLowerInvariant();
            if (ext != ".sldasm")
                return new CommandResult { Success = false, Error = "BOM extraction only works on assembly files (.sldasm)" };

            ModelDoc2? doc = null;
            bool wasAlreadyOpen = false;
            try
            {
                doc = OpenDocument(filePath!, out var errors, out var warnings, out wasAlreadyOpen);
                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open file: errors={errors}" };

                var assembly = (AssemblyDoc)doc;
                var bom = new List<BomItem>();
                
                // Get active configuration if not specified
                var configName = configuration ?? doc.ConfigurationManager.ActiveConfiguration.Name;

                // Get all components
                var components = (object[])assembly.GetComponents(false); // false = all levels
                var quantities = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

                if (components != null)
                {
                    foreach (Component2 comp in components)
                    {
                        if (comp.IsSuppressed()) continue;

                        var compPath = comp.GetPathName();
                        if (string.IsNullOrEmpty(compPath)) continue;

                        // Count quantities
                        if (quantities.ContainsKey(compPath))
                            quantities[compPath]++;
                        else
                            quantities[compPath] = 1;
                    }

                    // Build BOM with unique parts and their quantities
                    var processed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    
                    foreach (Component2 comp in components)
                    {
                        if (comp.IsSuppressed()) continue;

                        var compPath = comp.GetPathName();
                        if (string.IsNullOrEmpty(compPath) || processed.Contains(compPath)) continue;
                        processed.Add(compPath);

                        var fileName = Path.GetFileName(compPath);
                        var compExt = Path.GetExtension(compPath).ToLowerInvariant();
                        
                        // Get properties from component
                        var props = new Dictionary<string, string>();
                        var compDoc = comp.GetModelDoc2() as ModelDoc2;
                        if (compDoc != null)
                        {
                            props = ReadCustomProperties(compDoc, comp.ReferencedConfiguration);
                        }

                        bom.Add(new BomItem
                        {
                            FileName = fileName,
                            FilePath = compPath,
                            FileType = compExt == ".sldprt" ? "Part" : compExt == ".sldasm" ? "Assembly" : "Other",
                            Quantity = quantities[compPath],
                            Configuration = comp.ReferencedConfiguration,
                            PartNumber = GetPartNumber(props),
                            Description = GetDictValue(props, "Description") ?? "",
                            Material = GetDictValue(props, "Material") ?? "",
                            Revision = GetRevision(props),
                            Properties = props
                        });
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
                // Only close if WE opened it - don't close user's open documents!
                if (doc != null && !wasAlreadyOpen)
                {
                    try { CloseDocument(filePath!); } catch { }
                }
                CloseSolidWorksIfWeStartedIt();
            }
        }

        /// <summary>
        /// Get all external references from a file
        /// </summary>
        public CommandResult GetExternalReferences(string? filePath)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            ModelDoc2? doc = null;
            bool wasAlreadyOpen = false;
            try
            {
                doc = OpenDocument(filePath!, out var errors, out var warnings, out wasAlreadyOpen);
                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open file: errors={errors}" };

                var references = new List<object>();
                var dependencies = (object[])doc.GetDependencies2(true, true, false);

                if (dependencies != null)
                {
                    // Dependencies come in pairs: [path, bool, path, bool, ...]
                    for (int i = 0; i < dependencies.Length; i += 2)
                    {
                        var refPath = dependencies[i] as string;
                        if (string.IsNullOrEmpty(refPath)) continue;

                        references.Add(new
                        {
                            path = refPath,
                            fileName = Path.GetFileName(refPath),
                            exists = File.Exists(refPath),
                            fileType = GetFileType(refPath!)
                        });
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
                // Only close if WE opened it - don't close user's open documents!
                if (doc != null && !wasAlreadyOpen)
                {
                    try { CloseDocument(filePath!); } catch { }
                }
                CloseSolidWorksIfWeStartedIt();
            }
        }

        #endregion

        #region Custom Properties

        /// <summary>
        /// Get custom properties from a file
        /// </summary>
        public CommandResult GetCustomProperties(string? filePath, string? configuration = null)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            ModelDoc2? doc = null;
            bool wasAlreadyOpen = false;
            try
            {
                doc = OpenDocument(filePath!, out var errors, out var warnings, out wasAlreadyOpen);
                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open file: errors={errors}" };

                var fileProps = ReadCustomProperties(doc, null);
                var configProps = new Dictionary<string, Dictionary<string, string>>();

                // Get configuration-specific properties (drawings may not have configurations)
                var configNamesObj = doc.GetConfigurationNames();
                var configNames = configNamesObj as string[] ?? Array.Empty<string>();
                foreach (var config in configNames)
                {
                    if (configuration == null || config == configuration)
                    {
                        try
                        {
                            configProps[config] = ReadCustomProperties(doc, config);
                        }
                        catch { } // Ignore errors reading config properties
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
                // Only close if WE opened it - don't close user's open documents!
                if (doc != null && !wasAlreadyOpen)
                {
                    try { CloseDocument(filePath!); } catch { }
                }
                CloseSolidWorksIfWeStartedIt();
            }
        }

        /// <summary>
        /// Set custom properties on a file
        /// </summary>
        public CommandResult SetCustomProperties(string? filePath, Dictionary<string, string>? properties, string? configuration = null)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            if (properties == null || properties.Count == 0)
                return new CommandResult { Success = false, Error = "Missing or empty 'properties'" };

            ModelDoc2? doc = null;
            bool wasAlreadyOpen = false;
            try
            {
                doc = OpenDocument(filePath!, out var errors, out var warnings, out wasAlreadyOpen, readOnly: false);
                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open file: errors={errors}" };

                WriteCustomProperties(doc, properties, configuration);

                // Save the document
                doc.Save3(
                    (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                    ref errors,
                    ref warnings
                );

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        filePath,
                        propertiesSet = properties.Count,
                        configuration = configuration ?? "(file-level)"
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
            finally
            {
                // Only close if WE opened it - don't close user's open documents!
                if (doc != null && !wasAlreadyOpen)
                {
                    try { CloseDocument(filePath!); } catch { }
                }
                CloseSolidWorksIfWeStartedIt();
            }
        }

        private Dictionary<string, string> ReadCustomProperties(ModelDoc2 doc, string? configuration)
        {
            var props = new Dictionary<string, string>();

            try
            {
                var ext = doc?.Extension;
                if (ext == null) return props;
                
                var manager = string.IsNullOrEmpty(configuration)
                    ? ext.CustomPropertyManager[""]
                    : ext.CustomPropertyManager[configuration];

                if (manager == null) return props;

                object names = null!;
                object types = null!;
                object values = null!;
                object resolved = null!;
                object linkToProperty = null!;
                manager.GetAll3(ref names, ref types, ref values, ref resolved, ref linkToProperty);

                if (names is string[] nameArray && resolved is string[] resolvedArray)
                {
                    for (int i = 0; i < nameArray.Length; i++)
                    {
                        props[nameArray[i]] = resolvedArray[i] ?? "";
                    }
                }
            }
            catch { }

            return props;
        }

        private void WriteCustomProperties(ModelDoc2 doc, Dictionary<string, string> properties, string? configuration)
        {
            var ext = doc.Extension;
            var manager = string.IsNullOrEmpty(configuration)
                ? ext.CustomPropertyManager[""]
                : ext.CustomPropertyManager[configuration];

            foreach (var prop in properties)
            {
                // Try to set existing property first, then add if it doesn't exist
                var result = manager.Set2(prop.Key, prop.Value);
                if (result != (int)swCustomInfoSetResult_e.swCustomInfoSetResult_OK)
                {
                    manager.Add3(prop.Key, (int)swCustomInfoType_e.swCustomInfoText, prop.Value, 
                        (int)swCustomPropertyAddOption_e.swCustomPropertyDeleteAndAdd);
                }
            }
        }

        #endregion

        #region Configurations

        /// <summary>
        /// Get all configurations from a file
        /// </summary>
        public CommandResult GetConfigurations(string? filePath)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            ModelDoc2? doc = null;
            bool wasAlreadyOpen = false;
            try
            {
                doc = OpenDocument(filePath!, out var errors, out var warnings, out wasAlreadyOpen);
                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open file: errors={errors}" };

                var configs = new List<object>();
                var configNames = (string[])doc.GetConfigurationNames();
                var activeConfig = doc.ConfigurationManager.ActiveConfiguration?.Name ?? "";

                foreach (var name in configNames)
                {
                    var config = (Configuration)doc.GetConfigurationByName(name);
                    var props = ReadCustomProperties(doc, name);
                    
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
                // Only close if WE opened it - don't close user's open documents!
                if (doc != null && !wasAlreadyOpen)
                {
                    try { CloseDocument(filePath!); } catch { }
                }
                CloseSolidWorksIfWeStartedIt();
            }
        }

        #endregion

        #region Mass Properties

        /// <summary>
        /// Get mass properties from a part or assembly
        /// </summary>
        public CommandResult GetMassProperties(string? filePath, string? configuration = null)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            ModelDoc2? doc = null;
            bool wasAlreadyOpen = false;
            try
            {
                doc = OpenDocument(filePath!, out var errors, out var warnings, out wasAlreadyOpen);
                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open file: errors={errors}" };

                if (!string.IsNullOrEmpty(configuration))
                {
                    doc.ShowConfiguration2(configuration);
                    doc.EditRebuild3();
                }

                var massProps = (double[])doc.Extension.GetMassProperties2(1, out var status, true);

                if (massProps == null || status != 0)
                {
                    return new CommandResult
                    {
                        Success = false,
                        Error = "Failed to get mass properties. Ensure the model has assigned materials."
                    };
                }

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        filePath,
                        configuration = configuration ?? "Active",
                        mass = massProps[5], // kg
                        volume = massProps[3], // m^3
                        surfaceArea = massProps[4], // m^2
                        centerOfMass = new { x = massProps[0], y = massProps[1], z = massProps[2] },
                        momentsOfInertia = new { 
                            Ixx = massProps[6], Iyy = massProps[7], Izz = massProps[8],
                            Ixy = massProps[9], Izx = massProps[10], Iyz = massProps[11]
                        }
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
            finally
            {
                // Only close if WE opened it - don't close user's open documents!
                if (doc != null && !wasAlreadyOpen)
                {
                    try { CloseDocument(filePath!); } catch { }
                }
                CloseSolidWorksIfWeStartedIt();
            }
        }

        #endregion

        #region Export Operations

        /// <summary>
        /// Export a drawing to PDF
        /// </summary>
        public CommandResult ExportToPdf(string? filePath, string? outputPath, string? filenamePattern = null, PdmMetadata? pdmMetadata = null)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            ModelDoc2? doc = null;
            ISldWorks? sw = null;
            try
            {
                sw = GetSolidWorks();
                int errors = 0, warnings = 0;

                doc = (ModelDoc2)sw.OpenDoc6(
                    filePath,
                    (int)swDocumentTypes_e.swDocDRAWING,
                    (int)swOpenDocOptions_e.swOpenDocOptions_Silent,
                    "",
                    ref errors,
                    ref warnings
                );

                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open drawing: errors={errors}" };

                // Get drawing custom properties for filename pattern
                var props = ReadCustomProperties(doc, null);
                var baseName = Path.GetFileNameWithoutExtension(filePath);
                var outputDir = outputPath ?? Path.GetDirectoryName(filePath)!;
                
                // Build output filename using pattern if provided
                string finalOutputPath;
                if (!string.IsNullOrEmpty(filenamePattern))
                {
                    // Drawings don't have configurations, pass empty string for config name
                    var fileName = FormatExportFilename(filenamePattern!, baseName, "", props, ".pdf", pdmMetadata);
                    finalOutputPath = Path.Combine(outputDir, fileName);
                }
                else if (!string.IsNullOrEmpty(outputPath) && outputPath.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
                {
                    // outputPath is a full file path
                    finalOutputPath = outputPath;
                }
                else
                {
                    // outputPath is a directory or not provided - use original filename
                    finalOutputPath = Path.Combine(outputDir, baseName + ".pdf");
                }
                
                Directory.CreateDirectory(Path.GetDirectoryName(finalOutputPath)!);

                // Set PDF export options
                var exportData = (ExportPdfData)sw.GetExportFileData((int)swExportDataFileType_e.swExportPdfData);
                var drawDoc = (DrawingDoc)doc;
                var sheetNames = (string[])drawDoc.GetSheetNames();
                exportData.SetSheets((int)swExportDataSheetsToExport_e.swExportData_ExportAllSheets, sheetNames);
                exportData.ViewPdfAfterSaving = false;

                bool success = doc.Extension.SaveAs3(
                    finalOutputPath,
                    (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                    (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                    exportData,
                    null,
                    ref errors,
                    ref warnings
                );

                if (!success)
                    return new CommandResult { Success = false, Error = $"PDF export failed: errors={errors}" };

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        inputFile = filePath,
                        outputFile = finalOutputPath,
                        fileSize = new FileInfo(finalOutputPath).Length
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
                if (doc != null && sw != null)
                {
                    try { sw.CloseDoc(filePath); } catch { }
                }
                CloseSolidWorksIfWeStartedIt();
            }
        }

        /// <summary>
        /// Export to STEP format
        /// </summary>
        public CommandResult ExportToStep(string? filePath, string? outputPath, string? configuration, bool exportAllConfigs, string[]? configurations = null, string? filenamePattern = null, PdmMetadata? pdmMetadata = null)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            ModelDoc2? doc = null;
            ISldWorks? sw = null;
            try
            {
                sw = GetSolidWorks();
                var ext = Path.GetExtension(filePath).ToLowerInvariant();
                var docType = ext == ".sldprt" ? swDocumentTypes_e.swDocPART : swDocumentTypes_e.swDocASSEMBLY;

                int errors = 0, warnings = 0;
                doc = (ModelDoc2)sw.OpenDoc6(
                    filePath,
                    (int)docType,
                    (int)swOpenDocOptions_e.swOpenDocOptions_Silent,
                    "",
                    ref errors,
                    ref warnings
                );

                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open file: errors={errors}" };

                var exportedFiles = new List<string>();
                var baseName = Path.GetFileNameWithoutExtension(filePath);
                // FIX: If outputPath is a directory, use it directly; otherwise extract directory from file path
                var outputDir = !string.IsNullOrEmpty(outputPath) && Directory.Exists(outputPath) 
                    ? outputPath 
                    : Path.GetDirectoryName(outputPath ?? filePath)!;
                Directory.CreateDirectory(outputDir);

                // Determine which configs to export
                string[] configsToExport;
                if (configurations != null && configurations.Length > 0)
                {
                    // Export specific configurations
                    configsToExport = configurations;
                }
                else if (exportAllConfigs)
                {
                    // Export all configurations
                    configsToExport = (string[])doc.GetConfigurationNames();
                }
                else if (!string.IsNullOrEmpty(configuration))
                {
                    // Export single configuration
                    configsToExport = new[] { configuration! };
                }
                else
                {
                    // Export active configuration only
                    configsToExport = new string[0];
                }

                if (configsToExport.Length > 0)
                {
                    // Track used filenames to detect collisions (case-insensitive for Windows)
                    var usedFilenames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    
                    foreach (var configName in configsToExport)
                    {
                        doc.ShowConfiguration2(configName);
                        doc.EditRebuild3();

                        // Get properties for pattern replacement and metadata
                        var props = GetConfigProperties(doc, configName);
                        
                        // Build output filename
                        string configOutputPath;
                        if (!string.IsNullOrEmpty(filenamePattern))
                        {
                            var fileName = FormatExportFilename(filenamePattern!, baseName, configName, props, ".step", pdmMetadata);
                            configOutputPath = Path.Combine(outputDir, fileName);
                        }
                        else
                        {
                            configOutputPath = Path.Combine(outputDir, $"{baseName}_{configName}.step");
                        }

                        // Check for filename collision and append config name if needed
                        if (usedFilenames.Contains(configOutputPath))
                        {
                            // Collision detected - append config name to make unique
                            var collisionDir = Path.GetDirectoryName(configOutputPath)!;
                            var nameWithoutExt = Path.GetFileNameWithoutExtension(configOutputPath);
                            var fileExt = Path.GetExtension(configOutputPath);
                            configOutputPath = Path.Combine(collisionDir, $"{nameWithoutExt}_({configName}){fileExt}");
                            Console.Error.WriteLine($"[Export] Filename collision detected, renamed to: {Path.GetFileName(configOutputPath)}");
                        }
                        usedFilenames.Add(configOutputPath);

                        bool success = doc.Extension.SaveAs3(
                            configOutputPath,
                            (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                            (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                            null, null,
                            ref errors, ref warnings
                        );

                        if (success)
                        {
                            exportedFiles.Add(configOutputPath);
                            
                            // Update STEP file metadata with part number, description, revision
                            // Use SW file properties first, PDM metadata as fallback
                            var partNumber = GetPartNumber(props);
                            var revision = GetRevision(props);
                            var description = GetDictValue(props, "Description") ?? GetDictValue(props, "DESCRIPTION") ?? "";
                            
                            // Apply PDM fallbacks for STEP metadata too
                            if (string.IsNullOrEmpty(partNumber))
                            {
                                // pdmMetadata.PartNumber should already contain the full item number
                                // (base + tab combined from TypeScript), but as a safety net,
                                // combine base + tab if PartNumber looks like just the base
                                var baseNum = pdmMetadata?.PartNumber ?? "";
                                var tabNum = pdmMetadata?.TabNumber ?? "";
                                
                                // If we have both base and tab, and base doesn't already end with tab,
                                // combine them (use dash as default separator)
                                if (!string.IsNullOrEmpty(baseNum) && !string.IsNullOrEmpty(tabNum) 
                                    && !baseNum.EndsWith($"-{tabNum}"))
                                {
                                    partNumber = $"{baseNum}-{tabNum}";
                                    Console.Error.WriteLine($"[Export] Combined base+tab for STEP metadata: '{partNumber}'");
                                }
                                else
                                {
                                    partNumber = baseNum;
                                }
                            }
                            if (string.IsNullOrEmpty(revision)) revision = pdmMetadata?.Revision ?? "";
                            if (string.IsNullOrEmpty(description)) description = pdmMetadata?.Description ?? "";
                            
                            UpdateStepFileMetadata(configOutputPath, partNumber, description, revision, configName);
                        }
                    }
                }
                else
                {
                    // No specific config - export current/active
                    var finalOutputPath = outputPath ?? Path.ChangeExtension(filePath, ".step");
                    Directory.CreateDirectory(Path.GetDirectoryName(finalOutputPath)!);

                    bool success = doc.Extension.SaveAs3(
                        finalOutputPath,
                        (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                        (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                        null, null,
                        ref errors, ref warnings
                    );

                    if (success)
                        exportedFiles.Add(finalOutputPath);
                }

                return new CommandResult
                {
                    Success = exportedFiles.Count > 0,
                    Data = new
                    {
                        inputFile = filePath,
                        exportedFiles,
                        count = exportedFiles.Count
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
                if (doc != null && sw != null)
                {
                    try { sw.CloseDoc(filePath); } catch { }
                }
                CloseSolidWorksIfWeStartedIt();
            }
        }

        /// <summary>
        /// Export to IGES format
        /// </summary>
        public CommandResult ExportToIges(string? filePath, string? outputPath)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            ModelDoc2? doc = null;
            bool wasAlreadyOpen = false;
            try
            {
                doc = OpenDocument(filePath!, out var errors, out var warnings, out wasAlreadyOpen);
                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open file: errors={errors}" };

                var finalOutputPath = outputPath ?? Path.ChangeExtension(filePath, ".igs");
                Directory.CreateDirectory(Path.GetDirectoryName(finalOutputPath)!);

                bool success = doc.Extension.SaveAs3(
                    finalOutputPath,
                    (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                    (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                    null, null,
                    ref errors, ref warnings
                );

                if (!success)
                    return new CommandResult { Success = false, Error = $"IGES export failed: errors={errors}" };

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        inputFile = filePath,
                        outputFile = finalOutputPath,
                        fileSize = new FileInfo(finalOutputPath).Length
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
            finally
            {
                // Only close if WE opened it - don't close user's open documents!
                if (doc != null && !wasAlreadyOpen)
                {
                    try { CloseDocument(filePath!); } catch { }
                }
                CloseSolidWorksIfWeStartedIt();
            }
        }

        /// <summary>
        /// Export to STL format with quality options
        /// </summary>
        /// <param name="filePath">Source SolidWorks file path</param>
        /// <param name="outputPath">Output directory or file path</param>
        /// <param name="configuration">Single configuration to export (optional)</param>
        /// <param name="exportAllConfigs">Export all configurations</param>
        /// <param name="configurations">Specific configurations to export (optional)</param>
        /// <param name="resolution">STL quality: "coarse", "fine", or "custom"</param>
        /// <param name="binaryFormat">True for binary STL, false for ASCII</param>
        /// <param name="customDeviation">Custom chord deviation in mm (for resolution="custom")</param>
        /// <param name="customAngle">Custom angle tolerance in degrees (for resolution="custom")</param>
        /// <param name="filenamePattern">Filename pattern with placeholders</param>
        /// <param name="pdmMetadata">PDM metadata fallback values</param>
        public CommandResult ExportToStl(
            string? filePath, 
            string? outputPath, 
            string? configuration, 
            bool exportAllConfigs, 
            string[]? configurations = null,
            string? resolution = "fine",
            bool binaryFormat = true,
            double? customDeviation = null,
            double? customAngle = null,
            string? filenamePattern = null, 
            PdmMetadata? pdmMetadata = null)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            ModelDoc2? doc = null;
            ISldWorks? sw = null;
            try
            {
                sw = GetSolidWorks();
                var ext = Path.GetExtension(filePath).ToLowerInvariant();
                
                // STL export only works for parts and assemblies
                if (ext != ".sldprt" && ext != ".sldasm")
                    return new CommandResult { Success = false, Error = "STL export only works on part (.sldprt) or assembly (.sldasm) files" };
                
                var docType = ext == ".sldprt" ? swDocumentTypes_e.swDocPART : swDocumentTypes_e.swDocASSEMBLY;

                int errors = 0, warnings = 0;
                doc = (ModelDoc2)sw.OpenDoc6(
                    filePath,
                    (int)docType,
                    (int)swOpenDocOptions_e.swOpenDocOptions_Silent,
                    "",
                    ref errors,
                    ref warnings
                );

                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open file: errors={errors}" };

                // Set STL export options
                SetStlExportOptions(sw, resolution ?? "fine", binaryFormat, customDeviation, customAngle);

                var exportedFiles = new List<string>();
                var baseName = Path.GetFileNameWithoutExtension(filePath);
                // FIX: If outputPath is a directory, use it directly; otherwise extract directory from file path
                var outputDir = !string.IsNullOrEmpty(outputPath) && Directory.Exists(outputPath) 
                    ? outputPath 
                    : Path.GetDirectoryName(outputPath ?? filePath)!;
                Directory.CreateDirectory(outputDir);

                // Determine which configs to export
                string[] configsToExport;
                if (configurations != null && configurations.Length > 0)
                {
                    // Export specific configurations
                    configsToExport = configurations;
                }
                else if (exportAllConfigs)
                {
                    // Export all configurations
                    configsToExport = (string[])doc.GetConfigurationNames();
                }
                else if (!string.IsNullOrEmpty(configuration))
                {
                    // Export single configuration
                    configsToExport = new[] { configuration! };
                }
                else
                {
                    // Export active configuration only
                    configsToExport = new string[0];
                }

                if (configsToExport.Length > 0)
                {
                    // Track used filenames to detect collisions (case-insensitive for Windows)
                    var usedFilenames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    
                    foreach (var configName in configsToExport)
                    {
                        doc.ShowConfiguration2(configName);
                        doc.EditRebuild3();

                        // Get properties for pattern replacement and metadata
                        var props = GetConfigProperties(doc, configName);
                        
                        // Build output filename
                        string configOutputPath;
                        if (!string.IsNullOrEmpty(filenamePattern))
                        {
                            var fileName = FormatExportFilename(filenamePattern!, baseName, configName, props, ".stl", pdmMetadata);
                            configOutputPath = Path.Combine(outputDir, fileName);
                        }
                        else
                        {
                            configOutputPath = Path.Combine(outputDir, $"{baseName}_{configName}.stl");
                        }

                        // Check for filename collision and append config name if needed
                        if (usedFilenames.Contains(configOutputPath))
                        {
                            // Collision detected - append config name to make unique
                            var collisionDir = Path.GetDirectoryName(configOutputPath)!;
                            var nameWithoutExt = Path.GetFileNameWithoutExtension(configOutputPath);
                            var fileExt = Path.GetExtension(configOutputPath);
                            configOutputPath = Path.Combine(collisionDir, $"{nameWithoutExt}_({configName}){fileExt}");
                            Console.Error.WriteLine($"[Export] Filename collision detected, renamed to: {Path.GetFileName(configOutputPath)}");
                        }
                        usedFilenames.Add(configOutputPath);

                        bool success = doc.Extension.SaveAs3(
                            configOutputPath,
                            (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                            (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                            null, null,
                            ref errors, ref warnings
                        );

                        if (success)
                        {
                            exportedFiles.Add(configOutputPath);
                            Console.Error.WriteLine($"[Export] STL exported: {Path.GetFileName(configOutputPath)}");
                        }
                        else
                        {
                            Console.Error.WriteLine($"[Export] STL export failed for config '{configName}': errors={errors}, warnings={warnings}");
                        }
                    }
                }
                else
                {
                    // No specific config - export current/active
                    var finalOutputPath = outputPath ?? Path.ChangeExtension(filePath, ".stl");
                    Directory.CreateDirectory(Path.GetDirectoryName(finalOutputPath)!);

                    bool success = doc.Extension.SaveAs3(
                        finalOutputPath,
                        (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                        (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                        null, null,
                        ref errors, ref warnings
                    );

                    if (success)
                        exportedFiles.Add(finalOutputPath);
                }

                return new CommandResult
                {
                    Success = exportedFiles.Count > 0,
                    Data = new
                    {
                        inputFile = filePath,
                        exportedFiles,
                        count = exportedFiles.Count,
                        resolution = resolution ?? "fine",
                        binaryFormat
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
                if (doc != null && sw != null)
                {
                    try { sw.CloseDoc(filePath); } catch { }
                }
                CloseSolidWorksIfWeStartedIt();
            }
        }

        /// <summary>
        /// Set STL export options via SolidWorks user preferences
        /// </summary>
        /// <param name="sw">SolidWorks application instance</param>
        /// <param name="resolution">Quality setting: "coarse", "fine", or "custom"</param>
        /// <param name="binaryFormat">True for binary STL, false for ASCII</param>
        /// <param name="customDeviation">Chord deviation in mm (for custom resolution)</param>
        /// <param name="customAngle">Angle tolerance in degrees (for custom resolution)</param>
        private void SetStlExportOptions(ISldWorks sw, string resolution, bool binaryFormat, double? customDeviation, double? customAngle)
        {
            // Set STL quality
            // swSTLQuality: 0 = Coarse, 1 = Fine, 2 = Custom
            int qualityValue = resolution.ToLowerInvariant() switch
            {
                "coarse" => 0,
                "fine" => 1,
                "custom" => 2,
                _ => 1 // Default to fine
            };
            
            sw.SetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swSTLQuality, qualityValue);
            Console.Error.WriteLine($"[Export] STL quality set to: {resolution} ({qualityValue})");

            // Set binary/ASCII format via user preferences
            // swExportStlBinary (integer preference): 0 = ASCII, 1 = Binary
            // Note: The exact enum value may vary by SW version. Using numeric value directly.
            // swUserPreferenceIntegerValue_e value for STL binary: 73 (swExportStlBinary)
            const int swExportStlBinary = 73;
            sw.SetUserPreferenceIntegerValue(swExportStlBinary, binaryFormat ? 1 : 0);
            Console.Error.WriteLine($"[Export] STL format set to: {(binaryFormat ? "Binary" : "ASCII")}");

            // Set custom deviation and angle if using custom quality
            if (qualityValue == 2)
            {
                if (customDeviation.HasValue && customDeviation.Value > 0)
                {
                    // swSTLDeviation is in meters, input is in mm
                    double deviationMeters = customDeviation.Value / 1000.0;
                    sw.SetUserPreferenceDoubleValue((int)swUserPreferenceDoubleValue_e.swSTLDeviation, deviationMeters);
                    Console.Error.WriteLine($"[Export] STL custom deviation set to: {customDeviation.Value} mm");
                }
                
                if (customAngle.HasValue && customAngle.Value > 0)
                {
                    // swSTLAngleTolerance is in radians, input is in degrees
                    double angleRadians = customAngle.Value * (Math.PI / 180.0);
                    sw.SetUserPreferenceDoubleValue((int)swUserPreferenceDoubleValue_e.swSTLAngleTolerance, angleRadians);
                    Console.Error.WriteLine($"[Export] STL custom angle tolerance set to: {customAngle.Value} degrees");
                }
            }
        }

        /// <summary>
        /// Export drawing to DXF
        /// </summary>
        public CommandResult ExportToDxf(string? filePath, string? outputPath)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            ModelDoc2? doc = null;
            bool wasAlreadyOpen = false;
            try
            {
                doc = OpenDocument(filePath!, out var errors, out var warnings, out wasAlreadyOpen);
                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open file: errors={errors}" };

                var finalOutputPath = outputPath ?? Path.ChangeExtension(filePath, ".dxf");
                Directory.CreateDirectory(Path.GetDirectoryName(finalOutputPath)!);

                bool success = doc.Extension.SaveAs3(
                    finalOutputPath,
                    (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                    (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                    null, null,
                    ref errors, ref warnings
                );

                if (!success)
                    return new CommandResult { Success = false, Error = $"DXF export failed: errors={errors}" };

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        inputFile = filePath,
                        outputFile = finalOutputPath,
                        fileSize = new FileInfo(finalOutputPath).Length
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
            finally
            {
                // Only close if WE opened it - don't close user's open documents!
                if (doc != null && !wasAlreadyOpen)
                {
                    try { CloseDocument(filePath!); } catch { }
                }
                CloseSolidWorksIfWeStartedIt();
            }
        }

        /// <summary>
        /// Export model view to image
        /// </summary>
        public CommandResult ExportToImage(string? filePath, string? outputPath, int width = 800, int height = 600)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            ModelDoc2? doc = null;
            bool wasAlreadyOpen = false;
            try
            {
                doc = OpenDocument(filePath!, out var errors, out var warnings, out wasAlreadyOpen);
                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open file: errors={errors}" };

                var finalOutputPath = outputPath ?? Path.ChangeExtension(filePath, ".png");
                Directory.CreateDirectory(Path.GetDirectoryName(finalOutputPath)!);

                // Use SaveAs with image format
                int saveErrors = 0, saveWarnings = 0;
                bool success = doc.Extension.SaveAs2(
                    finalOutputPath,
                    (int)swSaveAsVersion_e.swSaveAsCurrentVersion,
                    (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                    null,
                    "",
                    false,
                    ref saveErrors,
                    ref saveWarnings
                );

                return new CommandResult
                {
                    Success = success && File.Exists(finalOutputPath),
                    Data = new
                    {
                        inputFile = filePath,
                        outputFile = finalOutputPath,
                        width,
                        height,
                        fileSize = File.Exists(finalOutputPath) ? new FileInfo(finalOutputPath).Length : 0
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
            finally
            {
                // Only close if WE opened it - don't close user's open documents!
                if (doc != null && !wasAlreadyOpen)
                {
                    try { CloseDocument(filePath!); } catch { }
                }
                CloseSolidWorksIfWeStartedIt();
            }
        }

        #endregion

        #region Assembly Operations

        /// <summary>
        /// Replace a component in an assembly
        /// </summary>
        public CommandResult ReplaceComponent(string? assemblyPath, string? oldComponent, string? newComponent)
        {
            if (string.IsNullOrEmpty(assemblyPath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (string.IsNullOrEmpty(oldComponent) || string.IsNullOrEmpty(newComponent))
                return new CommandResult { Success = false, Error = "Missing 'oldComponent' or 'newComponent'" };

            if (!File.Exists(newComponent))
                return new CommandResult { Success = false, Error = $"New component not found: {newComponent}" };

            ModelDoc2? doc = null;
            bool wasAlreadyOpen = false;
            try
            {
                doc = OpenDocument(assemblyPath!, out var errors, out var warnings, out wasAlreadyOpen, readOnly: false);
                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open assembly: errors={errors}" };

                var assembly = (AssemblyDoc)doc;
                var components = (object[])assembly.GetComponents(false);
                int replacedCount = 0;

                foreach (Component2 comp in components)
                {
                    var compPath = comp.GetPathName();
                    if (string.Equals(compPath, oldComponent, StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(Path.GetFileName(compPath), Path.GetFileName(oldComponent), StringComparison.OrdinalIgnoreCase))
                    {
                        comp.Select4(true, null, false);

                        bool replaced = assembly.ReplaceComponents2(
                            newComponent,
                            "", // Use active configuration
                            false, // Keep mates
                            (int)swReplaceComponentsConfiguration_e.swReplaceComponentsConfiguration_MatchName,
                            true
                        );

                        if (replaced)
                            replacedCount++;

                        doc.ClearSelection2(true);
                    }
                }

                doc.Save3(
                    (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                    ref errors, ref warnings
                );

                return new CommandResult
                {
                    Success = replacedCount > 0,
                    Data = new
                    {
                        assemblyPath,
                        oldComponent,
                        newComponent,
                        replacedCount
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
            finally
            {
                // Only close if WE opened it - don't close user's open documents!
                if (doc != null && !wasAlreadyOpen)
                {
                    try { CloseDocument(assemblyPath!); } catch { }
                }
                CloseSolidWorksIfWeStartedIt();
            }
        }

        /// <summary>
        /// Pack and Go - copy assembly with all references
        /// </summary>
        public CommandResult PackAndGo(string? filePath, string? outputFolder, string? prefix, string? suffix)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (string.IsNullOrEmpty(outputFolder))
                return new CommandResult { Success = false, Error = "Missing 'outputFolder'" };

            ModelDoc2? doc = null;
            ISldWorks? sw = null;
            try
            {
                sw = GetSolidWorks();
                int errors = 0, warnings = 0;

                doc = (ModelDoc2)sw.OpenDoc6(
                    filePath,
                    (int)swDocumentTypes_e.swDocASSEMBLY,
                    (int)swOpenDocOptions_e.swOpenDocOptions_Silent,
                    "",
                    ref errors, ref warnings
                );

                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open assembly: errors={errors}" };

                Directory.CreateDirectory(outputFolder);

                var packAndGo = (PackAndGo)doc.Extension.GetPackAndGo();
                packAndGo.IncludeDrawings = true;
                packAndGo.IncludeSimulationResults = false;
                packAndGo.IncludeToolboxComponents = true;
                packAndGo.FlattenToSingleFolder = true;
                packAndGo.SetSaveToName(true, outputFolder);

                object fileNamesObj = null!;
                packAndGo.GetDocumentNames(out fileNamesObj);
                var fileNames = (object[])fileNamesObj;
                var newNames = new string[fileNames.Length];

                for (int i = 0; i < fileNames.Length; i++)
                {
                    var originalName = Path.GetFileNameWithoutExtension((string)fileNames[i]);
                    var extension = Path.GetExtension((string)fileNames[i]);
                    var newName = $"{prefix ?? ""}{originalName}{suffix ?? ""}{extension}";
                    newNames[i] = Path.Combine(outputFolder, newName);
                }

                packAndGo.SetDocumentSaveToNames(newNames);
                var statuses = (int[])doc.Extension.SavePackAndGo(packAndGo);

                int successCount = 0;
                var copiedFiles = new List<string>();
                for (int i = 0; i < statuses.Length; i++)
                {
                    if (statuses[i] == 0)
                    {
                        successCount++;
                        copiedFiles.Add(newNames[i]);
                    }
                }

                return new CommandResult
                {
                    Success = successCount > 0,
                    Data = new
                    {
                        sourceFile = filePath,
                        outputFolder,
                        totalFiles = fileNames.Length,
                        copiedFiles = successCount,
                        files = copiedFiles
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
                if (doc != null && sw != null)
                {
                    try { sw.CloseDoc(filePath); } catch { }
                }
                CloseSolidWorksIfWeStartedIt();
            }
        }

        /// <summary>
        /// Add a component (part or subassembly) to an open assembly.
        /// If assemblyPath is null, uses the active document in SolidWorks.
        /// </summary>
        public CommandResult AddComponent(string? assemblyPath, string? componentPath, double[]? coordinates)
        {
            if (string.IsNullOrEmpty(componentPath))
                return new CommandResult { Success = false, Error = "Missing 'componentPath'" };

            if (!File.Exists(componentPath))
                return new CommandResult { Success = false, Error = $"Component file not found: {componentPath}" };

            // Validate component is a valid SolidWorks part or assembly
            var compExt = Path.GetExtension(componentPath).ToLowerInvariant();
            if (compExt != ".sldprt" && compExt != ".sldasm")
                return new CommandResult { Success = false, Error = $"Invalid component type: {compExt}. Must be .sldprt or .sldasm" };

            ModelDoc2? doc = null;
            bool openedAssembly = false;
            try
            {
                var sw = GetSolidWorks();

                // Get the target assembly (active doc or specified path)
                if (string.IsNullOrEmpty(assemblyPath))
                {
                    // Use the active document
                    doc = sw.ActiveDoc as ModelDoc2;
                    if (doc == null)
                        return new CommandResult { Success = false, Error = "No active document in SolidWorks" };
                }
                else
                {
                    // First try to get it if already open
                    doc = sw.GetOpenDocumentByName(assemblyPath) as ModelDoc2;
                    
                    if (doc == null)
                    {
                        // Open the assembly
                        int errors = 0, warnings = 0;
                        doc = (ModelDoc2)sw.OpenDoc6(
                            assemblyPath,
                            (int)swDocumentTypes_e.swDocASSEMBLY,
                            (int)swOpenDocOptions_e.swOpenDocOptions_Silent,
                            "",
                            ref errors, ref warnings
                        );
                        openedAssembly = true;
                        
                        if (doc == null)
                            return new CommandResult { Success = false, Error = $"Failed to open assembly: errors={errors}" };
                    }
                }

                // Verify it's an assembly
                if (doc.GetType() != (int)swDocumentTypes_e.swDocASSEMBLY)
                    return new CommandResult { Success = false, Error = "Target document is not an assembly" };

                var assembly = (AssemblyDoc)doc;

                // Default coordinates (origin) or use provided
                double x = coordinates != null && coordinates.Length > 0 ? coordinates[0] : 0;
                double y = coordinates != null && coordinates.Length > 1 ? coordinates[1] : 0;
                double z = coordinates != null && coordinates.Length > 2 ? coordinates[2] : 0;

                // Add the component using AddComponent5
                // Parameters: PathName, ConfigOption, ConfigName, UseConfigForSWMates, NewName, X, Y, Z
                var component = assembly.AddComponent5(
                    componentPath,
                    (int)swAddComponentConfigOptions_e.swAddComponentConfigOptions_CurrentSelectedConfig,
                    "",      // configuration name (empty = use active config of component)
                    false,   // use config as displayed
                    "",      // new instance name (empty = auto-generate)
                    x, y, z  // placement coordinates (meters)
                );

                if (component == null)
                    return new CommandResult { Success = false, Error = "Failed to add component - AddComponent5 returned null" };

                // Get the component name
                string componentName = component.Name2;

                // Save the assembly if we need to persist the change
                // Note: Don't save if the assembly was already open by the user - let them decide
                if (openedAssembly)
                {
                    int errors = 0, warnings = 0;
                    doc.Save3((int)swSaveAsOptions_e.swSaveAsOptions_Silent, ref errors, ref warnings);
                }

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        componentName,
                        componentPath,
                        assemblyPath = doc.GetPathName(),
                        position = new { x, y, z }
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
            finally
            {
                // Only close the assembly if WE opened it
                if (openedAssembly && doc != null)
                {
                    try { CloseDocument(assemblyPath!); } catch { }
                }
                CloseSolidWorksIfWeStartedIt();
            }
        }

        #endregion

        #region Helpers

        private string GetFileType(string filePath)
        {
            var ext = Path.GetExtension(filePath).ToLowerInvariant();
            return ext switch
            {
                ".sldprt" => "Part",
                ".sldasm" => "Assembly",
                ".slddrw" => "Drawing",
                _ => "Other"
            };
        }

        /// <summary>
        /// Safe dictionary value getter (replacement for GetValueOrDefault in .NET 4.8)
        /// </summary>
        private static string? GetDictValue(Dictionary<string, string> dict, string key)
        {
            if (dict.TryGetValue(key, out var value))
                return value;
            return null;
        }

        /// <summary>
        /// Get part number from properties, checking common property name variations.
        /// IMPORTANT: "Number" must be first - it's the property written by "Save to File" in the UI
        /// and represents the user's current/intended part number. "Base Item Number" may contain
        /// legacy or template values that would incorrectly override user edits.
        /// </summary>
        private static string GetPartNumber(Dictionary<string, string> props)
        {
            // Priority order matters! "Number" is actively written by UI, check it first.
            // "Base Item Number" (Document Manager standard) may contain stale values.
            string[] partNumberKeys = {
                // Blue Robotics primary - written by "Save to File"
                "Number", "No", "No.",
                // Document Manager standard (may be stale, check after Number)
                "Base Item Number",
                // Common variations
                "PartNumber", "Part Number", "Part No", "Part No.", "PartNo",
                "ItemNumber", "Item Number", "Item No", "Item No.", "ItemNo",
                "PN", "P/N",
                // Blue Robotics specific
                "BR Number", "BRNumber", "BR-Number", "DrawingNumber", "Drawing Number"
            };

            foreach (var key in partNumberKeys)
            {
                var value = GetDictValue(props, key);
                if (value != null && value.Length > 0)
                    return value;
            }

            // Try case-insensitive search as fallback
            foreach (var kvp in props)
            {
                var lowerKey = kvp.Key.ToLowerInvariant();
                if (lowerKey.Contains("part") && (lowerKey.Contains("number") || lowerKey.Contains("no")) ||
                    lowerKey.Contains("item") && (lowerKey.Contains("number") || lowerKey.Contains("no")) ||
                    lowerKey == "pn" || lowerKey == "p/n" ||
                    lowerKey == "number" || lowerKey == "br number" || lowerKey == "brnumber")
                {
                    if (!string.IsNullOrEmpty(kvp.Value))
                        return kvp.Value;
                }
            }

            return "";
        }

        /// <summary>
        /// Get revision from properties, checking common property name variations
        /// </summary>
        private static string GetRevision(Dictionary<string, string> props)
        {
            // Common revision property names used in SolidWorks
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

            // Try case-insensitive search as fallback
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

        /// <summary>
        /// Get tab number from properties.
        /// Tab number is the configuration-specific suffix (e.g., "394" in "BR-101011-394").
        /// It can be stored as a dedicated "Tab Number" property, or parsed from the Number property.
        /// </summary>
        private static string GetTabNumber(Dictionary<string, string> props)
        {
            // Check for dedicated tab number property
            string[] tabKeys = {
                "Tab Number", "TabNumber", "Tab No", "Tab", "TAB",
                "Configuration Tab", "Config Tab", "Suffix"
            };

            foreach (var key in tabKeys)
            {
                var value = GetDictValue(props, key);
                if (value != null && value.Length > 0)
                    return value;
            }

            // Try to extract from the Number/Part Number property
            // Format: "BR-101010-394" -> extract "394"
            var number = GetPartNumber(props);
            if (!string.IsNullOrEmpty(number) && number.Contains("-"))
            {
                var parts = number.Split('-');
                if (parts.Length >= 3)
                {
                    // Get the last segment after the last dash
                    var lastPart = parts[parts.Length - 1];
                    // Only use it if it looks like a tab number (numeric, 1-4 chars)
                    if (lastPart.Length >= 1 && lastPart.Length <= 4)
                    {
                        // Check if it's mostly numeric
                        int digitCount = 0;
                        foreach (char c in lastPart)
                        {
                            if (char.IsDigit(c)) digitCount++;
                        }
                        if (digitCount >= lastPart.Length / 2)
                        {
                            return lastPart;
                        }
                    }
                }
            }

            return "";
        }

        /// <summary>
        /// Get custom properties from a configuration for export filename formatting.
        /// Merges file-level properties with configuration-specific properties.
        /// Configuration properties override file-level properties when both exist.
        /// </summary>
        private Dictionary<string, string> GetConfigProperties(ModelDoc2 doc, string configName)
        {
            var props = new Dictionary<string, string>();
            
            // First, read file-level properties (these are the base/default values)
            try
            {
                var fileManager = doc.Extension.CustomPropertyManager[""];
                if (fileManager != null)
                {
                    object? names = null, values = null, resolved = null, types = null, linkedProps = null;
                    fileManager.GetAll3(ref names, ref types, ref values, ref resolved, ref linkedProps);
                    
                    var propNames = names as string[];
                    var propResolved = resolved as string[];
                    
                    if (propNames != null && propResolved != null)
                    {
                        for (int i = 0; i < propNames.Length && i < propResolved.Length; i++)
                        {
                            var name = propNames[i];
                            var value = propResolved[i];
                            if (!string.IsNullOrEmpty(name) && !string.IsNullOrEmpty(value))
                            {
                                props[name] = value;
                            }
                        }
                    }
                }
            }
            catch
            {
                // Ignore file-level property read errors
            }
            
            // Then, read configuration-specific properties (these override file-level)
            if (!string.IsNullOrEmpty(configName))
            {
                try
                {
                    var configManager = doc.Extension.CustomPropertyManager[configName];
                    if (configManager != null)
                    {
                        object? names = null, values = null, resolved = null, types = null, linkedProps = null;
                        configManager.GetAll3(ref names, ref types, ref values, ref resolved, ref linkedProps);
                        
                        var propNames = names as string[];
                        var propResolved = resolved as string[];
                        
                        if (propNames != null && propResolved != null)
                        {
                            for (int i = 0; i < propNames.Length && i < propResolved.Length; i++)
                            {
                                var name = propNames[i];
                                var value = propResolved[i];
                                // Override file-level props with config-specific ones
                                if (!string.IsNullOrEmpty(name) && !string.IsNullOrEmpty(value))
                                {
                                    props[name] = value;
                                }
                            }
                        }
                    }
                }
                catch
                {
                    // Ignore config-level property read errors
                }
            }
            
            return props;
        }

        /// <summary>
        /// Format export filename using a pattern with placeholders
        /// Supported placeholders:
        /// {filename} - Original file name (without extension)
        /// {config} - Configuration name
        /// {partNumber} or {number} - Part/Item number from properties
        /// {tab} or {tabNumber} - Tab number suffix from config properties
        /// {revision} or {rev} - Revision from properties
        /// {description} or {desc} - Description from properties
        /// {date} - Current date (YYYY-MM-DD)
        /// {time} - Current time (HH-MM-SS)
        /// {datetime} - Current date and time (YYYY-MM-DD_HH-MM-SS)
        /// </summary>
        private string FormatExportFilename(string pattern, string baseName, string configName, Dictionary<string, string> props, string extension, PdmMetadata? pdmMetadata = null)
        {
            var now = DateTime.Now;
            
            // Log properties for debugging
            Console.Error.WriteLine($"[Export] Formatting filename for config '{configName}'");
            Console.Error.WriteLine($"[Export] Pattern: {pattern}");
            Console.Error.WriteLine($"[Export] Found {props.Count} SW file properties:");
            foreach (var kvp in props)
            {
                Console.Error.WriteLine($"[Export]   '{kvp.Key}' = '{kvp.Value}'");
            }
            
            if (pdmMetadata != null)
            {
                Console.Error.WriteLine($"[Export] PDM metadata fallback: partNumber='{pdmMetadata.PartNumber}', revision='{pdmMetadata.Revision}', description='{pdmMetadata.Description}', tabNumber='{pdmMetadata.TabNumber}'");
            }
            
            // Get property values from SW file
            var partNumber = GetPartNumber(props) ?? "";
            var tabNumber = GetTabNumber(props) ?? "";
            var revision = GetRevision(props) ?? "";
            var description = GetDictValue(props, "Description") ?? GetDictValue(props, "DESCRIPTION") ?? "";
            
            // Use PDM metadata as fallback if SW file properties are empty
            if (string.IsNullOrEmpty(partNumber) && !string.IsNullOrEmpty(pdmMetadata?.PartNumber))
            {
                partNumber = pdmMetadata!.PartNumber;
                Console.Error.WriteLine($"[Export] Using PDM partNumber fallback: '{partNumber}'");
            }
            if (string.IsNullOrEmpty(tabNumber) && !string.IsNullOrEmpty(pdmMetadata?.TabNumber))
            {
                tabNumber = pdmMetadata!.TabNumber;
                Console.Error.WriteLine($"[Export] Using PDM tabNumber fallback: '{tabNumber}'");
            }
            if (string.IsNullOrEmpty(revision) && !string.IsNullOrEmpty(pdmMetadata?.Revision))
            {
                revision = pdmMetadata!.Revision;
                Console.Error.WriteLine($"[Export] Using PDM revision fallback: '{revision}'");
            }
            if (string.IsNullOrEmpty(description) && !string.IsNullOrEmpty(pdmMetadata?.Description))
            {
                description = pdmMetadata!.Description;
                Console.Error.WriteLine($"[Export] Using PDM description fallback: '{description}'");
            }
            
            Console.Error.WriteLine($"[Export] Final resolved: partNumber='{partNumber}', tabNumber='{tabNumber}', revision='{revision}', description='{description}'");
            
            // Replace placeholders (case-insensitive)
            var result = pattern;
            result = ReplaceIgnoreCase(result, "{filename}", baseName);
            result = ReplaceIgnoreCase(result, "{config}", configName);
            result = ReplaceIgnoreCase(result, "{partNumber}", partNumber);
            result = ReplaceIgnoreCase(result, "{number}", partNumber);
            result = ReplaceIgnoreCase(result, "{tab}", tabNumber);
            result = ReplaceIgnoreCase(result, "{tabNumber}", tabNumber);
            result = ReplaceIgnoreCase(result, "{revision}", revision);
            result = ReplaceIgnoreCase(result, "{rev}", revision);
            result = ReplaceIgnoreCase(result, "{description}", description);
            result = ReplaceIgnoreCase(result, "{desc}", description);
            result = ReplaceIgnoreCase(result, "{date}", now.ToString("yyyy-MM-dd"));
            result = ReplaceIgnoreCase(result, "{time}", now.ToString("HH-mm-ss"));
            result = ReplaceIgnoreCase(result, "{datetime}", now.ToString("yyyy-MM-dd_HH-mm-ss"));
            
            // Clean up invalid filename characters
            foreach (char c in Path.GetInvalidFileNameChars())
            {
                result = result.Replace(c, '_');
            }
            
            // Ensure extension
            if (!result.EndsWith(extension, StringComparison.OrdinalIgnoreCase))
            {
                result += extension;
            }
            
            Console.Error.WriteLine($"[Export] Final filename: {result}");
            
            return result;
        }

        private static string ReplaceIgnoreCase(string source, string oldValue, string newValue)
        {
            int index = source.IndexOf(oldValue, StringComparison.OrdinalIgnoreCase);
            while (index >= 0)
            {
                source = source.Substring(0, index) + newValue + source.Substring(index + oldValue.Length);
                index = source.IndexOf(oldValue, index + newValue.Length, StringComparison.OrdinalIgnoreCase);
            }
            return source;
        }

        /// <summary>
        /// Post-process a STEP file to update PRODUCT metadata with custom properties.
        /// STEP files are ASCII text and contain PRODUCT entities that define the part info.
        /// 
        /// PRODUCT entity format: PRODUCT('id','name','description',(context));
        /// PRODUCT_DEFINITION_FORMATION entity contains revision info
        /// </summary>
        private void UpdateStepFileMetadata(string stepFilePath, string partNumber, string description, string revision, string configName)
        {
            if (string.IsNullOrEmpty(partNumber) && string.IsNullOrEmpty(description) && string.IsNullOrEmpty(revision))
            {
                Console.Error.WriteLine("[Export] No metadata to embed in STEP file");
                return;
            }
            
            try
            {
                if (!File.Exists(stepFilePath))
                {
                    Console.Error.WriteLine($"[Export] STEP file not found: {stepFilePath}");
                    return;
                }
                
                var content = File.ReadAllText(stepFilePath);
                bool modified = false;
                
                // STEP file uses specific encoding for special chars
                var safePartNumber = EscapeStepString(partNumber);
                var safeDescription = EscapeStepString(description);
                var safeRevision = EscapeStepString(revision);
                var safeConfigName = EscapeStepString(configName);
                
                Console.Error.WriteLine($"[Export] Updating STEP metadata:");
                Console.Error.WriteLine($"[Export]   Part Number: '{safePartNumber}'");
                Console.Error.WriteLine($"[Export]   Description: '{safeDescription}'");
                Console.Error.WriteLine($"[Export]   Revision: '{safeRevision}'");
                
                // Update PRODUCT entity - format: PRODUCT('id','name','description',(#context));
                // The 'id' field should be the part number
                // The 'name' field is often the filename, but we can set it to part number
                // The 'description' field is the description
                var productPattern = @"PRODUCT\s*\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,";
                var productMatches = System.Text.RegularExpressions.Regex.Matches(content, productPattern);
                
                if (productMatches.Count > 0)
                {
                    Console.Error.WriteLine($"[Export] Found {productMatches.Count} PRODUCT entities");
                    
                    // Replace the first PRODUCT (main product) with our values
                    var newProductId = !string.IsNullOrEmpty(safePartNumber) ? safePartNumber : "$1";
                    var newProductName = !string.IsNullOrEmpty(safePartNumber) ? safePartNumber : "$2";
                    var newProductDesc = !string.IsNullOrEmpty(safeDescription) ? safeDescription : "$3";
                    
                    // Only replace if we have values to set
                    if (!string.IsNullOrEmpty(partNumber) || !string.IsNullOrEmpty(description))
                    {
                        // Build replacement pattern
                        var firstMatch = productMatches[0];
                        var oldProduct = firstMatch.Value;
                        var newProduct = $"PRODUCT('{(string.IsNullOrEmpty(safePartNumber) ? firstMatch.Groups[1].Value : safePartNumber)}','{(string.IsNullOrEmpty(safePartNumber) ? firstMatch.Groups[2].Value : safePartNumber)}','{(string.IsNullOrEmpty(safeDescription) ? firstMatch.Groups[3].Value : safeDescription)}',";
                        
                        content = content.Replace(oldProduct, newProduct);
                        modified = true;
                        Console.Error.WriteLine($"[Export] Updated PRODUCT entity");
                    }
                }
                
                // Update PRODUCT_DEFINITION_FORMATION for revision
                // Format: PRODUCT_DEFINITION_FORMATION('id','description',#product);
                // The 'id' field is typically the revision
                if (!string.IsNullOrEmpty(revision))
                {
                    var pdfPattern = @"PRODUCT_DEFINITION_FORMATION\s*\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,";
                    var pdfMatches = System.Text.RegularExpressions.Regex.Matches(content, pdfPattern);
                    
                    if (pdfMatches.Count > 0)
                    {
                        Console.Error.WriteLine($"[Export] Found {pdfMatches.Count} PRODUCT_DEFINITION_FORMATION entities");
                        
                        var firstMatch = pdfMatches[0];
                        var oldPdf = firstMatch.Value;
                        var newPdf = $"PRODUCT_DEFINITION_FORMATION('{safeRevision}','{firstMatch.Groups[2].Value}',";
                        
                        content = content.Replace(oldPdf, newPdf);
                        modified = true;
                        Console.Error.WriteLine($"[Export] Updated PRODUCT_DEFINITION_FORMATION with revision");
                    }
                }
                
                // Write back if modified
                if (modified)
                {
                    File.WriteAllText(stepFilePath, content);
                    Console.Error.WriteLine($"[Export] STEP file metadata updated successfully");
                }
                else
                {
                    Console.Error.WriteLine($"[Export] No STEP metadata modifications needed");
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[Export] Failed to update STEP metadata: {ex.Message}");
                // Don't throw - the export was successful, just metadata update failed
            }
        }
        
        /// <summary>
        /// Escape a string for use in STEP file (single quotes need escaping)
        /// </summary>
        private static string EscapeStepString(string value)
        {
            if (string.IsNullOrEmpty(value)) return "";
            // In STEP files, single quotes are escaped by doubling them
            return value.Replace("'", "''");
        }

        #endregion

        #region Open Document Management

        /// <summary>
        /// Get list of currently open documents in SolidWorks
        /// </summary>
        /// <param name="includeComponents">If true, includes all loaded documents (components of assemblies) 
        /// even if they don't have their own visible window. If false (default), only returns documents 
        /// that the user explicitly opened with their own window.</param>
        public CommandResult GetOpenDocuments(bool includeComponents = false)
        {
            // Use COM stability layer if available
            if (_comStability != null)
            {
                var result = _comStability.ExecuteSerialized(() => GetOpenDocumentsInternal(includeComponents), operationName: "GetOpenDocuments");
                if (!result.IsSuccess)
                {
                    return new CommandResult
                    {
                        Success = false,
                        Error = result.ErrorMessage,
                        ErrorDetails = result.ErrorDetails,
                        ErrorCode = result.ErrorCode.ToString()
                    };
                }
                return result.Data!;
            }
            
            return GetOpenDocumentsInternal(includeComponents);
        }

        /// <summary>
        /// Internal implementation of GetOpenDocuments
        /// </summary>
        /// <param name="includeComponents">If true, includes all loaded documents including assembly components</param>
        private CommandResult GetOpenDocumentsInternal(bool includeComponents)
        {
            try
            {
                // Only try to connect to running instance, don't start SW
                ISldWorks? sw = null;
                try
                {
                    sw = (ISldWorks)Marshal.GetActiveObject("SldWorks.Application");
                }
                catch
                {
                    return new CommandResult
                    {
                        Success = true,
                        Data = new
                        {
                            solidWorksRunning = false,
                            documents = new List<object>()
                        }
                    };
                }

                var documents = new List<object>();
                var doc = (ModelDoc2)sw.GetFirstDocument();

                while (doc != null)
                {
                    var filePath = doc.GetPathName();
                    if (!string.IsNullOrEmpty(filePath))
                    {
                        // Check if document has a visible window
                        // Documents without windows are components loaded in memory as part of an assembly
                        // If ActiveView is null, the document has no window (loaded as component only)
                        bool isVisible = doc.ActiveView != null;
                        
                        // Include document if it has a visible window, OR if includeComponents is true
                        // This allows checkout/checkin to update read-only state of all loaded documents
                        if (isVisible || includeComponents)
                        {
                            documents.Add(new
                            {
                                filePath,
                                fileName = Path.GetFileName(filePath),
                                fileType = GetFileType(filePath),
                                isReadOnly = doc.IsOpenedReadOnly(),
                                isDirty = doc.GetSaveFlag(), // true if has unsaved changes
                                activeConfiguration = doc.ConfigurationManager?.ActiveConfiguration?.Name ?? "",
                                isComponent = !isVisible // true if loaded as component without its own window
                            });
                        }
                    }
                    doc = (ModelDoc2)doc.GetNext();
                }

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        solidWorksRunning = true,
                        documents,
                        count = documents.Count
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
        }

        /// <summary>
        /// Get list of currently selected components in the active assembly.
        /// Returns file paths of selected parts/sub-assemblies for display in BluePLM.
        /// </summary>
        public CommandResult GetSelectedFiles()
        {
            // Use COM stability layer if available
            if (_comStability != null)
            {
                var result = _comStability.ExecuteSerialized(() => GetSelectedFilesInternal(), operationName: "GetSelectedFiles", quiet: true);
                if (!result.IsSuccess)
                {
                    return new CommandResult
                    {
                        Success = false,
                        Error = result.ErrorMessage,
                        ErrorDetails = result.ErrorDetails,
                        ErrorCode = result.ErrorCode.ToString()
                    };
                }
                return result.Data!;
            }
            
            return GetSelectedFilesInternal();
        }

        /// <summary>
        /// Internal implementation of GetSelectedFiles
        /// </summary>
        private CommandResult GetSelectedFilesInternal()
        {
            try
            {
                // Only try to connect to running instance, don't start SW
                ISldWorks? sw = null;
                try
                {
                    sw = (ISldWorks)Marshal.GetActiveObject("SldWorks.Application");
                }
                catch
                {
                    return new CommandResult
                    {
                        Success = true,
                        Data = new
                        {
                            solidWorksRunning = false,
                            activeDocument = (string?)null,
                            files = new List<object>(),
                            count = 0
                        }
                    };
                }

                // Get the active document
                var activeDoc = sw.ActiveDoc as ModelDoc2;
                if (activeDoc == null)
                {
                    return new CommandResult
                    {
                        Success = true,
                        Data = new
                        {
                            solidWorksRunning = true,
                            activeDocument = (string?)null,
                            files = new List<object>(),
                            count = 0
                        }
                    };
                }

                var activeDocPath = activeDoc.GetPathName();
                var selectedFiles = new List<object>();
                var seenPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                // Get the SelectionManager
                var selMgr = activeDoc.SelectionManager as SelectionMgr;
                if (selMgr == null)
                {
                    return new CommandResult
                    {
                        Success = true,
                        Data = new
                        {
                            solidWorksRunning = true,
                            activeDocument = activeDocPath,
                            files = new List<object>(),
                            count = 0
                        }
                    };
                }

                // Get count of selected objects (-1 = all marks)
                int selCount = selMgr.GetSelectedObjectCount2(-1);

                // Iterate through selections (SOLIDWORKS uses 1-based indexing)
                for (int i = 1; i <= selCount; i++)
                {
                    try
                    {
                        // Get the type of selection
                        int selType = selMgr.GetSelectedObjectType3(i, -1);
                        Component2? comp = null;

                        // Direct component selection (from FeatureManager tree)
                        if (selType == (int)swSelectType_e.swSelCOMPONENTS)
                        {
                            comp = selMgr.GetSelectedObject6(i, -1) as Component2;
                        }
                        else
                        {
                            // Graphics area selection - get component from face/edge/vertex/body via IEntity
                            object selObj = selMgr.GetSelectedObject6(i, -1);
                            // Use IEntity interface which provides GetComponent2() for all geometric entities
                            if (selObj is IEntity entity)
                            {
                                try
                                {
                                    comp = entity.GetComponent() as Component2;
                                }
                                catch
                                {
                                    // Some entities may not have a component (e.g., in part documents)
                                }
                            }
                        }

                        // Add component if found and not already seen
                        if (comp != null)
                        {
                            string compPath = comp.GetPathName();
                            if (!string.IsNullOrEmpty(compPath) && !seenPaths.Contains(compPath))
                            {
                                seenPaths.Add(compPath);
                                selectedFiles.Add(new
                                {
                                    filePath = compPath,
                                    fileName = Path.GetFileName(compPath),
                                    componentName = comp.Name2 ?? Path.GetFileNameWithoutExtension(compPath),
                                    fileType = GetFileType(compPath),
                                    isVirtual = comp.IsVirtual
                                });
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        // Skip individual selection errors, log for debugging
                        Console.Error.WriteLine($"[SW-API] GetSelectedFiles: Error processing selection {i}: {ex.Message}");
                    }
                }

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        solidWorksRunning = true,
                        activeDocument = activeDocPath,
                        files = selectedFiles,
                        count = selectedFiles.Count
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
        }

        /// <summary>
        /// Check if a specific file is open in SolidWorks
        /// </summary>
        public CommandResult IsDocumentOpen(string? filePath)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            // Use COM stability layer if available
            if (_comStability != null)
            {
                var result = _comStability.ExecuteSerialized(() => IsDocumentOpenInternal(filePath), operationName: "IsDocumentOpen");
                if (!result.IsSuccess)
                {
                    return new CommandResult
                    {
                        Success = false,
                        Error = result.ErrorMessage,
                        ErrorDetails = result.ErrorDetails,
                        ErrorCode = result.ErrorCode.ToString()
                    };
                }
                return result.Data!;
            }
            
            return IsDocumentOpenInternal(filePath);
        }

        /// <summary>
        /// Internal implementation of IsDocumentOpen
        /// </summary>
        private CommandResult IsDocumentOpenInternal(string filePath)
        {
            try
            {
                ISldWorks? sw = null;
                try
                {
                    sw = (ISldWorks)Marshal.GetActiveObject("SldWorks.Application");
                }
                catch
                {
                    return new CommandResult
                    {
                        Success = true,
                        Data = new
                        {
                            filePath,
                            isOpen = false,
                            solidWorksRunning = false
                        }
                    };
                }

                var doc = (ModelDoc2)sw.GetOpenDocument(filePath);
                var isOpen = doc != null;

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        filePath,
                        isOpen,
                        solidWorksRunning = true,
                        isReadOnly = isOpen ? doc!.IsOpenedReadOnly() : (bool?)null,
                        isDirty = isOpen ? doc!.GetSaveFlag() : (bool?)null
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
        }

        /// <summary>
        /// Set read-only state of an open document.
        /// This allows checking out a file without closing SolidWorks!
        /// </summary>
        public CommandResult SetDocumentReadOnly(string? filePath, bool readOnly)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            // Use COM stability layer if available
            // NOTE: No health check here - ExecuteSerialized already has retry logic with exponential backoff
            // and IMessageFilter integration. The previous health check caused false "Unresponsive" failures
            // when assemblies with components were open (the health check spawns a new thread that can deadlock).
            if (_comStability != null)
            {
                var result = _comStability.ExecuteSerialized(() => SetDocumentReadOnlyInternal(filePath, readOnly), operationName: "SetDocumentReadOnly");
                if (!result.IsSuccess)
                {
                    return new CommandResult
                    {
                        Success = false,
                        Error = result.ErrorMessage,
                        ErrorDetails = result.ErrorDetails,
                        ErrorCode = result.ErrorCode.ToString()
                    };
                }
                return result.Data!;
            }
            
            return SetDocumentReadOnlyInternal(filePath, readOnly);
        }

        /// <summary>
        /// Internal implementation of SetDocumentReadOnly
        /// </summary>
        private CommandResult SetDocumentReadOnlyInternal(string filePath, bool readOnly)
        {
            try
            {
                ISldWorks? sw = null;
                try
                {
                    sw = (ISldWorks)Marshal.GetActiveObject("SldWorks.Application");
                }
                catch
                {
                    return new CommandResult
                    {
                        Success = false,
                        Error = "SolidWorks is not running",
                        ErrorCode = ComErrorCode.SwNotRunning.ToString()
                    };
                }

                var doc = (ModelDoc2)sw.GetOpenDocument(filePath);
                if (doc == null)
                {
                    return new CommandResult
                    {
                        Success = false,
                        Error = $"File is not open in SolidWorks: {Path.GetFileName(filePath)}",
                        ErrorCode = ComErrorCode.FileNotOpen.ToString()
                    };
                }

                // Check current state
                var wasReadOnly = doc.IsOpenedReadOnly();
                
                // Set the new state
                doc.SetReadOnlyState(readOnly);

                // Verify the change
                var isNowReadOnly = doc.IsOpenedReadOnly();

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        filePath,
                        fileName = Path.GetFileName(filePath),
                        wasReadOnly,
                        isNowReadOnly,
                        readOnly,
                        changed = wasReadOnly != isNowReadOnly
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
        }

        /// <summary>
        /// Save an open document. Useful before check-in.
        /// </summary>
        public CommandResult SaveDocument(string? filePath)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            // Use COM stability layer if available
            if (_comStability != null)
            {
                // Health check before critical operation
                var health = _comStability.HealthCheck();
                if (health != SwHealthStatus.Healthy)
                {
                    Console.Error.WriteLine($"[SW-API] SaveDocument: Health check failed - {health}");
                    var errorCode = health switch
                    {
                        SwHealthStatus.Busy => ComErrorCode.SwBusy,
                        SwHealthStatus.Unresponsive => ComErrorCode.SwUnresponsive,
                        SwHealthStatus.NotRunning => ComErrorCode.SwNotRunning,
                        _ => ComErrorCode.Unknown
                    };
                    return new CommandResult
                    {
                        Success = false,
                        Error = $"SolidWorks is not ready: {health}",
                        ErrorCode = errorCode.ToString()
                    };
                }

                var result = _comStability.ExecuteSerialized(() => SaveDocumentInternal(filePath), operationName: "SaveDocument");
                if (!result.IsSuccess)
                {
                    return new CommandResult
                    {
                        Success = false,
                        Error = result.ErrorMessage,
                        ErrorDetails = result.ErrorDetails,
                        ErrorCode = result.ErrorCode.ToString()
                    };
                }
                return result.Data!;
            }
            
            return SaveDocumentInternal(filePath);
        }

        /// <summary>
        /// Internal implementation of SaveDocument
        /// </summary>
        private CommandResult SaveDocumentInternal(string filePath)
        {
            try
            {
                ISldWorks? sw = null;
                try
                {
                    sw = (ISldWorks)Marshal.GetActiveObject("SldWorks.Application");
                }
                catch
                {
                    return new CommandResult
                    {
                        Success = false,
                        Error = "SolidWorks is not running",
                        ErrorCode = ComErrorCode.SwNotRunning.ToString()
                    };
                }

                var doc = (ModelDoc2)sw.GetOpenDocument(filePath);
                if (doc == null)
                {
                    return new CommandResult
                    {
                        Success = false,
                        Error = $"File is not open in SolidWorks: {Path.GetFileName(filePath)}",
                        ErrorCode = ComErrorCode.FileNotOpen.ToString()
                    };
                }

                // Check if document has unsaved changes
                var wasDirty = doc.GetSaveFlag();
                
                if (!wasDirty)
                {
                    return new CommandResult
                    {
                        Success = true,
                        Data = new
                        {
                            filePath,
                            fileName = Path.GetFileName(filePath),
                            saved = false,
                            reason = "No unsaved changes"
                        }
                    };
                }

                // Check if document is read-only
                if (doc.IsOpenedReadOnly())
                {
                    return new CommandResult
                    {
                        Success = false,
                        Error = $"Cannot save: document is read-only. Check out the file first."
                    };
                }

                int errors = 0, warnings = 0;
                doc.Save3(
                    (int)swSaveAsOptions_e.swSaveAsOptions_Silent,
                    ref errors,
                    ref warnings
                );

                if (errors != 0)
                {
                    return new CommandResult
                    {
                        Success = false,
                        Error = $"Save failed with error code: {errors}"
                    };
                }

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        filePath,
                        fileName = Path.GetFileName(filePath),
                        saved = true,
                        warnings
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
        }

        /// <summary>
        /// Set custom properties on an open document WITHOUT closing it.
        /// Uses the live SolidWorks API instead of Document Manager.
        /// This allows editing properties while the user has the file open.
        /// </summary>
        public CommandResult SetDocumentProperties(string? filePath, Dictionary<string, string>? properties, string? configuration = null)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (properties == null || properties.Count == 0)
                return new CommandResult { Success = false, Error = "Missing or empty 'properties'" };

            // Use COM stability layer if available
            if (_comStability != null)
            {
                var result = _comStability.ExecuteSerialized(() => SetDocumentPropertiesInternal(filePath, properties, configuration), operationName: "SetDocumentProperties");
                if (!result.IsSuccess)
                {
                    return new CommandResult
                    {
                        Success = false,
                        Error = result.ErrorMessage,
                        ErrorDetails = result.ErrorDetails,
                        ErrorCode = result.ErrorCode.ToString()
                    };
                }
                return result.Data!;
            }
            
            return SetDocumentPropertiesInternal(filePath, properties, configuration);
        }

        /// <summary>
        /// Internal implementation of SetDocumentProperties
        /// </summary>
        private CommandResult SetDocumentPropertiesInternal(string filePath, Dictionary<string, string> properties, string? configuration)
        {
            try
            {
                ISldWorks? sw = null;
                try
                {
                    sw = (ISldWorks)Marshal.GetActiveObject("SldWorks.Application");
                }
                catch
                {
                    return new CommandResult
                    {
                        Success = false,
                        Error = "SolidWorks is not running",
                        ErrorCode = ComErrorCode.SwNotRunning.ToString()
                    };
                }

                var doc = (ModelDoc2)sw.GetOpenDocument(filePath);
                if (doc == null)
                {
                    return new CommandResult
                    {
                        Success = false,
                        Error = $"File is not open in SolidWorks: {Path.GetFileName(filePath)}",
                        ErrorCode = ComErrorCode.FileNotOpen.ToString()
                    };
                }

                // Check if document is read-only
                if (doc.IsOpenedReadOnly())
                {
                    return new CommandResult
                    {
                        Success = false,
                        Error = $"Cannot set properties: document is read-only. Check out the file first."
                    };
                }

                // Use the WriteCustomProperties helper to set properties
                WriteCustomProperties(doc, properties, configuration);

                Console.Error.WriteLine($"[SW-API] Set {properties.Count} properties on open document: {Path.GetFileName(filePath)}, config: {configuration ?? "file-level"}");

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        filePath,
                        fileName = Path.GetFileName(filePath),
                        propertiesSet = properties.Count,
                        configuration = configuration ?? "file-level"
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
        }

        /// <summary>
        /// Get detailed info about an open document including dirty state
        /// </summary>
        public CommandResult GetDocumentInfo(string? filePath)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            // Use COM stability layer if available
            if (_comStability != null)
            {
                var result = _comStability.ExecuteSerialized(() => GetDocumentInfoInternal(filePath), operationName: "GetDocumentInfo");
                if (!result.IsSuccess)
                {
                    return new CommandResult
                    {
                        Success = false,
                        Error = result.ErrorMessage,
                        ErrorDetails = result.ErrorDetails,
                        ErrorCode = result.ErrorCode.ToString()
                    };
                }
                return result.Data!;
            }
            
            return GetDocumentInfoInternal(filePath);
        }

        /// <summary>
        /// Internal implementation of GetDocumentInfo
        /// </summary>
        private CommandResult GetDocumentInfoInternal(string filePath)
        {
            try
            {
                ISldWorks? sw = null;
                try
                {
                    sw = (ISldWorks)Marshal.GetActiveObject("SldWorks.Application");
                }
                catch
                {
                    return new CommandResult
                    {
                        Success = true,
                        Data = new
                        {
                            filePath,
                            solidWorksRunning = false,
                            isOpen = false
                        }
                    };
                }

                var doc = (ModelDoc2)sw.GetOpenDocument(filePath);
                if (doc == null)
                {
                    return new CommandResult
                    {
                        Success = true,
                        Data = new
                        {
                            filePath,
                            solidWorksRunning = true,
                            isOpen = false
                        }
                    };
                }

                var props = ReadCustomProperties(doc, null);

                return new CommandResult
                {
                    Success = true,
                    Data = new
                    {
                        filePath,
                        fileName = Path.GetFileName(filePath),
                        solidWorksRunning = true,
                        isOpen = true,
                        isReadOnly = doc.IsOpenedReadOnly(),
                        isDirty = doc.GetSaveFlag(),
                        fileType = GetFileType(filePath!),
                        activeConfiguration = doc.ConfigurationManager?.ActiveConfiguration?.Name ?? "",
                        properties = props
                    }
                };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
        }

        #endregion

        #region Preview Extraction

        /// <summary>
        /// Get preview image from a SolidWorks file using the full SolidWorks API.
        /// This is slower than Document Manager but works with newer file formats.
        /// </summary>
        public CommandResult GetPreviewImage(string? filePath, string? configuration = null)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "File path is required" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            try
            {
                var sw = GetSolidWorks();
                
                // Check if file is already open
                var openDoc = sw.IGetOpenDocumentByName2(filePath) as ModelDoc2;
                bool weOpenedIt = false;
                
                if (openDoc == null)
                {
                    // Open the file in read-only mode with light-weight assembly
                    int errors = 0, warnings = 0;
                    
                    // Determine document type
                    var ext = Path.GetExtension(filePath).ToUpperInvariant();
                    swDocumentTypes_e docType = ext switch
                    {
                        ".SLDPRT" => swDocumentTypes_e.swDocPART,
                        ".SLDASM" => swDocumentTypes_e.swDocASSEMBLY,
                        ".SLDDRW" => swDocumentTypes_e.swDocDRAWING,
                        _ => throw new Exception($"Unsupported file type: {ext}")
                    };
                    
                    // Open with options: read-only, silent, invisible
                    int openOptions = (int)(swOpenDocOptions_e.swOpenDocOptions_ReadOnly | 
                                           swOpenDocOptions_e.swOpenDocOptions_Silent);
                    
                    openDoc = sw.OpenDoc6(filePath, (int)docType, openOptions, 
                                         configuration ?? "", ref errors, ref warnings) as ModelDoc2;
                    
                    if (openDoc == null)
                        return new CommandResult { Success = false, Error = $"Failed to open file: errors={errors}, warnings={warnings}" };
                    
                    weOpenedIt = true;
                }
                
                try
                {
                    // Activate the target configuration if specified
                    if (!string.IsNullOrEmpty(configuration))
                    {
                        openDoc.ShowConfiguration2(configuration);
                    }
                    
                    // Get the preview using SaveBMP to a temp file
                    string tempPath = Path.Combine(Path.GetTempPath(), $"preview_{Guid.NewGuid()}.bmp");
                    byte[]? imageData = null;
                    string mimeType = "image/bmp";
                    
                    // Different sizes for different file types
                    var ext = Path.GetExtension(filePath).ToUpperInvariant();
                    int width, height;
                    
                    if (ext == ".SLDDRW")
                    {
                        // Drawings: Use higher res, landscape for sheets (most drawings are landscape)
                        width = 1600;
                        height = 1200;
                    }
                    else
                    {
                        // Parts/Assemblies: 3D view
                        width = 1024;
                        height = 768;
                    }
                    
                    try
                    {
                        if (ext == ".SLDPRT" || ext == ".SLDASM")
                        {
                            // Zoom to fit for best preview
                            openDoc.ViewZoomtofit2();
                            
                            // Save as bitmap
                            bool result = openDoc.SaveBMP(tempPath, width, height);
                            if (result && File.Exists(tempPath))
                            {
                                imageData = File.ReadAllBytes(tempPath);
                            }
                        }
                        else if (ext == ".SLDDRW")
                        {
                            var drawDoc = openDoc as DrawingDoc;
                            
                            if (drawDoc != null)
                            {
                                // Get sheet size for proper aspect ratio
                                var sheet = drawDoc.GetCurrentSheet() as Sheet;
                                if (sheet != null)
                                {
                                    double sheetWidth = 0, sheetHeight = 0;
                                    sheet.GetSize(ref sheetWidth, ref sheetHeight);
                                    
                                    if (sheetWidth > 0 && sheetHeight > 0)
                                    {
                                        // Calculate aspect ratio matching the sheet
                                        double aspectRatio = sheetWidth / sheetHeight;
                                        
                                        // Use higher resolution for drawings
                                        if (aspectRatio >= 1.0) // Landscape
                                        {
                                            width = 2000;
                                            height = (int)(2000 / aspectRatio);
                                        }
                                        else // Portrait
                                        {
                                            height = 2000;
                                            width = (int)(2000 * aspectRatio);
                                        }
                                    }
                                }
                            }
                            
                            // Zoom to fit the drawing sheet
                            openDoc.ViewZoomtofit2();
                            
                            // Save as bitmap with sheet's aspect ratio
                            bool result = openDoc.SaveBMP(tempPath, width, height);
                            if (result && File.Exists(tempPath))
                            {
                                imageData = File.ReadAllBytes(tempPath);
                            }
                        }
                    }
                    finally
                    {
                        // Clean up temp file
                        try { if (File.Exists(tempPath)) File.Delete(tempPath); } catch { }
                    }
                    
                    if (imageData == null || imageData.Length == 0)
                        return new CommandResult { Success = false, Error = "Could not capture preview from document" };
                    
                    return new CommandResult
                    {
                        Success = true,
                        Data = new
                        {
                            filePath,
                            configuration = openDoc.ConfigurationManager?.ActiveConfiguration?.Name ?? "",
                            imageData = Convert.ToBase64String(imageData),
                            mimeType,
                            width,
                            height,
                            sizeBytes = imageData.Length
                        }
                    };
                }
                finally
                {
                    // Close the document if we opened it
                    if (weOpenedIt && openDoc != null)
                    {
                        sw.CloseDoc(openDoc.GetTitle());
                    }
                }
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = $"Preview extraction failed: {ex.Message}" };
            }
        }

        #endregion

        #region IDisposable

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;

            if (_weStartedSW && _swApp != null)
            {
                try { _swApp.ExitApp(); } catch { }
            }

            _swApp = null;
            GC.Collect();
        }

        #endregion
    }

    /// <summary>
    /// BOM item data structure
    /// </summary>
    public class BomItem
    {
        [Newtonsoft.Json.JsonProperty("fileName")]
        public string FileName { get; set; } = "";
        
        [Newtonsoft.Json.JsonProperty("filePath")]
        public string FilePath { get; set; } = "";
        
        [Newtonsoft.Json.JsonProperty("fileType")]
        public string FileType { get; set; } = "";
        
        [Newtonsoft.Json.JsonProperty("quantity")]
        public int Quantity { get; set; } = 1;
        
        [Newtonsoft.Json.JsonProperty("configuration")]
        public string Configuration { get; set; } = "";
        
        [Newtonsoft.Json.JsonProperty("partNumber")]
        public string PartNumber { get; set; } = "";
        
        [Newtonsoft.Json.JsonProperty("description")]
        public string Description { get; set; } = "";
        
        [Newtonsoft.Json.JsonProperty("material")]
        public string Material { get; set; } = "";
        
        [Newtonsoft.Json.JsonProperty("revision")]
        public string Revision { get; set; } = "";
        
        [Newtonsoft.Json.JsonProperty("properties")]
        public Dictionary<string, string> Properties { get; set; } = new();
        
        /// <summary>
        /// True if the referenced file doesn't exist on disk (broken reference)
        /// </summary>
        [Newtonsoft.Json.JsonProperty("isBroken")]
        public bool IsBroken { get; set; } = false;
    }
}

