# Fix `invalid_tower_skill` — 18/10/2026

- Root cause: the client sent duplicate RPC 3700 requests while the first selection was still saving. The second request reused the old `select` index; after the first response removed that option, the server correctly returned `invalid_tower_skill`.
- Fix: `lhs-tower-fix-v2.js` now allows only one 3700 request in flight per tower model. Duplicate taps are ignored until success/failure/network callback; the lock is then released for the next deliberate choice. Cache version is `tower_fix_v4`.
- Production static rollout verified with CAS/backup/HTTPS on the shared client: backup `/linhhoasu/_ai_workbench/backups/tower_skill_singleflight_20261018_210226`, no restart and no player writes.
- Tests: 6 client VM groups PASS, including duplicate confirm; prior 16 server groups remain PASS. S1–S9 share this web bundle through the common web root.
- Reward audit remains separate: live handler includes rewards for manual wins at 780/790/800; the reported player identity `hung1992` was not found in current account/player collections, so no reward backpay was performed.
