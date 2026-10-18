# Event live health — 07/10/2026

Read-only audit at 13:56 ICT. No production edits, restart, gameplay RPC, browser input or player writes.

## Current verified findings

- S1–S7: PM2 online; `/ready` HTTP200/status ok; Mongo/Redis true. All five inspected flags (rotation, native rotation, cross event, event settlement, OldTrek settlement) are `1`.
- Bounded log scan: at most 262,144 bytes per node/log. No matching CrossEvent/CrossArena/TypeError/uncaught/unhandled error in this sample. `EventSettlement enabled v2` lines are startup notices.
- **S6 OldTrek: six `OLD_TREK_SAVE_NOT_CONFIRMED` errors on 07/10, 09:18:16–09:22:15 ICT**, five RPC7008 and one RPC7002. Log context shows `Player skip stale save ... incomingLevel=544` immediately before errors at 09:20:15, 09:21:09 and 09:22:15 for the same player. After 09:21:09, router rejects unauthenticated requests and socket closes; login follows at 09:21:53. This is a real interrupted gameplay/save flow; reward loss was not established.
- Source mapping: `old-trek.js` RPC7008 checkpoints the voyage and synchronizes passive rewards/offline cache; RPC7002 resolves a voyage encounter. Suspected root layer is stale player save conflict, which requires a separate focused fix audit before changes.

## Event settlement and exposure

- S1 shared cross-event DB recent CrossArena daily 06/10: done, 9 recipients/9 delivered; 05/10: 6/6; last completed weekly CrossArena:12/12; CrossRival weekly:4/4. Empty `lastError`.
- Scheduler cursor documents for all seven nodes have `state=pending`, zero recipients and empty `lastError`; these are cursor metadata, not evidence of failed reward delivery.
- Recent sampled Fishing/Kim Ma/OldTrek reward receipts inspected across S1–S7 are done. This bounded receipt sample does not establish every historical reward correct.
- Active persisted player activity rows currently include type21/27/30/37/49/52 (e.g. S7 each has 70 rows), plus Fortune43002 and KimMa44002. This establishes state generation, not menu accessibility or gameplay correctness. Config `requiresNativeQa` alone is not a feature lock.
- Current native rotation includes seven-day families21/27/30/37/43/44/49/52. Activation pass7/login privileges9 have registry `enabled:false`, but old/personal activity rows remain present, so do not equate registry disabled with paid entitlement unavailable.

## Evidence method

- Reused `_ai_workbench/tools/audit_events_current_20261003.js` read-only logic through SSH, suppressing large source/config fields in tool output. It uses bounded log tails, readonly config decode, readiness requests, and Mongo projections/aggregations.
- Follow-up read only: latest262144 bytes of `/root/.pm2/logs/lhs-s1006-out.log`, filtered to 09:18–09:22. No output file written on production.
- Full browser/native E2E for every event was not performed.
