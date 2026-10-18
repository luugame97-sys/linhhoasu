from __future__ import annotations

import csv
import hashlib
import shutil
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "linhhoasu/webgame/game/update/resource/assets"
OUTPUT = ROOT / "_ai_workbench/temp/UI_Chinese_To_Translate_20260828"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def is_chinese_locale_png(path: Path) -> bool:
    relative_parts = path.relative_to(ASSETS).parts
    return path.suffix.lower() == ".png" and "lang_cn" in relative_parts


def main() -> None:
    sources = sorted(path for path in ASSETS.rglob("*.png") if is_chinese_locale_png(path))
    grouped: dict[str, list[Path]] = {}
    for source in sources:
        grouped.setdefault(source.name.casefold(), []).append(source)

    collisions = {name: paths for name, paths in grouped.items() if len(paths) > 1}
    if collisions:
        details = "\n".join(
            f"{name}: " + "; ".join(str(path.relative_to(ASSETS)) for path in paths)
            for name, paths in collisions.items()
        )
        raise RuntimeError(f"Duplicate output filenames detected:\n{details}")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    for old_file in OUTPUT.glob("*.png"):
        old_file.unlink()

    rows: list[dict[str, str | int]] = []
    for source in sources:
        destination = OUTPUT / source.name
        shutil.copy2(source, destination)
        with Image.open(destination) as image:
            width, height = image.size
        rows.append(
            {
                "filename": source.name,
                "width": width,
                "height": height,
                "bytes": source.stat().st_size,
                "sha256": sha256(destination),
                "source_relative_path": source.relative_to(ASSETS).as_posix(),
            }
        )

    mapping_path = OUTPUT / "mapping.tsv"
    with mapping_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=rows[0].keys(), delimiter="\t")
        writer.writeheader()
        writer.writerows(rows)

    atlases = sorted(
        (row for row in rows if int(row["width"]) >= 800 or int(row["height"]) >= 800),
        key=lambda row: int(row["bytes"]),
        reverse=True,
    )
    atlas_path = OUTPUT / "priority_large_atlases.tsv"
    with atlas_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=rows[0].keys(), delimiter="\t")
        writer.writeheader()
        writer.writerows(atlases)

    readme = OUTPUT / "README_VI.txt"
    readme.write_text(
        "GÓI ẢNH TIẾNG TRUNG CẦN SOÁT/DỊCH\n"
        "=================================\n\n"
        f"Tổng số PNG từ các nhánh lang_cn: {len(rows)}\n"
        f"Số atlas lớn nên ưu tiên kiểm tra: {len(atlases)}\n\n"
        "- Các PNG được đặt phẳng trong thư mục này và giữ nguyên tên file.\n"
        "- mapping.tsv lưu đường dẫn gốc, kích thước và SHA-256 để đóng gói lại an toàn.\n"
        "- priority_large_atlases.tsv liệt kê atlas lớn; một atlas có thể chứa rất nhiều nút chữ.\n"
        "- Không đổi tên, không đổi kích thước canvas và phải giữ alpha khi chỉnh sửa.\n"
        "- ui_mainLang_a72efeec.png là nguồn của các chữ còn sót trong ảnh chụp mẫu.\n",
        encoding="utf-8-sig",
    )

    print(f"OUTPUT={OUTPUT}")
    print(f"PNG_COUNT={len(rows)}")
    print(f"LARGE_ATLAS_COUNT={len(atlases)}")
    print(f"MAPPING={mapping_path}")


if __name__ == "__main__":
    main()
