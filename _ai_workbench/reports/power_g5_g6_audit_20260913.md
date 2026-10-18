# Power HUD G5/G6 audit — 2026-09-13

## G5 — release integrity

- Server/client syntax: **PASS** (`node --check` for `lhs-power-display-v1.js`, `lhs-power-relogin-v1.js`).
- Read-only pipeline audit: **PASS**; `productionWrites=0`.
- Codec round-trip: **PASS** (1 through 2^53-1 fixtures).
- Producer projection contract: **FAIL / HOLD**. Audit fixture shows Arena projection keys but no canonical `combatPowerValue`, version, unit, revision metadata.
- Attr config parity: **FAIL / HOLD**. Server config SHA256 `5b494d...bbc8de`; client config SHA256 `9a405a...11c7b`; weighted-attrs hash matches, but full bundle hashes differ and require release decision.

## G6 — acceptance evidence

- Formatter source audit: **PASS** for numeric formatting and glyph inventory; no native screenshot or live same-player comparison.
- Virtual bot fixture: **HOLD** (`hasRobotAttrsInSnapshot=false`; source/config fixture only).
- Native player E2E (login → HUD/profile/map/Arena → mutate bonus → relog): **NOT RUN**.
- VPS readiness/hash/log checks: **NOT RUN**; no deploy performed.

## Release manifest (candidate, not deployed)

- Server calculator: `linhhoasu/lhs/newServer/src/services/BattleService.js`
- Client HUD: `linhhoasu/webgame/game/js/lhs-power-display-v1.js`
- Client relogin guard: `linhhoasu/webgame/game/js/lhs-power-relogin-v1.js`
- Cache-bust entry: `linhhoasu/webgame/game/index.html` (`20260913_power_display_v2`)
- Required gates before deploy: add canonical metadata to remaining producers; resolve config hash policy; run native E2E; then VPS backup → narrow deploy → readiness/hash/log invariants.

**Decision: G5/G6 not fully green; deployment must remain blocked.**
