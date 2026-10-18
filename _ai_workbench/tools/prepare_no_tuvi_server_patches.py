from pathlib import Path

root = Path(r"I:\Linhhoasu\server\server")
remote = root / "_ai_workbench" / "temp" / "donate_remote_current"
local = root / "linhhoasu" / "lhs" / "newServer" / "src"

# Preserve all remote changes and replace only the skill-upgrade function.
remote_upgrade = (remote / "upgrade.js").read_text(encoding="utf-8")
local_upgrade = (local / "handlers" / "upgrade.js").read_text(encoding="utf-8")
start = "async function handleSkillUpgrade(params, session, msgUid) {"
end = "\n// 功法技能顺序调整"
rs, re = remote_upgrade.index(start), remote_upgrade.index(end, remote_upgrade.index(start))
ls, le = local_upgrade.index(start), local_upgrade.index(end, local_upgrade.index(start))
patched_upgrade = remote_upgrade[:rs] + local_upgrade[ls:le] + remote_upgrade[re:]
(remote / "upgrade.no_tuvi.js").write_text(patched_upgrade, encoding="utf-8")

# Add durable per-user claim serialization/ledger and replace only mail claim.
remote_mail = (remote / "handlers_mail.js").read_text(encoding="utf-8")
local_mail = (local / "handlers" / "mail.js").read_text(encoding="utf-8")
anchor = "const { ensureRoleAppearance, unlockEquipAppearance } = require('../services/RoleAppearanceService');"
helper_start = "const MAIL_CLAIM_LEDGER_LIMIT = 4000;"
helper_end = "\nfunction toClientSender"
if helper_start not in remote_mail:
    h1, h2 = local_mail.index(helper_start), local_mail.index(helper_end, local_mail.index(helper_start))
    remote_mail = remote_mail.replace(anchor, anchor + "\n" + local_mail[h1:h2], 1)
claim_start = "async function handleMailClaim"
claim_end = "\nasync function handleMailDelete"
rs, re = remote_mail.index(claim_start), remote_mail.index(claim_end, remote_mail.index(claim_start))
ls = local_mail.index("async function handleMailClaimUnlocked")
le = local_mail.index(claim_end, ls)
patched_mail = remote_mail[:rs] + local_mail[ls:le] + remote_mail[re:]
(remote / "handlers_mail.no_tuvi.js").write_text(patched_mail, encoding="utf-8")
print("prepared", remote / "upgrade.no_tuvi.js", remote / "handlers_mail.no_tuvi.js")
