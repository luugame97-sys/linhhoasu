# Mine (Thái Cổ Thần Đình) latency audit — 20/09/2026

Read-only audit; no source, player or database changes.

## Evidence

- Live source hashes: `src/handlers/mine.js` `9977d32efc81f3b126c8295f02e3be1887cb8e7e1b8e76e5be79f3def7678016`; `src/services/MineExitValidationService.js` `bf02291cf06afcc606909814c50ec7153861e47cac958d8e8e4f3b483da6cb94`.
- `FeatureMutation.wrap` serializes a per-player mutation, drains pending saves, clones the canonical player, and `mine.js` awaits `FeatureMutation.save` before returning RPC 2801.
- `FeatureMutation.save` calls `PlayerService.savePlayer(..., {returnSaved:false})`; this clones the complete player and performs a Mongo `updateOne` with the complete snapshot under a per-user save queue.
- Pure live benchmark over the largest Mine states: JSON clone `0.14–0.85 ms`; `ensureMineInfo` `0.13–0.85 ms`. This is not enough to explain multi-second stalls.
- Historical live correlation on S3 user `u_Wk_1003_fd2b7a_1789319689857`:
  - 19/09 16:21:22: RPC 2801 `879 ms` (`route 863 ms`) and PlayerSave `dbMs=839`.
  - 19/09 16:21:30: queue wait for 2801 `7447 ms`; 16:21:31 RPC 2801 `751 ms` (`route 740 ms`) and PlayerSave `dbMs=725`.
  - 19/09 16:21:44: RPC 2801 `984 ms` (`route 973 ms`) and PlayerSave `dbMs=954`.
  - 17/09 15:29:50: RPC 2801 `1630 ms` (`route 1605 ms`) while PlayerSave logged `cloneMs=105/dbMs=1065/total=1411`.
- Current tail check (20/09 01:30Z) found no new 2800–2804 slow/error/queue lines on S1–S5. This is absence of traffic, not proof that the path is fast.
- Mongo current snapshot: 107 connections, 8 active; WiredTiger write tickets available 6/6 and queue 0 at measurement time. Player collection S1 average document size is about 38 KB. Historical stalls occurred during write contention; current idle state cannot reproduce them.

## Client-side contribution

The production bundle sets the Mine global mask before sending RPC 2801. The callback dispatches `Mine_Dig_Block_Update`; normal item55 animation includes movement and a 400 ms attack wait, and rocket animation is spread over each affected meter. `afterDigBlock` clears the mask only after the action list completes. Therefore a slow RPC directly extends the visible frozen state, while the animation itself adds a bounded delay. The callback does not branch on `result != 0` before dispatching the update.

## Fix implications

Measure route, save-queue wait, Mongo write and animation duration separately on a live request. Then reduce the Mine write path to an atomic, minimal Mine/economy delta with a per-player CAS/receipt, or coalesce a deferred snapshot without allowing replay or reordering. Preserve the existing mutation lock and native geometry invariants. Do not claim a client-only animation fix while the awaited full-player save remains in the 2801 critical path.
