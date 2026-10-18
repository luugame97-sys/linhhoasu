# Review OldTrek candidate vs Fulu/other task writes — 07/10/2026

Read-only review; no source/deploy/player writes. Candidate reviewed:
`_ai_workbench/temp/event_goal_20261007/oldtrek/candidate/src/`.

## Verified positives

- Existing candidate tests pass: `test-scoped.js` 11/11 and `test-handler.js` 9/9; both report `productionWrites=0`, `networkCalls=0`.
- Scoped patch retains `other_attr_info` subtrees, items/currencies and OldTrek ledger under CAS. Level downgrade is rejected. Unrelated remote level/task updates are rebased when ancestor metadata is current.
- Deferred saves are drained before OldTrek preflight. Read failure, true same-field conflict, CAS miss and uncertain commit fail closed. Durable request receipt is checked before any retry, so no blind duplicate reward/cargo debit.
- `saveOldTrekScoped` uses `$set` only changed fields, guards oldTrek/items/currencies plus changed paths, and does not restore the entire player document.

## Blocker found: deferred-save WeakMap ancestor drift

`OldTrekSnapshotService.persisted` is a WeakMap. `savePlayerDeferred()` clones pending data at flush time and `savePlayer()` remembers the clone, but it does not refresh the original live player object's ancestor fingerprint. If a separate task/Fulu flow then mutates that same live object before a new OldTrek request:

1. Original live object ancestor is taskInfo=2.
2. Deferred snapshot writes taskInfo=6 to Mongo.
3. Live object is changed locally to taskInfo=7.
4. New Mongo preflight reads taskInfo=6.
5. `rebase(live, remote)` sees a two-sided change from stale ancestor and returns `conflicts:['taskInfo']`.

This reproduces in `tools/test_oldtrek_fulu_interleave_20261007.js` with the actual candidate PlayerService and RAM Mongo adapter. It is safe against overwrite, but causes unnecessary `OLD_TREK_RESYNC_REQUIRED`/disconnect during auto-farming and task progress. The same shape can involve `other_attr_info` and Fulu ledger, so it must be fixed or explicitly accepted before canary.

Suggested narrow fix for the OldTrek agent: after deferred save confirms, call `oldTrekSnapshots.remember(pending.data, snapshot, onlyFields)` (or inherit the confirmed snapshot fingerprint into the live source object) before resolving waiters. Keep the exact fields/unknown commit semantics; do not weaken conflict checks or copy the whole DB document into an old session. Add this interleave case to scoped tests.

## Fulu CAS compatibility

- Fulu `Activity52Service` and task service guard `activityInfo/items/currencies/other_attr_info/level` through the PhaseAB `activity52CAS` path. OldTrek patch guards its own changed paths and the same economy roots. A true concurrent same-field change is correctly rejected, preserving Fulu receipts/rewards.
- The review did not find evidence that OldTrek scoped patch overwrites a committed Fulu ledger when the ancestor is current. The blocker is stale WeakMap metadata after deferred writes, not an unsafe overwrite.
- Existing `savePlayer` full-save writers remain outside this scoped CAS; do not claim system-wide conflict safety.

## Gates before canary

1. Fix or test-accept the deferred-save ancestor drift above; rerun 11+9 existing tests and the new interleave test.
2. Verify taskInfo, `fuluTaskLedger`, items232/233, level/EXP and OldTrekInfo in one concurrent fixture; ensure true same-field conflicts remain fail-closed.
3. Recheck `FeatureReceiptService` replay after commit timeout; no duplicate reward/cargo.
4. Only then canary S6/authorized QA, with structured resync counts and readiness. This review does not authorize deployment.
