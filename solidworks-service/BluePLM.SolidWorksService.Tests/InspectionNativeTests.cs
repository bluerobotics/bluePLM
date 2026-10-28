using System;
using System.Linq;
using Xunit;

namespace BluePLM.SolidWorksService.Tests
{
    /// <summary>
    /// The pure half of extractDrawingCharacteristics / applyInspectionBalloons: keys, units,
    /// tolerance text, GD&amp;T symbols and balloon placement. No SolidWorks, no COM.
    /// </summary>
    [Trait("Category", "Headless")]
    public class InspectionNativeTests
    {
        // ---------------------------------------------------------------- keys

        [Fact]
        public void Base_key_is_the_first_20_hex_chars_of_the_sha1_of_the_persist_reference()
        {
            // SHA-1("abc") = a9993e364706816aba3e25717850c26c9cd0d89d
            var key = InspectionNative.BaseKeyFromPersistRef(new byte[] { 0x61, 0x62, 0x63 });
            Assert.Equal("a9993e364706816aba3e", key);
        }

        [Fact]
        public void The_same_persist_bytes_give_the_same_key_whatever_array_type_carries_them()
        {
            var bytes = new byte[] { 1, 2, 3, 250 };
            var boxed = new object[] { (byte)1, 2, 3.0, 250 };
            Assert.Equal(
                InspectionNative.BaseKeyFromPersistRef(InspectionNative.PersistBytes(bytes)!),
                InspectionNative.BaseKeyFromPersistRef(InspectionNative.PersistBytes(boxed)!));
        }

        [Fact]
        public void No_persist_reference_gives_no_bytes()
        {
            Assert.Null(InspectionNative.PersistBytes(null));
            Assert.Null(InspectionNative.PersistBytes(new byte[0]));
            Assert.Null(InspectionNative.PersistBytes("not an array"));
        }

        [Fact]
        public void Sub_keys_round_trip_to_their_base_key()
        {
            Assert.Equal("abc#2", InspectionNative.SubKey("abc", 2));
            Assert.Equal("abc", InspectionNative.BaseKeyOf("abc#2"));
            Assert.Equal("abc", InspectionNative.BaseKeyOf("abc"));
        }

        [Fact]
        public void The_dimension_fallback_sub_key_never_collides_with_variable_zero()
        {
            var fallback = "abc#" + InspectionNative.DimensionFallbackSubKey;
            Assert.NotEqual(InspectionNative.SubKey("abc", 0), fallback);
            Assert.Equal("abc", InspectionNative.BaseKeyOf(fallback));
        }

        [Fact]
        public void A_skip_keeps_its_base_key_as_null_on_the_wire_when_none_was_computed()
        {
            var json = Newtonsoft.Json.JsonConvert.SerializeObject(new ExtractionSkip { SourceKey = "View1/RD1", Sheet = "Sheet1", Reason = "no persistent reference" });
            Assert.Contains("\"baseKey\":null", json);
            Assert.Contains("\"sheet\":\"Sheet1\"", json);
        }

        // ---------------------------------------------------------------- units and numbers

        [Theory]
        [InlineData(0, "mm", "mm", 0.001)]
        [InlineData(3, "in", "in", 0.0254)]
        [InlineData(1, "other", null, 0.01)]
        [InlineData(5, "other", "in", 0.0254)]
        public void Length_units_map_to_wire_units_labels_and_exact_factors(int swUnit, string wire, string? label, double factor)
        {
            var (w, l, f) = InspectionNative.LengthUnit(swUnit);
            Assert.Equal(wire, w);
            Assert.Equal(label, l);
            Assert.Equal(factor, f, 12);
        }

        [Fact]
        public void Numbers_format_with_their_precision_in_invariant_culture_and_never_as_minus_zero()
        {
            Assert.Equal("25.40", InspectionNative.FormatNumber(25.4, 2));
            Assert.Equal("0.000", InspectionNative.FormatNumber(-0.0000001, 3));
            Assert.Equal("3", InspectionNative.FormatNumber(2.6, 0));
        }

        [Fact]
        public void Tolerances_are_signed_and_a_zero_tolerance_is_unsigned()
        {
            Assert.Equal("+0.10", InspectionNative.FormatSigned(0.1, 2));
            Assert.Equal("-0.05", InspectionNative.FormatSigned(-0.05, 2));
            Assert.Equal("0.00", InspectionNative.FormatSigned(0, 2));
            Assert.Equal("0.00", InspectionNative.FormatSigned(-0.0001, 2));
        }

        [Fact]
        public void Bilateral_tolerance_gives_signed_deviations_and_limits()
        {
            var t = InspectionNative.Tolerance(2, 10.0, 0.1, -0.05, 2, 2);
            Assert.Equal("Bilateral", t.Type);
            Assert.Equal("+0.10", t.Plus);
            Assert.Equal("-0.05", t.Minus);
            Assert.Equal("10.10", t.Upper);
            Assert.Equal("9.95", t.Lower);
        }

        [Fact]
        public void Symmetric_tolerance_uses_one_magnitude_both_ways()
        {
            var t = InspectionNative.Tolerance(4, 5.0, 0.02, 0, 2, 3);
            Assert.Equal("Symmetric", t.Type);
            Assert.Equal("+0.020", t.Plus);
            Assert.Equal("-0.020", t.Minus);
            Assert.Equal("5.020", t.Upper);
            Assert.Equal("4.980", t.Lower);
        }

        [Fact]
        public void Min_and_max_tolerances_make_the_value_a_limit()
        {
            var min = InspectionNative.Tolerance(5, 3.2, 0, 0, 1, 1);
            Assert.Equal("Min", min.Type);
            Assert.Equal("3.2", min.Lower);
            Assert.Null(min.Upper);

            var max = InspectionNative.Tolerance(6, 3.2, 0, 0, 1, 1);
            Assert.Equal("3.2", max.Upper);
            Assert.Null(max.Lower);
        }

        [Theory]
        [InlineData(0, "None")]
        [InlineData(1, "Basic")]
        [InlineData(7, "Fit")]
        [InlineData(11, "General")]
        public void Tolerances_without_numeric_deviations_invent_none(int swTolType, string name)
        {
            var t = InspectionNative.Tolerance(swTolType, 10, 0.1, -0.1, 2, 2);
            Assert.Equal(name, t.Type);
            Assert.Null(t.Plus);
            Assert.Null(t.Minus);
            Assert.Null(t.Upper);
            Assert.Null(t.Lower);
        }

        [Theory]
        [InlineData("Ø0.05 Ⓜ", "0.05")]
        [InlineData("Ra 1,6", "1.6")]
        [InlineData(".2", "0.2")]
        [InlineData("A B", null)]
        public void Leading_number_reads_the_first_numeric_value(string text, string? expected)
        {
            Assert.Equal(expected, InspectionNative.LeadingNumber(text));
        }

        // ---------------------------------------------------------------- GD&T

        [Theory]
        [InlineData(23, "⌖", "Position")]
        [InlineData(15, "⏥", "Flatness")]
        [InlineData(21, "⟂", "Perpendicularity")]
        [InlineData(26, "⌰", "Total Runout")]
        public void Gtol_codes_map_to_unicode_and_names(int code, string glyph, string name)
        {
            var gcs = InspectionNative.GtolCharacteristic(code);
            Assert.Equal((glyph, name), gcs);
        }

        [Theory]
        [InlineData("<IGTOL-POSI>", "Position")]
        [InlineData("<IGTOL-FLAT>", "Flatness")]
        [InlineData("<IGTOL-CIRC>", "Circularity")]
        [InlineData("<IGTOL-CRUNOUT>", "Circular Runout")]
        [InlineData("<IGTOL-SPROF>", "Profile of a Surface")]
        public void Gtol_tokens_map_by_stem(string token, string name)
        {
            Assert.Equal(name, InspectionNative.GtolCharacteristic(token)?.Name);
        }

        [Fact]
        public void No_symbol_is_no_characteristic()
        {
            Assert.Null(InspectionNative.GtolCharacteristic(12)); // swGcsNONE
            Assert.Null(InspectionNative.GtolCharacteristic(null));
            Assert.Null(InspectionNative.GtolCharacteristic("<IGTOL-NONE>"));
        }

        [Fact]
        public void Symbol_tokens_decode_to_unicode_and_unknown_tokens_stay_readable()
        {
            Assert.Equal("Ø0.1Ⓜ", InspectionNative.DecodeSymbolTokens("<MOD-DIAM>0.1<MOD-MMC>"));
            Assert.Equal("⌖ A", InspectionNative.DecodeSymbolTokens("<IGTOL-POSI>  A"));
            Assert.Equal("HOLE-THING 3", InspectionNative.DecodeSymbolTokens("<HOLE-THING> 3"));
        }

        // ---------------------------------------------------------------- balloons

        [Theory]
        [InlineData("1", 2)]
        [InlineData("12", 2)]
        [InlineData("123", 3)]
        [InlineData("1234567", 5)]
        public void Balloon_fit_is_at_least_two_characters_and_at_most_five(string label, int fit)
        {
            Assert.Equal(fit, InspectionNative.BalloonFit(label));
        }

        [Fact]
        public void Balloon_diameter_follows_the_font_and_falls_back_to_the_standard_note_height()
        {
            Assert.Equal(0.01, InspectionNative.BalloonDiameter(0.004), 12);
            Assert.Equal(2.5 * InspectionNative.DefaultNoteCharHeightM, InspectionNative.BalloonDiameter(0), 12);
        }

        [Fact]
        public void Balloons_stack_outward_from_the_view_centre_one_diameter_apart()
        {
            // Annotation right of the view centre: balloons go further right.
            var p = InspectionNative.BalloonPositions(0.2, 0.1, 0.1, 0.1, 3, 0.01, 0, 0);
            Assert.Equal(3, p.Count);
            Assert.Equal(0.215, p[0].X, 9);
            Assert.Equal(0.225, p[1].X, 9);
            Assert.Equal(0.235, p[2].X, 9);
            Assert.All(p, q => Assert.Equal(0.1, q.Y, 9));
        }

        [Fact]
        public void Balloons_go_up_when_the_annotation_sits_on_the_centre()
        {
            var p = InspectionNative.BalloonPositions(0.1, 0.1, 0.1, 0.1, 1, 0.01, 0, 0).Single();
            Assert.Equal(0.1, p.X, 9);
            Assert.Equal(0.115, p.Y, 9);
        }

        [Fact]
        public void Balloons_stay_on_the_sheet()
        {
            var p = InspectionNative.BalloonPositions(0.415, 0.29, 0.2, 0.15, 2, 0.01, 0.42, 0.297);
            Assert.All(p, q =>
            {
                Assert.InRange(q.X, 0.005, 0.415);
                Assert.InRange(q.Y, 0.005, 0.292);
            });
        }

        // ---------------------------------------------------------------- kept positions

        static InspectionNative.OldBalloon Old(string? label, string sheet, string? view, double x = 0, double y = 0) =>
            new InspectionNative.OldBalloon { Label = label, Sheet = sheet, View = view, X = x, Y = y };

        static InspectionNative.BalloonTarget Target(string label, string sheet, string? view) =>
            new InspectionNative.BalloonTarget(label, sheet, view);

        [Fact]
        public void A_request_reuses_the_old_balloon_with_its_label()
        {
            var old = new[] { Old("1", "Sheet1", "View1"), Old("2", "Sheet1", "View1") };
            var m = InspectionNative.MatchOldBalloons(old, new[] { Target("2", "Sheet1", "View1"), Target("1", "Sheet1", "View1") });
            Assert.Equal(new int?[] { 1, 0 }, m);
        }

        [Fact]
        public void Unmatched_requests_get_no_old_position()
        {
            var old = new[] { Old("1", "Sheet1", "View1"), Old(null, "Sheet1", "View1") };
            var m = InspectionNative.MatchOldBalloons(old, new[] { Target("7", "Sheet1", "View1"), Target("", "Sheet1", "View1") });
            Assert.Equal(new int?[] { null, null }, m);
        }

        [Fact]
        public void Duplicate_labels_prefer_the_target_view_then_the_first_on_the_sheet()
        {
            var old = new[] { Old("5", "Sheet1", "View1"), Old("5", "Sheet1", "View2"), Old("6", "Sheet1", "View3"), Old("6", "Sheet1", "View4") };
            var m = InspectionNative.MatchOldBalloons(old, new[] { Target("5", "Sheet1", "View2"), Target("6", "Sheet1", "View9") });
            Assert.Equal(new int?[] { 1, 2 }, m);
        }

        [Fact]
        public void A_same_view_match_is_not_stolen_by_an_earlier_fallback()
        {
            // Target 0 has no balloon in its view; target 1 does. The view pass runs first for all.
            var old = new[] { Old("3", "Sheet1", "View2") };
            var m = InspectionNative.MatchOldBalloons(old, new[] { Target("3", "Sheet1", "View1"), Target("3", "Sheet1", "View2") });
            Assert.Equal(new int?[] { null, 0 }, m);
        }

        [Fact]
        public void A_balloon_on_another_sheet_is_never_reused_and_labels_match_trimmed()
        {
            var old = new[] { Old("4", "Sheet2", "View1"), Old(" 8 ", "Sheet1", null) };
            var m = InspectionNative.MatchOldBalloons(old, new[] { Target("4", "Sheet1", "View1"), Target("8", "Sheet1", null) });
            Assert.Equal(new int?[] { null, 1 }, m);
        }
    }
}
