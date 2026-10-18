"""Read-only postcheck for the aligned special-compose client release."""

from pathlib import Path

import verify_gem10_special_postdeploy_20261002 as base


base.TOKEN = "20261002_gem_quick100_v4"
base.OUT = Path(__file__).resolve().parents[2] / "_ai_workbench" / "temp" / "gem10_release_20261002_ui" / "special_ui_postcheck.json"


if __name__ == "__main__":
    base.main()
