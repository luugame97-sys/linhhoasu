from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[2]
ATLAS = (
    ROOT
    / "linhhoasu/webgame/game/update/resource/assets/atlas_ui/1_lilian/main"
    / "mainLang/lang_cn/ui_mainLang_a72efeec.png"
)


def connected_components(mask: np.ndarray) -> list[tuple[int, int, int, int, int]]:
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    components: list[tuple[int, int, int, int, int]] = []

    for y in range(height):
        for x in range(width):
            if not mask[y, x] or visited[y, x]:
                continue

            queue = deque([(x, y)])
            visited[y, x] = True
            min_x = max_x = x
            min_y = max_y = y
            area = 0

            while queue:
                cx, cy = queue.popleft()
                area += 1
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)

                for nx, ny in (
                    (cx - 1, cy - 1), (cx, cy - 1), (cx + 1, cy - 1),
                    (cx - 1, cy),                     (cx + 1, cy),
                    (cx - 1, cy + 1), (cx, cy + 1), (cx + 1, cy + 1),
                ):
                    if (
                        0 <= nx < width
                        and 0 <= ny < height
                        and mask[ny, nx]
                        and not visited[ny, nx]
                    ):
                        visited[ny, nx] = True
                        queue.append((nx, ny))

            components.append((min_x, min_y, max_x + 1, max_y + 1, area))

    return components


def print_components(dilate: int, min_area: int) -> None:
    atlas = Image.open(ATLAS).convert("RGBA")
    alpha = atlas.getchannel("A")
    if dilate > 1:
        alpha = alpha.filter(ImageFilter.MaxFilter(dilate))
    mask = np.asarray(alpha) > 200
    components = connected_components(mask)
    selected = [item for item in components if item[4] >= min_area]
    selected.sort(key=lambda item: (item[1], item[0]))
    for index, item in enumerate(selected, 1):
        x1, y1, x2, y2, area = item
        print(f"{index:3d}: {x1:4d},{y1:4d} -> {x2:4d},{y2:4d}  {x2-x1:4d}x{y2-y1:4d}  area={area}")


def write_grid(out_path: Path, min_area: int) -> None:
    atlas = Image.open(ATLAS).convert("RGBA")
    alpha = np.asarray(atlas.getchannel("A")) > 200
    components = [item for item in connected_components(alpha) if item[4] >= min_area]
    draw = ImageDraw.Draw(atlas)
    try:
        font = ImageFont.truetype("arial.ttf", 12)
    except OSError:
        font = ImageFont.load_default()
    for index, (x1, y1, x2, y2, _area) in enumerate(sorted(components, key=lambda item: (item[1], item[0])), 1):
        draw.rectangle((x1, y1, x2 - 1, y2 - 1), outline=(255, 0, 0, 255), width=2)
        draw.text((x1 + 2, y1 + 2), f"{index}:{x1},{y1}", fill=(255, 0, 0, 255), font=font)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(out_path)
    print(out_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Locate UI labels inside ui_mainLang atlas")
    parser.add_argument("--components", action="store_true")
    parser.add_argument("--grid", type=Path)
    parser.add_argument("--dilate", type=int, default=7)
    parser.add_argument("--min-area", type=int, default=100)
    args = parser.parse_args()

    if args.components:
        print_components(args.dilate, args.min_area)
        return

    if args.grid:
        write_grid(args.grid, args.min_area)
        return

    parser.error("Use --components while reviewing atlas regions")


if __name__ == "__main__":
    main()
