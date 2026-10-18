#!/usr/bin/env python3
"""RAM-only tests for server_merge_tool.py.

All data lives in TemporaryDirectory.  No Mongo/Redis/HTTP/PM2 operation is
performed; the assertions deliberately include the zero-write boundary.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import server_merge_tool as tool


def write_jsonl(root: Path, database: str, collection: str, rows: list[dict]) -> None:
    destination = root / database
    destination.mkdir(parents=True, exist_ok=True)
    (destination / f"{collection}.jsonl").write_text(
        "".join(tool.canonical_json(row) + "\n" for row in rows), encoding="utf-8"
    )


def args_for(root: Path, *, rename: str | None = None) -> argparse.Namespace:
    return argparse.Namespace(
        root_server="1001",
        source_servers="1001,1002",
        target_server=None,
        db_prefix="lhs_s",
        target_db=None,
        identity_db=None,
        server_map=None,
        policy_file=None,
        rename_suffix=rename,
        merge_id="00000000-0000-4000-8000-000000000001",
        snapshot_dir=str(root),
        out=str(root / "manifest.json"),
    )


class ServerMergeToolTests(unittest.TestCase):
    def test_dry_run_blocks_unknown_collection_and_residue(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            write_jsonl(root, "lhs_s1001", "players", [{
                "_id": "p1", "userId": "u1", "playerId": "p1", "name": "Alice",
                "serverId": 1001, "currencies": {"gold": 10}, "displayPower": 100,
            }])
            write_jsonl(root, "lhs_s1002", "players", [{
                "_id": "p2", "userId": "u2", "playerId": "p2", "name": "Alice",
                "serverId": 999, "currencies": {"gold": 20}, "displayPower": 90,
            }])
            write_jsonl(root, "lhs_s1002", "mystery", [{"secret": "must not be dropped"}])
            manifest = tool.inventory_manifest(tool.make_manifest(args_for(root)), root)
            report = tool.dry_run(manifest, root)
            self.assertEqual(report["productionWrites"], 0)
            self.assertEqual(report["networkAttempts"], 0)
            self.assertEqual(report["status"], "blocked")
            kinds = {item["kind"] for item in report["conflicts"]}
            self.assertIn("player_name_collision", kinds)
            self.assertIn("player_server_id_outside_manifest", kinds)
            self.assertIn("unknown_collection", kinds)

    def test_deterministic_suffix_and_exact_mail_dedupe(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            write_jsonl(root, "lhs_s1001", "players", [{
                "_id": "p1", "userId": "u1", "playerId": "p1", "name": "Hero", "serverId": 1001,
                "displayPower": 100,
            }])
            write_jsonl(root, "lhs_s1002", "players", [{
                "_id": "p2", "userId": "u2", "playerId": "p2", "name": "Hero", "serverId": 1002,
                "displayPower": 100,
            }])
            mail = {"_id": "m1", "userId": "u1", "eventKey": "gift:1", "claimed": False}
            write_jsonl(root, "lhs_s1001", "mails", [mail])
            write_jsonl(root, "lhs_s1002", "mails", [dict(mail)])
            manifest = tool.inventory_manifest(tool.make_manifest(args_for(root, rename="·S{serverId}")), root)
            report = tool.dry_run(manifest, root)
            self.assertEqual(report["status"], "ready_pending_power")
            self.assertEqual(report["nameMapping"]["1002:Hero"], "Hero·S1002")
            self.assertTrue(any(item["decision"] == "dedupe" for item in report["conflicts"]))
            output = tool.build_output_records(manifest, root)
            mails = output[("lhs_s1001", "mails")]
            self.assertEqual(len(mails), 1)
            # The source object remains untouched; remapping is a candidate-only operation.
            original = tool.load_database_snapshot(root, "lhs_s1002")["players"][0]
            self.assertEqual(original["name"], "Hero")

    def test_snapshot_apply_requires_all_gates_and_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            work = Path(raw)
            root = work / "source"
            write_jsonl(root, "lhs_s1001", "players", [{
                "_id": "p1", "userId": "u1", "playerId": "p1", "name": "A", "serverId": 1001,
                "currencies": {"gold": 5}, "items": {"x": 2}, "displayPower": 50,
            }])
            write_jsonl(root, "lhs_s1002", "players", [{
                "_id": "p2", "userId": "u2", "playerId": "p2", "name": "B", "serverId": 1002,
                "currencies": {"gold": 7}, "items": {"y": 3}, "displayPower": 70,
            }])
            manifest_path = root / "manifest.json"
            manifest = tool.inventory_manifest(tool.make_manifest(args_for(root)), root)
            tool.write_json(manifest_path, manifest, overwrite=False)
            loaded = tool.load_manifest(manifest_path)
            report = tool.dry_run(loaded, root)
            tool.write_json(manifest_path, loaded, overwrite=True)
            report_path = root / "dry-run.json"
            tool.write_json(report_path, report, overwrite=False)

            backup_dir = work / "backup"
            restore_dir = work / "restore-test"
            backup_meta = tool.backup_snapshot(loaded, root, backup_dir, restore_dir)
            backup_manifest = backup_dir / "backup_manifest.json"
            self.assertEqual(tool.load_backup_manifest(backup_manifest)["archiveSha256"], backup_meta["archiveSha256"])
            token = root / "maintenance.token"
            token.write_text(f"MERGE-READY:{loaded['mergeId']}\n", encoding="utf-8")
            power_path = root / "power.json"
            power_payload = {
                "mergeId": loaded["mergeId"],
                "planHash": loaded["planHash"],
                "players": [{"serverId": 1001, "playerRef": "playerId=p1", "before": 50, "after": 50, "attrsHashBefore": "a", "attrsHashAfter": "a"},
                             {"serverId": 1002, "playerRef": "playerId=p2", "before": 70, "after": 70, "attrsHashBefore": "b", "attrsHashAfter": "b"}],
            }
            power_payload["reportHash"] = tool.sha256_json(power_payload)
            power_path.write_text(json.dumps(power_payload), encoding="utf-8")
            power = tool.read_native_power_report(power_path)
            self.assertEqual(power["status"], "pass")
            tool.ensure_apply_gates(
                loaded, report, power, backup_meta, f"APPLY:{loaded['mergeId']}", token, True, root
            )
            target = work / "target-staging"
            journal = work / "journal.json"
            first = tool.write_materialised_snapshot(loaded, root, target, journal)
            second = tool.write_materialised_snapshot(loaded, root, target, journal, resume=True)
            self.assertEqual(first["status"], "done")
            self.assertEqual(second["status"], "done")
            self.assertEqual(len(second["receipts"]), len(first["receipts"]))
            self.assertEqual(second["targetDigest"], tool.directory_digest(target))
            verified = tool.verify_materialised_snapshot(loaded, target, power, report)
            self.assertEqual(verified["status"], "pass")
            self.assertEqual(verified["productionWrites"], 0)
            self.assertTrue(backup_manifest.exists())

    def test_shared_account_roles_keep_origin_and_do_not_touch_unrelated_server(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            write_jsonl(root, "lhs_s1001", "players", [{"playerId": "p1", "userId": "u1", "name": "A", "serverId": 1001}])
            write_jsonl(root, "lhs_s1002", "players", [{"playerId": "p2", "userId": "u2", "name": "B", "serverId": 1002}])
            write_jsonl(root, "lhs_s1001", "accounts", [{
                "accountId": "a1", "roles": [
                    {"roleId": "r1", "userId": "u1", "serverId": 1001},
                    {"roleId": "r2", "userId": "u2", "serverId": 1002},
                    {"roleId": "r5", "userId": "u5", "serverId": 1005},
                ],
                "activeRoleByServer": {"1001": "r1", "1002": "r2", "1005": "r5"},
            }])
            manifest = tool.inventory_manifest(tool.make_manifest(args_for(root)), root)
            output = tool.build_output_records(manifest, root)
            account = output[("lhs_s1001", "accounts")][0]
            roles = {role["roleId"]: role for role in account["roles"]}
            self.assertEqual(roles["r1"]["serverId"], 1001)
            self.assertEqual(roles["r2"]["serverId"], 1002)
            self.assertEqual(roles["r5"]["serverId"], 1005)
            self.assertEqual(roles["r2"]["canonicalServerId"], 1001)
            self.assertNotIn("canonicalServerId", roles["r5"])
            self.assertEqual(account["activeRoleByServer"]["1002"], "r2")

    def test_paths_cannot_be_recursive_copy_targets(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            (root / "source").mkdir()
            manifest = tool.make_manifest(args_for(root / "source"))
            with self.assertRaises(tool.MergeToolError):
                tool.backup_snapshot(manifest, root / "source", root / "source" / "backup", None)

    def test_negative_native_power_blocks(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            path = Path(raw) / "power.json"
            path.write_text(json.dumps({"players": [{"playerRef": "playerId=p1", "before": 10, "after": 9, "attrsHashBefore": "a", "attrsHashAfter": "a"}]}), encoding="utf-8")
            report = tool.read_native_power_report(path)
            self.assertEqual(report["status"], "blocked")
            self.assertEqual(report["negativeDeltaCount"], 1)

    def test_native_power_must_cover_every_expected_player(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            path = Path(raw) / "power.json"
            path.write_text(json.dumps({"mergeId": "m", "planHash": "p", "players": []}), encoding="utf-8")
            with self.assertRaises(tool.MergeToolError):
                tool.read_native_power_report(path, [{"serverId": 1001, "playerRef": "playerId=p1"}])

    def test_source_hash_changes_are_visible_to_apply_gate(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            write_jsonl(root, "lhs_s1001", "players", [{"playerId": "p1", "userId": "u1", "name": "A", "serverId": 1001}])
            manifest = tool.inventory_manifest(tool.make_manifest(args_for(root)), root)
            before = tool.current_source_directory_hashes(manifest, root)
            (root / "lhs_s1001" / "players.jsonl").write_text(
                (root / "lhs_s1001" / "players.jsonl").read_text(encoding="utf-8") + "\n", encoding="utf-8"
            )
            after = tool.current_source_directory_hashes(manifest, root)
            self.assertNotEqual(before, after)


if __name__ == "__main__":
    unittest.main(verbosity=2)
