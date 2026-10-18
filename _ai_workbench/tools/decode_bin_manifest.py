from __future__ import annotations

import json
import struct
import zlib
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
FILES = {
    "local_main": ROOT / "linhhoasu/webgame/game/update/resource/default.res_main_c669f2c0.bin",
    "local_cn": ROOT / "linhhoasu/webgame/game/update/resource/default.res_cn_main_f70d4753.bin",
    "cn_main": ROOT / "_ai_workbench/temp/cn_origin_70000001_20260831/resource/default.res_main_e6b9a080.bin",
    "cn_cn": ROOT / "_ai_workbench/temp/cn_origin_70000001_20260831/resource/default.res_cn_main_5b670eb9.bin",
    "local_start": ROOT / "linhhoasu/webgame/game/update/resource/default.res_326514c1.bin",
    "cn_start": ROOT / "_ai_workbench/temp/cn_origin_70000001_20260831/resource/default.res_326514c1.bin",
}


class Reader:
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0

    def need(self, count: int) -> None:
        if self.pos + count > len(self.data):
            raise ValueError(f"truncated at {self.pos}, need {count}, size {len(self.data)}")

    def u8(self) -> int:
        self.need(1)
        value = self.data[self.pos]
        self.pos += 1
        return value

    def u16(self) -> int:
        self.need(2)
        value = struct.unpack_from(">H", self.data, self.pos)[0]
        self.pos += 2
        return value

    def u32(self) -> int:
        self.need(4)
        value = struct.unpack_from(">I", self.data, self.pos)[0]
        self.pos += 4
        return value

    def bytes(self, count: int) -> bytes:
        self.need(count)
        value = self.data[self.pos : self.pos + count]
        self.pos += count
        return value

    def auto(self, signed: bool = False) -> int:
        value = 0
        multiplier = 1
        first = True
        negative = False
        while True:
            byte = self.u8()
            more = bool(byte & 0x80)
            byte &= 0x7F
            if signed and first:
                negative = bool(byte & 0x40)
                byte &= 0x3F
            value += byte * multiplier
            multiplier *= 128 if not (signed and first) else 64
            first = False
            if not more:
                break
        return -value if signed and negative else value

    def utf8(self, count: int) -> str:
        return self.bytes(count).decode("utf-8", "replace")


def decode(data: bytes) -> Any:
    try:
        data = zlib.decompress(data)
    except zlib.error:
        pass
    reader = Reader(data)
    version = reader.u16()
    if version != 2:
        raise ValueError(f"unsupported version {version}")
    pool_count = reader.auto(False)
    pool = []
    for _ in range(pool_count):
        pool.append(reader.utf8(reader.auto(False)))

    def field() -> Any:
        tag = reader.u8()
        if tag == 0:
            return None
        if tag == 1:
            return 0
        if tag == 2:
            return -reader.u8()
        if tag == 3:
            return -reader.u16()
        if tag == 4:
            return reader.u32()
        if tag == 5:
            low = reader.u32()
            high = reader.u32()
            return -(high * 4294967296 + low)
        if tag == 6:
            return reader.u8()
        if tag == 7:
            return reader.u16()
        if tag == 8:
            return reader.u32()
        if tag == 9:
            low = reader.u32()
            high = reader.u32()
            return high * 4294967296 + low
        if tag == 10:
            return float(pool[reader.auto(False)])
        if tag == 11:
            return ""
        if tag in (12, 13, 14):
            index = reader.u8() if tag == 12 else reader.u16() if tag == 13 else reader.auto(False) + 65536
            return pool[index]
        if tag == 15:
            return []
        if tag in (17, 18):
            signed = tag == 18
            return [reader.auto(signed) for _ in range(reader.auto(False))]
        if tag == 19:
            return [pool[reader.auto(False)] for _ in range(reader.auto(False))]
        if tag == 16:
            return [field() for _ in range(reader.auto(False))]
        if tag == 20:
            return {}
        if tag in (22, 23):
            signed = tag == 23
            result = {}
            for _ in range(reader.auto(False)):
                # Python evaluates the RHS before an indexed assignment. Read
                # the key first to preserve the wire order (key, then value).
                key = reader.auto(signed)
                result[key] = field()
            return result
        if tag == 21:
            result = {}
            for _ in range(reader.auto(False)):
                key = pool[reader.auto(False)]
                result[key] = field()
            return result
        if tag == 24:
            return True
        if tag == 25:
            return False
        raise ValueError(f"unknown field tag {tag} at {reader.pos - 1}")

    result = field()
    return {"version": version, "pool_count": pool_count, "value": result, "bytes_used": reader.pos, "bytes_total": len(data)}


def flatten(value: Any, prefix: str = "") -> list[tuple[str, Any]]:
    rows: list[tuple[str, Any]] = []
    if isinstance(value, dict):
        for key, child in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            rows.extend(flatten(child, path))
    elif isinstance(value, list):
        rows.append((prefix, value))
    else:
        rows.append((prefix, value))
    return rows


def main() -> None:
    output: list[str] = []
    decoded: dict[str, Any] = {}
    for name, path in FILES.items():
        if not path.is_file():
            output.append(f"### {name} MISSING {path}")
            continue
        try:
            item = decode(path.read_bytes())
            decoded[name] = item["value"]
            output.append(f"### {name} bytes={path.stat().st_size} decoded={item['bytes_total']} used={item['bytes_used']} pool={item['pool_count']}")
            flat = flatten(item["value"])
            selected = [(key, value) for key, value in flat if any(token in key.lower() for token in ("eui", "guide", "loading", "mask", "spine/ui", "touch"))]
            output.append(f"selected={len(selected)} total_leaves={len(flat)}")
            for key, value in selected[:400]:
                encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
                output.append(f"{key}\t{encoded[:1200]}")
        except Exception as exc:
            output.append(f"### {name} ERROR {type(exc).__name__}: {exc}")

    if "local_main" in decoded and "cn_main" in decoded:
        local_keys = {key for key, _ in flatten(decoded["local_main"])}
        cn_keys = {key for key, _ in flatten(decoded["cn_main"])}
        output.append("### KEY_SET_DIFF local_main_vs_cn_main")
        output.append(f"local_only={len(local_keys - cn_keys)} cn_only={len(cn_keys - local_keys)} common={len(local_keys & cn_keys)}")
        for key in sorted(local_keys - cn_keys):
            if any(token in key.lower() for token in ("eui", "guide", "loading", "mask", "spine")):
                output.append("LOCAL_ONLY\t" + key)
        for key in sorted(cn_keys - local_keys):
            if any(token in key.lower() for token in ("eui", "guide", "loading", "mask", "spine")):
                output.append("CN_ONLY\t" + key)

    target = ROOT / "_ai_workbench/temp/resource_manifest_compare_20260831.txt"
    target.write_text("\n".join(output) + "\n", encoding="utf-8")
    print(target)


if __name__ == "__main__":
    main()
