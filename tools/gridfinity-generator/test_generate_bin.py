"""Unit tests for generate_bin.py — format_value, build_command, auto_filename."""
import pytest
from generate_bin import auto_filename, build_command, format_value, PARAM_REGISTRY


# ---------------------------------------------------------------------------
# format_value
# ---------------------------------------------------------------------------

class TestFormatValueArray:
    def test_simple(self):
        assert format_value([2, 0], "array") == "[2,0]"

    def test_four_element(self):
        assert format_value([1, 1, 1, 1], "array") == "[1,1,1,1]"

    def test_float_elements(self):
        assert format_value([0, 14, 0, 0.6], "array") == "[0,14,0,0.6]"

    def test_negative_elements(self):
        assert format_value([-2, -0.5], "array") == "[-2,-0.5]"


class TestFormatValueString:
    def test_word(self):
        assert format_value("normal", "string") == '"normal"'

    def test_multi_word_value(self):
        assert format_value("hexgrid", "string") == '"hexgrid"'

    def test_disabled(self):
        assert format_value("disabled", "string") == '"disabled"'


class TestFormatValueBool:
    def test_true(self):
        assert format_value(True, "bool") == "true"

    def test_false(self):
        assert format_value(False, "bool") == "false"

    def test_string_true(self):
        assert format_value("true", "bool") == "true"

    def test_string_false(self):
        assert format_value("false", "bool") == "false"

    def test_string_yes(self):
        assert format_value("yes", "bool") == "true"

    def test_string_1(self):
        assert format_value("1", "bool") == "true"

    def test_string_0(self):
        assert format_value("0", "bool") == "false"


class TestFormatValueNumber:
    def test_integer(self):
        assert format_value(3, "number") == "3"

    def test_float(self):
        assert format_value(0.7, "number") == "0.7"

    def test_negative(self):
        assert format_value(-1, "number") == "-1"

    def test_zero(self):
        assert format_value(0, "number") == "0"


# ---------------------------------------------------------------------------
# build_command
# ---------------------------------------------------------------------------

class TestBuildCommandStructure:
    def test_includes_openscad_path(self):
        cmd = build_command({}, "out.stl")
        assert cmd[0].endswith("openscad.exe") or "openscad" in cmd[0].lower() or "AppRun" in cmd[0]

    def test_includes_scad_file(self):
        cmd = build_command({}, "out.stl")
        assert any("gridfinity_basic_cup.scad" in part for part in cmd)

    def test_includes_output_path(self):
        cmd = build_command({}, "/tmp/output.stl")
        assert "/tmp/output.stl" in cmd

    def test_includes_backend_flag(self):
        cmd = build_command({}, "out.stl")
        assert "--backend" in cmd

    def test_includes_export_format(self):
        cmd = build_command({}, "out.stl")
        assert "--export-format" in cmd
        assert "binstl" in cmd


class TestBuildCommandDefaults:
    def test_default_params_not_emitted(self):
        params = {"width": [2, 0], "depth": [1, 0], "height": [3, 0]}
        cmd = build_command(params, "out.stl")
        assert "-D" not in cmd

    def test_all_defaults_produces_no_d_flags(self):
        defaults = {k: v["default"] for k, v in PARAM_REGISTRY.items()}
        cmd = build_command(defaults, "out.stl")
        assert "-D" not in cmd


class TestBuildCommandOverrides:
    def test_array_override(self):
        cmd = build_command({"width": [3, 0]}, "out.stl")
        assert "-D" in cmd
        d_idx = cmd.index("-D")
        assert cmd[d_idx + 1] == "width=[3,0]"

    def test_bool_true_override(self):
        cmd = build_command({"filled_in": True}, "out.stl")
        assert "filled_in=true" in cmd

    def test_string_override(self):
        cmd = build_command({"lip_style": "none"}, "out.stl")
        assert 'lip_style="none"' in cmd

    def test_number_override(self):
        cmd = build_command({"floor_thickness": 1.2}, "out.stl")
        assert "floor_thickness=1.2" in cmd

    def test_wallcutout_vertical_enabled(self):
        """Test wall cutout vertical enabled produces correct -D flag"""
        cmd = build_command({"wallcutout_vertical": "enabled"}, "out.stl")
        assert 'wallcutout_vertical="enabled"' in cmd

    def test_wallcutout_horizontal_frontonly(self):
        """Test wall cutout horizontal leftonly produces correct -D flag"""
        cmd = build_command({"wallcutout_horizontal": "leftonly"}, "out.stl")
        assert 'wallcutout_horizontal="leftonly"' in cmd

    def test_wallcutout_disabled_not_in_command(self):
        """Test that disabled (default) wall cutout params are not emitted"""
        cmd = build_command({"wallcutout_vertical": "disabled", "wallcutout_horizontal": "disabled"}, "out.stl")
        assert "wallcutout_vertical" not in " ".join(cmd)
        assert "wallcutout_horizontal" not in " ".join(cmd)

    def test_wallpattern_enabled(self):
        cmd = build_command({"wallpattern_enabled": True, "wallpattern_style": "hexgrid"}, "out.stl")
        assert "wallpattern_enabled=true" in cmd
        assert 'wallpattern_style="hexgrid"' in cmd

    def test_half_pitch_true(self):
        cmd = build_command({"half_pitch": True}, "out.stl")
        assert "half_pitch=true" in cmd

    def test_half_pitch_false_is_default_skipped(self):
        cmd = build_command({"half_pitch": False}, "out.stl")
        assert "half_pitch" not in " ".join(cmd)

    def test_unknown_param_skipped(self):
        cmd = build_command({"nonexistent_param": 42}, "out.stl")
        assert "-D" not in cmd

    def test_multiple_overrides_all_present(self):
        params = {"width": [4, 0], "filled_in": True, "lip_style": "reduced"}
        cmd = build_command(params, "out.stl")
        joined = " ".join(cmd)
        assert "width=[4,0]" in joined
        assert "filled_in=true" in joined
        assert 'lip_style="reduced"' in joined


# ---------------------------------------------------------------------------
# auto_filename
# ---------------------------------------------------------------------------

class TestAutoFilename:
    def test_basic(self):
        assert auto_filename({"width": [2, 0], "depth": [3, 0], "height": [6, 0]}) == "bin_2x3x6.stl"

    def test_defaults(self):
        assert auto_filename({}) == "bin_2x1x3.stl"

    def test_float_dimension(self):
        result = auto_filename({"width": [1.5, 0], "depth": [1, 0], "height": [3, 0]})
        assert result == "bin_1.5x1x3.stl"

    def test_scalar_dimension(self):
        result = auto_filename({"width": 2, "depth": 1, "height": 4})
        assert result == "bin_2x1x4.stl"


# ---------------------------------------------------------------------------
# build_command with optional scad_file parameter
# ---------------------------------------------------------------------------

class TestBuildCommandModel:
    def test_uses_default_scad_file_when_no_model_arg(self):
        from generate_bin import SCAD_FILE
        params = {}
        cmd = build_command(params, "out.stl")
        assert cmd[1] == SCAD_FILE

    def test_uses_custom_model_when_provided(self):
        params = {}
        cmd = build_command(params, "out.stl", scad_file="/custom/path/model.scad")
        assert cmd[1] == "/custom/path/model.scad"
