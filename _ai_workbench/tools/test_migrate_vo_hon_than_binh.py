#!/usr/bin/env python3
"""Fixture tests for migrate_vo_hon_than_binh.py (no Mongo/network)."""

from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import migrate_vo_hon_than_binh as migration


TASKS = {
    90002: {"id": 90002, "type": 9, "nextId": 90003, "taskValue1": 1},
    90003: {"id": 90003, "type": 9, "nextId": 90004, "taskValue1": 1},
    90020: {"id": 90020, "type": 9, "nextId": 90021, "activeId": 13, "taskValue1": 1},
    90021: {"id": 90021, "type": 9, "nextId": 90022, "activeId": 40, "taskValue1": 1},
}


def player(**overrides):
    value = {
        "_id": "fixture-1",
        "userId": "human-1",
        "updatedAt": "v1",
        "systemUnlockInfo": {"unlockedSystem": ["311", "313"]},
        "taskInfo": {"tasks": {}, "tasksMap": {}},
    }
    value.update(overrides)
    return value


class MigrationTest(unittest.TestCase):
    def test_normalizes_numeric_unlocks_and_excludes_bots(self):
        plan = migration.plan_player(player(userId="lhs_real_bot_qa"), TASKS)
        self.assertEqual(plan["status"], "excluded")
        self.assertEqual(migration.normalize_unlocked(["313", 311, 0, "bad"]), [311, 313])

    def test_seeds_both_missing_roots_and_materializes_map(self):
        plan = migration.plan_player(player(), TASKS)
        actions = {(row["kind"], row["action"], row["taskId"]) for row in plan["actions"]}
        self.assertIn(("than_binh", "seed_missing_root", 90020), actions)
        self.assertIn(("vo_hon", "seed_missing_root", 90002), actions)
        self.assertIn("taskInfo.tasksMap.9", {row["path"] for row in plan["changes"]})
        self.assertEqual(plan["status"], "planned")

    def test_merge_prefers_claimed_state_but_reports_conflict(self):
        p = player(taskInfo={
            "tasks": {"90020": {"id": 90020, "type": 9, "status": 30, "progress": 1}},
            "tasksMap": {"9": [{"id": 90020, "type": 9, "status": 10, "progress": 0}]},
        })
        result = migration.plan_player(p, TASKS)
        merged = result["afterFields"]["taskInfo.tasks"]["90020"]
        self.assertEqual(merged["status"], 30)
        self.assertTrue(any(c.get("taskId") == 90020 for c in result["conflicts"]))
        self.assertIn(90021, {row.get("taskId") for row in result["actions"]})

    def test_main_task_is_not_rewritten_as_type9(self):
        p = player(taskInfo={"tasks": {"10302": {"id": 10302, "status": 30}}, "tasksMap": {}})
        result = migration.plan_player(p, TASKS)
        self.assertEqual(result["afterFields"]["taskInfo.tasks"]["10302"]["status"], 30)
        self.assertNotIn(10302, [row.get("taskId") for row in result["actions"]])

    def test_status_two_without_receipt_is_preserved_for_review(self):
        p = player(taskInfo={"tasks": {"90020": {"id": 90020, "type": 9, "status": 2}}, "tasksMap": {}})
        result = migration.plan_player(p, TASKS)
        self.assertEqual(result["afterFields"]["taskInfo.tasks"]["90020"]["status"], 2)
        self.assertTrue(any(c.get("reason") == "STATUS_2_REQUIRES_RECEIPT" for c in result["conflicts"]))
        self.assertTrue(result["blocked"])

    def test_status_two_map_conflict_blocks_even_when_other_copy_claimed(self):
        p = player(taskInfo={
            "tasks": {"90020": {"id": 90020, "type": 9, "status": 30, "progress": 1}},
            "tasksMap": {"9": [{"id": 90020, "type": 9, "status": 2, "progress": 1}]},
        })
        result = migration.plan_player(p, TASKS)
        self.assertTrue(result["blocked"])

    def test_authoritative_receipt_recovers_successor_and_feature(self):
        p = player(taskInfo={
            "tasks": {"90020": {"id": 90020, "type": 9, "status": 30, "progress": 1}},
            "tasksMap": {},
            "claimLedger": {"90021": {"taskId": 90021, "authoritative": True, "receiptId": "r-1", "status": "committed"}},
        })
        result = migration.plan_player(p, TASKS)
        self.assertEqual(result["afterFields"]["taskInfo.tasks"]["90021"]["status"], 30)
        self.assertIn(209, result["afterFields"]["systemUnlockInfo.unlockedSystem"])
        self.assertEqual(len(result["receiptsUsed"]), 1)

    def test_inline_task_receipt_normalizes_legacy_status_two(self):
        p = player(taskInfo={
            "tasks": {"90020": {"id": 90020, "type": 9, "status": 2, "claimReceipt": "r-root", "claimedAt": "2026-09-19T00:00:00Z"}},
            "tasksMap": {},
        })
        result = migration.plan_player(p, TASKS)
        self.assertEqual(result["afterFields"]["taskInfo.tasks"]["90020"]["status"], 30)
        self.assertFalse(result["blocked"])

    def test_apply_fixture_is_cas_and_idempotent(self):
        original = player()
        payload = {"players": [original]}
        plans = [migration.plan_player(original, TASKS)]
        with tempfile.TemporaryDirectory() as directory:
            journal = Path(directory) / "repair.jsonl"
            first = migration.apply_json(payload, plans, journal)
            self.assertEqual(first["applied"], 1)
            self.assertTrue(payload["players"][0]["taskInfo"]["migrationLedger"][migration.MARKER])
            second_plan = migration.plan_player(payload["players"][0], TASKS)
            second = migration.apply_json(payload, [second_plan], journal)
            self.assertEqual(second["applied"], 0)
            self.assertGreaterEqual(second["skipped"], 1)

    def test_plan_is_read_only(self):
        original = player()
        before = copy.deepcopy(original)
        migration.plan_player(original, TASKS)
        self.assertEqual(original, before)

    def test_apply_rejects_stale_preimage(self):
        original = player()
        plan = migration.plan_player(original, TASKS)
        original["systemUnlockInfo"]["unlockedSystem"].append("999")
        with tempfile.TemporaryDirectory() as directory:
            result = migration.apply_json({"players": [original]}, [plan], Path(directory) / "stale.jsonl")
        self.assertEqual(result["applied"], 0)
        self.assertEqual(result["casConflicts"], 1)
        self.assertNotIn(migration.MARKER, original.get("taskInfo", {}).get("migrationLedger", {}))

    def test_apply_falls_back_to_full_document_hash_without_version(self):
        original = player()
        del original["updatedAt"]
        plan = migration.plan_player(original, TASKS)
        original["level"] = 999
        with tempfile.TemporaryDirectory() as directory:
            result = migration.apply_json({"players": [original]}, [plan], Path(directory) / "stale.jsonl")
        self.assertEqual(result["casConflicts"], 1)


if __name__ == "__main__":
    unittest.main()
