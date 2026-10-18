"""Đối chiếu catalog ngoại quan với manifest/file và xuất toàn bộ ID test."""

from __future__ import annotations

import csv
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
WORKBENCH = ROOT / "_ai_workbench"
RAW = WORKBENCH / "temp" / "appearance_catalog_raw_20260904.json"
RESOURCE_ROOT = ROOT / "linhhoasu/webgame/game/update/resource"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_resource_config import parse  # noqa: E402


CONFIRMED_PREFIXES = (
    "TIMED_FASHION_",
    "WRONG_REWARD_ROUTE_",
    "DIRECT_REWARD_",
    "ITEM_REWARD_",
    "SUIT_EQUIP_",
    "SUIT_VARIANT_",
    "DRESS_STAR_",
    "MISSING_APPEARANCE_CONFIG",
    "REWARD_GRANT_UNSUPPORTED_EXPECT_FORMATION",
    "REWARD_GRANT_UNSUPPORTED_EXPECT_SPIRIT",
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def uniq(values: list[Any]) -> list[Any]:
    result = []
    seen = set()
    for value in values:
        marker = json.dumps(value, sort_keys=True, ensure_ascii=False) if isinstance(value, (dict, list)) else value
        if marker in seen:
            continue
        seen.add(marker)
        result.append(value)
    return result


def load_manifest() -> tuple[dict[str, list[dict]], dict[str, list[dict]], dict, list[tuple[str, bytes]]]:
    by_name: dict[str, list[dict]] = defaultdict(list)
    by_url: dict[str, list[dict]] = defaultdict(list)
    manifests = {}
    pack_data: list[tuple[str, bytes]] = []
    for manifest in sorted(RESOURCE_ROOT.glob("default.res*.bin")):
        parsed = parse(manifest)
        manifests[manifest.name] = {
            "resourceCount": parsed["resource_count"],
            "bytes": manifest.stat().st_size,
            "sha256": sha256(manifest),
        }
        for resource in parsed["resources"]:
            row = {**resource, "manifest": manifest.name}
            by_name[str(resource.get("name") or "")].append(row)
            by_url[str(resource.get("url") or "")].append(row)
    import zlib
    for pack in sorted((RESOURCE_ROOT / "assets/cfg").rglob("*_pack_*.bin")):
        data = pack.read_bytes()
        try:
            data = zlib.decompress(data)
        except zlib.error:
            pass
        pack_data.append((str(pack), data))
    return by_name, by_url, manifests, pack_data


def resource_exists(name: str, by_name: dict[str, list[dict]], pack_data: list[tuple[str, bytes]]) -> tuple[bool, bool, list[str]]:
    rows = by_name.get(name, [])
    files = [RESOURCE_ROOT / str(row.get("url") or "") for row in rows]
    packed = [pack for pack, data in pack_data if name.encode("utf-8") in data]
    return bool(rows or packed), any(path.is_file() for path in files) or bool(packed), [str(path) for path in files] + packed


def check_icon(icon: str, by_name: dict[str, list[dict]], pack_data: list[tuple[str, bytes]]) -> list[str]:
    if not icon:
        return []
    manifest, physical, _ = resource_exists(icon, by_name, pack_data)
    digits = "".join(character for character in icon if character.isdigit())
    if not manifest and digits:
        manifest = physical = any(digits.encode("utf-8") in data for _pack, data in pack_data)
    if not manifest:
        return ["MISSING_MANIFEST_ICON"]
    if not physical:
        return ["MISSING_PHYSICAL_ICON"]
    return []


def check_appearance(appearance: dict | None, by_name: dict[str, list[dict]], pack_data: list[tuple[str, bytes]]) -> list[str]:
    if not isinstance(appearance, dict):
        return []
    issues: list[str] = []
    picture = str(appearance.get("picture") or "")
    spine = str(appearance.get("appearance") or "")
    if picture:
        manifest, physical, _ = resource_exists(picture, by_name, pack_data)
        digits = "".join(character for character in picture if character.isdigit())
        if not manifest and digits:
            manifest = physical = any(digits.encode("utf-8") in data for _pack, data in pack_data)
        if not manifest:
            issues.append("MISSING_MANIFEST_PICTURE")
        elif not physical:
            issues.append("MISSING_PHYSICAL_PICTURE")
    if spine:
        skel_manifest, skel_physical, _ = resource_exists(spine + "_skel", by_name, pack_data)
        png_manifest, png_physical, _ = resource_exists(spine + "_png", by_name, pack_data)
        ktx_manifest, ktx_physical, _ = resource_exists(spine + "_astc_ktx", by_name, pack_data)
        packed_skel = any(
            "skel" in Path(pack).name.lower() and spine.encode("utf-8") in data
            for pack, data in pack_data
        )
        packed_atlas = any(
            "atlas" in Path(pack).name.lower() and spine.encode("utf-8") in data
            for pack, data in pack_data
        )
        skel_manifest = skel_manifest or packed_skel
        skel_physical = skel_physical or packed_skel
        png_manifest = png_manifest or packed_atlas
        png_physical = png_physical or packed_atlas
        if not skel_manifest:
            issues.append("MISSING_MANIFEST_SPINE_SKEL")
        elif not skel_physical:
            issues.append("MISSING_PHYSICAL_SPINE_SKEL")
        if not (png_manifest or ktx_manifest):
            issues.append("MISSING_MANIFEST_SPINE_TEXTURE")
        elif not (png_physical or ktx_physical):
            issues.append("MISSING_PHYSICAL_SPINE_TEXTURE")
    return issues


def status_for(issues: list[str]) -> str:
    if any(issue.startswith(CONFIRMED_PREFIXES) for issue in issues):
        return "LOI_DA_XAC_NHAN"
    if issues:
        return "CAN_TEST_NATIVE"
    return "TINH_OK"


def flatten_rows(payload: dict, by_name: dict[str, list[dict]], pack_data: list[tuple[str, bytes]]) -> list[dict]:
    rows = []
    for entry in payload["fashionRows"]:
        issues = list(entry.get("issues") or [])
        issues += check_icon(str(entry.get("icon") or ""), by_name, pack_data)
        for appearance in entry.get("appearanceRows") or []:
            issues += check_appearance(appearance, by_name, pack_data)
        fashion_id = int(entry.get("fashionId") or 0)
        config_item_id = int(entry.get("sendItemId") or 0)
        recommended = fashion_id
        route = "Gửi đúng fashion ID qua thư; nhận thư sẽ kích hoạt trực tiếp"
        if entry.get("expectedRewardKind") != "fashion":
            route = "ID trùng collection native; xem cột mail_route và không dùng activity/shop generic"
        asset_type = int(entry.get("assetType") or 0)
        if asset_type in {5, 6, 16, 18, 22, 40, 94}:
            mail_route = entry.get("expectedRewardKind")
        else:
            mail_route = "fashion"
        rows.append({
            "category": entry.get("category"),
            "family": "fashion",
            "recommended_send_id": recommended,
            "config_item_id": config_item_id,
            "internal_id": fashion_id,
            "name": entry.get("name") or "",
            "quality": entry.get("quality") or 0,
            "fashion_type": entry.get("fashionType") or 0,
            "asset_type": asset_type,
            "mail_route": mail_route,
            "direct_reward_route": entry.get("actualRewardKind") or "",
            "status": status_for(uniq(issues)),
            "issues": uniq(issues),
            "test_instruction": route,
        })

    for entry in payload["dressRows"]:
        issues = list(entry.get("issues") or [])
        issues += check_icon(str(entry.get("icon") or ""), by_name, pack_data)
        send_id = int(entry.get("sendItemId") or 0)
        instruction = (
            "Gửi ID bộ đồ, nhận thư, vào túi dùng item rồi thử mặc bộ"
            if send_id > 0 else
            "Không có item gửi trực tiếp; chỉ là suit mặc định/ghép component"
        )
        rows.append({
            "category": entry.get("category"),
            "family": entry.get("family"),
            "recommended_send_id": send_id,
            "config_item_id": send_id,
            "internal_id": int(entry.get("dressId") or 0),
            "name": entry.get("name") or "",
            "quality": entry.get("quality") or 0,
            "fashion_type": 0,
            "asset_type": entry.get("assetType") or 0,
            "mail_route": "bag_then_use" if send_id else "not_sendable",
            "direct_reward_route": "bag_then_use" if send_id else "not_sendable",
            "status": status_for(uniq(issues)),
            "issues": uniq(issues),
            "test_instruction": instruction,
        })

    for entry in payload["nativeRows"]:
        issues = list(entry.get("issues") or [])
        issues += check_icon(str(entry.get("icon") or ""), by_name, pack_data)
        issues += check_appearance(entry.get("appearanceRow"), by_name, pack_data)
        if entry.get("family") == "artifact" and "MISSING_NATIVE_APPEARANCE_CONFIG" in issues:
            # 235xx rows are artifact-soul templates. They have native ArtifactConfig
            # and grant correctly, but intentionally have no separate role appearance.
            issues = [
                "ARTIFACT_SOUL_NO_STANDALONE_ROLE_APPEARANCE"
                if issue == "MISSING_NATIVE_APPEARANCE_CONFIG" else issue
                for issue in issues
            ]
        family = str(entry.get("family") or "")
        mail_route = entry.get("rewardGrantKind") or ""
        instruction = "Gửi ID qua thư, nhận và kiểm collection native + trang bị/hiển thị"
        rows.append({
            "category": entry.get("category"),
            "family": family,
            "recommended_send_id": int(entry.get("sendItemId") or 0),
            "config_item_id": int(entry.get("sendItemId") or 0),
            "internal_id": int(entry.get("nativeId") or 0),
            "name": entry.get("name") or "",
            "quality": entry.get("quality") or 0,
            "fashion_type": 0,
            "asset_type": entry.get("assetType") or 0,
            "mail_route": mail_route,
            "direct_reward_route": entry.get("itemRewardKind") or "",
            "status": status_for(uniq(issues)),
            "issues": uniq(issues),
            "test_instruction": instruction,
        })
    return rows


def write_csv(path: Path, rows: list[dict]) -> None:
    fields = [
        "category", "family", "recommended_send_id", "config_item_id", "internal_id",
        "name", "quality", "fashion_type", "asset_type", "mail_route",
        "direct_reward_route", "status", "issues", "test_instruction",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            value = dict(row)
            value["issues"] = ";".join(value.get("issues") or [])
            writer.writerow({field: value.get(field, "") for field in fields})


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    payload = json.loads(RAW.read_text(encoding="utf-8"))
    by_name, _by_url, manifests, pack_data = load_manifest()
    rows = flatten_rows(payload, by_name, pack_data)
    rows.sort(key=lambda row: (
        str(row["category"]), int(row["recommended_send_id"] or 0),
        str(row["family"]), int(row["internal_id"] or 0),
    ))

    report_dir = WORKBENCH / "reports"
    temp_dir = WORKBENCH / "temp"
    report_dir.mkdir(parents=True, exist_ok=True)
    temp_dir.mkdir(parents=True, exist_ok=True)
    all_csv = report_dir / "appearance_all_test_ids_20260904.csv"
    problem_csv = report_dir / "appearance_problem_ids_20260904.csv"
    txt = report_dir / "appearance_test_ids_20260904.txt"
    detail = temp_dir / "appearance_full_audit_20260904.json"
    write_csv(all_csv, rows)
    problem_rows = [row for row in rows if row["status"] != "TINH_OK"]
    write_csv(problem_csv, problem_rows)

    groups: dict[str, list[int]] = defaultdict(list)
    for row in rows:
        send_id = int(row["recommended_send_id"] or 0)
        if send_id > 0:
            groups[str(row["category"])].append(send_id)
    lines = [
        "DANH SACH ID NGOAI QUAN DE GUI TEST",
        "Tao tu config production ngay 04/09/2026.",
        "Moi ID gui so luong 1. Bo do: nhan thu xong phai vao tui bam Su dung.",
        "ID loi xem appearance_problem_ids_20260904.csv.",
        "",
    ]
    for category in sorted(groups):
        ids = sorted(set(groups[category]))
        lines.append(f"[{category}] count={len(ids)}")
        for start in range(0, len(ids), 25):
            lines.append(",".join(str(value) for value in ids[start:start + 25]))
        lines.append("")
    txt.write_text("\n".join(lines), encoding="utf-8-sig")

    status_counts = Counter(row["status"] for row in rows)
    issue_counts = Counter(issue for row in rows for issue in row["issues"])
    category_counts = Counter(row["category"] for row in rows)
    unique_send_ids = sorted({int(row["recommended_send_id"]) for row in rows if int(row["recommended_send_id"] or 0) > 0})
    result = {
        "generatedAt": payload["generatedAt"],
        "configTableCount": payload["tableCount"],
        "manifestSummary": {
            "files": len(manifests),
            "resources": sum(row["resourceCount"] for row in manifests.values()),
            "manifests": manifests,
            "packFiles": len(pack_data),
        },
        "summary": {
            "rows": len(rows),
            "uniqueSendIds": len(unique_send_ids),
            "statusCounts": dict(status_counts),
            "issueCounts": dict(issue_counts),
            "categoryCounts": dict(category_counts),
        },
        "handlerFindings": payload["handlerFindings"],
        "artifacts": {
            "allCsv": str(all_csv),
            "problemCsv": str(problem_csv),
            "testIdsTxt": str(txt),
        },
        "rows": rows,
    }
    detail.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "result": "PASS",
        "summary": result["summary"],
        "artifacts": result["artifacts"],
        "detail": str(detail),
        "sha256": {
            "allCsv": sha256(all_csv),
            "problemCsv": sha256(problem_csv),
            "testIdsTxt": sha256(txt),
            "detail": sha256(detail),
        },
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
