from __future__ import annotations

import argparse
import difflib
import re
from pathlib import Path


TERMS = (
    "guideTimeCheck=function",
    "timeGuideCheck=function",
    "PowerSavingModePanel",
    "waitPlayEnd=function",
    "showCloud=function",
    "hideCloud=function",
    "checkFullScreenDialog=function",
    "hideMainUI=function",
    "showMainUI=function",
    "closeEasy=function",
    "onRemovedFromStage=function",
    "idleTouchTime",
)


def esc(value: str) -> str:
    return value.encode("ascii", "backslashreplace").decode("ascii")


def snippets(path: Path) -> str:
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = [f"### {path} len={len(text)}"]
    for term in TERMS:
        positions = [m.start() for m in re.finditer(re.escape(term), text)]
        lines.append(f"{term} count={len(positions)} positions={positions[:12]}")
        for pos in positions[:2]:
            lines.append(esc(text[max(0, pos - 180) : pos + 1000]))
    return "\n".join(lines)


def token_diff(left: Path, right: Path, limit: int) -> str:
    # A delimiter tokenizer makes a useful, bounded comparison without asking
    # SequenceMatcher to index several million individual characters.
    pattern = re.compile(r"(?:[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|===|!==|=>|==|!=|&&|\|\||[{}()\[\].,:;?+*/%<>=!~-])")
    a = pattern.findall(left.read_text(encoding="utf-8", errors="replace"))
    b = pattern.findall(right.read_text(encoding="utf-8", errors="replace"))
    sm = difflib.SequenceMatcher(None, a, b, autojunk=True)
    out = [f"TOKEN_DIFF {left} ({len(a)}) -> {right} ({len(b)})"]
    ops = [op for op in sm.get_opcodes() if op[0] != "equal"]
    out.append(f"operations={len(ops)}")
    for tag, i1, i2, j1, j2 in ops[:limit]:
        out.append(f"{tag} a[{i1}:{i2}] b[{j1}:{j2}] A={a[i1:i2][:35]!r} B={b[j1:j2][:35]!r}")
    return "\n".join(out)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+", type=Path)
    parser.add_argument("--diff", nargs=2, type=Path)
    parser.add_argument("--limit", type=int, default=80)
    args = parser.parse_args()
    for path in args.paths:
        print(snippets(path))
    if args.diff:
        print(token_diff(args.diff[0], args.diff[1], args.limit))


if __name__ == "__main__":
    main()
