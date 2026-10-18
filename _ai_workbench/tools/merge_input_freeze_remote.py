"""Merge freeze fixes into current production arena/account snapshots."""
from __future__ import annotations

import hashlib
from pathlib import Path

ROOT = Path(r"I:\Linhhoasu\server\server")
REMOTE = ROOT / "_ai_workbench" / "temp" / "input_freeze_remote_current"
OUT = ROOT / "_ai_workbench" / "temp" / "input_freeze_merged"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one anchor, got {count}")
    return text.replace(old, new, 1)


arena_path = REMOTE / "lhs" / "newServer" / "src" / "handlers" / "arena.js"
arena = arena_path.read_text(encoding="utf-8")
arena = replace_once(
    arena,
    """function buildArenaChallengeRowFromPlayer(targetPlayer, serverId) {
  const show = clonePlayerSnapshot(targetPlayer);""",
    """function buildArenaChallengeRowFromPlayer(targetPlayer, serverId, options = {}) {
  // Lean opponent rows are short-lived read models; do not clone a full
  // player document for each candidate in the hot Arena path.
  const show = options.clone === false ? (targetPlayer || {}) : clonePlayerSnapshot(targetPlayer);""",
    "arena row clone",
)
arena = replace_once(
    arena,
    """    const accountRows = await Account.find(
      { 'roles.serverId': serverId },
      { roles: 1, _id: 0 }
    ).lean();""",
    """    const accountRows = await Account.find(
      { 'roles.serverId': serverId },
      {
        'roles.userId': 1,
        'roles.serverId': 1,
        'roles.lastLoginTime': 1,
        'roles.createTime': 1,
        _id: 0,
      }
    ).select({
      'roles.userId': 1,
      'roles.serverId': 1,
      'roles.lastLoginTime': 1,
      'roles.createTime': 1,
      _id: 0,
    }).maxTimeMS(1500).lean();""",
    "arena account query",
)
arena = replace_once(
    arena,
    "    const playerRows = await Player.find({ userId: { $in: userIds } }).lean();",
    """    const playerRows = await Player.find({ userId: { $in: userIds } })
      .maxTimeMS(1500)
      .lean();""",
    "arena player query",
)
arena = replace_once(
    arena,
    "      challengers.push(buildArenaChallengeRowFromPlayer(targetPlayer, serverId));",
    "      challengers.push(buildArenaChallengeRowFromPlayer(targetPlayer, serverId, { clone: false }));",
    "arena candidate conversion",
)
arena = replace_once(
    arena,
    """  const myRank = playerId ? await rank.getRank('arena', playerId) : 999;
  const challengelist = await buildArenaChallengeList(session, player);""",
    """  const [myRank, challengelist] = await Promise.all([
    playerId ? rank.getRank('arena', playerId).catch(() => -1) : Promise.resolve(999),
    buildArenaChallengeList(session, player),
  ]);""",
    "arena info parallel reads",
)
arena = replace_once(
    arena,
    """  await notifyArenaTargetUpdate(selectedChallenge, player, arenaServerId, crossArena ? 5003 : 2603);
  const myRank = player.playerId ? await rank.getRank(rankType, player.playerId) : 999;""",
    """  // Target refresh is best-effort and must not hold the initiator's FIFO queue.
  void notifyArenaTargetUpdate(selectedChallenge, player, arenaServerId, crossArena ? 5003 : 2603)
    .catch((err) => logger.warn(`[Arena] target update detached: ${err.message}`));
  const myRank = player.playerId
    ? await rank.getRank(rankType, player.playerId).catch(() => -1)
    : 999;""",
    "arena detached push",
)

account_path = REMOTE / "lhs" / "newServer" / "src" / "db" / "models" / "Account.js"
account = account_path.read_text(encoding="utf-8")
account = replace_once(
    account,
    "module.exports = model('Account', accountSchema);",
    "// Arena/server-role lookups use embedded role fields; keep them indexed.\naccountSchema.index({ 'roles.serverId': 1 });\naccountSchema.index({ 'roles.userId': 1 });\n\nmodule.exports = model('Account', accountSchema);",
    "account role indexes",
)

for rel, payload in (
    (Path("lhs/newServer/src/handlers/arena.js"), arena),
    (Path("lhs/newServer/src/db/models/Account.js"), account),
):
    target = OUT / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(payload, encoding="utf-8", newline="")
    print(f"{rel} sha256={hashlib.sha256(payload.encode('utf-8')).hexdigest()}")
print(f"OUTPUT={OUT}")
