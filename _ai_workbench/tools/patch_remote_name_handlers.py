from pathlib import Path
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)


def patch_task(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    text = replace_once(
        text,
        "const { nowNs, recordTaskPushNs } = require('../services/TaskPerfService');",
        "const { nowNs, recordTaskPushNs } = require('../services/TaskPerfService');\n"
        "const { validatePlayerName, isNameTaken, syncAccountRoleName } = require('../services/PlayerNameService');",
        "task import",
    )
    text = replace_once(
        text,
        "  const newName = String((params && (params.name || params.newName)) || '').trim();\n"
        "  if (!newName || newName.length < 1 || newName.length > 16) {\n"
        "    return { tag: 21, msgUid, data: { result: 1 } };\n"
        "  }\n"
        "  if (!/^[\\u4e00-\\u9fa5a-zA-Z0-9_]+$/.test(newName)) {\n"
        "    return { tag: 21, msgUid, data: { result: 1 } };\n"
        "  }",
        "  const newName = String((params && (params.name || params.newName)) || '');\n"
        "  const nameValidation = validatePlayerName(newName);\n"
        "  if (!nameValidation.ok) {\n"
        "    return { tag: 21, msgUid, data: { result: 1 } };\n"
        "  }\n"
        "  if (session._isBot) return { tag: 21, msgUid, data: { result: 1, name: player.name || '' } };\n"
        "  if (await isNameTaken(nameValidation.name, session.userId)) {\n"
        "    return { tag: 21, msgUid, data: { result: 1 } };\n"
        "  }",
        "task validation",
    )
    text = replace_once(text, "  player.name = newName;\n", "  player.name = nameValidation.name;\n", "task assignment")
    text = replace_once(
        text,
        "    await playerService.savePlayer(session.userId, player, { returnSaved: false });\n  } catch (err) {",
        "    await playerService.savePlayer(session.userId, player, { returnSaved: false });\n"
        "    await syncAccountRoleName(session.userId, player.name);\n  } catch (err) {",
        "task sync",
    )
    path.write_text(text, encoding="utf-8")


def patch_compat(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    text = replace_once(
        text,
        "const { getBoxSkipUnitMs, getClientBoxEndTimeSec } = require('../utils/boxTiming');",
        "const { getBoxSkipUnitMs, getClientBoxEndTimeSec } = require('../utils/boxTiming');\n"
        "const { validatePlayerName, isNameTaken, syncAccountRoleName } = require('../services/PlayerNameService');",
        "compat import",
    )
    text = replace_once(
        text,
        "  const newName = String(params.name || params.newName || '').trim();\n"
        "  if (!newName || newName.length > 16) {",
        "  const newName = String(params.name || params.newName || '');\n"
        "  const validation = validatePlayerName(newName);\n"
        "  if (!validation.ok || await isNameTaken(validation.name, session && session.userId)) {",
        "compat validation",
    )
    text = replace_once(text, "  player.name = newName;\n", "  player.name = validation.name;\n", "compat assignment")
    text = replace_once(
        text,
        "  await saveSessionPlayer(session, player);\n\n  return {\n    tag: 22,",
        "  await saveSessionPlayer(session, player);\n  await syncAccountRoleName(session.userId, player.name);\n\n  return {\n    tag: 22,",
        "compat sync",
    )
    path.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_remote_name_handlers.py task.js compat.js")
    patch_task(Path(sys.argv[1]))
    patch_compat(Path(sys.argv[2]))
    print("patched task and compat")
