from __future__ import annotations

import csv
import hashlib
import tarfile
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
INPUT = ROOT / "_ai_workbench/temp/UI_Chinese_To_Translate_20260828"
ASSETS = ROOT / "linhhoasu/webgame/game/update/resource/assets"
OUTPUT = ROOT / "_ai_workbench/temp/translated_images_online_upload_20260829.tar.gz"


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest().upper()


def main() -> None:
    mapping_path = INPUT / "mapping.tsv"
    with mapping_path.open("r", encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream, delimiter="\t"))

    changed = []
    for row in rows:
        translated = INPUT / row["filename"]
        if not translated.is_file():
            raise FileNotFoundError(translated)
        translated_hash = digest(translated)
        if translated_hash == row["sha256"]:
            continue
        with Image.open(translated) as image:
            image.verify()
            width, height = image.size
        if (width, height) != (int(row["width"]), int(row["height"])):
            raise ValueError(f"Canvas mismatch: {translated.name}")
        changed.append(
            {
                "filename": row["filename"],
                "source_relative_path": row["source_relative_path"],
                "original_sha256": row["sha256"],
                "translated_sha256": translated_hash,
                "width": str(width),
                "height": str(height),
                "bytes": str(translated.stat().st_size),
            }
        )

    if OUTPUT.exists():
        OUTPUT.unlink()
    manifest_path = INPUT / "online_upload_manifest.tsv"
    with manifest_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=changed[0].keys() if changed else ["filename"], delimiter="\t")
        writer.writeheader()
        writer.writerows(changed)

    with tarfile.open(OUTPUT, "w:gz") as archive:
        archive.add(manifest_path, arcname="online_upload_manifest.tsv")
        for row in changed:
            source = INPUT / row["filename"]
            archive.add(source, arcname=(Path("assets") / Path(row["source_relative_path"])).as_posix())

    print(f"OUTPUT={OUTPUT}")
    print(f"CHANGED={len(changed)}")
    print(f"MANIFEST={manifest_path}")


if __name__ == "__main__":
    main()
