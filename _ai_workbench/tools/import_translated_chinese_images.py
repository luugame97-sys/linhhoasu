from __future__ import annotations

import csv
import hashlib
import shutil
from datetime import datetime
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
CLIENT = ROOT / "linhhoasu"
ASSETS = CLIENT / "webgame/game/update/resource/assets"
INPUT = ROOT / "_ai_workbench/temp/UI_Chinese_To_Translate_20260828"
MAPPING = INPUT / "mapping.tsv"


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest().upper()


def main() -> None:
    if not MAPPING.is_file():
        raise FileNotFoundError(MAPPING)

    with MAPPING.open("r", encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream, delimiter="\t"))

    changed: list[dict[str, str]] = []
    for row in rows:
        translated = INPUT / row["filename"]
        source = ASSETS / Path(row["source_relative_path"])
        if not translated.is_file():
            raise FileNotFoundError(translated)
        if not source.is_file():
            raise FileNotFoundError(source)
        with Image.open(translated) as image:
            if image.size != (int(row["width"]), int(row["height"])):
                raise ValueError(f"Invalid dimensions: {translated.name}: {image.size}")
            image.verify()
        translated_hash = digest(translated)
        if translated_hash == row["sha256"]:
            continue
        source_hash = digest(source)
        if source_hash != row["sha256"]:
            raise RuntimeError(
                f"Source conflict for {source}: expected export hash {row['sha256']}, got {source_hash}"
            )
        changed.append(
            {
                "filename": row["filename"],
                "source_relative_path": row["source_relative_path"],
                "old_sha256": source_hash,
                "new_sha256": translated_hash,
                "width": row["width"],
                "height": row["height"],
                "bytes": str(translated.stat().st_size),
            }
        )

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_root = ROOT / "_ai_workbench/backups" / f"translated_images_{stamp}"
    backup_root.mkdir(parents=True, exist_ok=False)
    for item in changed:
        source = ASSETS / Path(item["source_relative_path"])
        backup = backup_root / Path(item["source_relative_path"])
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, backup)

    manifest = backup_root / "import_manifest.tsv"
    with manifest.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=changed[0].keys() if changed else ["filename"], delimiter="\t")
        writer.writeheader()
        writer.writerows(changed)

    for item in changed:
        translated = INPUT / item["filename"]
        source = ASSETS / Path(item["source_relative_path"])
        shutil.copy2(translated, source)
        actual = digest(source)
        if actual != item["new_sha256"]:
            raise RuntimeError(f"Post-copy hash mismatch: {source}")

    print(f"INPUT={INPUT}")
    print(f"MAPPING_ROWS={len(rows)}")
    print(f"IMPORTED={len(changed)}")
    print(f"UNCHANGED={len(rows) - len(changed)}")
    print(f"BACKUP={backup_root}")
    print(f"MANIFEST={manifest}")


if __name__ == "__main__":
    main()
