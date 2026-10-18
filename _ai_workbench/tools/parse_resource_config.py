from __future__ import annotations

import json
import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FILES = {
    "local_main": ROOT / "linhhoasu/webgame/game/update/resource/default.res_main_c669f2c0.bin",
    "local_cn": ROOT / "linhhoasu/webgame/game/update/resource/default.res_cn_main_f70d4753.bin",
    "cn_main": ROOT / "_ai_workbench/temp/cn_origin_70000001_20260831/resource/default.res_main_e6b9a080.bin",
    "cn_cn": ROOT / "_ai_workbench/temp/cn_origin_70000001_20260831/resource/default.res_cn_main_5b670eb9.bin",
    "local_start": ROOT / "linhhoasu/webgame/game/update/resource/default.res_326514c1.bin",
    "cn_start": ROOT / "_ai_workbench/temp/cn_origin_70000001_20260831/resource/default.res_326514c1.bin",
}

TYPE_NAMES = {0: "image", 1: "json", 2: "text", 3: "xml", 4: "sheet", 5: "font", 6: "bin", 7: "sound", 8: "atlas", 9: "imageWithGrid", 10: "ktx"}


class Reader:
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0

    def u8(self) -> int:
        if self.pos >= len(self.data):
            raise ValueError("truncated u8")
        value = self.data[self.pos]
        self.pos += 1
        return value

    def u16(self) -> int:
        if self.pos + 2 > len(self.data):
            raise ValueError("truncated u16")
        value = struct.unpack_from(">H", self.data, self.pos)[0]
        self.pos += 2
        return value

    def auto(self) -> int:
        value = 0
        multiplier = 1
        while True:
            byte = self.u8()
            more = bool(byte & 0x80)
            value += (byte & 0x7F) * multiplier
            if not more:
                return value
            multiplier *= 128

    def raw(self, count: int) -> bytes:
        if self.pos + count > len(self.data):
            raise ValueError(f"truncated raw at {self.pos}, count={count}")
        value = self.data[self.pos : self.pos + count]
        self.pos += count
        return value

    def string(self, count: int) -> str:
        return self.raw(count).decode("utf-8", "replace")


def parse(path: Path) -> dict:
    raw = path.read_bytes()
    try:
        data = zlib.decompress(raw)
    except zlib.error:
        data = raw
    reader = Reader(data)
    prefix_count = reader.u16()
    prefixes = []
    for _ in range(prefix_count):
        prefixes.append(reader.string(reader.auto()))
    groups_by_type = []
    type_group_count = reader.auto()
    for _ in range(type_group_count):
        groups_by_type.append((reader.auto(), reader.auto()))
    resources = []
    for type_code, count in groups_by_type:
        is_sheet = type_code == 4
        is_ktx = type_code == 10
        is_grid = type_code == 9
        for _ in range(count):
            name = reader.string(reader.auto())
            prefix_index = reader.auto()
            url_length = reader.auto()
            url_pos = reader.pos
            reader.pos += url_length
            size = reader.auto()
            url = (prefixes[prefix_index] if prefix_index < len(prefixes) else "") + data[url_pos : url_pos + url_length].decode("utf-8", "replace")
            item = {"name": name, "type": TYPE_NAMES.get(type_code, str(type_code)), "type_code": type_code, "prefix": prefix_index, "url": url, "size": size}
            if is_sheet:
                aliases = reader.string(reader.auto())
                item["subkeys"] = aliases.split(",") if aliases else []
            if is_grid:
                item["scale9grid"] = reader.string(reader.auto())
            resources.append(item)
    group_count = reader.auto()
    groups = {}
    for _ in range(group_count):
        group_name = reader.string(reader.auto())
        member_count = reader.auto()
        groups[group_name] = [reader.auto() for _ in range(member_count)]
    return {"prefix_count": prefix_count, "prefixes": prefixes, "resource_count": len(resources), "resources": resources, "groups": groups, "bytes_total": len(data), "bytes_used": reader.pos}


def selected(item: dict) -> bool:
    value = (item.get("name", "") + " " + item.get("url", "")).lower()
    return any(token in value for token in ("eui", "guide", "loading", "mask", "spine/ui", "cloud", "power", "artifact", "spirit"))


def main() -> None:
    parsed = {}
    output: list[str] = []
    for name, path in FILES.items():
        if not path.is_file():
            output.append(f"### {name} MISSING {path}")
            continue
        try:
            result = parse(path)
            parsed[name] = result
            output.append(f"### {name} bytes={path.stat().st_size} decoded={result['bytes_total']} used={result['bytes_used']} prefixes={result['prefix_count']} resources={result['resource_count']} groups={len(result['groups'])}")
            for item in result["resources"]:
                if selected(item):
                    output.append(json.dumps(item, ensure_ascii=False, separators=(",", ":")))
        except Exception as exc:
            output.append(f"### {name} ERROR {type(exc).__name__}: {exc}")

    for left, right in (("local_main", "cn_main"), ("local_cn", "cn_cn"), ("local_start", "cn_start")):
        if left not in parsed or right not in parsed:
            continue
        a = {item["name"]: item for item in parsed[left]["resources"]}
        b = {item["name"]: item for item in parsed[right]["resources"]}
        output.append(f"### DIFF {left}_vs_{right} common={len(a.keys() & b.keys())} local_only={len(a.keys() - b.keys())} cn_only={len(b.keys() - a.keys())}")
        for key in sorted(a.keys() & b.keys()):
            if (a[key].get("url"), a[key].get("type"), a[key].get("size")) != (b[key].get("url"), b[key].get("type"), b[key].get("size")) and selected(a[key]):
                output.append("CHANGED\t" + json.dumps({"name": key, "local": a[key], "cn": b[key]}, ensure_ascii=False, separators=(",", ":")))
        for key in sorted(a.keys() - b.keys()):
            if selected(a[key]):
                output.append("LOCAL_ONLY\t" + json.dumps(a[key], ensure_ascii=False, separators=(",", ":")))
        for key in sorted(b.keys() - a.keys()):
            if selected(b[key]):
                output.append("CN_ONLY\t" + json.dumps(b[key], ensure_ascii=False, separators=(",", ":")))

    target = ROOT / "_ai_workbench/temp/resource_config_compare_20260831.txt"
    target.write_text("\n".join(output) + "\n", encoding="utf-8")
    print(target)


if __name__ == "__main__":
    main()
