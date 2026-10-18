"""Merge only the five VUSA pet resource rows into the live-style manifest.

The baseline is the remote fashion candidate manifest, not the stale local
default manifest. Existing resources/groups are retained; only missing pet
rows are appended to their type groups, preserving existing group indices.
"""
from __future__ import annotations

import hashlib
import json
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "_ai_workbench/temp/pet_vusa_port_20260929/remote_baseline"
VUSA = ROOT / "_ai_workbench/temp/vusa_login_assets_20260928"
OUT = ROOT / "_ai_workbench/temp/pet_vusa_port_20260929/candidate"


TYPE_NAMES = {0: "image", 1: "json", 2: "text", 3: "xml", 4: "sheet", 5: "font", 6: "bin", 7: "sound", 8: "atlas", 9: "imageWithGrid", 10: "ktx"}
PET_TOKENS = ("sp_pet_810", "icon_810101", "icon_810201", "icon_810301", "icon_810401", "icon_810501", "ls_icon_810", "ls_bm_frame_10")


class Reader:
    def __init__(self, data: bytes):
        self.data, self.pos = data, 0

    def u8(self):
        value = self.data[self.pos]
        self.pos += 1
        return value

    def auto(self):
        value, multiplier = 0, 1
        while True:
            byte = self.u8()
            value += (byte & 0x7F) * multiplier
            if not byte & 0x80:
                return value
            multiplier *= 128

    def raw(self, count):
        value = self.data[self.pos:self.pos + count]
        self.pos += count
        return value

    def string(self, count):
        return self.raw(count).decode("utf-8", "replace")


def auto(value: int) -> bytes:
    out = bytearray()
    value = int(value)
    while True:
        byte = value & 0x7F
        value >>= 7
        out.append(byte | (0x80 if value else 0))
        if not value:
            return bytes(out)


def parse(path: Path | bytes) -> dict:
    raw = path if isinstance(path, bytes) else path.read_bytes()
    compressed = True
    try:
        data = zlib.decompress(raw)
    except zlib.error:
        compressed = False
        data = raw
    reader = Reader(data)
    prefix_count = struct.unpack(">H", reader.raw(2))[0]
    prefixes = [reader.string(reader.auto()) for _ in range(prefix_count)]
    groups_by_type = [(reader.auto(), reader.auto()) for _ in range(reader.auto())]
    resources = []
    for type_code, count in groups_by_type:
        for _ in range(count):
            name = reader.string(reader.auto())
            prefix_index = reader.auto()
            url_suffix = reader.string(reader.auto())
            size = reader.auto()
            item = {"name": name, "type_code": type_code, "type": TYPE_NAMES.get(type_code, str(type_code)), "prefix": prefix_index, "url": prefixes[prefix_index] + url_suffix, "size": size}
            if type_code == 4:
                item["subkeys"] = reader.string(reader.auto()).split(",")
            elif type_code == 9:
                item["scale9grid"] = reader.string(reader.auto())
            resources.append(item)
    groups = {}
    for _ in range(reader.auto()):
        name = reader.string(reader.auto())
        groups[name] = [reader.auto() for _ in range(reader.auto())]
    assert reader.pos == len(data)
    return {"prefixes": prefixes, "groups_by_type": groups_by_type, "resources": resources, "groups": groups, "compressed": compressed}


def encode(manifest: dict) -> bytes:
    prefixes = manifest["prefixes"]
    prefix_index = {value: index for index, value in enumerate(prefixes)}
    resources_by_type = {}
    type_order = []
    for type_code, _count in manifest["groups_by_type"]:
        if type_code not in type_order:
            type_order.append(type_code)
    for item in manifest["resources"]:
        resources_by_type.setdefault(item["type_code"], []).append(item)
        if item["type_code"] not in type_order:
            type_order.append(item["type_code"])
    payload = bytearray(struct.pack(">H", len(prefixes)))
    for value in prefixes:
        encoded = value.encode("utf-8")
        payload += auto(len(encoded)) + encoded
    payload += auto(len(type_order))
    for type_code in type_order:
        payload += auto(type_code) + auto(len(resources_by_type.get(type_code, [])))
    for type_code in type_order:
        for item in resources_by_type.get(type_code, []):
            name = item["name"].encode("utf-8")
            prefix = prefixes[item['prefix']]
            if prefix is None:
                raise ValueError(f"NO_PREFIX:{item['url']}")
            suffix = item["url"][len(prefix):].encode("utf-8")
            payload += auto(len(name)) + name + auto(prefix_index[prefix]) + auto(len(suffix)) + suffix + auto(item.get("size", 0))
            if type_code == 4:
                aliases = ",".join(item.get("subkeys", [])).encode("utf-8")
                payload += auto(len(aliases)) + aliases
            elif type_code == 9:
                grid = item.get("scale9grid", "").encode("utf-8")
                payload += auto(len(grid)) + grid
    payload += auto(len(manifest["groups"]))
    ordered = [item for code in type_order for item in resources_by_type.get(code, [])]
    new_indices = {item['name']: i for i, item in enumerate(ordered)}
    for name, members in manifest["groups"].items():
        encoded = name.encode("utf-8")
        payload += auto(len(encoded)) + encoded + auto(len(members))
        for member in members:
            payload += auto(new_indices[manifest['resources'][member]['name']])
    return zlib.compress(bytes(payload), 9) if manifest.get("compressed", False) else bytes(payload)


def merge_main():
    base_path = BASE / "default.res_main_c669f2c0_fashion_candidate.bin"
    vusa_path = VUSA / "default.res_main_56f938ac.bin"
    base, vusa = parse(base_path), parse(vusa_path)
    original = parse(base_path)
    prefix_set = set(base["prefixes"])
    for prefix in vusa["prefixes"]:
        if prefix not in prefix_set and any(token in prefix for token in ("battleHero", "icon/pet")):
            base["prefixes"].append(prefix)
            prefix_set.add(prefix)
    existing = {item["name"]: item for item in base["resources"]}
    added = []
    for item in vusa["resources"]:
        if not any(token in item["name"] for token in PET_TOKENS):
            continue
        if item["name"] in existing:
            continue
        item = dict(item, prefix=base['prefixes'].index(vusa['prefixes'][item['prefix']]))
        asset = VUSA / item['url']
        assert asset.is_file(), 'ASSET_MISSING:' + item['url']
        if item['size']:
            assert item['size'] == asset.stat().st_size, 'ASSET_LENGTH:' + item['name']
        base["resources"].append(item)
        existing[item["name"]] = item
        added.append(item["name"])
    assert len(added) == 31, f"PET_RESOURCE_DELTA:{len(added)}"
    candidate = encode(base)
    check = parse_bytes(candidate)
    names = {item["name"] for item in check["resources"]}
    assert all(name in names for name in added)
    by_name = {item['name']: item for item in check['resources']}
    for item in original['resources']:
        assert by_name[item['name']] == item, 'EXISTING_RESOURCE_CHANGED:' + item['name']
    for group, indices in original['groups'].items():
        assert [original['resources'][i]['name'] for i in indices] == [check['resources'][i]['name'] for i in check['groups'][group]], 'GROUP_CHANGED:' + group
    return candidate, {"added": added, "resourceCount": len(check["resources"]), "before": sha(base_path.read_bytes()), "after": sha(candidate), "bytes": len(candidate)}


def parse_bytes(data: bytes) -> dict:
    return parse(data)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    candidate, report = merge_main()
    out = OUT / "default.res_main_c669f2c0_pet_vusa_20260929.bin"
    out.write_bytes(candidate)
    # The CN manifest has no pet resources; keep the remote fashion candidate
    # byte-for-byte and only change the filename in the index for cache busting.
    cn_src = BASE / "default.res_cn_main_f70d4753_fashion_candidate.bin"
    cn_out = OUT / "default.res_cn_main_f70d4753_pet_vusa_20260929.bin"
    cn_out.write_bytes(cn_src.read_bytes())
    report["cn"] = {"before": sha(cn_src.read_bytes()), "after": sha(cn_out.read_bytes()), "bytes": cn_out.stat().st_size, "unchanged": True}
    (OUT / "manifest-build.json").write_text(json.dumps({"result": "PASS", **report}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"result": "PASS", **report}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
