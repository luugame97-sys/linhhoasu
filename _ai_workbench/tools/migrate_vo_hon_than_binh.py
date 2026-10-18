#!/usr/bin/env python3
"""Plan and (only when explicitly requested) apply the side-task repair.

The live player collection is deliberately not contacted by this module.  It
accepts a JSON export containing complete player documents, which makes the
default operation a safe, repeatable dry-run.  A deployment wrapper can use
the pure planning functions with its own Mongo client; ``apply_json`` is kept
here as a small fixture/local migration implementation and has the same CAS
and idempotency rules.

Usage::

    python migrate_vo_hon_than_binh.py --input players.json --output plan.json
    python migrate_vo_hon_than_binh.py --input players.json --apply \
        --output players.repaired.json --journal repair.journal.jsonl

``--apply`` requires an output path and a journal path.  It never writes the
input file unless ``--in-place`` is also supplied.  No command line mode
connects to production; a Mongo deployment must provide a wrapper that does
an atomic update with ``beforeHash``/``updatedAt`` and the marker emitted by
this tool.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator, Mapping, MutableMapping, Sequence


MARKER = "vo_hon_than_binh_migration_v1"
ROOT_SPECS = {
    "than_binh": {
        "prerequisite": 311,
        "feature": 209,
        "root": 90020,
        "successor": 90021,
    },
    "vo_hon": {
        "prerequisite": 313,
        "feature": 216,
        "root": 90002,
        "successor": 90003,
    },
}
KNOWN_TYPE9 = {90002, 90003, 90004, 90005, 90020, 90021, 90022}


def number(value: Any, default: int = 0) -> int:
    """Return a finite integer, accepting numeric strings but not booleans."""

    if isinstance(value, bool):
        return default
    try:
        result = int(float(value))
    except (TypeError, ValueError, OverflowError):
        return default
    return result


def obj(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def arr(value: Any) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def canonical(value: Any) -> Any:
    """Convert BSON-ish values to stable JSON values for hashing/output."""

    if isinstance(value, Mapping):
        return {str(k): canonical(v) for k, v in sorted(value.items(), key=lambda x: str(x[0]))}
    if isinstance(value, (list, tuple)):
        return [canonical(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    # ObjectId/Date wrappers in exports are represented by their string form.
    return str(value)


def digest(value: Any) -> str:
    encoded = json.dumps(canonical(value), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def normalize_unlocked(value: Any) -> list[int]:
    """Canonicalize unlockedSystem, including legacy numeric-string values."""

    values: list[Any]
    if isinstance(value, Mapping):
        values = list(value.keys())
    elif isinstance(value, (list, tuple, set)):
        values = list(value)
    elif value is None:
        values = []
    else:
        values = [value]
    return sorted({n for n in (number(v, -1) for v in values) if n > 0})


def _truth(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "bot", "qa", "test"}
    return bool(value)


def excluded_reason(player: Mapping[str, Any]) -> str | None:
    """Return a stable exclusion reason for bot/QA/test accounts."""

    for key in ("isBot", "bot", "is_bot", "isRobot", "robot"):
        if _truth(player.get(key)):
            return key
    for key in ("isQA", "isQa", "qa", "isTest", "testAccount", "qaAccount"):
        if _truth(player.get(key)):
            return key
    tags = player.get("tags")
    if isinstance(tags, Mapping):
        if any(_truth(tags.get(k)) for k in ("bot", "qa", "test", "automation")):
            return "tags"
    elif isinstance(tags, (list, tuple, set)) and any(str(v).lower() in {"bot", "qa", "test", "automation"} for v in tags):
        return "tags"
    for field in ("userId", "accountId", "playerId", "name"):
        value = str(player.get(field) or "").strip().lower()
        if re.search(r"(^|[-_])(bot|qa|test)([-_]|$)", value):
            return field
    return None


def identity(player: Mapping[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for field in ("_id", "userId", "playerId", "accountId", "serverId", "name"):
        if field in player and player[field] is not None:
            out[field] = canonical(player[field])
    if not out:
        out["anonymousHash"] = digest(player)[:16]
    return out


def _task_id(state: Mapping[str, Any], key: Any = None) -> int:
    return number(state.get("id", key), 0)


def _iter_states(value: Any, *, key_hint: Any = None) -> Iterator[dict[str, Any]]:
    if isinstance(value, Mapping):
        # A single task object has an id field; otherwise it is an id -> task map.
        if "id" in value or "status" in value or "progress" in value:
            yield dict(value)
        else:
            for key, row in value.items():
                if isinstance(row, Mapping):
                    state = dict(row)
                    if "id" not in state:
                        state["id"] = number(key, 0)
                    yield state
    elif isinstance(value, list):
        for row in value:
            if isinstance(row, Mapping):
                state = dict(row)
                if "id" not in state and key_hint is not None:
                    state["id"] = number(key_hint, 0)
                yield state


def task_sources(player: Mapping[str, Any]) -> dict[int, list[tuple[str, dict[str, Any]]]]:
    """Collect taskInfo.tasks and tasksMap type 9 without dropping legacy data."""

    info = obj(player.get("taskInfo"))
    found: dict[int, list[tuple[str, dict[str, Any]]]] = {}
    for source, value in (("tasks", info.get("tasks")), ("tasksMap[9]", obj(info.get("tasksMap")).get("9")),
                          ("tasksMap[9-num]", obj(info.get("tasksMap")).get(9)),
                          ("sideTasks", player.get("sideTasks")), ("type9Map", player.get("type9Map"))):
        for state in _iter_states(value):
            task_id = _task_id(state)
            if task_id <= 0:
                continue
            if task_id not in KNOWN_TYPE9 and number(state.get("type"), 0) != 9:
                continue
            found.setdefault(task_id, []).append((source, state))
    return found


def _receipt_values(player: Mapping[str, Any]) -> Iterator[tuple[str, Any]]:
    info = obj(player.get("taskInfo"))
    paths = (
        ("taskInfo.claimLedger", info.get("claimLedger")),
        ("taskInfo.receipts", info.get("receipts")),
        ("taskInfo.taskReceipts", info.get("taskReceipts")),
        ("sideTaskReceipts", player.get("sideTaskReceipts")),
        ("progressReceipts", player.get("progressReceipts")),
    )
    for path, value in paths:
        if isinstance(value, Mapping):
            for key, row in value.items():
                yield f"{path}.{key}", row
        elif isinstance(value, list):
            for index, row in enumerate(value):
                yield f"{path}[{index}]", row


def authoritative_receipt(player: Mapping[str, Any], task_id: int) -> str | None:
    """Find an explicit committed receipt; inventory ownership is not evidence."""

    # Some older exports stored the receipt beside the task state instead of
    # in a claim ledger.  A bare status/claimedAt is not enough; require a
    # receipt/event/idempotency marker as well.
    for source, state in task_sources(player).get(task_id, []):
        proof = state.get("claimReceipt") or state.get("receiptId") or state.get("eventId") or state.get("idempotencyKey")
        if proof and (state.get("claimedAt") or state.get("claimed") is True or state.get("committed") is True or isinstance(proof, Mapping)):
            return f"{source}.{task_id}.claimReceipt"
    for path, value in _receipt_values(player):
        row = obj(value)
        declared = number(row.get("taskId", row.get("task_id", row.get("task"))), -1)
        key_id = number(path.rsplit(".", 1)[-1].rstrip("]"), -1)
        if declared != task_id and key_id != task_id:
            continue
        committed = row.get("authoritative") is True or row.get("committed") is True
        committed = committed or str(row.get("status", "")).lower() in {"committed", "done", "complete", "completed"}
        committed = committed and bool(row.get("receiptId") or row.get("eventId") or row.get("idempotencyKey") or row.get("key"))
        if committed:
            return path
    return None


def _status_rank(status: int, receipt: bool = False) -> int:
    if status == 30 or (status == 2 and receipt):
        return 3
    if status == 20:
        return 2
    if status == 10:
        return 1
    # Legacy status 2 is intentionally below an ordinary claimed state until
    # an authoritative receipt proves its meaning.
    return 0


@dataclass
class MergeResult:
    state: dict[str, Any]
    conflict: dict[str, Any] | None
    sources: list[str]


def merge_state(task_id: int, sources: Sequence[tuple[str, Mapping[str, Any]]], player: Mapping[str, Any], config: Mapping[str, Any] | None = None) -> MergeResult:
    """Merge duplicate task representations by semantic status then progress."""

    rows = [(source, dict(row)) for source, row in sources]
    receipt = authoritative_receipt(player, task_id) is not None
    ranked = sorted(rows, key=lambda item: (_status_rank(number(item[1].get("status")), receipt and number(item[1].get("status")) == 2),
                                             max(0, number(item[1].get("progress"))),
                                             1 if item[0].startswith("tasksMap") else 0), reverse=True)
    winner_source, winner = ranked[0]
    statuses = sorted({number(row.get("status")) for _, row in rows})
    progresses = sorted({max(0, number(row.get("progress"))) for _, row in rows})
    target = max([number(row.get("target")) for _, row in rows] + [number((config or {}).get("taskValue1"))])
    progress = min(target, max(progresses or [0])) if target > 0 else max(progresses or [0])
    state = copy.deepcopy(winner)
    state["id"] = task_id
    state["type"] = 9
    if target > 0:
        state["target"] = target
    if "progress" in state or progresses:
        state["progress"] = progress
    if number(state.get("status")) == 2 and receipt:
        state["status"] = 30
        state.setdefault("migration", {})["legacyStatus2Normalized"] = True
    conflict = None
    if 2 in statuses or len(statuses) > 1 or len(progresses) > 1:
        conflict = {
            "taskId": task_id,
            "sources": [source for source, _ in rows],
            "statuses": statuses,
            "progresses": progresses,
            "status2Receipt": receipt,
            "winner": winner_source,
            "action": "normalized" if number(state.get("status")) != 2 else "preserved_for_review",
        }
    return MergeResult(state=state, conflict=conflict, sources=[source for source, _ in rows])


def _table_data(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    data = raw.get("data") if isinstance(raw, Mapping) else raw
    return dict(data) if isinstance(data, Mapping) else {}


def load_config(config_root: Path | None = None) -> tuple[dict[int, dict[str, Any]], dict[int, dict[str, Any]]]:
    root = config_root or Path(__file__).resolve().parents[2]
    task_path = root / "linhhoasu/lhs/newServer/scripts/_tables_dump/TaskConfig.json"
    system_path = root / "linhhoasu/lhs/newServer/scripts/_tables_dump/SystemConfig.json"
    tasks_raw, systems_raw = _table_data(task_path), _table_data(system_path)
    tasks = {number(k): dict(v) for k, v in tasks_raw.items() if isinstance(v, Mapping) and number(k) > 0}
    systems = {number(k): dict(v) for k, v in systems_raw.items() if isinstance(v, Mapping) and number(k) > 0}
    # Keep this tool useful with a redacted export while refusing silent drift
    # in the four IDs that define the repair.
    expected = {90002: 90003, 90020: 90021}
    for task_id, next_id in expected.items():
        if tasks and number(tasks.get(task_id, {}).get("nextId")) not in {0, next_id}:
            raise ValueError(f"TASK_CONFIG_DRIFT:{task_id}")
    if systems:
        for feature, root in ((209, 90021), (216, 90003)):
            conditions = systems.get(feature, {}).get("conditions", [])
            if conditions and not any(number(c.get("value")) == root for c in conditions if isinstance(c, Mapping)):
                raise ValueError(f"SYSTEM_CONFIG_DRIFT:{feature}")
    return tasks, systems


def _state_list(merged: Mapping[int, dict[str, Any]], original: Any) -> list[dict[str, Any]]:
    unknown = []
    for state in _iter_states(original):
        task_id = _task_id(state)
        if task_id not in merged and task_id > 0:
            unknown.append(state)
    result = [copy.deepcopy(state) for _, state in sorted(merged.items())]
    result.extend(unknown)
    return result


def _relevant(player: Mapping[str, Any]) -> dict[str, Any]:
    info = obj(player.get("taskInfo"))
    maps = obj(info.get("tasksMap"))
    return {
        "systemUnlockInfo": {"unlockedSystem": canonical(obj(player.get("systemUnlockInfo")).get("unlockedSystem"))},
        "taskInfo": {
            "tasks": canonical(info.get("tasks")),
            "tasksMap9": canonical(maps.get("9", maps.get(9))),
            "migrationLedger": canonical(info.get("migrationLedger")),
        },
    }


def _make_state(task_id: int, cfg: Mapping[str, Any] | None, status: int = 10, progress: int = 0) -> dict[str, Any]:
    cfg = cfg or {}
    target = max(0, number(cfg.get("taskValue1"), 1))
    return {"id": task_id, "type": 9, "status": status, "target": target, "progress": min(target, max(0, progress))}


def plan_player(player: Mapping[str, Any], task_config: Mapping[int, Mapping[str, Any]] | None = None) -> dict[str, Any]:
    """Create one deterministic repair plan without mutating ``player``."""

    original = copy.deepcopy(dict(player))
    plan: dict[str, Any] = {
        "identity": identity(player),
        "excluded": excluded_reason(player),
        "status": "excluded" if excluded_reason(player) else "no_change",
        "actions": [],
        "conflicts": [],
        "receiptsUsed": [],
        "classifications": [],
        "beforeHash": digest(_relevant(original)),
        "fullBeforeHash": digest(original),
    }
    if plan["excluded"]:
        return plan
    info = obj(original.get("taskInfo"))
    ledger = obj(info.get("migrationLedger"))
    existing_marker = ledger.get(MARKER)
    if existing_marker:
        plan["status"] = "already_applied"
        plan["idempotency"] = {"marker": MARKER, "existing": canonical(existing_marker)}
        return plan

    after = copy.deepcopy(original)
    unlock_info = obj(after.get("systemUnlockInfo"))
    unlocked_before = canonical(unlock_info.get("unlockedSystem"))
    unlocked = set(normalize_unlocked(unlock_info.get("unlockedSystem")))
    unlock_info["unlockedSystem"] = sorted(unlocked)
    after["systemUnlockInfo"] = unlock_info

    sources = task_sources(original)
    task_config = task_config or {}
    scope_relevant = bool(sources) or any(
        spec["prerequisite"] in unlocked or spec["feature"] in unlocked
        for spec in ROOT_SPECS.values()
    )
    merged: dict[int, dict[str, Any]] = {}
    merge_conflicts: list[dict[str, Any]] = []
    for task_id, rows in sources.items():
        result = merge_state(task_id, rows, original, task_config.get(task_id))
        merged[task_id] = result.state
        if result.conflict:
            merge_conflicts.append(result.conflict)
    plan["conflicts"].extend(merge_conflicts)

    # Materialize a canonical copy in both legacy locations.  This is the
    # important part of the repair: a later refresh cannot overwrite a task
    # that happened to exist only in tasksMap['9'] (or only in tasks).
    tasks_original = info.get("tasks")
    tasks_map_original = obj(info.get("tasksMap"))
    tasks_after = copy.deepcopy(tasks_original) if isinstance(tasks_original, Mapping) else {}
    for task_id, state in merged.items():
        tasks_after[str(task_id)] = copy.deepcopy(state)
    maps_after = copy.deepcopy(tasks_map_original)
    if scope_relevant:
        maps_after["9"] = _state_list(merged, tasks_map_original.get("9", tasks_map_original.get(9)))
        if 9 in maps_after:
            del maps_after[9]
    info_after = copy.deepcopy(info)
    if scope_relevant:
        info_after["tasks"] = tasks_after
        info_after["tasksMap"] = maps_after
    after["taskInfo"] = info_after

    for kind, spec in ROOT_SPECS.items():
        prerequisite = spec["prerequisite"] in unlocked
        feature_open = spec["feature"] in unlocked
        root = merged.get(spec["root"])
        successor = merged.get(spec["successor"])
        root_status = number(root.get("status"), 0) if root else 0
        successor_status = number(successor.get("status"), 0) if successor else 0
        classification = {
            "kind": kind,
            "prerequisiteSystem": spec["prerequisite"],
            "prerequisiteUnlocked": prerequisite,
            "featureSystem": spec["feature"],
            "featureUnlockedBefore": feature_open,
            "rootTask": spec["root"],
            "rootPresentBefore": bool(root),
            "rootStatusBefore": root_status,
            "successorTask": spec["successor"],
            "successorPresentBefore": bool(successor),
            "successorStatusBefore": successor_status,
            "missingRoot": bool(prerequisite and not root),
            "missingSuccessor": bool(prerequisite and root_status == 30 and not successor),
        }
        plan["classifications"].append(classification)
        if not prerequisite:
            classification.update({
                "featureUnlockedAfter": feature_open,
                "rootPresentAfter": bool(root),
                "rootStatusAfter": root_status,
                "successorPresentAfter": bool(successor),
                "successorStatusAfter": successor_status,
            })
            continue
        if root and root_status == 2 and not authoritative_receipt(original, spec["root"]):
            plan["conflicts"].append({"kind": kind, "taskId": spec["root"], "reason": "STATUS_2_REQUIRES_RECEIPT"})
        if successor and successor_status == 2 and not authoritative_receipt(original, spec["successor"]):
            plan["conflicts"].append({"kind": kind, "taskId": spec["successor"], "reason": "STATUS_2_REQUIRES_RECEIPT"})
        if not root and not feature_open:
            state = _make_state(spec["root"], task_config.get(spec["root"]))
            merged[spec["root"]] = state
            tasks_after[str(spec["root"])] = copy.deepcopy(state)
            maps_after["9"].append(copy.deepcopy(state))
            plan["actions"].append({"kind": kind, "action": "seed_missing_root", "taskId": spec["root"], "status": 10})
            root = state
            root_status = 10
        if root_status == 30 and not successor:
            receipt_path = authoritative_receipt(original, spec["successor"])
            if receipt_path:
                state = _make_state(spec["successor"], task_config.get(spec["successor"]), status=30, progress=number(task_config.get(spec["successor"], {}).get("taskValue1"), 1))
                unlocks = sorted(unlocked | {spec["feature"]})
                unlock_info["unlockedSystem"] = unlocks
                unlocked = set(unlocks)
                merged[spec["successor"]] = state
                tasks_after[str(spec["successor"])] = copy.deepcopy(state)
                maps_after["9"].append(copy.deepcopy(state))
                plan["receiptsUsed"].append({"kind": kind, "taskId": spec["successor"], "path": receipt_path})
                plan["actions"].append({"kind": kind, "action": "recover_claimed_successor", "taskId": spec["successor"], "status": 30, "unlock": spec["feature"]})
            else:
                state = _make_state(spec["successor"], task_config.get(spec["successor"]))
                merged[spec["successor"]] = state
                tasks_after[str(spec["successor"])] = copy.deepcopy(state)
                maps_after["9"].append(copy.deepcopy(state))
                plan["actions"].append({"kind": kind, "action": "reconcile_missing_successor", "taskId": spec["successor"], "status": 10})
        elif successor_status == 30 and not feature_open:
            unlocked.add(spec["feature"])
            unlock_info["unlockedSystem"] = sorted(unlocked)
            plan["actions"].append({"kind": kind, "action": "unlock_from_claimed_successor", "taskId": spec["successor"], "unlock": spec["feature"]})
        classification.update({
            "featureUnlockedAfter": spec["feature"] in unlocked,
            "rootPresentAfter": spec["root"] in merged,
            "rootStatusAfter": number(merged.get(spec["root"], {}).get("status"), 0),
            "successorPresentAfter": spec["successor"] in merged,
            "successorStatusAfter": number(merged.get(spec["successor"], {}).get("status"), 0),
        })

    # Sort after appending repair states and remove duplicate map entries.
    if scope_relevant:
        dedup: dict[int, dict[str, Any]] = {}
        for state in maps_after.get("9", []):
            task_id = _task_id(state)
            if task_id > 0:
                dedup[task_id] = state
        maps_after["9"] = [dedup[k] for k in sorted(dedup)]
        info_after["tasks"] = tasks_after
        info_after["tasksMap"] = maps_after
    after["taskInfo"] = info_after
    after["systemUnlockInfo"] = unlock_info

    after_rel = _relevant(after)
    changes = []
    if canonical(unlocked_before) != canonical(after_rel["systemUnlockInfo"]["unlockedSystem"]):
        changes.append({"path": "systemUnlockInfo.unlockedSystem", "before": unlocked_before, "after": after_rel["systemUnlockInfo"]["unlockedSystem"]})
    before_rel = _relevant(original)
    if before_rel["taskInfo"]["tasks"] != after_rel["taskInfo"]["tasks"]:
        changes.append({"path": "taskInfo.tasks", "beforeHash": digest(before_rel["taskInfo"]["tasks"]), "afterHash": digest(after_rel["taskInfo"]["tasks"])})
    if before_rel["taskInfo"]["tasksMap9"] != after_rel["taskInfo"]["tasksMap9"]:
        changes.append({"path": "taskInfo.tasksMap.9", "beforeHash": digest(before_rel["taskInfo"]["tasksMap9"]), "afterHash": digest(after_rel["taskInfo"]["tasksMap9"])})
    plan["changes"] = changes
    plan["blocked"] = any(
        c.get("reason") == "STATUS_2_REQUIRES_RECEIPT"
        or (c.get("status2Receipt") is False and 2 in c.get("statuses", []))
        for c in plan["conflicts"]
    )
    if plan["actions"] or changes or plan["conflicts"]:
        plan["status"] = "conflict" if plan["blocked"] else ("planned" if changes else "review")
    plan["afterFields"] = {
        "systemUnlockInfo.unlockedSystem": canonical(after["systemUnlockInfo"]["unlockedSystem"]),
        "taskInfo.tasks": canonical(obj(after.get("taskInfo")).get("tasks", {})),
        "taskInfo.tasksMap.9": canonical(obj(after.get("taskInfo")).get("tasksMap", {}).get("9", [])),
    }
    plan["afterHash"] = digest(_relevant(after))
    plan["idempotency"] = {"marker": MARKER, "planHash": digest({"beforeHash": plan["beforeHash"], "afterHash": plan["afterHash"], "actions": plan["actions"]})}
    cas_field = "updatedAt" if "updatedAt" in player else ("stateVersion" if "stateVersion" in player else None)
    plan["cas"] = {"required": True, "field": cas_field or "fullDocumentHash", "expected": canonical(player.get(cas_field)) if cas_field else plan["fullBeforeHash"]}
    return plan


def _set_path(player: MutableMapping[str, Any], path: str, value: Any) -> None:
    if path == "systemUnlockInfo.unlockedSystem":
        holder = obj(player.get("systemUnlockInfo")); holder["unlockedSystem"] = copy.deepcopy(value); player["systemUnlockInfo"] = holder; return
    info = obj(player.get("taskInfo")); maps = obj(info.get("tasksMap"))
    if path == "taskInfo.tasks": info["tasks"] = copy.deepcopy(value)
    elif path == "taskInfo.tasksMap.9": maps["9"] = copy.deepcopy(value); info["tasksMap"] = maps
    player["taskInfo"] = info


def apply_json(payload: Any, plans: Sequence[Mapping[str, Any]], journal_path: Path, *, in_place: bool = False) -> dict[str, Any]:
    """Apply plans to a JSON fixture with per-player hash CAS and marker guard."""

    journal_path.parent.mkdir(parents=True, exist_ok=True)
    applied = skipped = conflicts = 0
    entries = list(_entries(payload))
    by_identity = {json.dumps(canonical(identity(row)), sort_keys=True): row for _, row in entries}
    journal_lines: list[str] = []
    for plan in plans:
        if plan.get("blocked"):
            skipped += 1
            journal_lines.append(json.dumps({"result": "BLOCKED_REVIEW", "identity": plan.get("identity"), "conflicts": plan.get("conflicts", [])}, ensure_ascii=False))
            continue
        if plan.get("status") in {"excluded", "already_applied", "no_change"} or not plan.get("changes"):
            skipped += 1
            continue
        key = json.dumps(canonical(plan.get("identity", {})), sort_keys=True)
        player = by_identity.get(key)
        if player is None:
            conflicts += 1; journal_lines.append(json.dumps({"result": "CAS_MISSING", "identity": plan.get("identity")}, ensure_ascii=False)); continue
        if obj(obj(player.get("taskInfo")).get("migrationLedger")).get(MARKER):
            skipped += 1; journal_lines.append(json.dumps({"result": "ALREADY_APPLIED", "identity": plan.get("identity")}, ensure_ascii=False)); continue
        current_hash = digest(_relevant(player))
        if current_hash != plan.get("beforeHash"):
            conflicts += 1; journal_lines.append(json.dumps({"result": "CAS_MISMATCH", "identity": plan.get("identity"), "expected": plan.get("beforeHash"), "actual": current_hash}, ensure_ascii=False)); continue
        cas = obj(plan.get("cas")); cas_field = cas.get("field")
        if cas_field == "fullDocumentHash":
            current_cas = digest(player)
        else:
            current_cas = player.get(cas_field) if cas_field else None
        if cas_field and current_cas != cas.get("expected"):
            conflicts += 1; journal_lines.append(json.dumps({"result": "VERSION_CAS_MISMATCH", "identity": plan.get("identity"), "field": cas_field, "expected": cas.get("expected"), "actual": canonical(current_cas)}, ensure_ascii=False)); continue
        full_before = copy.deepcopy(player)
        before = copy.deepcopy(_relevant(player))
        for path, value in plan.get("afterFields", {}).items():
            _set_path(player, path, value)
        if digest(_relevant(player)) != plan.get("afterHash"):
            player.clear(); player.update(full_before)
            conflicts += 1
            journal_lines.append(json.dumps({"result": "READBACK_MISMATCH", "identity": plan.get("identity"), "expected": plan.get("afterHash"), "actual": digest(_relevant(player))}, ensure_ascii=False))
            continue
        info = obj(player.get("taskInfo")); ledger = obj(info.get("migrationLedger")); ledger[MARKER] = {"marker": MARKER, "planHash": plan.get("idempotency", {}).get("planHash"), "beforeHash": plan.get("beforeHash"), "afterHash": plan.get("afterHash"), "appliedAt": datetime.now(timezone.utc).isoformat()}; info["migrationLedger"] = ledger; player["taskInfo"] = info
        applied += 1
        journal_lines.append(json.dumps({"result": "APPLIED", "identity": plan.get("identity"), "before": before, "after": _relevant(player), "cas": plan.get("cas"), "marker": MARKER}, ensure_ascii=False))
    journal_path.write_text("\n".join(journal_lines) + ("\n" if journal_lines else ""), encoding="utf-8")
    return {"applied": applied, "skipped": skipped, "casConflicts": conflicts, "journal": str(journal_path), "inPlaceRequested": in_place}


def _entries(payload: Any) -> Iterator[tuple[Any, MutableMapping[str, Any]]]:
    if isinstance(payload, list):
        for row in payload:
            if isinstance(row, MutableMapping):
                yield row, row
        return
    if not isinstance(payload, MutableMapping):
        return
    for key in ("players", "records", "documents"):
        rows = payload.get(key)
        if isinstance(rows, list):
            for row in rows:
                if isinstance(row, MutableMapping):
                    candidate = row.get("player") if isinstance(row.get("player"), MutableMapping) else row
                    yield row, candidate
            return
    if isinstance(payload.get("player"), MutableMapping):
        yield payload, payload["player"]
        return
    if any(k in payload for k in ("taskInfo", "systemUnlockInfo", "userId", "playerId")):
        yield payload, payload


def _load_players(path: Path) -> tuple[Any, list[MutableMapping[str, Any]]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    players = [player for _, player in _entries(payload)]
    if not players:
        raise ValueError("INPUT_HAS_NO_COMPLETE_PLAYER_DOCUMENTS")
    return payload, players


def _summary(plans: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    action_counts: dict[str, int] = {}
    missing_roots = missing_successors = 0
    for plan in plans:
        status = str(plan.get("status", "unknown")); counts[status] = counts.get(status, 0) + 1
        for action in plan.get("actions", []):
            name = str(action.get("action")); action_counts[name] = action_counts.get(name, 0) + 1
        missing_roots += sum(1 for row in plan.get("classifications", []) if row.get("missingRoot"))
        missing_successors += sum(1 for row in plan.get("classifications", []) if row.get("missingSuccessor"))
    return {"players": len(plans), "statuses": counts, "actions": action_counts, "classifications": {"missingRoots": missing_roots, "missingSuccessors": missing_successors}, "conflicts": sum(len(p.get("conflicts", [])) for p in plans), "blocked": sum(1 for p in plans if p.get("blocked")), "receiptsUsed": sum(len(p.get("receiptsUsed", [])) for p in plans)}


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="complete player JSON export")
    parser.add_argument("--output", type=Path, help="JSON plan/output path; dry-run may omit it")
    parser.add_argument("--journal", type=Path, help="required with --apply; JSONL preimage/postimage journal")
    parser.add_argument("--config-root", type=Path, help="project root containing linhhoasu/lhs/newServer/scripts/_tables_dump")
    parser.add_argument("--apply", action="store_true", help="apply only to the supplied JSON fixture")
    parser.add_argument("--in-place", action="store_true", help="allow --apply to replace --input (otherwise output must differ)")
    args = parser.parse_args(argv)
    if args.apply and (not args.output or not args.journal):
        parser.error("--apply requires --output and --journal; default mode is dry-run")
    if args.apply and args.output.resolve() == args.input.resolve() and not args.in_place:
        parser.error("refusing in-place write without --in-place")
    payload, players = _load_players(args.input)
    tasks, _systems = load_config(args.config_root)
    plans = [plan_player(player, tasks) for player in players]
    diff_preview = [{
        "identity": plan.get("identity"),
        "status": plan.get("status"),
        "classifications": plan.get("classifications", []),
        "changes": plan.get("changes", []),
        "afterFields": plan.get("afterFields", {}),
    } for plan in plans]
    journal_preview = [{
        "identity": plan.get("identity"),
        "status": plan.get("status"),
        "beforeHash": plan.get("beforeHash"),
        "afterHash": plan.get("afterHash"),
        "actions": plan.get("actions", []),
        "conflicts": plan.get("conflicts", []),
    } for plan in plans]
    result: dict[str, Any] = {"version": 1, "generatedAt": datetime.now(timezone.utc).isoformat(), "mode": "apply" if args.apply else "dry-run", "input": str(args.input), "marker": MARKER, "summary": _summary(plans), "players": plans, "diff": diff_preview, "journal": journal_preview}
    if args.apply:
        result["apply"] = apply_json(payload, plans, args.journal, in_place=args.in_place)
        if result["apply"]["casConflicts"]:
            result["status"] = "CAS_CONFLICT"
            rc = 2
        else:
            result["status"] = "PASS"
            rc = 0
        # The payload was mutated through its nested player references.
        args.output.parent.mkdir(parents=True, exist_ok=True)
        tmp = args.output.with_name(args.output.name + ".next")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, args.output)
    else:
        result["status"] = "DRY_RUN"
        rc = 0
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output and not args.apply:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print(text, end="")
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
