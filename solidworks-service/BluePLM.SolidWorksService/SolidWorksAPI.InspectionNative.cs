using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using SolidWorks.Interop.sldworks;
using SolidWorks.Interop.swconst;

namespace BluePLM.SolidWorksService
{
    /// <summary>
    /// Native inspection: read a drawing's inspectable characteristics and write BluePLM's numbered
    /// balloons through the plain SOLIDWORKS API, so neither needs a SOLIDWORKS Inspection licence.
    ///
    /// Every member used here was checked by reflection against SolidWorks.Interop.sldworks /
    /// swconst 32.1.0 (the package this project references): it exists with the signature used.
    /// What reflection cannot show is runtime behaviour. The points below are NOT verified on a real
    /// SOLIDWORKS session and are what the user's drawing check has to confirm:
    ///   R1  IModelDocExtension.GetPersistReference3 returns a reference for a display dimension,
    ///       GTOL and surface finish symbol in a drawing, and it does not change when a view, sheet,
    ///       sketch or feature is renamed, or across close / reopen / rebuild / save.
    ///   R2  IAnnotation.GetPosition and SetPosition2 use sheet coordinates (metres from the sheet
    ///       origin) for annotations owned by a drawing view, as the API help states. No transform is
    ///       applied; a position outside the sheet is logged so a wrong assumption shows in the log.
    ///   R3  IDimensionTolerance.GetMaxValue / GetMinValue and ICalloutVariable.ToleranceMax / Min
    ///       are signed deviations in system units (metres / radians), min negative below nominal.
    ///   R4  ICalloutLengthVariable.Length is in metres and ICalloutAngleVariable.Angle in radians.
    ///   R5  IGtol.GetFrameValues / GetFrameSymbols3 take a 1-based frame number (0-based is tried
    ///       when frame 1 is empty), and GetFrameValues returns {tol1, tol2, datum1, datum2, datum3}.
    ///   R6  ISFSymbol.GetText takes a swSurfaceFinishSymbolText_e.
    ///   R7  IView.GetOutline returns {xmin, ymin, xmax, ymax} in sheet coordinates.
    ///   R8  InsertNote with a view activated (IDrawingDoc.ActivateView) makes the note belong to
    ///       that view, and EditSheet makes the next note a sheet annotation.
    ///   R9  IAnnotation.Select3(true, null) selects a view's note while that view is not active, so
    ///       IModelDocExtension.DeleteSelection2 removes the previous balloons.
    ///   R10 ILayerMgr.AddLayer creates the layer (checked by GetLayer afterwards, not by its return).
    ///   R11 IModelDoc2.ReloadOrReplace(false, samePath, true) discards a user-open document's unsaved
    ///       edits and returns swReloadOkay; anything else is reported as DOC_MODIFIED_NOT_SAVED.
    ///   R12 ISelectionMgr.GetSelectedObjectType3 reports a selected note (balloon) as swSelNOTES.
    ///   R13 INote.GetText on a BluePLM balloon returns exactly its label, and GetPosition of the old
    ///       balloon fed back to SetPosition2 puts the new one in the same place (same space both ways).
    /// </summary>
    public partial class SolidWorksAPI
    {
        /// <summary>A drawing sheet with its sheet view and drawing views, in the drawing's sheet order.</summary>
        private sealed class InspectionSheet
        {
            public string Name = "";
            public Sheet? Sheet;
            public View? SheetView;
            public readonly List<View> Views = new List<View>();
            public double WidthM;
            public double HeightM;
            /// <summary>Reading this sheet's views or annotations hit an error: absence on it proves nothing.</summary>
            public bool Incomplete;
        }

        /// <summary>One annotation found on a sheet or in a view.</summary>
        private sealed class AnnotationSite
        {
            public Annotation Annotation = null!;
            public int Type;
            public string Layer = "";
            public InspectionSheet Sheet = null!;
            /// <summary>The owning drawing view, or null for an annotation on the sheet itself.</summary>
            public View? View;
            public string? ViewName;
            public string RawName = "";
            public bool Hidden;
            public object? Specific;
            public byte[]? PersistRef;
            public string? BaseKey;
            public double X;
            public double Y;

            public string AnnotationName => (ViewName ?? Sheet.Name) + "/" + RawName;
        }

        /// <summary>Drawing units and default precisions, read once per document.</summary>
        private sealed class InspectionUnits
        {
            public string WireUnits = "other";
            public string? LengthLabel;
            public double MetresPerUnit = 0.001;
            public int LinearDecimals = 2;
            public int AngularDecimals = 1;
        }

        private static bool IsDrawingPath(string path) =>
            string.Equals(Path.GetExtension(path), ".slddrw", StringComparison.OrdinalIgnoreCase);

        private static CommandResult NotADrawing(string filePath) => new CommandResult
        {
            Success = false,
            Error = $"{Path.GetFileName(filePath)} is not a SOLIDWORKS drawing",
            ErrorCode = InspectionNative.NotADrawingCode
        };

        #region extractDrawingCharacteristics

        /// <summary>
        /// Read every inspectable characteristic of a drawing - display dimensions (including hole
        /// callouts and chamfers), GTOLs and surface finish symbols - with no Inspection add-in.
        ///
        /// Keys. Each annotation's <c>baseKey</c> is the first 20 hex characters of the SHA-1 of the
        /// bytes IModelDocExtension.GetPersistReference3 returns for its IDisplayDimension / IGtol /
        /// ISFSymbol. The persist reference is SOLIDWORKS's own persistent ID, which is meant to
        /// survive close / reopen / rebuild and renames; the view and annotation names are not part
        /// of the key (they are reported separately as <c>annotationName</c>, for diagnostics). An
        /// annotation without a persist reference is skipped rather than keyed by name, so a key can
        /// never silently change when something is renamed. A hole callout, a chamfer and a GTOL
        /// always key their values <c>baseKey#n</c> (even with one value), where n is the source
        /// index - the callout variable's index, the chamfer part, the GTOL frame - never a count of
        /// values read, so an unreadable value cannot shift its neighbours' keys. A hole callout with
        /// no callout variables is read from its dimension as <c>baseKey#d</c>. A plain dimension or
        /// surface finish symbol uses <c>baseKey</c> itself. Every skip carries the sheet and, when
        /// computed, the baseKey; <c>incompleteSheets</c> names sheets the walk could not finish. <c>persistRef</c> is the
        /// same bytes in base64, so applyInspectionBalloons can resolve an annotation directly.
        ///
        /// Opens the drawing read-only (reusing it when it is already open), changes nothing, and
        /// closes it again only if this call opened it. Hidden annotations, annotations in hidden
        /// views and annotations on the BluePLM balloon layer are excluded.
        /// </summary>
        public CommandResult ExtractDrawingCharacteristics(string? filePath)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            if (!IsDrawingPath(filePath!))
                return NotADrawing(filePath!);

            ModelDoc2? doc = null;
            bool wasAlreadyOpen = false;
            try
            {
                doc = OpenDocument(filePath!, out var errors, out _, out wasAlreadyOpen);
                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open drawing: errors={errors}" };

                if (doc.GetType() != (int)swDocumentTypes_e.swDocDRAWING)
                    return NotADrawing(filePath!);

                var drw = (DrawingDoc)doc;
                var units = ReadInspectionUnits(doc);
                var sheets = ReadInspectionSheets(drw);
                var data = new ExtractedDrawingCharacteristicsData
                {
                    Units = units.WireUnits,
                    Sheets = sheets.Select(s => new ExtractedDrawingSheet { Name = s.Name, WidthM = s.WidthM, HeightM = s.HeightM }).ToList()
                };

                // Every skip names the sheet and, whenever one was computed, the persist-ref hash, so
                // the app can tell "read but unusable" from "gone" and keep that annotation's rows.
                void Skip(AnnotationSite s, string sourceKey, string reason) => data.Skipped.Add(new ExtractionSkip
                {
                    SourceKey = sourceKey,
                    BaseKey = s.BaseKey,
                    Sheet = s.Sheet.Name,
                    Reason = reason
                });

                var sites = WalkAnnotationSites(doc, sheets);
                var seenKeys = new HashSet<string>(StringComparer.Ordinal);
                foreach (var site in sites)
                {
                    if (!IsCharacteristicType(site.Type)) continue;
                    if (string.Equals(site.Layer, InspectionNative.BalloonLayer, StringComparison.OrdinalIgnoreCase)) continue;

                    if (site.Hidden)
                    {
                        Skip(site, site.BaseKey ?? site.AnnotationName, "hidden");
                        continue;
                    }
                    if (site.BaseKey == null || site.PersistRef == null)
                    {
                        Skip(site, site.AnnotationName, "no persistent reference");
                        continue;
                    }
                    if (!seenKeys.Add(site.BaseKey))
                    {
                        Skip(site, site.BaseKey, $"duplicate persistent reference ({site.AnnotationName})");
                        continue;
                    }

                    if (site.Sheet.WidthM > 0 && (site.X < 0 || site.Y < 0 || site.X > site.Sheet.WidthM || site.Y > site.Sheet.HeightM))
                        Console.Error.WriteLine($"[InspectionNative] {site.AnnotationName} position ({site.X:0.####}, {site.Y:0.####}) is outside sheet {site.Sheet.Name} - GetPosition may not be in sheet coordinates (R2)");

                    try
                    {
                        var current = site;
                        var values = ReadSiteCharacteristics(site, units, (key, reason) => Skip(current, key, reason), out var skipReason);
                        if (values.Count == 0)
                        {
                            Skip(site, site.BaseKey, skipReason ?? "no value");
                            continue;
                        }
                        data.Characteristics.AddRange(values);
                    }
                    catch (Exception ex)
                    {
                        Skip(site, site.BaseKey, "read failed: " + ex.Message);
                    }
                }

                data.IncompleteSheets = sheets.Where(s => s.Incomplete).Select(s => s.Name).ToList();
                return new CommandResult { Success = true, Data = data };
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
            finally
            {
                // Only close if WE opened it - never close a document the user already had open.
                if (doc != null && !wasAlreadyOpen)
                {
                    try { CloseDocument(filePath!); } catch { }
                }
                CloseSolidWorksIfWeStartedIt();
            }
        }

        private static bool IsCharacteristicType(int annotationType) =>
            annotationType == (int)swAnnotationType_e.swDisplayDimension
            || annotationType == (int)swAnnotationType_e.swGTol
            || annotationType == (int)swAnnotationType_e.swSFSymbol;

        private static InspectionUnits ReadInspectionUnits(ModelDoc2 doc)
        {
            var units = new InspectionUnits();
            try
            {
                var (wire, label, factor) = InspectionNative.LengthUnit(
                    doc.GetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swUnitsLinear));
                units.WireUnits = wire;
                units.LengthLabel = label;
                units.MetresPerUnit = factor;
            }
            catch { }
            try { units.LinearDecimals = doc.GetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swUnitsLinearDecimalPlaces); } catch { }
            try { units.AngularDecimals = doc.GetUserPreferenceIntegerValue((int)swUserPreferenceIntegerValue_e.swUnitsAngularDecimalPlaces); } catch { }
            return units;
        }

        private static List<string> StringList(object? raw)
        {
            var list = new List<string>();
            if (raw is Array array)
                foreach (var item in array)
                    if (item is string s) list.Add(s);
            return list;
        }

        private static List<InspectionSheet> ReadInspectionSheets(DrawingDoc drw)
        {
            var ordered = new List<InspectionSheet>();
            var byName = new Dictionary<string, InspectionSheet>(StringComparer.OrdinalIgnoreCase);
            foreach (var name in StringList(drw.GetSheetNames()))
            {
                if (byName.ContainsKey(name)) continue;
                var sheet = new InspectionSheet { Name = name };
                byName[name] = sheet;
                ordered.Add(sheet);
            }

            // GetViews: one array per sheet, the sheet's own view first, then its drawing views.
            // Anything that cannot be read or attributed to a sheet marks sheets incomplete, so the
            // app never reads "not extracted" as "no longer in the drawing" there.
            object? rawViews = null;
            bool viewsFailed = false;
            try { rawViews = drw.GetViews(); } catch { viewsFailed = true; }
            bool unattributed = viewsFailed;
            if (rawViews is Array perSheet)
            {
                foreach (var entry in perSheet)
                {
                    if (!(entry is Array views) || views.Length == 0 || !(views.GetValue(0) is View sheetView))
                    {
                        unattributed = true;
                        continue;
                    }

                    Sheet? swSheet = null;
                    try { swSheet = sheetView.Sheet; } catch { }
                    string? name = null;
                    try { name = swSheet?.GetName(); } catch { }
                    if (string.IsNullOrEmpty(name)) { try { name = sheetView.GetName2(); } catch { } }
                    if (string.IsNullOrEmpty(name)) { unattributed = true; continue; }

                    if (!byName.TryGetValue(name!, out var sheet))
                    {
                        sheet = new InspectionSheet { Name = name! };
                        byName[name!] = sheet;
                        ordered.Add(sheet);
                    }
                    sheet.Sheet = swSheet;
                    sheet.SheetView = sheetView;
                    for (var i = 1; i < views.Length; i++)
                    {
                        if (views.GetValue(i) is View v) sheet.Views.Add(v);
                        else sheet.Incomplete = true;
                    }

                    if (swSheet != null)
                    {
                        try
                        {
                            double w = 0, h = 0;
                            swSheet.GetSize(ref w, ref h);
                            sheet.WidthM = w;
                            sheet.HeightM = h;
                        }
                        catch { }
                    }
                }
            }
            else if (rawViews != null)
            {
                unattributed = true;
            }

            foreach (var sheet in ordered)
                if (unattributed || sheet.SheetView == null) sheet.Incomplete = true;
            return ordered;
        }

        /// <summary>Every annotation on every sheet and view, sheet annotations first, in sheet order.</summary>
        private static List<AnnotationSite> WalkAnnotationSites(ModelDoc2 doc, List<InspectionSheet> sheets)
        {
            var sites = new List<AnnotationSite>();
            foreach (var sheet in sheets)
            {
                try
                {
                    WalkSheetAnnotations(doc, sheet, sites);
                }
                catch (Exception ex)
                {
                    sheet.Incomplete = true;
                    Console.Error.WriteLine($"[InspectionNative] Walking sheet {sheet.Name} failed: {ex.Message}");
                }
            }
            return sites;
        }

        /// <summary>
        /// Annotations of one sheet. A view whose annotations cannot be read, or an annotation whose
        /// type cannot be read, marks the sheet incomplete instead of silently dropping it.
        /// </summary>
        private static void WalkSheetAnnotations(ModelDoc2 doc, InspectionSheet sheet, List<AnnotationSite> sites)
        {
            {
                var owners = new List<(View view, bool isSheet)>();
                if (sheet.SheetView != null) owners.Add((sheet.SheetView, true));
                owners.AddRange(sheet.Views.Select(v => (v, false)));

                foreach (var (view, isSheet) in owners)
                {
                    bool viewHidden = false;
                    string? viewName = null;
                    if (!isSheet)
                    {
                        try { viewHidden = !view.GetVisible(); } catch { }
                        try { viewName = view.GetName2(); } catch { }
                    }

                    object? raw = null;
                    try { raw = view.GetAnnotations(); }
                    catch { sheet.Incomplete = true; continue; }
                    if (raw == null) continue; // no annotations
                    if (!(raw is Array annotations)) { sheet.Incomplete = true; continue; }

                    foreach (var item in annotations)
                    {
                        if (!(item is Annotation ann)) { sheet.Incomplete = true; continue; }
                        var site = new AnnotationSite
                        {
                            Annotation = ann,
                            Sheet = sheet,
                            View = isSheet ? null : view,
                            ViewName = viewName,
                            Hidden = viewHidden,
                        };
                        try { site.Type = ann.GetType(); } catch { sheet.Incomplete = true; continue; }
                        try { site.Layer = ann.Layer ?? ""; } catch { }
                        try { site.RawName = ann.GetName() ?? ""; } catch { }
                        try { site.Hidden |= ann.Visible == (int)swAnnotationVisibilityState_e.swAnnotationHidden; } catch { }
                        try
                        {
                            if (ann.GetPosition() is Array pos && pos.Length >= 2)
                            {
                                site.X = Convert.ToDouble(pos.GetValue(0));
                                site.Y = Convert.ToDouble(pos.GetValue(1));
                            }
                        }
                        catch { }

                        if (IsCharacteristicType(site.Type))
                        {
                            try { site.Specific = ann.GetSpecificAnnotation(); } catch { }
                            if (site.Specific != null)
                            {
                                try { site.PersistRef = InspectionNative.PersistBytes(doc.Extension.GetPersistReference3(site.Specific)); } catch { }
                                if (site.PersistRef != null)
                                    site.BaseKey = InspectionNative.BaseKeyFromPersistRef(site.PersistRef);
                            }
                        }

                        sites.Add(site);
                    }
                }
            }
        }

        private ExtractedCharacteristic NewCharacteristic(AnnotationSite site, string kind, string sourceKey)
        {
            string? zone = null;
            try
            {
                var z = site.Sheet.Sheet?.GetDrawingZone(site.X, site.Y);
                zone = string.IsNullOrWhiteSpace(z) ? null : z!.Trim();
            }
            catch { }

            return new ExtractedCharacteristic
            {
                SourceKey = sourceKey,
                BaseKey = site.BaseKey!,
                PersistRef = Convert.ToBase64String(site.PersistRef!),
                AnnotationName = site.AnnotationName,
                Sheet = site.Sheet.Name,
                View = site.ViewName,
                Kind = kind,
                Zone = zone,
                X = site.X,
                Y = site.Y,
            };
        }

        /// <param name="skipPart">Reports one value of a multi-value annotation that could not be read (its sub-key, why).</param>
        private List<ExtractedCharacteristic> ReadSiteCharacteristics(AnnotationSite site, InspectionUnits units,
            Action<string, string> skipPart, out string? skipReason)
        {
            skipReason = null;
            switch (site.Type)
            {
                case (int)swAnnotationType_e.swDisplayDimension:
                    return ReadDimension(site, units, skipPart, out skipReason);
                case (int)swAnnotationType_e.swGTol:
                    return ReadGtol(site, units, skipPart, out skipReason);
                case (int)swAnnotationType_e.swSFSymbol:
                    return ReadSurfaceFinish(site, out skipReason);
                default:
                    return new List<ExtractedCharacteristic>();
            }
        }

        private static string? DimensionSubType(int swDimensionType) => swDimensionType switch
        {
            1 or 7 or 8 => "Ordinate",
            2 or 9 or 11 or 12 => "Linear",
            3 or 16 => "Angular",
            4 => "Arc Length",
            5 or 14 => "Radius",
            6 or 15 => "Diameter",
            10 => "Chamfer",
            13 => "Scalar",
            _ => null,
        };

        /// <summary>System value (metres / radians) of a dimension in the configuration its view shows.</summary>
        private static double? DimensionSystemValue(Dimension dim, string? configuration)
        {
            try
            {
                object raw = string.IsNullOrEmpty(configuration)
                    ? dim.GetSystemValue3((int)swInConfigurationOpts_e.swThisConfiguration, null)
                    : dim.GetSystemValue3((int)swInConfigurationOpts_e.swSpecifyConfiguration, new[] { configuration });
                if (raw is Array values && values.Length > 0) return Convert.ToDouble(values.GetValue(0));
            }
            catch { }
            try { return dim.SystemValue; } catch { return null; }
        }

        private List<ExtractedCharacteristic> ReadDimension(AnnotationSite site, InspectionUnits units,
            Action<string, string> skipPart, out string? skipReason)
        {
            skipReason = null;
            var result = new List<ExtractedCharacteristic>();
            var dd = (DisplayDimension)site.Specific!;
            var dim = dd.GetDimension2(0);
            if (dim == null) { skipReason = "display dimension has no dimension"; return result; }

            int dimType = 0;
            try { dimType = dd.GetType(); } catch { }
            bool angular = dimType == (int)swDimensionType_e.swAngularDimension || dimType == (int)swDimensionType_e.swAngularOrdinateDimension;
            bool scalar = dimType == (int)swDimensionType_e.swScalarDimension;

            bool isReference = false;
            try { isReference = dd.IsReferenceDim(); } catch { }
            try { isReference |= dd.ShowParenthesis; } catch { }

            int precision = -1;
            try { precision = dd.GetUseDocPrecision() ? -1 : dd.GetPrimaryPrecision2(); } catch { }
            if (precision < 0) precision = angular ? units.AngularDecimals : units.LinearDecimals;
            int tolPrecision = -1;
            try { tolPrecision = dd.GetPrimaryTolPrecision2(); } catch { }
            if (tolPrecision < 0) tolPrecision = precision;

            string? configuration = null;
            try { configuration = site.View?.ReferencedConfiguration; } catch { }

            double ToLength(double metres) => metres / units.MetresPerUnit;
            double ToUnit(double system) => angular ? InspectionNative.RadiansToDegrees(system) : scalar ? system : ToLength(system);
            string? unitLabel = angular ? InspectionNative.DegreeUnit : scalar ? null : units.LengthLabel;

            bool holeCallout = false;
            try { holeCallout = dd.IsHoleCallout(); } catch { }

            if (holeCallout)
            {
                object? rawVars;
                try { rawVars = dd.GetHoleCalloutVariables(); }
                catch (Exception ex)
                {
                    // Unreadable is not "no variables": falling back would key this callout differently.
                    skipReason = "hole callout variables unreadable: " + ex.Message;
                    return result;
                }
                if (rawVars is Array vars && vars.Length > 0)
                {
                    // The sub-key is the variable's index in the callout, never a count of the values
                    // read so far, so one unreadable or empty variable cannot shift the keys after it.
                    for (var index = 0; index < vars.Length; index++)
                    {
                        var subKey = InspectionNative.SubKey(site.BaseKey!, index);
                        try
                        {
                            if (!(vars.GetValue(index) is ICalloutVariable cv))
                            {
                                skipPart(subKey, "hole callout variable is not a callout variable");
                                continue;
                            }
                            var variable = ReadCalloutVariable(site, cv, units, index, isReference);
                            if (variable != null) result.Add(variable);
                        }
                        catch (Exception ex)
                        {
                            skipPart(subKey, "hole callout variable unreadable: " + ex.Message);
                        }
                    }
                    if (result.Count == 0) skipReason = "hole callout has no readable values";
                    return result;
                }
            }

            if (dimType == (int)swDimensionType_e.swChamferDimension && !holeCallout)
            {
                double length = 0, angle = 0;
                bool ok = false;
                try { ok = dim.GetSystemChamferValues(ref length, ref angle); } catch { }
                if (ok)
                {
                    var c0 = NewCharacteristic(site, "dimension", InspectionNative.SubKey(site.BaseKey!, 0));
                    c0.SubType = "Chamfer";
                    c0.Nominal = InspectionNative.FormatNumber(ToLength(length), precision);
                    c0.Unit = units.LengthLabel;
                    c0.IsReference = isReference;
                    result.Add(c0);

                    var c1 = NewCharacteristic(site, "dimension", InspectionNative.SubKey(site.BaseKey!, 1));
                    c1.SubType = "Chamfer Angle";
                    c1.Nominal = InspectionNative.FormatNumber(InspectionNative.RadiansToDegrees(angle), units.AngularDecimals);
                    c1.Unit = InspectionNative.DegreeUnit;
                    c1.IsReference = isReference;
                    result.Add(c1);
                    return result;
                }
            }

            var system = DimensionSystemValue(dim, configuration);
            if (system == null) { skipReason = "dimension value unreadable"; return result; }
            var nominal = ToUnit(system.Value);

            // A hole callout with no callout variables is read from its dimension, keyed "#d" so it
            // can never collide with variable 0 of a callout that later exposes its variables.
            var key = holeCallout ? site.BaseKey! + "#" + InspectionNative.DimensionFallbackSubKey : site.BaseKey!;
            var c = NewCharacteristic(site, holeCallout ? "holeCallout" : "dimension", key);
            c.SubType = DimensionSubType(dimType);
            c.Unit = unitLabel;
            c.IsReference = isReference;
            c.Nominal = InspectionNative.FormatNumber(nominal, precision);

            try
            {
                var tol = dim.Tolerance;
                if (tol != null)
                {
                    int tolType = tol.Type;
                    var text = InspectionNative.Tolerance(tolType, nominal,
                        ToUnit(tol.GetMaxValue()), ToUnit(tol.GetMinValue()), precision, tolPrecision);
                    c.ToleranceType = text.Type;
                    c.PlusTolerance = text.Plus;
                    c.MinusTolerance = text.Minus;
                    c.UpperLimit = text.Upper;
                    c.LowerLimit = text.Lower;
                    if (tolType >= (int)swTolType_e.swTolFIT && tolType <= (int)swTolType_e.swTolFITTOLONLY)
                    {
                        var fit = string.Join("/", new[] { tol.GetHoleFitValue(), tol.GetShaftFitValue() }
                            .Where(f => !string.IsNullOrWhiteSpace(f)).Select(f => f.Trim()));
                        if (fit.Length > 0) c.Nominal += " " + fit;
                    }
                }
            }
            catch { }

            result.Add(c);
            return result;
        }

        private ExtractedCharacteristic? ReadCalloutVariable(AnnotationSite site, ICalloutVariable cv, InspectionUnits units, int index, bool isReference)
        {
            int variableType = 0;
            try { variableType = cv.VariableType; } catch { }
            string? name = null;
            try { name = cv.UserReadableVariableName; } catch { }
            if (string.IsNullOrWhiteSpace(name)) { try { name = cv.VariableName; } catch { } }

            var c = NewCharacteristic(site, "holeCallout", InspectionNative.SubKey(site.BaseKey!, index));
            c.SubType = string.IsNullOrWhiteSpace(name) ? null : InspectionNative.DecodeSymbolTokens(name);
            c.IsReference = isReference;

            double nominal;
            int precision;
            Func<double, double> toUnit;
            switch (variableType)
            {
                case (int)swCalloutVariableType_e.swCalloutVariableType_Length:
                {
                    if (!(cv is ICalloutLengthVariable lv)) return null;
                    toUnit = m => m / units.MetresPerUnit;
                    nominal = toUnit(lv.Length);
                    precision = units.LinearDecimals;
                    try { if (lv.Precision >= 0) precision = lv.Precision; } catch { }
                    c.Unit = units.LengthLabel;
                    break;
                }
                case (int)swCalloutVariableType_e.swCalloutVariableType_Angle:
                {
                    if (!(cv is ICalloutAngleVariable av)) return null;
                    toUnit = InspectionNative.RadiansToDegrees;
                    nominal = toUnit(av.Angle);
                    precision = units.AngularDecimals;
                    c.Unit = InspectionNative.DegreeUnit;
                    break;
                }
                case (int)swCalloutVariableType_e.swCalloutVariableType_String:
                {
                    if (!(cv is ICalloutStringVariable sv)) return null;
                    var text = InspectionNative.DecodeSymbolTokens(DecodeSwSymbolFont(sv.String ?? ""));
                    if (string.IsNullOrWhiteSpace(text)) return null;
                    c.Nominal = text;
                    return c;
                }
                default:
                    return null;
            }

            c.Nominal = InspectionNative.FormatNumber(nominal, precision);
            try
            {
                int tolType = cv.ToleranceType;
                int tolPrecision = precision;
                if (cv is ICalloutLengthVariable lv2) { try { if (lv2.TolerancePrecision >= 0) tolPrecision = lv2.TolerancePrecision; } catch { } }
                var text = InspectionNative.Tolerance(tolType, nominal, toUnit(cv.ToleranceMax), toUnit(cv.ToleranceMin), precision, tolPrecision);
                c.ToleranceType = text.Type;
                c.PlusTolerance = text.Plus;
                c.MinusTolerance = text.Minus;
                c.UpperLimit = text.Upper;
                c.LowerLimit = text.Lower;
                if (tolType >= (int)swTolType_e.swTolFIT && tolType <= (int)swTolType_e.swTolFITTOLONLY)
                {
                    var fit = string.Join("/", new[] { cv.HoleFit, cv.ShaftFit }
                        .Where(f => !string.IsNullOrWhiteSpace(f)).Select(f => f.Trim()));
                    if (fit.Length > 0) c.Nominal += " " + fit;
                }
            }
            catch { }
            return c;
        }

        private static string DecodeAnnotationText(object? raw)
        {
            var s = raw as string ?? (raw == null ? "" : Convert.ToString(raw) ?? "");
            return InspectionNative.DecodeSymbolTokens(DecodeSwSymbolFont(s));
        }

        private static List<string> GtolFrameValues(Gtol g, int frame)
        {
            var list = new List<string>();
            try
            {
                if (g.GetFrameValues((short)frame) is Array values)
                    foreach (var v in values) list.Add(DecodeAnnotationText(v));
            }
            catch { }
            return list;
        }

        private static object? GtolFrameSymbol(Gtol g, int frame)
        {
            try { if (g.GetFrameSymbols3(frame) is Array s3 && s3.Length > 0) return s3.GetValue(0); } catch { }
            try { if (g.GetFrameSymbols((short)frame) is Array s1 && s1.Length > 0) return s1.GetValue(0); } catch { }
            return null;
        }

        private List<ExtractedCharacteristic> ReadGtol(AnnotationSite site, InspectionUnits units,
            Action<string, string> skipPart, out string? skipReason)
        {
            skipReason = null;
            var result = new List<ExtractedCharacteristic>();
            var g = (Gtol)site.Specific!;
            int count = 0;
            try { count = g.GetFrameCount(); } catch { }
            if (count <= 0) { skipReason = "GTOL has no frames"; return result; }

            // R5: frame numbers are documented 1-based; fall back to 0-based if frame 1 reads empty.
            int first = GtolFrameValues(g, 1).Any(v => v.Length > 0) || GtolFrameSymbol(g, 1) != null ? 1 : 0;

            // The sub-key is the frame index, never a count of non-empty frames, so an empty or
            // unreadable frame cannot shift the keys of the frames after it.
            for (var i = 0; i < count; i++)
            {
                var frame = first + i;
                var subKey = InspectionNative.SubKey(site.BaseKey!, i);
                var values = GtolFrameValues(g, frame);
                var gcs = InspectionNative.GtolCharacteristic(GtolFrameSymbol(g, frame));
                var tol1 = values.Count > 0 ? values[0] : "";
                var tol2 = values.Count > 1 ? values[1] : "";
                if (gcs == null && tol1.Length == 0)
                {
                    skipPart(subKey, "GTOL frame is empty or unreadable");
                    continue;
                }

                var parts = new List<string>();
                if (gcs != null) parts.Add(gcs.Value.Glyph);
                if (tol1.Length > 0) parts.Add(tol1);
                if (tol2.Length > 0) parts.Add(tol2);
                parts.AddRange(values.Skip(2).Where(v => v.Length > 0));

                var c = NewCharacteristic(site, "gtol", subKey);
                c.SubType = gcs?.Name;
                c.Nominal = string.Join(" ", parts);
                c.Unit = units.LengthLabel;
                c.UpperLimit = InspectionNative.LeadingNumber(tol1);
                result.Add(c);
            }

            if (result.Count == 0) skipReason = "GTOL frames are empty";
            return result;
        }

        private List<ExtractedCharacteristic> ReadSurfaceFinish(AnnotationSite site, out string? skipReason)
        {
            skipReason = null;
            var result = new List<ExtractedCharacteristic>();
            var sf = (SFSymbol)site.Specific!;

            string Text(swSurfaceFinishSymbolText_e part)
            {
                try { return DecodeAnnotationText(sf.GetText((int)part)); } catch { return ""; }
            }

            var max = Text(swSurfaceFinishSymbolText_e.swSFSymbolMaximumRoughness);
            var v1 = Text(swSurfaceFinishSymbolText_e.swSFSymbolRoughnessValue1);
            var other = Text(swSurfaceFinishSymbolText_e.swSFSymbolOtherRoughnessValue);
            var min = Text(swSurfaceFinishSymbolText_e.swSFSymbolMinimumRoughness);

            var nominal = new[] { max, v1, other, min }.FirstOrDefault(t => t.Length > 0);
            if (nominal == null) { skipReason = "surface finish symbol has no roughness value"; return result; }

            var c = NewCharacteristic(site, "surfaceFinish", site.BaseKey!);
            c.Nominal = nominal;
            c.UpperLimit = InspectionNative.LeadingNumber(max.Length > 0 ? max : v1);
            c.LowerLimit = min.Length > 0 && nominal != min ? InspectionNative.LeadingNumber(min) : null;
            result.Add(c);
            return result;
        }

        #endregion

        #region applyInspectionBalloons

        /// <summary>
        /// Write BluePLM's numbered balloons into a drawing on the "BluePLM Inspection" layer,
        /// replacing every balloon BluePLM placed before, then save it.
        ///
        /// Resolves each requested key by walking the drawing's annotations and recomputing their
        /// keys exactly as extractDrawingCharacteristics does; a key the walk does not find is
        /// resolved through IModelDocExtension.GetObjectByPersistReference3 when the item carries a
        /// persistRef. Values of one annotation (baseKey#0, #1, ...) get one balloon each, stacked
        /// outward from it. Each balloon is inserted with its owning view activated so it belongs to
        /// that view and moves with it.
        ///
        /// Refuses a file with the read-only attribute (DM_FILE_READ_ONLY), a document SOLIDWORKS has
        /// open with unsaved changes (DOC_HAS_UNSAVED_CHANGES) or open read-only
        /// (FILE_OPEN_IN_SOLIDWORKS), and anything that is not a drawing (NOT_A_DRAWING). Closes the
        /// document afterwards if this call opened it; closing discards the edits when the save failed.
        /// </summary>
        internal CommandResult ApplyInspectionBalloons(string? filePath, List<InspectionBalloonRequest>? balloons)
        {
            if (string.IsNullOrEmpty(filePath))
                return new CommandResult { Success = false, Error = "Missing 'filePath'" };

            if (!File.Exists(filePath))
                return new CommandResult { Success = false, Error = $"File not found: {filePath}" };

            if (!IsDrawingPath(filePath!))
                return NotADrawing(filePath!);

            if (balloons == null)
                return new CommandResult { Success = false, Error = "Missing 'balloons'" };

            if ((File.GetAttributes(filePath!) & FileAttributes.ReadOnly) != 0)
            {
                return new CommandResult
                {
                    Success = false,
                    Error = $"{Path.GetFileName(filePath)} is read-only on disk - check it out first",
                    ErrorCode = DocumentManagerAPI.FileReadOnlyCode
                };
            }

            ModelDoc2? doc = null;
            bool wasAlreadyOpen = false;
            try
            {
                var sw = GetSolidWorks();

                if (IsDocumentAlreadyOpen(filePath!) && sw.GetOpenDocument(filePath) is ModelDoc2 open)
                {
                    if (open.GetSaveFlag())
                    {
                        // Refused before anything is touched; wasAlreadyOpen keeps the finally from closing it.
                        wasAlreadyOpen = true;
                        return new CommandResult
                        {
                            Success = false,
                            Error = $"{Path.GetFileName(filePath)} is open in SolidWorks with unsaved changes. Save or close it and try again.",
                            ErrorCode = InspectionNative.DocHasUnsavedChangesCode
                        };
                    }
                    if (open.IsOpenedReadOnly())
                    {
                        wasAlreadyOpen = true;
                        return new CommandResult
                        {
                            Success = false,
                            Error = $"{Path.GetFileName(filePath)} is open read-only in SolidWorks. Close it and try again.",
                            ErrorCode = "FILE_OPEN_IN_SOLIDWORKS"
                        };
                    }
                }

                doc = OpenDocument(filePath!, out var errors, out _, out wasAlreadyOpen, readOnly: false);
                if (doc == null)
                    return new CommandResult { Success = false, Error = $"Failed to open drawing: errors={errors}" };

                if (doc.GetType() != (int)swDocumentTypes_e.swDocDRAWING)
                    return NotADrawing(filePath!);

                if (doc.IsOpenedReadOnly())
                {
                    return new CommandResult
                    {
                        Success = false,
                        Error = $"SolidWorks opened {Path.GetFileName(filePath)} read-only (another session may hold it), so it cannot be saved",
                        ErrorCode = DocumentManagerAPI.FileReadOnlyCode
                    };
                }

                try
                {
                    int activateErrors = 0;
                    sw.ActivateDoc3(doc.GetTitle(), true, (int)swRebuildOnActivation_e.swDontRebuildActiveDoc, ref activateErrors);
                }
                catch { }

                bool changed = false;
                CommandResult result;
                try
                {
                    result = PlaceBalloons(doc, filePath!, balloons, ref changed);
                }
                catch (Exception ex)
                {
                    result = new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
                }

                // A failure after the first change must not leave edits behind. A document this call
                // opened is closed by the finally, which discards them. One the user already had open
                // is reloaded from disk with its in-memory changes discarded.
                if (!result.Success && changed && wasAlreadyOpen)
                    result = DiscardBalloonEdits(doc, filePath!, result);
                return result;
            }
            catch (Exception ex)
            {
                return new CommandResult { Success = false, Error = ex.Message, ErrorDetails = ex.ToString() };
            }
            finally
            {
                if (doc != null && !wasAlreadyOpen)
                {
                    try { CloseDocument(filePath!); } catch { }
                }
                CloseSolidWorksIfWeStartedIt();
            }
        }

        /// <summary>
        /// Throw away this call's unsaved edits in a document the user had open, with
        /// IModelDoc2.ReloadOrReplace(readOnly: false, the same path, discardChanges: true) (member
        /// verified on the interop; behaviour unverified at runtime, R11). If the reload does not
        /// report swReloadOkay, the reply is DOC_MODIFIED_NOT_SAVED: the document holds BluePLM's
        /// partial edits, unsaved, and the user has to close it without saving.
        /// </summary>
        private static CommandResult DiscardBalloonEdits(ModelDoc2 doc, string filePath, CommandResult failure)
        {
            int reload = -1;
            string? reloadError = null;
            try { reload = doc.ReloadOrReplace(false, filePath, true); }
            catch (Exception ex) { reloadError = ex.Message; }

            if (reload == (int)swComponentReloadError_e.swReloadOkay)
            {
                failure.Error = (failure.Error ?? "Placing balloons failed") +
                                ". The drawing was reloaded from disk, so none of the changes remain.";
                return failure;
            }

            Console.Error.WriteLine($"[InspectionNative] Discarding balloon edits failed: reload={reload} {reloadError}");
            return new CommandResult
            {
                Success = false,
                Error = $"{failure.Error ?? "Placing balloons failed"}. {Path.GetFileName(filePath)} is open in SolidWorks with " +
                        "BluePLM's partial changes, which were not saved. Close it without saving.",
                ErrorDetails = failure.ErrorDetails,
                ErrorCode = InspectionNative.DocModifiedNotSavedCode,
                Data = failure.Data
            };
        }

        /// <param name="changed">Set as soon as the document is modified in memory (layer, removal or balloon).</param>
        private CommandResult PlaceBalloons(ModelDoc2 doc, string filePath, List<InspectionBalloonRequest> balloons, ref bool changed)
        {
            var drw = (DrawingDoc)doc;
            var report = new AppliedInspectionBalloonsData();

            var layerMgr = doc.GetLayerManager() as LayerMgr;
            if (layerMgr == null)
                return new CommandResult { Success = false, Error = "The drawing's layer manager is not available" };

            string? originalSheet = null;
            try { originalSheet = (drw.GetCurrentSheet() as Sheet)?.GetName(); } catch { }
            string? originalLayer = null;
            try { originalLayer = layerMgr.GetCurrentLayer(); } catch { }

            CommandResult? failure;
            try
            {
                failure = ModifyDrawing(doc, drw, layerMgr, balloons, report, ref changed);
            }
            finally
            {
                // Restored on every path, including a failure part-way, and before any save.
                if (!string.IsNullOrEmpty(originalLayer)) { try { layerMgr.SetCurrentLayer(originalLayer); } catch { } }
                if (!string.IsNullOrEmpty(originalSheet)) { try { drw.ActivateSheet(originalSheet); } catch { } }
                try { doc.ClearSelection2(true); } catch { }
            }
            if (failure != null) return failure;

            // Save, unless nothing changed.
            if (!changed)
                return new CommandResult { Success = true, Data = report };

            string? saveFailure = null;
            try
            {
                int saveErrors = 0, saveWarnings = 0;
                doc.Save3((int)swSaveAsOptions_e.swSaveAsOptions_Silent, ref saveErrors, ref saveWarnings);
                report.Saved = !SwSaveError.IsFailure(saveErrors);
                if (!report.Saved) saveFailure = SwSaveError.Describe(saveErrors);
            }
            catch (Exception saveEx)
            {
                saveFailure = saveEx.Message;
            }

            if (saveFailure != null)
            {
                Console.Error.WriteLine($"[InspectionNative] Save after placing balloons failed: {saveFailure}");
                return new CommandResult
                {
                    Success = false,
                    Error = $"SolidWorks could not save {Path.GetFileName(filePath)} after placing balloons: {saveFailure}",
                    Data = report
                };
            }

            return new CommandResult { Success = true, Data = report };
        }

        /// <summary>
        /// The in-memory edits: layer, removal of the previous balloons, placement. Returns a failure
        /// (and the caller discards the edits) rather than ever leaving a half-done set to be saved.
        /// </summary>
        private CommandResult? ModifyDrawing(ModelDoc2 doc, DrawingDoc drw, LayerMgr layerMgr,
            List<InspectionBalloonRequest> balloons, AppliedInspectionBalloonsData report, ref bool changed)
        {
            var sheets = ReadInspectionSheets(drw);
            var sites = WalkAnnotationSites(doc, sheets);

            // Replacing the old set needs every sheet read: a sheet the walk could not finish may hold
            // previous balloons that would then stay next to the new ones.
            var incomplete = sheets.Where(s => s.Incomplete).Select(s => s.Name).ToList();
            if (incomplete.Count > 0)
                return new CommandResult { Success = false, Error = $"Could not read every annotation on sheet(s) {string.Join(", ", incomplete)}; nothing was changed" };

            if (layerMgr.GetLayer(InspectionNative.BalloonLayer) == null)
            {
                changed = true;
                // COLORREF 0x00BBGGRR: blue, so BluePLM balloons are told apart from the drawing's own.
                try { layerMgr.AddLayer(InspectionNative.BalloonLayer, "Inspection balloons placed by BluePLM", 0xFF0000, (int)swLineStyles_e.swLineCONTINUOUS, (int)swLineWeights_e.swLW_THIN); } catch { }
                if (layerMgr.GetLayer(InspectionNative.BalloonLayer) == null)
                    return new CommandResult { Success = false, Error = $"Could not create the '{InspectionNative.BalloonLayer}' layer" };
            }

            // 1. Record every note on the BluePLM layer (label, owner, position) so a balloon the user
            //    moved by hand is re-placed where it was, then remove them sheet by sheet (selection
            //    is per active sheet). Delete only when exactly those notes, and nothing else, are selected.
            var previousSites = sites
                .Where(s => s.Type == (int)swAnnotationType_e.swNote
                            && string.Equals(s.Layer, InspectionNative.BalloonLayer, StringComparison.OrdinalIgnoreCase))
                .ToList();
            var oldBalloons = previousSites.Select(s =>
            {
                string? label = null;
                try { label = (s.Annotation.GetSpecificAnnotation() as Note)?.GetText(); } catch { }
                return new InspectionNative.OldBalloon { Label = label, Sheet = s.Sheet.Name, View = s.ViewName, X = s.X, Y = s.Y };
            }).ToList();
            var previous = previousSites.GroupBy(s => s.Sheet.Name, StringComparer.OrdinalIgnoreCase);
            foreach (var group in previous)
            {
                var expected = group.Count();
                try { drw.ActivateSheet(group.Key); } catch { }
                doc.ClearSelection2(true);
                foreach (var site in group)
                {
                    try { site.Annotation.Select3(true, null); } catch { }
                }

                var selMgr = doc.SelectionManager as SelectionMgr;
                int selected = 0;
                try { selected = selMgr?.GetSelectedObjectCount2(-1) ?? 0; } catch { }
                bool onlyNotes = selMgr != null && selected == expected;
                for (var i = 1; onlyNotes && i <= selected; i++)
                {
                    int type = -1;
                    try { type = selMgr!.GetSelectedObjectType3(i, -1); } catch { }
                    if (type != (int)swSelectType_e.swSelNOTES) onlyNotes = false;
                }

                if (!onlyNotes)
                {
                    doc.ClearSelection2(true);
                    return new CommandResult
                    {
                        Success = false,
                        Error = $"Could not select exactly BluePLM's previous balloons on sheet {group.Key} " +
                                $"({expected} found, {selected} selected); nothing was deleted there"
                    };
                }

                changed = true;
                bool deleted = doc.Extension.DeleteSelection2(0);
                doc.ClearSelection2(true);
                if (!deleted)
                    return new CommandResult { Success = false, Error = $"Could not remove BluePLM's previous balloons on sheet {group.Key}" };
                report.RemovedPrevious += selected;
            }

            // 2. Resolve requested keys to annotations.
            var byKey = new Dictionary<string, AnnotationSite>(StringComparer.Ordinal);
            foreach (var s in sites)
                if (s.BaseKey != null && IsCharacteristicType(s.Type) && !byKey.ContainsKey(s.BaseKey)) byKey[s.BaseKey] = s;

            var groups = balloons
                .Where(b => !string.IsNullOrWhiteSpace(b.SourceKey))
                .GroupBy(b => InspectionNative.BaseKeyOf(b.SourceKey), StringComparer.Ordinal)
                .ToList();

            var placements = new List<(AnnotationSite site, List<InspectionBalloonRequest> items)>();
            foreach (var g in groups)
            {
                var items = g.OrderBy(b => SubIndex(b.SourceKey)).ThenBy(b => b.SourceKey, StringComparer.Ordinal).ToList();
                if (!byKey.TryGetValue(g.Key, out var site))
                    site = ResolveByPersistRef(doc, sites, items);
                if (site == null)
                {
                    report.Missing.AddRange(items.Select(b => b.SourceKey));
                    continue;
                }
                placements.Add((site, items));
            }

            // 3. Place the balloons. A balloon that cannot be placed fails the whole call.
            double charHeight = 0;
            try { charHeight = doc.Extension.GetUserPreferenceTextFormat((int)swUserPreferenceTextFormat_e.swDetailingBalloonTextFormat, 0)?.CharHeight ?? 0; } catch { }
            if (charHeight <= 0)
            {
                try { charHeight = doc.Extension.GetUserPreferenceTextFormat((int)swUserPreferenceTextFormat_e.swDetailingNoteTextFormat, 0)?.CharHeight ?? 0; } catch { }
            }
            var diameter = InspectionNative.BalloonDiameter(charHeight);

            if (placements.Count > 0)
            {
                try { layerMgr.SetCurrentLayer(InspectionNative.BalloonLayer); } catch { }
            }

            // A request whose label matches an old balloon reuses that balloon's position.
            var ordered = placements.GroupBy(p => p.site.Sheet.Name, StringComparer.OrdinalIgnoreCase).ToList();
            var targets = ordered.SelectMany(sg => sg.SelectMany(p => p.items.Select(b =>
                new InspectionNative.BalloonTarget(b.Label, p.site.Sheet.Name, p.site.ViewName)))).ToList();
            var matches = InspectionNative.MatchOldBalloons(oldBalloons, targets);
            var targetIndex = 0;

            foreach (var sheetGroup in ordered)
            {
                try { drw.ActivateSheet(sheetGroup.Key); } catch { }
                foreach (var (site, items) in sheetGroup)
                {
                    var (cx, cy) = OutwardCentre(site);
                    var positions = InspectionNative.BalloonPositions(site.X, site.Y, cx, cy, items.Count, diameter,
                        site.Sheet.WidthM, site.Sheet.HeightM);

                    for (var i = 0; i < items.Count; i++)
                    {
                        changed = true;
                        var (x, y) = positions[i];
                        var match = matches[targetIndex++];
                        if (match != null)
                        {
                            x = oldBalloons[match.Value].X;
                            y = oldBalloons[match.Value].Y;
                            report.KeptPositions++;
                        }
                        if (!InsertBalloon(doc, drw, site, items[i].Label, x, y))
                        {
                            return new CommandResult
                            {
                                Success = false,
                                Error = $"Could not place balloon '{items[i].Label}' for {items[i].SourceKey} on the '{InspectionNative.BalloonLayer}' layer",
                                Data = report
                            };
                        }
                        report.Placed++;
                    }
                }
            }

            return null;
        }

        private static int SubIndex(string sourceKey)
        {
            var hash = sourceKey.IndexOf('#');
            return hash >= 0 && int.TryParse(sourceKey.Substring(hash + 1), out var n) ? n : 0;
        }

        /// <summary>
        /// Fallback for a key the walk did not produce: resolve the persist reference directly, then
        /// find that annotation among the walked sites by owner and name so it is placed the same way.
        /// </summary>
        private static AnnotationSite? ResolveByPersistRef(ModelDoc2 doc, List<AnnotationSite> sites, List<InspectionBalloonRequest> items)
        {
            var persistRef = items.Select(b => b.PersistRef).FirstOrDefault(p => !string.IsNullOrWhiteSpace(p));
            if (persistRef == null) return null;
            try
            {
                var bytes = Convert.FromBase64String(persistRef);
                int error = 0;
                var obj = doc.Extension.GetObjectByPersistReference3(bytes, out error);
                Annotation? ann = obj switch
                {
                    DisplayDimension dd => dd.GetAnnotation() as Annotation,
                    Gtol g => g.GetAnnotation() as Annotation,
                    SFSymbol sf => sf.GetAnnotation() as Annotation,
                    _ => null,
                };
                if (ann == null) return null;

                var name = ann.GetName();
                string? ownerName = null;
                try
                {
                    ownerName = ann.Owner switch
                    {
                        View v => v.GetName2(),
                        Sheet s => s.GetName(),
                        _ => null,
                    };
                }
                catch { }

                return sites.FirstOrDefault(s =>
                    IsCharacteristicType(s.Type)
                    && string.Equals(s.RawName, name, StringComparison.Ordinal)
                    && (ownerName == null || string.Equals(s.ViewName ?? s.Sheet.Name, ownerName, StringComparison.Ordinal)));
            }
            catch
            {
                return null;
            }
        }

        /// <summary>The point balloons move away from: the owning view's outline centre, else the sheet centre.</summary>
        private static (double X, double Y) OutwardCentre(AnnotationSite site)
        {
            if (site.View != null)
            {
                try
                {
                    if (site.View.GetOutline() is Array o && o.Length >= 4)
                        return ((Convert.ToDouble(o.GetValue(0)) + Convert.ToDouble(o.GetValue(2))) / 2,
                                (Convert.ToDouble(o.GetValue(1)) + Convert.ToDouble(o.GetValue(3))) / 2);
                }
                catch { }
            }
            return (site.Sheet.WidthM / 2, site.Sheet.HeightM / 2);
        }

        private static bool InsertBalloon(ModelDoc2 doc, DrawingDoc drw, AnnotationSite site, string label, double x, double y)
        {
            // A13: activate the owning view so the note belongs to it and moves with it.
            try
            {
                if (site.View != null && site.ViewName != null) drw.ActivateView(site.ViewName);
                else drw.EditSheet();
            }
            catch { }

            doc.ClearSelection2(true); // a selection would give the note a leader to it
            if (!(doc.InsertNote(label) is Note note)) return false;

            try { note.SetBalloon((int)swBalloonStyle_e.swBS_Circular, InspectionNative.BalloonFit(label)); } catch { }

            if (!(note.GetAnnotation() is Annotation ann)) return false;
            try { ann.Layer = InspectionNative.BalloonLayer; } catch { }
            try { if (!ann.SetPosition2(x, y, 0)) ann.SetPosition(x, y, 0); } catch { }

            string? layer = null;
            try { layer = ann.Layer; } catch { }
            if (!string.Equals(layer, InspectionNative.BalloonLayer, StringComparison.OrdinalIgnoreCase))
            {
                // Never leave a balloon on another layer: the next run would not find it to replace.
                doc.ClearSelection2(true);
                try { if (ann.Select3(false, null)) doc.Extension.DeleteSelection2(0); } catch { }
                doc.ClearSelection2(true);
                return false;
            }
            return true;
        }

        #endregion
    }
}
