#!/usr/bin/env python3
"""Safe, dormant server-merge planner for the LHS game.

The tool is intentionally snapshot-first.  It can inventory and dry-run JSON
exports without a database connection, then materialise a merged *staging*
snapshot after explicit confirmations.  It never starts/stops PM2, changes
nginx, connects to a live database, or writes a player document by default.

The live runtime has shared identity data and many immutable settlement
collections.  A blind Mongo import would therefore be unsafe.  This module
keeps the safety boundary explicit: unresolved identity/financial/event
collisions, missing native power read-back, source drift, or a missing restore
rehearsal stop the operation before any staging write.

Snapshot layout (JSONL is preferred, JSON arrays are also accepted):

    <snapshot>/<database>/<collection>.jsonl
    <snapshot>/<identityDatabase>/accounts.jsonl

The command names intentionally match the future operator workflow:
inventory, dry-run, backup, apply, verify, resume and rollback.
"""

from __future__ import annotations

import argparse
import copy
import dataclasses
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any, Iterator, Mapping, Sequence


if os.name == "nt":
    # PowerShell can expose cp1252 even though the source/report is UTF-8.
    # Keep Vietnamese diagnostics and JSON summaries readable without asking
    # the operator to set an environment variable first.
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


TOOL_VERSION = "1.0.0-dormant-snapshot"
MANIFEST_SCHEMA = 1
REPORT_SCHEMA = 1


class MergeToolError(RuntimeError):
    """A user-actionable safety or input error."""


@dataclasses.dataclass(frozen=True)
class CollectionRule:
    canonical: str
    unique_fields: tuple[tuple[str, ...], ...] = ()
    immutable: bool = False
    identity: bool = False
    allow_exact_duplicate: bool = True


RULES: dict[str, CollectionRule] = {
    "players": CollectionRule(
        "players", (("userId",), ("playerId",), ("name",))
    ),
    "guilds": CollectionRule("guilds", (("guildId",), ("name",))),
    "mails": CollectionRule("mails", (("userId", "eventKey"),)),
    "transactions": CollectionRule("transactions", (("orderId",),)),
    "distcallbacktasks": CollectionRule("distcallbacktasks", (("dedupeKey",),)),
    "redemptioncodes": CollectionRule("redemptioncodes", (("code",),)),
    "rechargeproductconfigs": CollectionRule("rechargeproductconfigs", (("productId",),)),
    "globalconfigs": CollectionRule("globalconfigs", (("key",),)),
    "itemdictionaries": CollectionRule("item_dictionaries", (("itemId",),)),
    "adminagents": CollectionRule("adminagents", (("agentId",), ("username",))),
    "adminactionlogs": CollectionRule("adminactionlogs", (("_id",),), immutable=True),
    "accounts": CollectionRule("accounts", (("accountId",),), identity=True),
    "gameservers": CollectionRule("gameservers", (("serverId",),), identity=True),
    "arenafightlogs": CollectionRule(
        "arenafightlogs", (("fightId",),), immutable=True
    ),
    "arenasettlements": CollectionRule(
        "arenasettlements", (("_id",),), immutable=True
    ),
    "eventrewardsettlements": CollectionRule(
        "eventrewardsettlements", (("_id",),), immutable=True
    ),
    "crossevententries": CollectionRule(
        "crossevententries", (("cycleKey", "event", "playerId"),), immutable=True
    ),
    "crosseventsettlements": CollectionRule(
        "crosseventsettlements", (("_id",), ("cycleKey", "event")), immutable=True
    ),
    "crossarenaactions": CollectionRule(
        "crossarenaactions", (("_id",),), immutable=True
    ),
    "battlelogs": CollectionRule("battleLogs", (("_id",),), immutable=True),
}

# Typo-resistant aliases are normalised by removing punctuation and case.
ALIASES: dict[str, str] = {
    "player": "players",
    "players": "players",
    "guild": "guilds",
    "guilds": "guilds",
    "mail": "mails",
    "mails": "mails",
    "transaction": "transactions",
    "transactions": "transactions",
    "distcallbacktask": "distcallbacktasks",
    "distcallbacktasks": "distcallbacktasks",
    "redemptioncode": "redemptioncodes",
    "redemptioncodes": "redemptioncodes",
    "rechargeproductconfig": "rechargeproductconfigs",
    "rechargeproductconfigs": "rechargeproductconfigs",
    "globalconfig": "globalconfigs",
    "globalconfigs": "globalconfigs",
    "itemdictionary": "itemdictionaries",
    "itemdictionaries": "itemdictionaries",
    "adminagent": "adminagents",
    "adminagents": "adminagents",
    "adminactionlog": "adminactionlogs",
    "adminactionlogs": "adminactionlogs",
    "account": "accounts",
    "accounts": "accounts",
    "gameserver": "gameservers",
    "gameservers": "gameservers",
    "arenafightlog": "arenafightlogs",
    "arenafightlogs": "arenafightlogs",
    "arenasettlement": "arenasettlements",
    "arenasettlements": "arenasettlements",
    "eventrewardsettlement": "eventrewardsettlements",
    "eventrewardsettlements": "eventrewardsettlements",
    "crossevententry": "crossevententries",
    "crossevententries": "crossevententries",
    "crosseventsettlement": "crosseventsettlements",
    "crosseventsettlements": "crosseventsettlements",
    "crossarenaaction": "crossarenaactions",
    "crossarenaactions": "crossarenaactions",
    "battlelog": "battlelogs",
    "battlelogs": "battlelogs",
}

def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_json(value).encode("utf-8"))


def safe_int(value: Any, label: str) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError) as exc:
        raise MergeToolError(f"{label} phải là số nguyên dương") from exc
    if number <= 0:
        raise MergeToolError(f"{label} phải lớn hơn 0")
    return number


def safe_database_name(value: Any, label: str = "database") -> str:
    name = str(value or "").strip()
    if not name or name in {".", ".."} or ".." in name or "/" in name or "\\" in name or ":" in name:
        raise MergeToolError(f"{label} không phải tên database an toàn")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,119}", name):
        raise MergeToolError(f"{label} chứa ký tự không hợp lệ")
    return name


def normalise_collection_name(name: str) -> str:
    key = "".join(ch.lower() for ch in str(name) if ch.isalnum())
    return ALIASES.get(key, key)


def rule_for(name: str) -> CollectionRule | None:
    return RULES.get(normalise_collection_name(name))


def get_path(document: Mapping[str, Any], path: Sequence[str]) -> Any:
    current: Any = document
    for part in path:
        if not isinstance(current, Mapping) or part not in current:
            return None
        current = current[part]
    return current


def value_present(value: Any) -> bool:
    return value is not None and value != ""


def key_value(document: Mapping[str, Any], fields: Sequence[str]) -> tuple[str, ...] | None:
    values = tuple(get_path(document, field.split(".")) for field in fields)
    # A mail with an empty eventKey is not covered by the unique partial index;
    # use _id below so unrelated legacy mails are never deduplicated by guess.
    if not all(value_present(value) for value in values):
        return None
    return tuple(str(value) for value in values)


def numeric_or_none(value: Any) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if str(value).strip() == str(number) or isinstance(value, (int, float)) else None


def payload_for_compare(document: Mapping[str, Any]) -> Any:
    """Return a strict payload copy used for exact-deduplication checks."""
    payload = copy.deepcopy(dict(document))
    payload.pop("_id", None)
    return payload


def document_hash(document: Mapping[str, Any]) -> str:
    return sha256_json(payload_for_compare(document))


def short_ref(document: Mapping[str, Any]) -> str:
    # playerId/userId are stable across a Mongo export and are also the keys
    # emitted by the native power worker; prefer them over process-local _id.
    for field in ("playerId", "userId", "_id", "guildId", "orderId", "accountId", "eventKey"):
        value = document.get(field)
        if value is not None and value != "":
            return f"{field}={value}"
    return f"hash={document_hash(document)[:16]}"


def parse_json_file(path: Path) -> list[dict[str, Any]]:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise MergeToolError(f"Không đọc được snapshot {path}: {exc}") from exc
    if path.suffix.lower() in {".jsonl", ".ndjson"}:
        documents: list[dict[str, Any]] = []
        for line_no, line in enumerate(raw.splitlines(), 1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                raise MergeToolError(f"JSONL lỗi {path}:{line_no}: {exc}") from exc
            if not isinstance(value, dict):
                raise MergeToolError(f"Snapshot {path}:{line_no} không phải object")
            documents.append(value)
        return documents
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise MergeToolError(f"JSON lỗi {path}: {exc}") from exc
    if isinstance(value, dict) and isinstance(value.get("documents"), list):
        value = value["documents"]
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise MergeToolError(f"Snapshot {path} phải là mảng object hoặc JSONL")
    return value


def iter_snapshot_files(database_dir: Path) -> Iterator[Path]:
    if not database_dir.exists():
        return
    for path in sorted(database_dir.iterdir()):
        if path.is_file() and path.suffix.lower() in {".json", ".jsonl", ".ndjson"}:
            yield path


def load_database_snapshot(snapshot_root: Path, database: str) -> dict[str, list[dict[str, Any]]]:
    database = safe_database_name(database)
    database_dir = snapshot_root / database
    if not database_dir.exists() or not database_dir.is_dir():
        return {}
    loaded: dict[str, list[dict[str, Any]]] = {}
    for path in iter_snapshot_files(database_dir):
        collection = path.stem
        if collection in loaded:
            raise MergeToolError(f"database {database} có nhiều file snapshot cho collection {collection}")
        docs = parse_json_file(path)
        loaded[collection] = docs
    return loaded


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def directory_file_hashes(root: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    if not root.exists():
        return result
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        result[str(path.relative_to(root)).replace("\\", "/")] = file_sha256(path)
    return result


def directory_digest(root: Path) -> str:
    return sha256_json(directory_file_hashes(root))


def parse_server_list(value: str) -> list[int]:
    values = [part.strip() for part in str(value).replace(";", ",").split(",") if part.strip()]
    if not values:
        raise MergeToolError("source-servers không được rỗng")
    servers = [safe_int(part, "serverId") for part in values]
    if len(set(servers)) != len(servers):
        raise MergeToolError("source-servers có serverId trùng")
    return servers


def default_policy(rename_suffix: str | None = None) -> dict[str, Any]:
    return {
        "nameCollision": "suffix" if rename_suffix else "quarantine",
        "guildCollision": "quarantine",
        "identityCollision": "quarantine",
        "mailCollision": "quarantine",
        "transactionCollision": "quarantine",
        "settlementCollision": "quarantine",
        "exactDuplicate": "dedupe",
        "renameSuffix": rename_suffix or "·S{serverId}",
        "accountRolePolicy": "preserve-and-map",
        "allowPowerDelta": False,
        "requireAttributeHashEquality": True,
        "requireNativePowerReadback": True,
        "requireRestoreRehearsal": True,
        "allowUnknownCollections": False,
        "sourceReadOnlyDays": 30,
    }


def load_policy(path: Path | None, rename_suffix: str | None = None) -> dict[str, Any]:
    policy = default_policy(rename_suffix)
    if path is None:
        return policy
    try:
        user_policy = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise MergeToolError(f"policy JSON không hợp lệ: {path}: {exc}") from exc
    if not isinstance(user_policy, dict):
        raise MergeToolError("policy phải là object JSON")
    policy.update(user_policy)
    return policy


def make_manifest(args: argparse.Namespace) -> dict[str, Any]:
    root = safe_int(args.root_server, "root-server")
    source_servers = parse_server_list(args.source_servers)
    if root not in source_servers:
        raise MergeToolError("root-server phải nằm trong source-servers để giữ canonical identity")
    target = safe_int(args.target_server or root, "target-server")
    db_prefix = str(args.db_prefix or "lhs_s")
    server_map: dict[str, Any] = {}
    if args.server_map:
        try:
            raw = json.loads(Path(args.server_map).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise MergeToolError(f"server-map JSON không hợp lệ: {exc}") from exc
        if not isinstance(raw, dict):
            raise MergeToolError("server-map phải là object")
        server_map = raw

    source_rows = []
    for server_id in source_servers:
        override = server_map.get(str(server_id), {})
        if not isinstance(override, dict):
            raise MergeToolError(f"server-map[{server_id}] phải là object")
        source_rows.append(
            {
                "serverId": server_id,
                "database": safe_database_name(override.get("database") or f"{db_prefix}{server_id}", f"database[{server_id}]"),
                "identityDatabase": safe_database_name(override.get("identityDatabase") or args.identity_db or f"{db_prefix}{root}", "identityDatabase"),
                "process": override.get("process", f"lhs-s{server_id}"),
                "httpPort": override.get("httpPort"),
                "wsPort": override.get("wsPort"),
            }
        )
    identity_values = {str(row["identityDatabase"]) for row in source_rows}
    if len(identity_values) != 1:
        raise MergeToolError("các source server không cùng identityDatabase; phải chốt shared identity trước")
    identity_db = safe_database_name(args.identity_db or source_rows[0]["identityDatabase"], "identityDatabase")
    source_databases = [row["database"] for row in source_rows]
    if len(set(source_databases)) != len(source_databases):
        raise MergeToolError("hai source server đang trỏ cùng database; từ chối nhân bản/dedupe mù")
    target_db = safe_database_name(args.target_db or f"{db_prefix}{target}", "target-db")
    merge_id = str(args.merge_id or uuid.uuid4())
    policy = load_policy(Path(args.policy_file) if args.policy_file else None, args.rename_suffix)
    manifest: dict[str, Any] = {
        "schemaVersion": MANIFEST_SCHEMA,
        "tool": "lhs-server-merge",
        "toolVersion": TOOL_VERSION,
        "mergeId": merge_id,
        "createdAt": utc_now(),
        "mode": "dry-run",
        "rootServerId": root,
        "sourceServers": source_rows,
        "target": {
            "serverId": target,
            "database": target_db,
            "identityDatabase": identity_db,
        },
        "identityDatabase": identity_db,
        "policy": policy,
        "preconditions": {
            "sourceHashes": {},
            "sourceCounts": {},
            "freezeRequired": True,
            "maintenanceRequired": True,
            "restoreRehearsal": "required",
        },
        "mappingRefs": {},
        "conflicts": [],
        "powerInvariant": {
            "formula": "native BattleService.calcPlayerPower + ArenaReadModelService.displayPower",
            "status": "pending",
            "negativeDeltaCount": None,
        },
        "economyInvariant": {"status": "pending"},
        "checkpoints": [],
        "backup": {"status": "pending", "path": None, "restoreTest": None},
        "status": "planned",
    }
    manifest["planHash"] = plan_hash(manifest)
    return manifest


def plan_hash(manifest: Mapping[str, Any]) -> str:
    value = copy.deepcopy(dict(manifest))
    value.pop("planHash", None)
    # These fields are append-only execution evidence, not the operator's
    # selected merge plan.  Keeping them outside planHash lets backup,
    # checkpoint and power read-back receipts be added without invalidating a
    # previously approved plan; their own hashes still protect tampering.
    for key in ("status", "mode", "backup", "checkpoints", "conflicts", "powerInvariant", "economyInvariant", "inventory"):
        value.pop(key, None)
    return sha256_json(value)


def write_json(path: Path, value: Any, *, overwrite: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not overwrite:
        raise MergeToolError(f"Từ chối ghi đè file đã tồn tại: {path}")
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def inventory_database(snapshot_root: Path, database: str) -> dict[str, Any]:
    database = safe_database_name(database)
    database_dir = snapshot_root / database
    files: dict[str, Any] = {}
    if not database_dir.exists() or not database_dir.is_dir():
        return {"database": database, "exists": False, "collections": {}, "digest": None}
    for path in iter_snapshot_files(database_dir):
        docs = parse_json_file(path)
        canonical = normalise_collection_name(path.stem)
        files[path.stem] = {
            "canonical": canonical,
            "file": str(path.relative_to(snapshot_root)).replace("\\", "/"),
            "count": len(docs),
            "rawSha256": file_sha256(path),
            "documentSha256": sha256_json([document_hash(doc) for doc in docs]),
            "known": rule_for(canonical) is not None,
        }
    return {
        "database": database,
        "exists": True,
        "collections": files,
        "digest": sha256_json(files),
    }


def all_docs(snapshot_root: Path, database: str) -> list[tuple[str, str, dict[str, Any]]]:
    rows: list[tuple[str, str, dict[str, Any]]] = []
    for collection, docs in load_database_snapshot(snapshot_root, database).items():
        for doc in docs:
            rows.append((database, collection, doc))
    return rows


def inventory_manifest(manifest: dict[str, Any], snapshot_root: Path | None) -> dict[str, Any]:
    if snapshot_root is None:
        manifest["status"] = "planned"
        manifest["inventory"] = {"status": "not-run", "snapshotRoot": None}
        manifest["planHash"] = plan_hash(manifest)
        return manifest
    if not snapshot_root.exists() or not snapshot_root.is_dir():
        raise MergeToolError(f"snapshot-dir không tồn tại: {snapshot_root}")
    databases = {row["database"] for row in manifest["sourceServers"]}
    databases.add(manifest["identityDatabase"])
    databases.add(manifest["target"]["database"])
    inventory = {database: inventory_database(snapshot_root, database) for database in sorted(databases)}
    manifest["inventory"] = {"status": "complete", "snapshotRoot": str(snapshot_root), "databases": inventory}
    manifest["preconditions"]["sourceHashes"] = {
        database: inventory[database]["digest"] for database in sorted(databases) if inventory[database]["exists"]
    }
    manifest["preconditions"]["sourceCounts"] = {
        database: {
            row["canonical"]: row["count"] for row in inventory[database]["collections"].values()
        }
        for database in sorted(databases)
        if inventory[database]["exists"]
    }
    manifest["status"] = "inventoried"
    manifest["planHash"] = plan_hash(manifest)
    return manifest


def collision_key(rule: CollectionRule, document: Mapping[str, Any]) -> list[tuple[str, tuple[str, ...]]]:
    keys: list[tuple[str, tuple[str, ...]]] = []
    for fields in rule.unique_fields:
        value = key_value(document, fields)
        if value is not None:
            keys.append((".".join(fields), value))
    if rule.canonical == "mails" and not keys:
        fallback = key_value(document, ("_id",))
        if fallback is not None:
            keys.append(("_id", fallback))
    if not keys:
        fallback = key_value(document, ("_id",))
        if fallback is not None:
            keys.append(("_id", fallback))
    return keys


def source_server_for_database(manifest: Mapping[str, Any], database: str) -> int | None:
    for row in manifest.get("sourceServers", []):
        if row.get("database") == database:
            return int(row["serverId"])
    return None


def deterministic_renamed_name(name: str, server_id: int, suffix_template: str, used: set[str]) -> str:
    suffix = suffix_template.replace("{serverId}", str(server_id))
    candidate = f"{name}{suffix}"
    if candidate not in used:
        return candidate
    digest = hashlib.sha256(f"{server_id}:{name}".encode("utf-8")).hexdigest()[:8]
    candidate = f"{name}{suffix}-{digest}"
    if candidate not in used:
        return candidate
    counter = 2
    while f"{candidate}-{counter}" in used:
        counter += 1
    return f"{candidate}-{counter}"


def build_name_mapping(manifest: Mapping[str, Any], snapshot_root: Path) -> tuple[dict[tuple[int, str], str], list[dict[str, Any]]]:
    policy = manifest.get("policy", {})
    mapping: dict[tuple[int, str], str] = {}
    observations: dict[str, list[tuple[int, str]]] = {}
    for source in manifest.get("sourceServers", []):
        server_id = int(source["serverId"])
        database = str(source["database"])
        for collection, docs in load_database_snapshot(snapshot_root, database).items():
            if normalise_collection_name(collection) != "players":
                continue
            for doc in docs:
                name = str(doc.get("name") or "")
                if name:
                    observations.setdefault(name, []).append((server_id, short_ref(doc)))
    used: set[str] = set()
    conflicts: list[dict[str, Any]] = []
    root_server = int(manifest.get("rootServerId") or manifest["target"]["serverId"])
    for name, rows in sorted(observations.items()):
        distinct = sorted(set(rows), key=lambda item: (item[0] != root_server, item[0], item[1]))
        server_ids = {server_id for server_id, _ in distinct}
        if len(distinct) > len(server_ids):
            conflicts.append(
                {
                    "kind": "player_name_collision_same_source",
                    "key": name,
                    "sources": [{"serverId": sid, "ref": ref} for sid, ref in distinct],
                    "decision": "quarantine",
                    "status": "unresolved",
                }
            )
        for server_id, _ in distinct:
            if name not in used:
                used.add(name)
                mapping[(server_id, name)] = name
                continue
            if policy.get("nameCollision") != "suffix":
                conflicts.append(
                    {
                        "kind": "player_name_collision",
                        "key": name,
                        "sources": [{"serverId": sid, "ref": ref} for sid, ref in distinct],
                        "decision": "quarantine",
                        "status": "unresolved",
                    }
                )
                mapping[(server_id, name)] = name
                continue
            renamed = deterministic_renamed_name(
                name,
                server_id,
                str(policy.get("renameSuffix") or "·S{serverId}"),
                used,
            )
            used.add(renamed)
            mapping[(server_id, name)] = renamed
            conflicts.append(
                {
                    "kind": "player_name_collision",
                    "key": name,
                    "sources": [{"serverId": sid, "ref": ref} for sid, ref in distinct],
                    "decision": "deterministic_suffix",
                    "status": "resolved",
                    "mapping": {f"{server_id}:{name}": renamed},
                }
            )
    return mapping, conflicts


def remap_document(
    document: Mapping[str, Any],
    canonical: str,
    source_server_id: int | None,
    target_server_id: int,
    name_mapping: Mapping[tuple[int, str], str],
    source_server_ids: set[int] | None = None,
) -> dict[str, Any]:
    candidate = copy.deepcopy(dict(document))
    # Do not rewrite immutable event/settlement history.  For mutable records,
    # only fields whose runtime semantics are explicit are changed.
    if source_server_id is not None and canonical in {"players", "guilds", "mails", "accounts", "gameservers"}:
        if canonical in {"players", "guilds"} and "serverId" in candidate:
            candidate["serverId"] = target_server_id
        if canonical == "mails" and "targetServerId" in candidate:
            candidate["targetServerId"] = target_server_id
        if canonical == "gameservers" and candidate.get("serverId") == source_server_id:
            candidate["serverId"] = target_server_id
    if canonical == "players" and source_server_id is not None:
        old_name = str(candidate.get("name") or "")
        new_name = name_mapping.get((source_server_id, old_name))
        if new_name and new_name != old_name:
            candidate["name"] = new_name
            candidate.setdefault("mergeMeta", {})["originalName"] = old_name
            candidate["mergeMeta"]["originServerId"] = source_server_id
    if canonical == "guilds" and source_server_id is not None:
        # Guild embeds contain display names used by the WebGM and guild UI.
        # Update only names with an explicit deterministic mapping; immutable
        # battle/event history is intentionally excluded from this path.
        for field in ("members", "applications"):
            entries = candidate.get(field)
            if not isinstance(entries, list):
                continue
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                for name_field in ("name", "playername"):
                    old_name = str(entry.get(name_field) or "")
                    mapped = name_mapping.get((source_server_id, old_name))
                    if mapped and mapped != old_name:
                        entry[name_field] = mapped
    if canonical == "accounts":
        roles = candidate.get("roles")
        if isinstance(roles, list):
            for role in roles:
                role_server = numeric_or_none(role.get("serverId")) if isinstance(role, dict) else None
                role_sources = source_server_ids or ({source_server_id} if source_server_id is not None else set())
                if isinstance(role, dict) and role_server in role_sources:
                    if role_server != target_server_id:
                        # Keep the runtime lookup key intact until the
                        # merge-aware account/session router is deployed.
                        # A blind S2/S3/S4 -> S1 rewrite would collapse
                        # multiple roles and make activeRoleByServer lossy.
                        role.setdefault("mergeOriginServerId", role_server)
                        role["canonicalServerId"] = target_server_id
            active = candidate.get("activeRoleByServer")
            if isinstance(active, Mapping):
                meta = candidate.setdefault("mergeMeta", {})
                meta["activeRoleByOriginServer"] = copy.deepcopy(dict(active))
                meta["canonicalServerId"] = target_server_id
    return candidate


def collect_records(manifest: Mapping[str, Any], snapshot_root: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    records: list[dict[str, Any]] = []
    unknown: list[dict[str, Any]] = []
    name_mapping, name_conflicts = build_name_mapping(manifest, snapshot_root)
    target_server = int(manifest["target"]["serverId"])
    source_server_ids = {int(row["serverId"]) for row in manifest.get("sourceServers", [])}
    for source in manifest.get("sourceServers", []):
        server_id = int(source["serverId"])
        database = str(source["database"])
        loaded = load_database_snapshot(snapshot_root, database)
        if not loaded:
            unknown.append({"kind": "missing_source_database", "serverId": server_id, "database": database})
        for collection, docs in loaded.items():
            canonical = normalise_collection_name(collection)
            rule = rule_for(canonical)
            if rule is None:
                unknown.append({"kind": "unknown_collection", "database": database, "collection": collection, "count": len(docs)})
            for index, document in enumerate(docs):
                if not isinstance(document, dict):
                    unknown.append({"kind": "invalid_document", "database": database, "collection": collection, "index": index})
                    continue
                if rule and not collision_key(rule, document):
                    unknown.append({"kind": "missing_unique_key", "database": database, "collection": collection, "index": index, "ref": short_ref(document)})
                records.append(
                    {
                        "sourceServerId": server_id,
                        "sourceDatabase": database,
                        "sourceCollection": collection,
                        "canonicalCollection": canonical,
                        "sourceIndex": index,
                        "sourceId": short_ref(document),
                        "sourceHash": document_hash(document),
                        "originalServerId": document.get("serverId"),
                        "document": remap_document(document, canonical, server_id, target_server, name_mapping, source_server_ids),
                        "immutable": bool(rule and rule.immutable),
                    }
                )
    # Identity DB is shared.  Read it once and never duplicate it once per
    # source server.  If it also appears as a game source, exact duplicates
    # are collapsed later by the same receipt key.
    identity_db = str(manifest["identityDatabase"])
    seen_identity = {(row["sourceDatabase"], row["sourceCollection"], row["sourceIndex"]) for row in records}
    for collection, docs in load_database_snapshot(snapshot_root, identity_db).items():
        canonical = normalise_collection_name(collection)
        rule = rule_for(canonical)
        if rule is None:
            unknown.append({"kind": "unknown_identity_collection", "database": identity_db, "collection": collection, "count": len(docs)})
        for index, document in enumerate(docs):
            marker = (identity_db, collection, index)
            if marker in seen_identity:
                continue
            if not isinstance(document, dict):
                unknown.append({"kind": "invalid_document", "database": identity_db, "collection": collection, "index": index})
                continue
            if rule and not collision_key(rule, document):
                unknown.append({"kind": "missing_unique_key", "database": identity_db, "collection": collection, "index": index, "ref": short_ref(document)})
            records.append(
                {
                    "sourceServerId": None,
                    "sourceDatabase": identity_db,
                    "sourceCollection": collection,
                    "canonicalCollection": canonical,
                    "sourceIndex": index,
                    "sourceId": short_ref(document),
                    "sourceHash": document_hash(document),
                    "originalServerId": document.get("serverId"),
                    "document": remap_document(document, canonical, None, target_server, name_mapping, source_server_ids),
                    "immutable": bool(rule and rule.immutable),
                    "identity": True,
                }
            )
    if not load_database_snapshot(snapshot_root, identity_db):
        unknown.append({"kind": "missing_identity_database", "database": identity_db})
    return records, {"unknown": unknown, "nameConflicts": name_conflicts, "nameMapping": name_mapping}


def collision_report(manifest: Mapping[str, Any], records: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[tuple[str, str, tuple[str, ...]], list[Mapping[str, Any]]] = {}
    for record in records:
        canonical = str(record["canonicalCollection"])
        rule = rule_for(canonical)
        if not rule:
            continue
        for field_name, key in collision_key(rule, record["document"]):
            buckets.setdefault((canonical, field_name, key), []).append(record)
    conflicts: list[dict[str, Any]] = []
    policy = manifest.get("policy", {})
    for (canonical, field_name, key), rows in sorted(buckets.items(), key=lambda item: str(item[0])):
        if len(rows) <= 1:
            continue
        # Compare the candidate payload after the explicitly approved
        # server/name mapping.  Comparing only the source hash would mark two
        # identical mails as different when a target-only field is remapped.
        hashes = {document_hash(row["document"]) for row in rows}
        exact = len(hashes) == 1
        decision = "dedupe" if exact and policy.get("exactDuplicate") == "dedupe" else "quarantine"
        status = "resolved" if decision == "dedupe" else "unresolved"
        if canonical == "players" and field_name == "name" and policy.get("nameCollision") == "suffix":
            # Name mappings were already applied; any remaining collision is
            # a deterministic-suffix collision and must not be guessed away.
            decision = "quarantine"
            status = "unresolved"
        conflicts.append(
            {
                "kind": f"{canonical}_unique_collision",
                "key": {"field": field_name, "value": list(key)},
                "sources": [
                    {
                        "serverId": row.get("sourceServerId"),
                        "database": row.get("sourceDatabase"),
                        "collection": row.get("sourceCollection"),
                        "ref": row.get("sourceId"),
                        "hash": row.get("sourceHash"),
                    }
                    for row in rows
                ],
                "decision": decision,
                "status": status,
                "exactPayload": exact,
            }
        )
    # A player document carrying another serverId is a known residue class.
    source_ids = {int(row["serverId"]) for row in manifest.get("sourceServers", [])}
    for row in records:
        if row["canonicalCollection"] != "players":
            continue
        document = row["document"]
        embedded = row.get("originalServerId")
        source_server = row.get("sourceServerId")
        embedded_number = numeric_or_none(embedded)
        source_number = numeric_or_none(source_server)
        if embedded is not None and (
            embedded_number is None
            or embedded_number not in source_ids
            or (source_number is not None and embedded_number != source_number)
        ):
            conflicts.append(
                {
                    "kind": "player_server_id_invalid" if embedded_number is None else ("player_server_id_outside_manifest" if embedded_number not in source_ids else "player_server_id_mismatch"),
                    "key": row["sourceId"],
                    "sources": [{"serverId": source_server, "embeddedServerId": embedded}],
                    "decision": "quarantine",
                    "status": "unresolved",
                }
            )
    return conflicts


def aggregate_economy(records: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    totals: dict[str, int] = {}
    item_counts = 0
    player_count = 0
    for row in records:
        if row["canonicalCollection"] != "players":
            continue
        player_count += 1
        currencies = row["document"].get("currencies")
        if isinstance(currencies, Mapping):
            for key, value in currencies.items():
                if isinstance(value, (int, float)) and not isinstance(value, bool):
                    totals[str(key)] = totals.get(str(key), 0) + int(value)
        items = row["document"].get("items")
        if isinstance(items, Mapping):
            item_counts += len(items)
    return {"players": player_count, "currencyTotals": totals, "playerItemKeyCount": item_counts}


def aggregate_output_economy(output: Mapping[tuple[str, str], Sequence[Mapping[str, Any]]]) -> dict[str, Any]:
    rows = [
        {"canonicalCollection": normalise_collection_name(collection), "document": document}
        for (_database, collection), documents in output.items()
        for document in documents
    ]
    return aggregate_economy(rows)


def output_counts(output: Mapping[tuple[str, str], Sequence[Mapping[str, Any]]]) -> dict[str, int]:
    return {f"{database}:{collection}": len(documents) for (database, collection), documents in sorted(output.items())}


def reference_audit(manifest: Mapping[str, Any], output: Mapping[tuple[str, str], Sequence[Mapping[str, Any]]]) -> dict[str, Any]:
    """Check known references without guessing at arbitrary Mixed fields.

    Unknown Mixed subtrees remain byte-for-byte preserved, but a merge cannot
    call itself safe if the references used by login/mail/guild are broken.
    """
    players: list[Mapping[str, Any]] = []
    guilds: list[Mapping[str, Any]] = []
    mails: list[Mapping[str, Any]] = []
    accounts: list[Mapping[str, Any]] = []
    for (_database, collection), documents in output.items():
        canonical = normalise_collection_name(collection)
        if canonical == "players":
            players.extend(documents)
        elif canonical == "guilds":
            guilds.extend(documents)
        elif canonical == "mails":
            mails.extend(documents)
        elif canonical == "accounts":
            accounts.extend(documents)
    user_ids = {str(doc.get("userId")) for doc in players if value_present(doc.get("userId"))}
    player_ids = {str(doc.get("playerId")) for doc in players if value_present(doc.get("playerId"))}
    guild_ids = {str(doc.get("guildId")) for doc in guilds if value_present(doc.get("guildId"))}
    role_ids = set()
    role_owners: dict[str, str] = {}
    account_user_ids = set()
    issues: list[dict[str, Any]] = []
    for account in accounts:
        roles = account.get("roles")
        if not isinstance(roles, list):
            issues.append({"kind": "account_roles_not_array", "ref": short_ref(account)})
            continue
        for role in roles:
            if not isinstance(role, Mapping):
                issues.append({"kind": "account_role_not_object", "ref": short_ref(account)})
                continue
            if value_present(role.get("roleId")):
                role_id = str(role["roleId"])
                previous_owner = role_owners.get(role_id)
                owner = str(role.get("userId") or short_ref(account))
                if previous_owner is not None and previous_owner != owner:
                    issues.append({"kind": "role_id_multiple_owners", "roleId": role_id, "owners": [previous_owner, owner]})
                role_owners[role_id] = owner
                role_ids.add(role_id)
            if value_present(role.get("userId")):
                account_user_ids.add(str(role["userId"]))
    for player in players:
        guild_info = player.get("guildInfo")
        if isinstance(guild_info, Mapping) and value_present(guild_info.get("guildId")) and str(guild_info.get("guildId")) not in {"0", "-1"}:
            if str(guild_info.get("guildId")) not in guild_ids:
                issues.append({"kind": "player_guild_missing", "player": short_ref(player), "guildId": guild_info.get("guildId")})
    for guild in guilds:
        leader = guild.get("leaderId")
        if value_present(leader) and str(leader) not in user_ids:
            issues.append({"kind": "guild_leader_missing", "guild": short_ref(guild), "userId": leader})
        for field in ("members", "applications"):
            entries = guild.get(field)
            if not isinstance(entries, list):
                continue
            for entry in entries:
                if not isinstance(entry, Mapping):
                    issues.append({"kind": "guild_entry_not_object", "guild": short_ref(guild), "field": field})
                    continue
                if value_present(entry.get("userId")) and str(entry.get("userId")) not in user_ids:
                    issues.append({"kind": "guild_user_missing", "guild": short_ref(guild), "userId": entry.get("userId")})
                for id_field in ("playerId", "playerid"):
                    if value_present(entry.get(id_field)) and str(entry.get(id_field)) not in player_ids:
                        issues.append({"kind": "guild_player_missing", "guild": short_ref(guild), "playerId": entry.get(id_field)})
    for mail in mails:
        if value_present(mail.get("userId")) and str(mail.get("userId")) not in user_ids and str(mail.get("userId")) not in account_user_ids:
            issues.append({"kind": "mail_recipient_missing", "mail": short_ref(mail), "userId": mail.get("userId")})
    for account in accounts:
        active = account.get("activeRoleByServer")
        if not isinstance(active, Mapping):
            continue
        for server_key, role_id in active.items():
            if value_present(role_id) and str(role_id) not in role_ids:
                issues.append({"kind": "active_role_missing", "account": short_ref(account), "serverId": server_key, "roleId": role_id})
    return {
        "status": "pass" if not issues else "blocked",
        "players": len(players),
        "guilds": len(guilds),
        "mails": len(mails),
        "accounts": len(accounts),
        "issues": issues[:5000],
        "issueCount": len(issues),
    }


def cached_power(document: Mapping[str, Any]) -> int | None:
    for field in ("displayPower", "power", "powerScore"):
        value = document.get(field)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return int(value)
    role_info = document.get("roleInfo")
    if isinstance(role_info, Mapping):
        for field in ("power", "displayPower", "powerScore"):
            value = role_info.get(field)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                return int(value)
    return None


def dry_run(manifest: dict[str, Any], snapshot_root: Path) -> dict[str, Any]:
    if not snapshot_root.exists() or not snapshot_root.is_dir():
        raise MergeToolError(f"snapshot-dir không tồn tại: {snapshot_root}")
    records, metadata = collect_records(manifest, snapshot_root)
    conflicts = list(metadata["nameConflicts"])
    conflicts.extend(collision_report(manifest, records))
    unknown = metadata["unknown"]
    policy = manifest.get("policy", {})
    if unknown and not policy.get("allowUnknownCollections", False):
        conflicts.extend(
            {
                "kind": item["kind"],
                "key": item.get("collection") or item.get("database"),
                "sources": [item],
                "decision": "quarantine",
                "status": "unresolved",
            }
            for item in unknown
        )
    source_hashes: dict[str, str] = {}
    databases = {str(row["database"]) for row in manifest.get("sourceServers", [])}
    databases.add(str(manifest["identityDatabase"]))
    for database in sorted(databases):
        source_hashes[database] = directory_digest(snapshot_root / database)
    before_power: list[dict[str, Any]] = []
    for row in records:
        if row["canonicalCollection"] == "players":
            before_power.append(
                {
                    "serverId": row.get("sourceServerId"),
                    "playerRef": row["sourceId"],
                    "beforeCached": cached_power(row["document"]),
                    "afterCached": cached_power(row["document"]),
                    "deltaCached": 0,
                }
            )
    unresolved = [item for item in conflicts if item.get("status") == "unresolved"]
    unknown_status = "blocked" if unknown and not policy.get("allowUnknownCollections", False) else "ok"
    power_status = "pending_native_readback" if policy.get("requireNativePowerReadback", True) else "cached_only"
    planned_output: dict[tuple[str, str], list[dict[str, Any]]] = {}
    planned_economy = None
    planned_counts: dict[str, int] = {}
    reference = {"status": "pending", "issues": [], "issueCount": None}
    if not unresolved and not (unknown and not policy.get("allowUnknownCollections", False)):
        planned_output = build_output_records(manifest, snapshot_root)
        planned_economy = aggregate_output_economy(planned_output)
        planned_counts = output_counts(planned_output)
        reference = reference_audit(manifest, planned_output)
        if reference.get("status") != "pass":
            conflicts.extend(
                {
                    "kind": issue.get("kind", "reference_integrity"),
                    "key": issue.get("player") or issue.get("guild") or issue.get("mail") or issue.get("account"),
                    "sources": [issue],
                    "decision": "quarantine",
                    "status": "unresolved",
                }
                for issue in reference.get("issues", [])
            )
            unresolved = [item for item in conflicts if item.get("status") == "unresolved"]
    raw_economy = aggregate_economy(records)
    economy = {
        "status": "pass" if planned_economy is not None and not unresolved else "blocked",
        "rawSource": raw_economy,
        "plannedOutput": planned_economy,
        "dedupeAdjustment": {
            "recordsRead": len(records),
            "recordsPlanned": sum(planned_counts.values()),
            "exactDedupedRecords": max(0, len(records) - sum(planned_counts.values())),
        },
    }
    expected_refs = [
        {"serverId": row.get("serverId"), "playerRef": row["playerRef"]}
        for row in before_power
    ]
    report: dict[str, Any] = {
        "schemaVersion": REPORT_SCHEMA,
        "toolVersion": TOOL_VERSION,
        "generatedAt": utc_now(),
        "mergeId": manifest["mergeId"],
        "planHash": plan_hash(manifest),
        "snapshotRoot": str(snapshot_root),
        "sourceDirectoryHashes": source_hashes,
        "productionWrites": 0,
        "networkAttempts": 0,
        "writes": 0,
        "unknown": unknown,
        "conflicts": conflicts,
        "recordsRead": len(records),
        "recordsPlanned": sum(planned_counts.values()) if planned_counts else max(0, len(records) - len(unresolved)),
        "expectedCounts": planned_counts,
        "expectedPlayerRefs": expected_refs,
        "nameMapping": {f"{server}:{name}": value for (server, name), value in metadata["nameMapping"].items()},
        "powerInvariant": {
            "formula": "native BattleService.calcPlayerPower + ArenaReadModelService.displayPower",
            "status": power_status,
            "playersChecked": len(before_power),
            "negativeDeltaCount": None,
            "cachedSamples": before_power[:5000],
            "readbackRequired": bool(policy.get("requireNativePowerReadback", True)),
        },
        "economyInvariant": economy,
        "referenceInvariant": reference,
        "sourceUnchangedRequired": True,
        "status": "blocked" if unresolved or (unknown and unknown_status == "blocked") else "ready_pending_power",
        "nextGate": "native_power_readback + backup/restore rehearsal + maintenance token",
    }
    report["reportHash"] = sha256_json(report)
    manifest["conflicts"] = conflicts
    manifest["preconditions"]["sourceHashes"] = source_hashes
    manifest["powerInvariant"] = report["powerInvariant"]
    manifest["economyInvariant"] = report["economyInvariant"]
    manifest["status"] = report["status"]
    manifest["planHash"] = plan_hash(manifest)
    # A report's plan hash must be computed after manifest updates.  Keep both
    # values explicit so a tampered report cannot be used for apply.
    report["planHash"] = manifest["planHash"]
    report["reportHash"] = sha256_json({key: value for key, value in report.items() if key != "reportHash"})
    return report


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise MergeToolError(f"manifest không hợp lệ: {path}: {exc}") from exc
    if not isinstance(value, dict) or value.get("schemaVersion") != MANIFEST_SCHEMA:
        raise MergeToolError("manifest thiếu schemaVersion được hỗ trợ")
    supplied = value.get("planHash")
    if supplied and supplied != plan_hash(value):
        raise MergeToolError("manifest planHash không khớp nội dung; dừng để tránh chạy nhầm")
    return value


def load_report(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise MergeToolError(f"dry-run report không hợp lệ: {path}: {exc}") from exc
    if not isinstance(value, dict) or value.get("schemaVersion") != REPORT_SCHEMA:
        raise MergeToolError("report thiếu schemaVersion được hỗ trợ")
    supplied = value.get("reportHash")
    if supplied and supplied != sha256_json({key: item for key, item in value.items() if key != "reportHash"}):
        raise MergeToolError("reportHash không khớp nội dung; không dùng report đã sửa")
    return value


def read_native_power_report(path: Path | None, expected_refs: Sequence[Mapping[str, Any]] | None = None) -> dict[str, Any] | None:
    if path is None:
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise MergeToolError(f"native power report không hợp lệ: {exc}") from exc
    if not isinstance(value, dict):
        raise MergeToolError("native power report phải là object")
    supplied_hash = value.get("reportHash")
    if supplied_hash and supplied_hash != sha256_json({key: item for key, item in value.items() if key != "reportHash"}):
        raise MergeToolError("native power reportHash không khớp nội dung")
    rows = value.get("players")
    if not isinstance(rows, list):
        raise MergeToolError("native power report cần mảng players")
    negatives = []
    score_negatives = []
    attribute_mismatches = []
    actual_keys: set[tuple[str, str]] = set()
    for row in rows:
        if not isinstance(row, dict):
            raise MergeToolError("native power report có row không phải object")
        before = row.get("before")
        after = row.get("after")
        if not value_present(row.get("playerRef")):
            raise MergeToolError("native power report cần playerRef cho mọi player")
        key = (str(row.get("serverId", "")), str(row.get("playerRef")))
        if key in actual_keys:
            raise MergeToolError(f"native power report trùng playerRef: {key}")
        actual_keys.add(key)
        if isinstance(before, bool) or isinstance(after, bool) or not isinstance(before, (int, float)) or not isinstance(after, (int, float)):
            raise MergeToolError("native power report cần before/after số cho mọi player")
        if not value_present(row.get("attrsHashBefore")) or not value_present(row.get("attrsHashAfter")):
            raise MergeToolError("native power report cần attrsHashBefore/attrsHashAfter cho mọi player")
        if after < before:
            negatives.append(row)
        score_before = row.get("beforePowerScore")
        score_after = row.get("afterPowerScore")
        if score_before is not None or score_after is not None:
            if isinstance(score_before, bool) or isinstance(score_after, bool) or not isinstance(score_before, (int, float)) or not isinstance(score_after, (int, float)):
                raise MergeToolError("native power report before/afterPowerScore phải là số")
            if score_after < score_before:
                score_negatives.append(row)
        if row.get("attrsHashBefore") is not None and row.get("attrsHashAfter") is not None and row.get("attrsHashBefore") != row.get("attrsHashAfter"):
            attribute_mismatches.append(row)
    if expected_refs is not None:
        expected_keys = {(str(row.get("serverId", "")), str(row.get("playerRef"))) for row in expected_refs}
        if actual_keys != expected_keys:
            missing = sorted(expected_keys - actual_keys)[:10]
            extra = sorted(actual_keys - expected_keys)[:10]
            raise MergeToolError(f"native power coverage không khớp; missing={missing}, extra={extra}")
    value["negativeDeltaCount"] = len(negatives)
    value["maxNegativeDelta"] = min((float(row["after"]) - float(row["before"]) for row in negatives), default=0)
    value["powerScoreNegativeDeltaCount"] = len(score_negatives)
    value["attributeMismatchCount"] = len(attribute_mismatches)
    value["status"] = "pass" if not negatives and not score_negatives else "blocked"
    return value


def build_native_power_input(manifest: Mapping[str, Any], source_root: Path, target_root: Path, config_path: Path, runtime_root: Path | None) -> dict[str, Any]:
    source_players: list[dict[str, Any]] = []
    source_servers: dict[str, int] = {}
    source_report_refs: dict[str, str] = {}
    for source in manifest.get("sourceServers", []):
        server_id = int(source["serverId"])
        database = str(source["database"])
        for collection, docs in load_database_snapshot(source_root, database).items():
            if normalise_collection_name(collection) != "players":
                continue
            for doc in docs:
                if not isinstance(doc, dict):
                    raise MergeToolError(f"player snapshot không phải object: {database}/{collection}")
                report_ref = short_ref(doc)
                worker_ref = str(doc.get("playerId") or doc.get("userId") or doc.get("_id") or "")
                if not worker_ref or worker_ref in source_servers:
                    raise MergeToolError(f"trùng playerRef trước native power: {report_ref or worker_ref}")
                source_servers[worker_ref] = server_id
                source_report_refs[worker_ref] = report_ref
                source_players.append(copy.deepcopy(doc))
    target_db = str(manifest["target"]["database"])
    target_players: list[dict[str, Any]] = []
    for collection, docs in load_database_snapshot(target_root, target_db).items():
        if normalise_collection_name(collection) == "players":
            target_players.extend(copy.deepcopy(doc) for doc in docs)
    if not source_players or not target_players:
        raise MergeToolError("native power cần player snapshot trước và sau không rỗng")
    return {
        "clock": int(dt.datetime.now(dt.timezone.utc).timestamp() * 1000),
        "sourceRoot": str(runtime_root) if runtime_root else None,
        "configPath": str(config_path),
        "playersBefore": source_players,
        "playersAfter": target_players,
        "sourceHash": sha256_json(current_source_directory_hashes(manifest, source_root)),
        "configHash": file_sha256(config_path),
        "buildHash": TOOL_VERSION,
        "sourceServerByPlayerRef": source_servers,
        "sourceReportRefByWorkerId": source_report_refs,
    }


def command_native_power(args: argparse.Namespace) -> int:
    manifest = load_manifest(Path(args.manifest))
    report = load_report(Path(args.report))
    if report.get("status") == "blocked":
        raise MergeToolError("dry-run report còn conflict; không tính native power cho kế hoạch bị block")
    source_root = Path(args.source_snapshot_dir)
    target_root = Path(args.target_snapshot_dir)
    config_path = Path(args.config_path)
    if not config_path.exists():
        raise MergeToolError(f"config binary không tồn tại: {config_path}")
    if report.get("sourceDirectoryHashes") != current_source_directory_hashes(manifest, source_root):
        raise MergeToolError("source snapshot đã drift so với dry-run trước native power")
    actual_target_counts: dict[str, int] = {}
    for database in {str(manifest["target"]["database"]), str(manifest["identityDatabase"])}:
        info = inventory_database(target_root, database)
        for row in info.get("collections", {}).values():
            row_rule = rule_for(row["canonical"])
            output_name = row_rule.canonical if row_rule else row["canonical"]
            actual_target_counts[f"{database}:{output_name}"] = int(row["count"])
    if actual_target_counts != dict(report.get("expectedCounts") or {}):
        raise MergeToolError("target staging counts khác expectedCounts của dry-run")
    runtime_root = Path(args.runtime_root) if args.runtime_root else None
    payload = build_native_power_input(manifest, source_root, target_root, config_path, runtime_root)
    node = args.node or shutil.which("node")
    if not node:
        raise MergeToolError("không tìm thấy node để chạy native power worker")
    worker = Path(__file__).with_name("server_merge_native_power.js")
    if not worker.exists():
        raise MergeToolError(f"native power worker không tồn tại: {worker}")
    try:
        completed = subprocess.run(
            [node, str(worker)],
            input=json.dumps(payload, ensure_ascii=False),
            text=True,
            capture_output=True,
            check=False,
            timeout=max(10, int(args.timeout_seconds)),
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise MergeToolError(f"native power worker không chạy được: {exc}") from exc
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise MergeToolError(f"native power worker fail-closed: {detail[:1000]}")
    try:
        native = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise MergeToolError(f"native power worker trả JSON lỗi: {exc}") from exc
    if not isinstance(native, dict) or native.get("ok") is not True:
        raise MergeToolError("native power worker không trả ok=true")
    server_by_ref = payload["sourceServerByPlayerRef"]
    report_ref_by_worker_id = payload["sourceReportRefByWorkerId"]
    players = []
    for row in native.get("rows", []):
        worker_ref = str(row.get("id") or "")
        if not worker_ref or worker_ref not in server_by_ref:
            raise MergeToolError(f"native power thiếu mapping server cho {worker_ref}")
        player_ref = report_ref_by_worker_id[worker_ref]
        players.append({
            "serverId": server_by_ref[worker_ref],
            "playerRef": player_ref,
            "before": row.get("beforeDisplayPower"),
            "after": row.get("displayPower"),
            "beforePowerScore": row.get("beforePowerScore"),
            "afterPowerScore": row.get("powerScore"),
            "attrsHashBefore": row.get("attrsHashBefore"),
            "attrsHashAfter": row.get("attrsHashAfter"),
        })
    native_summary = {
        key: native.get(key)
        for key in ("ok", "mode", "evaluatedAt", "count", "ids", "inputHashes", "coordinatorHashes", "outputHash", "writes", "networkAttempts", "databaseAttempts", "sourceRoot", "configPath")
    }
    value = {
        "schemaVersion": 1,
        "mergeId": manifest["mergeId"],
        "planHash": manifest["planHash"],
        "players": players,
        "nativeWorkerSummary": native_summary,
        "productionWrites": native.get("writes", 0),
        "networkAttempts": native.get("networkAttempts", 0),
        "databaseAttempts": native.get("databaseAttempts", 0),
    }
    value["reportHash"] = sha256_json(value)
    write_json(Path(args.out), value, overwrite=False)
    checked = read_native_power_report(Path(args.out), report.get("expectedPlayerRefs", []))
    if checked.get("status") != "pass" or (manifest.get("policy", {}).get("requireAttributeHashEquality", True) and checked.get("attributeMismatchCount", 1) != 0):
        raise MergeToolError("native power delta âm hoặc coverage không đủ")
    print(json.dumps({"status": "pass", "out": args.out, "players": len(players), "productionWrites": value["productionWrites"], "networkAttempts": value["networkAttempts"]}, ensure_ascii=False))
    return 0


def backup_snapshot(manifest: dict[str, Any], snapshot_root: Path, destination: Path, restore_test: Path | None) -> dict[str, Any]:
    if not snapshot_root.exists() or not snapshot_root.is_dir():
        raise MergeToolError(f"snapshot-dir không tồn tại: {snapshot_root}")
    source_abs = snapshot_root.resolve()
    destination_abs = destination.resolve()
    if destination_abs == source_abs or destination_abs.is_relative_to(source_abs):
        raise MergeToolError("backup destination không được nằm trong snapshot-dir nguồn")
    if restore_test is not None:
        restore_abs = restore_test.resolve()
        if restore_abs == source_abs or restore_abs.is_relative_to(source_abs) or restore_abs == destination_abs or restore_abs.is_relative_to(destination_abs):
            raise MergeToolError("restore-test không được nằm trong nguồn hoặc backup destination")
    if destination.exists():
        raise MergeToolError(f"backup destination đã tồn tại, không ghi đè: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(snapshot_root, destination)
    hashes = directory_file_hashes(destination)
    backup_meta: dict[str, Any] = {
        "mergeId": manifest["mergeId"],
        "planHash": manifest.get("planHash"),
        "createdAt": utc_now(),
        "source": str(snapshot_root),
        "destination": str(destination),
        "sourceDirectoryHashes": current_source_directory_hashes(manifest, snapshot_root),
        "fileCount": len(hashes),
        "files": hashes,
        "archiveSha256": sha256_json(hashes),
        "restoreTest": None,
    }
    if restore_test is not None:
        if restore_test.exists():
            raise MergeToolError(f"restore-test destination đã tồn tại, không ghi đè: {restore_test}")
        shutil.copytree(destination, restore_test)
        restored_hashes = directory_file_hashes(restore_test)
        if restored_hashes != hashes:
            raise MergeToolError("restore rehearsal hash mismatch")
        backup_meta["restoreTest"] = {"path": str(restore_test), "status": "pass", "archiveSha256": sha256_json(restored_hashes)}
    write_json(destination / "backup_manifest.json", backup_meta, overwrite=False)
    manifest["backup"] = {
        "status": "restore_pass" if restore_test is not None else "backup_only",
        "path": str(destination),
        "restoreTest": backup_meta["restoreTest"],
        "archiveSha256": backup_meta["archiveSha256"],
    }
    return backup_meta


def load_backup_manifest(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise MergeToolError(f"backup manifest không hợp lệ: {exc}") from exc
    if not isinstance(value, dict) or not isinstance(value.get("files"), Mapping):
        raise MergeToolError("backup manifest thiếu files")
    if value.get("archiveSha256") != sha256_json(value["files"]):
        raise MergeToolError("backup archiveSha256 không khớp danh sách file")
    destination = Path(str(value.get("destination") or ""))
    if not destination.exists():
        raise MergeToolError("backup destination không tồn tại")
    for relative, expected_hash in value["files"].items():
        file_path = destination / str(relative)
        if not file_path.exists() or file_sha256(file_path) != expected_hash:
            raise MergeToolError(f"backup file hash không khớp: {relative}")
    restore = value.get("restoreTest")
    if isinstance(restore, Mapping) and restore.get("status") == "pass":
        restore_path = Path(str(restore.get("path") or ""))
        if not restore_path.exists():
            raise MergeToolError("restore rehearsal path không tồn tại")
        for relative, expected_hash in value["files"].items():
            file_path = restore_path / str(relative)
            if not file_path.exists() or file_sha256(file_path) != expected_hash:
                raise MergeToolError(f"restore rehearsal hash không khớp: {relative}")
    return value


def token_ok(path: Path, expected: str) -> bool:
    try:
        token = path.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise MergeToolError(f"không đọc được maintenance token: {exc}") from exc
    return token == expected


def current_source_directory_hashes(manifest: Mapping[str, Any], snapshot_root: Path) -> dict[str, str]:
    databases = {str(row["database"]) for row in manifest.get("sourceServers", [])}
    databases.add(str(manifest["identityDatabase"]))
    return {database: directory_digest(snapshot_root / safe_database_name(database)) for database in sorted(databases)}


def ensure_apply_gates(
    manifest: Mapping[str, Any],
    report: Mapping[str, Any],
    power_report: Mapping[str, Any] | None,
    backup_meta: Mapping[str, Any] | None,
    plan_confirm: str,
    token_file: Path,
    acknowledge_writes: bool,
    snapshot_root: Path,
) -> None:
    merge_id = str(manifest["mergeId"])
    if plan_confirm != f"APPLY:{merge_id}":
        raise MergeToolError(f"confirm phải đúng APPLY:{merge_id}")
    if not token_ok(token_file, f"MERGE-READY:{merge_id}"):
        raise MergeToolError(f"maintenance token phải chứa MERGE-READY:{merge_id}")
    if not acknowledge_writes:
        raise MergeToolError("apply cần --i-understand-staging-writes; chưa có production write")
    if report.get("planHash") != manifest.get("planHash"):
        raise MergeToolError("dry-run report không cùng planHash với manifest")
    expected_source_hashes = report.get("sourceDirectoryHashes")
    if not isinstance(expected_source_hashes, Mapping):
        raise MergeToolError("dry-run thiếu sourceDirectoryHashes")
    actual_source_hashes = current_source_directory_hashes(manifest, snapshot_root)
    if dict(expected_source_hashes) != actual_source_hashes:
        raise MergeToolError("snapshot nguồn đã drift sau dry-run; cần inventory/dry-run lại")
    if report.get("unknown"):
        raise MergeToolError("dry-run có collection/record unknown; không được apply kể cả khi allowUnknownCollections")
    economy = report.get("economyInvariant")
    if not isinstance(economy, Mapping) or economy.get("status") != "pass":
        raise MergeToolError("economy invariant chưa PASS")
    references = report.get("referenceInvariant")
    if not isinstance(references, Mapping) or references.get("status") != "pass":
        raise MergeToolError("reference invariant chưa PASS")
    if report.get("status") == "blocked":
        raise MergeToolError("dry-run còn conflict unresolved; không được apply")
    if any(item.get("status") == "unresolved" for item in report.get("conflicts", [])):
        raise MergeToolError("dry-run còn conflict unresolved; không được apply")
    if manifest.get("policy", {}).get("requireNativePowerReadback", True):
        if power_report is None or power_report.get("status") != "pass" or power_report.get("negativeDeltaCount", 1) != 0 or power_report.get("powerScoreNegativeDeltaCount", 1) != 0:
            raise MergeToolError("thiếu native power read-back PASS hoặc có delta âm")
        if not power_report.get("reportHash"):
            raise MergeToolError("native power report thiếu reportHash")
        if manifest.get("policy", {}).get("requireAttributeHashEquality", True) and power_report.get("attributeMismatchCount", 1) != 0:
            raise MergeToolError("native power attrs hash thay đổi; không chứng minh được toàn vẹn lực chiến")
        if any(int(power_report.get(field, 0) or 0) != 0 for field in ("productionWrites", "networkAttempts", "databaseAttempts")):
            raise MergeToolError("native power worker báo có side effect/network/database attempt")
        if power_report.get("mergeId") != manifest.get("mergeId"):
            raise MergeToolError("native power report không cùng mergeId")
        if power_report.get("planHash") != manifest.get("planHash"):
            raise MergeToolError("native power report không cùng planHash")
    if manifest.get("policy", {}).get("requireRestoreRehearsal", True):
        if not backup_meta or backup_meta.get("restoreTest", {}).get("status") != "pass":
            raise MergeToolError("backup chưa có restore rehearsal PASS")
        if backup_meta.get("mergeId") != manifest.get("mergeId") or backup_meta.get("planHash") != manifest.get("planHash"):
            raise MergeToolError("backup không cùng mergeId/planHash")
        if backup_meta.get("sourceDirectoryHashes") != dict(expected_source_hashes):
            raise MergeToolError("backup không cùng source hash của dry-run")


def build_output_records(manifest: Mapping[str, Any], snapshot_root: Path) -> dict[tuple[str, str], list[dict[str, Any]]]:
    records, metadata = collect_records(manifest, snapshot_root)
    conflicts = collision_report(manifest, records)
    unresolved = [item for item in metadata["nameConflicts"] + conflicts if item.get("status") == "unresolved"]
    if unresolved:
        raise MergeToolError("không thể materialise vì còn conflict unresolved")
    if metadata["unknown"] and not manifest.get("policy", {}).get("allowUnknownCollections", False):
        raise MergeToolError("không thể materialise vì có collection/record chưa biết")
    result: dict[tuple[str, str], list[dict[str, Any]]] = {}
    seen: dict[tuple[str, str, tuple[str, ...]], dict[str, Any]] = {}
    for row in records:
        canonical = str(row["canonicalCollection"])
        collection = str(row["sourceCollection"])
        rule = rule_for(canonical)
        keys = collision_key(rule, row["document"]) if rule else []
        duplicate = False
        for field_name, key in keys:
            identity = (canonical, field_name, key)
            previous = seen.get(identity)
            if previous is not None:
                if document_hash(previous["document"]) == document_hash(row["document"]):
                    duplicate = True
                    continue
                raise MergeToolError(f"collision chưa xử lý {canonical}:{field_name}={key}")
            seen[identity] = row
        if duplicate:
            continue
        output_database = str(manifest["identityDatabase"] if (row.get("identity") or (rule and rule.identity)) else manifest["target"]["database"])
        output_collection = rule.canonical if rule else collection
        result.setdefault((output_database, output_collection), []).append(row["document"])
    return result


def write_materialised_snapshot(
    manifest: dict[str, Any],
    snapshot_root: Path,
    target_root: Path,
    journal_path: Path,
    resume: bool = False,
) -> dict[str, Any]:
    records_by_file = build_output_records(manifest, snapshot_root)
    source_abs = snapshot_root.resolve()
    target_abs = target_root.resolve()
    if target_abs == source_abs or target_abs.is_relative_to(source_abs):
        raise MergeToolError("target-snapshot-dir không được nằm trong snapshot-dir nguồn")
    if journal_path.resolve() == target_abs or journal_path.resolve().is_relative_to(target_abs):
        raise MergeToolError("journal không được nằm trong target-snapshot-dir")
    if target_root.exists() and not resume:
        raise MergeToolError(f"target-snapshot-dir đã tồn tại; dùng resume nếu là apply dở: {target_root}")
    target_root.mkdir(parents=True, exist_ok=True)
    journal: dict[str, Any] = {
        "schemaVersion": 1,
        "mergeId": manifest["mergeId"],
        "planHash": manifest["planHash"],
        "createdAt": utc_now(),
        "status": "running",
        "targetRoot": str(target_root),
        "receipts": [],
    }
    if resume and journal_path.exists():
        try:
            old = json.loads(journal_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise MergeToolError(f"journal resume không hợp lệ: {exc}") from exc
        if old.get("mergeId") != manifest["mergeId"] or old.get("planHash") != manifest["planHash"]:
            raise MergeToolError("journal không cùng mergeId/planHash")
        if Path(str(old.get("targetRoot") or "")).resolve() != target_abs:
            raise MergeToolError("journal targetRoot không khớp target-snapshot-dir; từ chối resume nhầm đích")
        journal = old
    receipt_index = {(item.get("file"), item.get("sha256")) for item in journal.get("receipts", [])}
    for (database, collection), documents in sorted(records_by_file.items()):
        destination_dir = target_root / database
        destination_dir.mkdir(parents=True, exist_ok=True)
        destination = destination_dir / f"{collection}.jsonl"
        content = "".join(canonical_json(doc) + "\n" for doc in documents).encode("utf-8")
        digest = sha256_bytes(content)
        relative = str(destination.relative_to(target_root)).replace("\\", "/")
        if (relative, digest) in receipt_index and destination.exists() and file_sha256(destination) == digest:
            continue
        if destination.exists() and file_sha256(destination) != digest:
            raise MergeToolError(f"resume phát hiện file đích khác hash: {destination}")
        temporary = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
        temporary.write_bytes(content)
        os.replace(temporary, destination)
        receipt = {
            "mergeId": manifest["mergeId"],
            "collection": collection,
            "database": database,
            "file": relative,
            "sha256": digest,
            "count": len(documents),
            "status": "applied",
            "appliedAt": utc_now(),
        }
        journal.setdefault("receipts", []).append(receipt)
        write_json(journal_path, journal)
    journal["status"] = "done"
    journal["completedAt"] = utc_now()
    journal["targetDigest"] = directory_digest(target_root)
    write_json(journal_path, journal)
    manifest["mode"] = "apply-staging"
    manifest["status"] = "applied-staging"
    manifest["checkpoints"] = journal["receipts"]
    return journal


def verify_materialised_snapshot(
    manifest: Mapping[str, Any],
    target_root: Path,
    power_report: Mapping[str, Any] | None,
    expected_report: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    if not target_root.exists():
        raise MergeToolError(f"target snapshot không tồn tại: {target_root}")
    # Verify is deliberately conservative: the target is inspected as a
    # single canonical DB (plus the shared identity DB), so source-server
    # collection names are optional and no source document is rewritten.
    target_db = str(manifest["target"]["database"])
    databases = {target_db, str(manifest["identityDatabase"])}
    target_docs: dict[str, list[dict[str, Any]]] = {}
    target_rows: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []
    target_counts: dict[str, int] = {}
    for database in sorted(databases):
        for name, docs in load_database_snapshot(target_root, database).items():
            target_docs[f"{database}:{name}"] = docs
            target_counts[f"{database}:{name}"] = len(docs)
            if rule_for(name) is None:
                unresolved.append({"kind": "unknown_collection", "database": database, "collection": name, "count": len(docs)})
            for index, doc in enumerate(docs):
                if not isinstance(doc, dict):
                    unresolved.append({"kind": "invalid_document", "database": database, "collection": name, "index": index})
                else:
                    target_rows.append({
                        "sourceServerId": None,
                        "sourceDatabase": database,
                        "sourceCollection": name,
                        "canonicalCollection": normalise_collection_name(name),
                        "sourceId": short_ref(doc),
                        "sourceHash": document_hash(doc),
                        "document": doc,
                    })
    target_collision = collision_report(manifest, target_rows)
    unresolved.extend(item for item in target_collision if item.get("status") == "unresolved")
    power = dict(power_report or {"status": "pending", "negativeDeltaCount": None})
    expected_counts_raw = (expected_report or {}).get("expectedCounts") if expected_report is not None else None
    expected_counts = dict(expected_counts_raw or {})
    expected_economy = (expected_report or {}).get("economyInvariant", {}).get("plannedOutput")
    actual_output: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for (database_collection, docs) in target_docs.items():
        database, collection = database_collection.split(":", 1)
        actual_output[(database, collection)] = docs
    actual_economy = aggregate_output_economy(actual_output)
    expected_available = expected_report is not None and expected_report.get("planHash") == manifest.get("planHash")
    counts_match = bool(expected_available and expected_counts_raw is not None and target_counts == expected_counts)
    economy_match = bool(expected_available and expected_economy is not None and actual_economy == expected_economy)
    expected_power_keys = {
        (str(row.get("serverId", "")), str(row.get("playerRef")))
        for row in (expected_report or {}).get("expectedPlayerRefs", [])
    }
    actual_power_keys = {
        (str(row.get("serverId", "")), str(row.get("playerRef")))
        for row in power.get("players", [])
        if isinstance(row, Mapping)
    }
    power_coverage_match = bool(expected_available and actual_power_keys == expected_power_keys)
    power_side_effect_free = all(int(power.get(field, 0) or 0) == 0 for field in ("productionWrites", "networkAttempts", "databaseAttempts"))
    actual_reference = reference_audit(manifest, actual_output)
    reference_match = actual_reference.get("status") == "pass"
    attribute_hash_ok = not manifest.get("policy", {}).get("requireAttributeHashEquality", True) or power.get("attributeMismatchCount", 1) == 0
    status = "pass" if not unresolved and counts_match and economy_match and reference_match and power_coverage_match and power_side_effect_free and attribute_hash_ok and power.get("status") == "pass" and power.get("negativeDeltaCount", 1) == 0 and power.get("powerScoreNegativeDeltaCount", 1) == 0 else "blocked"
    result = {
        "schemaVersion": REPORT_SCHEMA,
        "toolVersion": TOOL_VERSION,
        "verifiedAt": utc_now(),
        "mergeId": manifest["mergeId"],
        "planHash": manifest.get("planHash"),
        "targetRoot": str(target_root),
        "targetDigest": directory_digest(target_root),
        "targetCounts": target_counts,
        "expectedCounts": expected_counts,
        "expectedAvailable": expected_available,
        "countsMatch": counts_match,
        "actualEconomy": actual_economy,
        "expectedEconomy": expected_economy,
        "economyMatch": economy_match,
        "referenceInvariant": actual_reference,
        "referenceMatch": reference_match,
        "unknown": unresolved,
        "powerInvariant": power,
        "powerCoverageMatch": power_coverage_match,
        "powerSideEffectFree": power_side_effect_free,
        "attributeHashMatch": attribute_hash_ok,
        "productionWrites": 0,
        "status": status,
    }
    result["reportHash"] = sha256_json(result)
    return result


def rollback_staging(
    manifest: Mapping[str, Any],
    journal_path: Path,
    target_snapshot_dir: Path,
    restore_to: Path,
    confirm: str,
    reason: str,
) -> dict[str, Any]:
    merge_id = str(manifest["mergeId"])
    if confirm != f"ROLLBACK:{merge_id}":
        raise MergeToolError(f"confirm phải đúng ROLLBACK:{merge_id}")
    if not reason.strip():
        raise MergeToolError("rollback cần reason")
    if not journal_path.exists():
        raise MergeToolError("chưa có journal; không có gì để rollback")
    journal = json.loads(journal_path.read_text(encoding="utf-8"))
    if journal.get("mergeId") != merge_id or journal.get("planHash") != manifest.get("planHash"):
        raise MergeToolError("journal không cùng mergeId/planHash với manifest")
    target = Path(str(journal.get("targetRoot") or ""))
    if target.resolve() != target_snapshot_dir.resolve():
        raise MergeToolError("journal targetRoot không khớp target-snapshot-dir")
    if not target.exists():
        raise MergeToolError("target snapshot không tồn tại; giữ nguyên journal để điều tra")
    if restore_to.exists():
        raise MergeToolError(f"restore-to đã tồn tại, không ghi đè: {restore_to}")
    target_abs = target.resolve()
    restore_abs = restore_to.resolve()
    if restore_abs == target_abs or restore_abs.is_relative_to(target_abs):
        raise MergeToolError("restore-to không được nằm trong target lỗi")
    # Never delete the failed target.  Copy it aside so the incident remains
    # recoverable; a human can choose a separately restored backup afterwards.
    shutil.copytree(target, restore_to)
    result = {
        "schemaVersion": 1,
        "mergeId": merge_id,
        "rollbackRequestedAt": utc_now(),
        "reason": reason,
        "failedTargetPreserved": str(target),
        "preservedCopy": str(restore_to),
        "status": "preserved-for-review",
        "productionWrites": 0,
    }
    write_json(restore_to / "rollback_receipt.json", result, overwrite=False)
    return result


def command_inventory(args: argparse.Namespace) -> int:
    manifest = make_manifest(args)
    manifest = inventory_manifest(manifest, Path(args.snapshot_dir) if args.snapshot_dir else None)
    out = Path(args.out)
    write_json(out, manifest, overwrite=False)
    print(json.dumps({"status": manifest["status"], "manifest": str(out), "planHash": manifest["planHash"], "writes": 0}, ensure_ascii=False))
    return 0


def command_dry_run(args: argparse.Namespace) -> int:
    manifest_path = Path(args.manifest)
    manifest = load_manifest(manifest_path)
    snapshot_root = Path(args.snapshot_dir)
    report = dry_run(manifest, snapshot_root)
    # Keep the manifest as the source of truth, but never overwrite an
    # existing operator file implicitly.
    if args.update_manifest:
        write_json(manifest_path, manifest, overwrite=True)
    write_json(Path(args.out), report, overwrite=False)
    print(json.dumps({"status": report["status"], "report": args.out, "planHash": report["planHash"], "writes": 0, "conflicts": len(report["conflicts"])}, ensure_ascii=False))
    return 0


def command_backup(args: argparse.Namespace) -> int:
    manifest_path = Path(args.manifest)
    manifest = load_manifest(manifest_path)
    meta = backup_snapshot(manifest, Path(args.snapshot_dir), Path(args.destination), Path(args.restore_test) if args.restore_test else None)
    if args.update_manifest:
        write_json(manifest_path, manifest, overwrite=True)
    print(json.dumps({"status": "restore_pass" if meta["restoreTest"] else "backup_only", "destination": args.destination, "files": meta["fileCount"], "writes": 0}, ensure_ascii=False))
    return 0


def command_apply(args: argparse.Namespace, resume: bool = False) -> int:
    manifest = load_manifest(Path(args.manifest))
    report = load_report(Path(args.report))
    snapshot_root = Path(args.snapshot_dir)
    power = read_native_power_report(
        Path(args.native_power_report) if args.native_power_report else None,
        report.get("expectedPlayerRefs", []),
    )
    backup_meta = None
    if args.backup_manifest:
        backup_meta = load_backup_manifest(Path(args.backup_manifest))
    ensure_apply_gates(
        manifest,
        report,
        power,
        backup_meta,
        args.confirm,
        Path(args.maintenance_token_file),
        bool(args.i_understand_staging_writes),
        snapshot_root,
    )
    target_root = Path(args.target_snapshot_dir)
    journal_path = Path(args.journal)
    journal = write_materialised_snapshot(manifest, snapshot_root, target_root, journal_path, resume=resume)
    if args.update_manifest:
        write_json(Path(args.manifest), manifest, overwrite=True)
    print(json.dumps({"status": journal["status"], "targetSnapshot": str(target_root), "journal": str(journal_path), "receipts": len(journal.get("receipts", [])), "productionWrites": 0}, ensure_ascii=False))
    return 0


def command_verify(args: argparse.Namespace) -> int:
    manifest = load_manifest(Path(args.manifest))
    expected_report = load_report(Path(args.report))
    power = read_native_power_report(
        Path(args.native_power_report) if args.native_power_report else None,
        expected_report.get("expectedPlayerRefs", []),
    )
    result = verify_materialised_snapshot(manifest, Path(args.target_snapshot_dir), power, expected_report)
    write_json(Path(args.out), result, overwrite=False)
    print(json.dumps({"status": result["status"], "report": args.out, "productionWrites": 0}, ensure_ascii=False))
    return 0 if result["status"] == "pass" else 2


def command_rollback(args: argparse.Namespace) -> int:
    manifest = load_manifest(Path(args.manifest))
    result = rollback_staging(
        manifest,
        Path(args.journal),
        Path(args.target_snapshot_dir),
        Path(args.restore_to),
        args.confirm,
        args.reason,
    )
    write_json(Path(args.out), result, overwrite=False)
    print(json.dumps(result, ensure_ascii=False))
    return 0


def add_common_plan_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--root-server", required=True, help="server gốc/canonical, ví dụ 1001")
    parser.add_argument("--source-servers", required=True, help="danh sách server, phân cách bằng dấu phẩy")
    parser.add_argument("--target-server", help="ID đích; mặc định root-server")
    parser.add_argument("--db-prefix", default="lhs_s", help="prefix DB mặc định")
    parser.add_argument("--target-db")
    parser.add_argument("--identity-db")
    parser.add_argument("--server-map", help="JSON map serverId -> database/process/ports")
    parser.add_argument("--policy-file")
    parser.add_argument("--rename-suffix", help="bật rename deterministic, ví dụ '·S{serverId}'")
    parser.add_argument("--merge-id")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="server_merge_tool.py",
        description="Lập kế hoạch/gộp server an toàn; mặc định không ghi production.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    inventory = sub.add_parser("inventory", help="tạo manifest và inventory snapshot read-only")
    add_common_plan_args(inventory)
    inventory.add_argument("--snapshot-dir")
    inventory.add_argument("--out", required=True)
    inventory.set_defaults(func=command_inventory)

    plan = sub.add_parser("plan", help="alias của inventory không có snapshot")
    add_common_plan_args(plan)
    plan.add_argument("--out", required=True)
    plan.set_defaults(snapshot_dir=None, func=command_inventory)

    dry = sub.add_parser("dry-run", help="phân tích conflict, economy và mapping; không ghi DB")
    dry.add_argument("--manifest", required=True)
    dry.add_argument("--snapshot-dir", required=True)
    dry.add_argument("--out", required=True)
    dry.add_argument("--update-manifest", action="store_true", help="chỉ ghi manifest khi file đích chưa tồn tại")
    dry.set_defaults(func=command_dry_run)

    backup = sub.add_parser("backup", help="backup snapshot không ghi đè + restore rehearsal")
    backup.add_argument("--manifest", required=True)
    backup.add_argument("--snapshot-dir", required=True)
    backup.add_argument("--destination", required=True)
    backup.add_argument("--restore-test")
    backup.add_argument("--update-manifest", action="store_true")
    backup.set_defaults(func=command_backup)

    for name, help_text in (("apply", "materialise staging snapshot sau đủ safety gates"), ("resume", "tiếp tục staging apply theo journal")):
        apply = sub.add_parser(name, help=help_text)
        apply.add_argument("--manifest", required=True)
        apply.add_argument("--report", required=True)
        apply.add_argument("--snapshot-dir", required=True)
        apply.add_argument("--target-snapshot-dir", required=True)
        apply.add_argument("--journal", required=True)
        apply.add_argument("--backup-manifest", required=True)
        apply.add_argument("--native-power-report", required=True)
        apply.add_argument("--maintenance-token-file", required=True)
        apply.add_argument("--confirm", required=True)
        apply.add_argument("--i-understand-staging-writes", action="store_true")
        apply.add_argument("--update-manifest", action="store_true")
        apply.set_defaults(func=(lambda ns, resume=(name == "resume"): command_apply(ns, resume=resume)))

    verify = sub.add_parser("verify", help="đọc lại staging snapshot và kiểm tra power invariant")
    verify.add_argument("--manifest", required=True)
    verify.add_argument("--report", required=True, help="dry-run report làm expected counts/economy")
    verify.add_argument("--target-snapshot-dir", required=True)
    verify.add_argument("--native-power-report", required=True)
    verify.add_argument("--out", required=True)
    verify.set_defaults(func=command_verify)

    native_power = sub.add_parser("native-power", help="tính power authoritative offline trước/sau bằng runtime BattleService")
    native_power.add_argument("--manifest", required=True)
    native_power.add_argument("--report", required=True, help="dry-run report để kiểm coverage player")
    native_power.add_argument("--source-snapshot-dir", required=True)
    native_power.add_argument("--target-snapshot-dir", required=True)
    native_power.add_argument("--config-path", required=True, help="config .bin đã được phê duyệt; không tự dò production")
    native_power.add_argument("--runtime-root", help="linhhoasu/lhs/newServer; mặc định tự resolve workspace")
    native_power.add_argument("--node", help="đường dẫn node, mặc định PATH")
    native_power.add_argument("--timeout-seconds", type=int, default=120)
    native_power.add_argument("--out", required=True)
    native_power.set_defaults(func=command_native_power)

    rollback = sub.add_parser("rollback", help="bảo toàn target lỗi để điều tra, không xóa/ghi đè")
    rollback.add_argument("--manifest", required=True)
    rollback.add_argument("--journal", required=True)
    rollback.add_argument("--target-snapshot-dir", required=True)
    rollback.add_argument("--restore-to", required=True)
    rollback.add_argument("--reason", required=True)
    rollback.add_argument("--confirm", required=True)
    rollback.add_argument("--out", required=True)
    rollback.set_defaults(func=command_rollback)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except MergeToolError as exc:
        print(f"MERGE_BLOCKED: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("MERGE_ABORTED: keyboard interrupt", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
