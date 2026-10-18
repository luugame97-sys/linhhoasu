"""Reuse scoped grid48 CAS/backup/rolling gates for the merge selection fix."""
from pathlib import Path
import release_pet_grid48_20261005 as release

release.OUT = Path(__file__).resolve().parents[1] / 'temp/pet_auto_exhaust_20261005'
release.MANIFEST = release.OUT / 'deployment.json'

if __name__ == '__main__':
    release.main()
