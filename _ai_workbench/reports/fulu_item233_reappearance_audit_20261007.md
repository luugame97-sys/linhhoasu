# Fulu item233 reappearance — read-only audit 07/10/2026

## Evidence timeline

| Snapshot | item233 | Fulu receipts | updatedAt |
|---|---:|---:|---|
| before_claim | 0 | 0 | 08:51:11Z |
| after_claim | 1 | 1 | 08:56:11Z |
| after_draw | 0 | 3 | 08:58:48Z |
| after_hotfix_reconnect | 0 | 3 | 09:11:27Z |
| final_relog | 10 | 3 | 09:52:13Z |

No new Fulu receipt, draw receipt, or Fulu activity row explains +10. Fulu ledger remains claimed75001 and draw receipt remains exactly once.

## Server sources checked

- `PlayerService` new-player defaults set item4, item60/61 and arena ticket; no item233 default.
- `account.js` login normalization only keeps item4 minimum and validates item60/61; it does not grant item233.
- `CurrencySync` mirrors only IDs1/2/3/6; no item233 synthesis.
- `FarmOfflineService` is disabled; `FarmDayService` resets alchemy/ad/farm fields only.
- No mail with attachment id233 for this user; no AdminActionLog target in the inspected 08:50–10:00Z interval; no Transaction row in that interval. These are negative evidence, not proof of no client purchase.

## Strong matching source

Current player `shopInfo.buyRecords` has `11021001=3` and `11021002=1`. Exact `ShopConfig` rows for those token recharge IDs award item233 counts **3** and **7** respectively. Their sum is **10**, exactly the final reappearance. `compat.handleTokenRecharge1230` consumes token, applies the configured reward rows, updates purchase benefits and saves the player. This path does not create a `Transaction` or `AdminActionLog`, and success logging is not present, so the current DB audit cannot timestamp whether it ran between after_hotfix and final_relog.

Conclusion: +10 is consistent with two configured token-shop rewards and has no evidence of Fulu replay or login refill. It is not yet proven whether a client/background request, previous purchase whose item grant was delayed, or another authorized action caused it. Do not refund, backfill, or call it a bug until `shopInfo`/recharge records are captured at every checkpoint or a scoped success log for tag1230 is added.

## Native color verification

Client `generateHuluArray` directly maps server `colorCount` keys to assets `sp_ui_hulu_0{color}`. Assets verified: 01 green, 02 blue, 05 red. QA packet `{1:1,2:1,5:3}` therefore means one green, one blue, three red, matching the screenshot. Selected color index2 is blue (Khảm Thuỷ); arrangement display2 awards exchange item232×2. No color mapping defect found.

## Blocker before public exposure

Capture `shopInfo.buyRecords`, item233, Fulu ledger/receipts before and after relog; add structured success logging for tag1230 (`userId`, `payId`, `multi`, reward rows, requestId) without secrets. Keep Fulu public gate closed until the +10 source is attributable. No production writes were made in this audit.
