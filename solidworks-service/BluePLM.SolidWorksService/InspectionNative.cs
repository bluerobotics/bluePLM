using System;
using System.Collections.Generic;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Newtonsoft.Json;

namespace BluePLM.SolidWorksService
{
    /// <summary>
    /// Pure helpers behind extractDrawingCharacteristics and applyInspectionBalloons: key building,
    /// unit conversion, tolerance and limit formatting, GD&amp;T symbol text and balloon placement
    /// maths. Nothing here touches COM, so the tests run without SOLIDWORKS.
    /// </summary>
    internal static class InspectionNative
    {
        /// <summary>The only layer applyInspectionBalloons writes to, and the layer extraction skips.</summary>
        public const string BalloonLayer = "BluePLM Inspection";

        /// <summary>Wire codes the two commands add. DM_FILE_READ_ONLY and FILE_OPEN_IN_SOLIDWORKS are reused.</summary>
        public const string DocHasUnsavedChangesCode = "DOC_HAS_UNSAVED_CHANGES";
        public const string NotADrawingCode = "NOT_A_DRAWING";
        /// <summary>A write failed after it changed the user's open document and the edits could not be discarded.</summary>
        public const string DocModifiedNotSavedCode = "DOC_MODIFIED_NOT_SAVED";

        /// <summary>Sub-key suffix of a hole callout read from its dimension because it exposed no callout variables.</summary>
        public const string DimensionFallbackSubKey = "d";

        /// <summary>Characters of the SHA-1 hex digest kept as the source key (80 bits).</summary>
        public const int SourceKeyLength = 20;

        // ------------------------------------------------------------------ keys

        /// <summary>
        /// The bytes of a persist reference as IModelDocExtension.GetPersistReference3 hands them
        /// over: a byte[] (SAFEARRAY of VT_UI1) or, through late binding, an array of boxed numbers.
        /// Null when the object has no persistent reference.
        /// </summary>
        public static byte[]? PersistBytes(object? raw)
        {
            switch (raw)
            {
                case null: return null;
                case byte[] bytes: return bytes.Length == 0 ? null : bytes;
                case Array array:
                {
                    if (array.Length == 0) return null;
                    var result = new byte[array.Length];
                    var i = 0;
                    foreach (var item in array)
                        result[i++] = Convert.ToByte(item, CultureInfo.InvariantCulture);
                    return result;
                }
                default: return null;
            }
        }

        /// <summary>Base key of an annotation: SHA-1 of its persist reference, lower-case hex, first 20 chars.</summary>
        public static string BaseKeyFromPersistRef(byte[] persistRef)
        {
            using var sha = SHA1.Create();
            var hash = sha.ComputeHash(persistRef);
            var sb = new StringBuilder(hash.Length * 2);
            foreach (var b in hash) sb.Append(b.ToString("x2", CultureInfo.InvariantCulture));
            return sb.ToString(0, SourceKeyLength);
        }

        /// <summary>Key of the n-th value of an annotation that can hold several (hole callout, chamfer, GTOL).</summary>
        public static string SubKey(string baseKey, int index) => baseKey + "#" + index.ToString(CultureInfo.InvariantCulture);

        /// <summary>The base key of a source key (the part before '#').</summary>
        public static string BaseKeyOf(string sourceKey)
        {
            var hash = sourceKey.IndexOf('#');
            return hash < 0 ? sourceKey : sourceKey.Substring(0, hash);
        }

        // ------------------------------------------------------------------ units

        /// <summary>
        /// A drawing's length unit (swLengthUnit_e, as swUnitsLinear returns it): the wire 'units'
        /// value, the per-value unit label ('mm', 'in' or null) and metres per unit. The factors are
        /// the unit definitions (1 in = 25.4 mm exactly), not fitted numbers. Feet-inches drawings
        /// are expressed in inches.
        /// </summary>
        public static (string WireUnits, string? Label, double MetresPerUnit) LengthUnit(int swLengthUnit) =>
            swLengthUnit switch
            {
                0 => ("mm", "mm", 0.001),          // swMM
                1 => ("other", null, 0.01),        // swCM
                2 => ("other", null, 1.0),         // swMETER
                3 => ("in", "in", 0.0254),         // swINCHES
                4 => ("other", null, 0.3048),      // swFEET
                5 => ("other", "in", 0.0254),      // swFEETINCHES, expressed in inches
                6 => ("other", null, 1e-10),       // swANGSTROM
                7 => ("other", null, 1e-9),        // swNANOMETER
                8 => ("other", null, 1e-6),        // swMICRON
                9 => ("other", null, 2.54e-5),     // swMIL
                10 => ("other", null, 2.54e-8),    // swUIN
                _ => ("other", null, 0.001),
            };

        public const string DegreeUnit = "°";

        public static double RadiansToDegrees(double radians) => radians * 180.0 / Math.PI;

        // ------------------------------------------------------------------ formatting

        /// <summary>Fixed-point text with the given decimals, invariant culture, never "-0".</summary>
        public static string FormatNumber(double value, int decimals)
        {
            decimals = Math.Max(0, Math.Min(8, decimals));
            var text = value.ToString("F" + decimals.ToString(CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);
            if (text.StartsWith("-", StringComparison.Ordinal) && IsZeroText(text.Substring(1))) text = text.Substring(1);
            return text;
        }

        /// <summary>A tolerance with its sign ("+0.10", "-0.05"); a zero tolerance has no sign ("0.00").</summary>
        public static string FormatSigned(double value, int decimals)
        {
            var magnitude = FormatNumber(Math.Abs(value), decimals);
            if (IsZeroText(magnitude)) return magnitude;
            return (value < 0 ? "-" : "+") + magnitude;
        }

        static bool IsZeroText(string text)
        {
            foreach (var ch in text)
                if (ch != '0' && ch != '.') return false;
            return true;
        }

        /// <summary>Wire name of a swTolType_e value.</summary>
        public static string ToleranceTypeName(int swTolType) => swTolType switch
        {
            0 => "None",
            1 => "Basic",
            2 => "Bilateral",
            3 => "Limit",
            4 => "Symmetric",
            5 => "Min",
            6 => "Max",
            7 => "Fit",              // swTolFIT (swTolMETRIC shares the value)
            8 => "FitWithTolerance",
            9 => "FitToleranceOnly",
            10 => "Block",
            11 => "General",
            _ => "Unknown",
        };

        /// <summary>Tolerance and limits of one value, as strings in the value's own unit.</summary>
        internal sealed class ToleranceText
        {
            public string? Type { get; set; }
            public string? Plus { get; set; }
            public string? Minus { get; set; }
            public string? Upper { get; set; }
            public string? Lower { get; set; }
        }

        /// <summary>
        /// Plus / minus tolerance and upper / lower limits from a swTolType_e and the two deviations
        /// SOLIDWORKS stores (IDimensionTolerance.GetMaxValue / GetMinValue, ICalloutVariable
        /// ToleranceMax / ToleranceMin), all already converted to the value's unit.
        ///
        /// <paramref name="maxDeviation"/> and <paramref name="minDeviation"/> are signed deviations
        /// from nominal (min is negative below nominal). Symmetric uses the magnitude of max (or of
        /// min when max is zero). Limit tolerances are the same deviations shown as limits. Min / Max
        /// make the shown value the lower / upper limit. Basic, None, a pure fit class, a tolerance
        /// block and the general tolerance carry no numeric deviation the API returns, so they get
        /// none here: the planner gets nulls rather than invented numbers.
        /// </summary>
        public static ToleranceText Tolerance(int swTolType, double nominal, double maxDeviation, double minDeviation,
            int valueDecimals, int tolDecimals)
        {
            var result = new ToleranceText { Type = ToleranceTypeName(swTolType) };
            switch (swTolType)
            {
                case 2: // Bilateral
                case 3: // Limit
                case 8: // Fit with tolerance
                case 9: // Fit, tolerance only
                    if ((swTolType == 8 || swTolType == 9) && maxDeviation == 0 && minDeviation == 0) break;
                    result.Plus = FormatSigned(maxDeviation, tolDecimals);
                    result.Minus = FormatSigned(minDeviation, tolDecimals);
                    result.Upper = FormatNumber(nominal + maxDeviation, Math.Max(valueDecimals, tolDecimals));
                    result.Lower = FormatNumber(nominal + minDeviation, Math.Max(valueDecimals, tolDecimals));
                    break;
                case 4: // Symmetric
                {
                    var t = Math.Abs(maxDeviation) > 0 ? Math.Abs(maxDeviation) : Math.Abs(minDeviation);
                    result.Plus = FormatSigned(t, tolDecimals);
                    result.Minus = FormatSigned(-t, tolDecimals);
                    result.Upper = FormatNumber(nominal + t, Math.Max(valueDecimals, tolDecimals));
                    result.Lower = FormatNumber(nominal - t, Math.Max(valueDecimals, tolDecimals));
                    break;
                }
                case 5: // Min: the value shown is the lower limit
                    result.Lower = FormatNumber(nominal, valueDecimals);
                    break;
                case 6: // Max: the value shown is the upper limit
                    result.Upper = FormatNumber(nominal, valueDecimals);
                    break;
            }
            return result;
        }

        /// <summary>The first number in a text ("Ø0.05 Ⓜ" → "0.05"), with ',' read as a decimal point.</summary>
        public static string? LeadingNumber(string? text)
        {
            if (string.IsNullOrWhiteSpace(text)) return null;
            var m = Regex.Match(text, "(\\d+(?:[.,]\\d+)?|[.,]\\d+)");
            if (!m.Success) return null;
            var s = m.Groups[1].Value.Replace(',', '.');
            return s.StartsWith(".", StringComparison.Ordinal) ? "0" + s : s;
        }

        // ------------------------------------------------------------------ GD&T text

        /// <summary>
        /// Geometric characteristic symbol and name for a GTOL frame, from either the
        /// swGtolGeomCharSymbol_e code (verified against swconst 32.1) or a symbol-library token such
        /// as "&lt;IGTOL-POSI&gt;" (token names unverified at runtime; matched by stem).
        /// </summary>
        public static (string Glyph, string Name)? GtolCharacteristic(object? symbol)
        {
            if (symbol == null) return null;
            if (symbol is string token) return GtolCharacteristicFromToken(token);
            int code;
            try { code = Convert.ToInt32(symbol, CultureInfo.InvariantCulture); }
            catch { return null; }
            return code switch
            {
                13 => ("⌯", "Symmetry"),
                14 => ("⏤", "Straightness"),
                15 => ("⏥", "Flatness"),
                16 => ("○", "Circularity"),
                17 => ("⌭", "Cylindricity"),
                18 => ("⌒", "Profile of a Line"),
                19 => ("⌓", "Profile of a Surface"),
                20 => ("∠", "Angularity"),
                21 => ("⟂", "Perpendicularity"),
                22 => ("∥", "Parallelism"),
                23 => ("⌖", "Position"),
                24 => ("◎", "Concentricity"),
                25 => ("↗", "Circular Runout"),
                26 => ("⌰", "Total Runout"),
                27 => ("↗", "Circular Runout"),
                28 => ("⌰", "Total Runout"),
                _ => null,
            };
        }

        static (string Glyph, string Name)? GtolCharacteristicFromToken(string token)
        {
            var t = token.Trim().Trim('<', '>').ToUpperInvariant();
            if (t.Length == 0 || t.Contains("NONE")) return null;
            if (t.Contains("TRUN") || t.Contains("TOTAL")) return GtolCharacteristic(26);
            if (t.Contains("CRUN") || t.Contains("RUNOUT")) return GtolCharacteristic(25);
            if (t.Contains("POSI")) return GtolCharacteristic(23);
            if (t.Contains("FLAT")) return GtolCharacteristic(15);
            if (t.Contains("STRA")) return GtolCharacteristic(14);
            if (t.Contains("CYL")) return GtolCharacteristic(17);
            if (t.Contains("SPRO") || t.Contains("SURFPROF") || t.Contains("SURF")) return GtolCharacteristic(19);
            if (t.Contains("LPRO") || t.Contains("LINEPROF") || t.Contains("PROF")) return GtolCharacteristic(18);
            if (t.Contains("CIRC") || t.Contains("ROUND")) return GtolCharacteristic(16);
            if (t.Contains("ANG")) return GtolCharacteristic(20);
            if (t.Contains("PERP")) return GtolCharacteristic(21);
            if (t.Contains("PARA")) return GtolCharacteristic(22);
            if (t.Contains("CONC") || t.Contains("COAX")) return GtolCharacteristic(24);
            if (t.Contains("SYMM")) return GtolCharacteristic(13);
            return null;
        }

        /// <summary>SOLIDWORKS symbol-library tokens that appear inside annotation text (unverified at runtime).</summary>
        static readonly Dictionary<string, string> SymbolTokens = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { "MOD-DIAM", "Ø" },
            { "MOD-SPHDIA", "SØ" },
            { "MOD-RAD", "R" },
            { "MOD-SPHRAD", "SR" },
            { "MOD-MMC", "Ⓜ" },
            { "MOD-LMC", "Ⓛ" },
            { "MOD-RFS", "Ⓢ" },
            { "MOD-PROJ", "Ⓟ" },
            { "MOD-PTZ", "Ⓟ" },
            { "MOD-FREE", "Ⓕ" },
            { "MOD-TANG", "Ⓣ" },
            { "MOD-STAT", "ⓈⓉ" },
            { "MOD-DEG", "°" },
            { "MOD-PM", "±" },
            { "MOD-PLMI", "±" },
            { "MOD-CL", "℄" },
            { "MOD-CBORE", "⌴" },
            { "MOD-CSINK", "⌵" },
            { "MOD-DEPTH", "↧" },
            { "MOD-SQUARE", "□" },
        };

        /// <summary>
        /// Replace "&lt;MOD-DIAM&gt;"-style tokens with Unicode. A GTOL characteristic token is replaced by
        /// its glyph; an unknown token keeps its name without the brackets so nothing is silently lost.
        /// </summary>
        public static string DecodeSymbolTokens(string? text)
        {
            if (string.IsNullOrEmpty(text)) return text ?? "";
            var decoded = Regex.Replace(text, "<([A-Za-z]+-[A-Za-z0-9]+)>", m =>
            {
                var name = m.Groups[1].Value;
                if (SymbolTokens.TryGetValue(name, out var glyph)) return glyph;
                if (name.StartsWith("IGTOL-", StringComparison.OrdinalIgnoreCase))
                {
                    var gcs = GtolCharacteristicFromToken(name);
                    if (gcs != null) return gcs.Value.Glyph;
                }
                return name;
            });
            return Regex.Replace(decoded, "\\s+", " ").Trim();
        }

        // ------------------------------------------------------------------ balloons

        /// <summary>
        /// swBalloonFit_e for a label: every balloon fits at least two characters so a set of
        /// balloons reads at one size, longer labels get the size that fits them (up to five).
        /// </summary>
        public static int BalloonFit(string label)
        {
            var len = Math.Max(2, (label ?? "").Length);
            return Math.Min(5, len); // swBF_2Chars = 2 ... swBF_5Chars = 5
        }

        /// <summary>
        /// Balloon diameter estimated from the note font height: two characters plus padding inside a
        /// circle. This is layout only (where the next balloon of a stack goes); SOLIDWORKS sizes the
        /// circle itself from the fit.
        /// </summary>
        public static double BalloonDiameter(double noteCharHeightM)
        {
            var h = noteCharHeightM > 0 ? noteCharHeightM : DefaultNoteCharHeightM;
            return 2.5 * h;
        }

        /// <summary>ISO 3098 / ISO 128 standard lettering height for notes, used when the drawing's note font cannot be read.</summary>
        public const double DefaultNoteCharHeightM = 0.0035;

        /// <summary>
        /// Centres for <paramref name="count"/> balloons of one annotation, stacked outward from it.
        /// "Outward" is the direction from the owning view's centre (or the sheet centre) to the
        /// annotation, so balloons move away from the geometry. The first centre sits 1.5 diameters
        /// from the annotation's position (half a balloon plus one diameter of clearance for the
        /// annotation text), each further balloon one diameter beyond the previous one. Centres are
        /// kept inside the sheet when its size is known.
        /// </summary>
        public static List<(double X, double Y)> BalloonPositions(
            double anchorX, double anchorY, double centreX, double centreY,
            int count, double diameter, double sheetWidthM, double sheetHeightM)
        {
            var result = new List<(double X, double Y)>();
            if (count <= 0) return result;

            var dx = anchorX - centreX;
            var dy = anchorY - centreY;
            var len = Math.Sqrt(dx * dx + dy * dy);
            if (len < 1e-9) { dx = 0; dy = 1; }
            else { dx /= len; dy /= len; }

            for (var i = 0; i < count; i++)
            {
                var distance = diameter * (1.5 + i);
                var x = anchorX + dx * distance;
                var y = anchorY + dy * distance;
                if (sheetWidthM > diameter && sheetHeightM > diameter)
                {
                    var r = diameter / 2;
                    x = Math.Max(r, Math.Min(sheetWidthM - r, x));
                    y = Math.Max(r, Math.Min(sheetHeightM - r, y));
                }
                result.Add((x, y));
            }
            return result;
        }

        /// <summary>A BluePLM balloon found on the drawing before it is replaced.</summary>
        internal sealed class OldBalloon
        {
            public string? Label;
            public string Sheet = "";
            /// <summary>Owning view name, or null for a balloon on the sheet itself.</summary>
            public string? View;
            public double X;
            public double Y;
        }

        /// <summary>One balloon about to be placed: its label and the sheet / view of its annotation.</summary>
        internal readonly struct BalloonTarget
        {
            public BalloonTarget(string label, string sheet, string? view) { Label = label; Sheet = sheet; View = view; }
            public string Label { get; }
            public string Sheet { get; }
            public string? View { get; }
        }

        /// <summary>
        /// For each target, the index of the old balloon whose position it reuses, or null to place it
        /// at the computed position. Balloon numbers are stable, so an old balloon matches a target by
        /// label (trimmed, exact). The first pass takes old balloons in the target annotation's own
        /// view; the second takes any remaining one with that label on the same sheet, first in
        /// drawing order. Each old balloon is used at most once. Positions are sheet coordinates, so
        /// a balloon on another sheet is never reused.
        /// </summary>
        public static List<int?> MatchOldBalloons(IReadOnlyList<OldBalloon> old, IReadOnlyList<BalloonTarget> targets)
        {
            var result = new List<int?>(new int?[targets.Count]);
            var used = new bool[old.Count];

            bool SameLabel(OldBalloon o, BalloonTarget t) =>
                o.Label != null && string.Equals(o.Label.Trim(), (t.Label ?? "").Trim(), StringComparison.Ordinal)
                && (t.Label ?? "").Trim().Length > 0;
            bool SameSheet(OldBalloon o, BalloonTarget t) => string.Equals(o.Sheet, t.Sheet, StringComparison.OrdinalIgnoreCase);
            bool SameView(OldBalloon o, BalloonTarget t) => SameSheet(o, t) && string.Equals(o.View, t.View, StringComparison.Ordinal);

            foreach (var pass in new Func<OldBalloon, BalloonTarget, bool>[] { SameView, SameSheet })
            {
                for (var t = 0; t < targets.Count; t++)
                {
                    if (result[t] != null) continue;
                    for (var o = 0; o < old.Count; o++)
                    {
                        if (used[o] || !SameLabel(old[o], targets[t]) || !pass(old[o], targets[t])) continue;
                        used[o] = true;
                        result[t] = o;
                        break;
                    }
                }
            }
            return result;
        }
    }

    // ---------------------------------------------------------------------- wire shapes

    /// <summary>data of extractDrawingCharacteristics. Field names are pinned by wire-manifest.json.</summary>
    internal sealed class ExtractedDrawingCharacteristicsData
    {
        [JsonProperty("units")] public string Units { get; set; } = "other";
        [JsonProperty("sheets")] public List<ExtractedDrawingSheet> Sheets { get; set; } = new List<ExtractedDrawingSheet>();
        [JsonProperty("characteristics")] public List<ExtractedCharacteristic> Characteristics { get; set; } = new List<ExtractedCharacteristic>();
        [JsonProperty("skipped")] public List<ExtractionSkip> Skipped { get; set; } = new List<ExtractionSkip>();
        /// <summary>Sheets whose walk hit an error, so a characteristic missing from them may still be in the drawing.</summary>
        [JsonProperty("incompleteSheets")] public List<string> IncompleteSheets { get; set; } = new List<string>();
    }

    internal sealed class ExtractedDrawingSheet
    {
        [JsonProperty("name")] public string Name { get; set; } = "";
        [JsonProperty("widthM")] public double WidthM { get; set; }
        [JsonProperty("heightM")] public double HeightM { get; set; }
    }

    internal sealed class ExtractionSkip
    {
        [JsonProperty("sourceKey")] public string SourceKey { get; set; } = "";
        /// <summary>The persist-reference hash whenever one was computed, so the app can keep that annotation's rows.</summary>
        [JsonProperty("baseKey")] public string? BaseKey { get; set; }
        [JsonProperty("sheet")] public string Sheet { get; set; } = "";
        [JsonProperty("reason")] public string Reason { get; set; } = "";
    }

    internal sealed class ExtractedCharacteristic
    {
        [JsonProperty("sourceKey")] public string SourceKey { get; set; } = "";
        [JsonProperty("baseKey")] public string BaseKey { get; set; } = "";
        [JsonProperty("persistRef")] public string PersistRef { get; set; } = "";
        [JsonProperty("annotationName")] public string AnnotationName { get; set; } = "";
        [JsonProperty("sheet")] public string Sheet { get; set; } = "";
        [JsonProperty("view")] public string? View { get; set; }
        [JsonProperty("kind")] public string Kind { get; set; } = "dimension";
        [JsonProperty("subType")] public string? SubType { get; set; }
        [JsonProperty("nominal")] public string Nominal { get; set; } = "";
        [JsonProperty("unit")] public string? Unit { get; set; }
        [JsonProperty("plusTolerance")] public string? PlusTolerance { get; set; }
        [JsonProperty("minusTolerance")] public string? MinusTolerance { get; set; }
        [JsonProperty("upperLimit")] public string? UpperLimit { get; set; }
        [JsonProperty("lowerLimit")] public string? LowerLimit { get; set; }
        [JsonProperty("toleranceType")] public string? ToleranceType { get; set; }
        [JsonProperty("isReference")] public bool IsReference { get; set; }
        [JsonProperty("zone")] public string? Zone { get; set; }
        [JsonProperty("x")] public double X { get; set; }
        [JsonProperty("y")] public double Y { get; set; }
    }

    /// <summary>One item of applyInspectionBalloons' 'balloons'.</summary>
    internal sealed class InspectionBalloonRequest
    {
        [JsonProperty("sourceKey")] public string SourceKey { get; set; } = "";
        [JsonProperty("label")] public string Label { get; set; } = "";
        [JsonProperty("persistRef")] public string? PersistRef { get; set; }
    }

    /// <summary>data of applyInspectionBalloons. Field names are pinned by wire-manifest.json.</summary>
    internal sealed class AppliedInspectionBalloonsData
    {
        [JsonProperty("placed")] public int Placed { get; set; }
        [JsonProperty("missing")] public List<string> Missing { get; set; } = new List<string>();
        [JsonProperty("removedPrevious")] public int RemovedPrevious { get; set; }
        [JsonProperty("saved")] public bool Saved { get; set; }
        /// <summary>Balloons placed at the position of the old balloon with the same label (hand-moved ones stay put).</summary>
        [JsonProperty("keptPositions")] public int KeptPositions { get; set; }
    }
}
