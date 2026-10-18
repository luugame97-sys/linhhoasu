"""Deploy only the aligned special-compose button layout with CAS read-back."""

from pathlib import Path

import deploy_gem_special_batch_20261002 as base


base.EXPECTED_BEFORE = {
    base.REMOTE_INDEX: "08d76e81494315f100c1c131dbb3693fe3c0dfb9dfe7662de985136b7551f8a2",
    base.REMOTE_QUICK: "8919bbf09270b64d0d4fc929214c4cec3ed96ac188479758bd622424cde9a92b",
}
base.TOKEN = "20261002_gem_quick100_v4"
base.OUT = Path(__file__).resolve().parents[2] / "_ai_workbench" / "temp" / "gem10_release_20261002_ui"


if __name__ == "__main__":
    base.main()
