from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js"
OUT = ROOT / "_ai_workbench/temp/login_privileges_exact_context.txt"


def main() -> None:
    text = BUNDLE.read_text(encoding="utf-8")
    blocks = []
    for term in (
        '"LoginPrivilegesBuyWin"',
        '"LoginPrivilegesCell"',
        '"LoginPrivilegesMainWin"',
        '"LoginPrivilegesLevelItem"',
        "tUt.getPayId=function",
        "tUt.checkIsBuyPrivileges=function",
    ):
        start = 0
        while True:
            pos = text.find(term, start)
            if pos < 0:
                break
            blocks.append(
                f"=== {term} @ {pos} ===\n"
                + text[max(0, pos - 14000) : pos + 4000]
                .encode("ascii", "backslashreplace")
                .decode("ascii")
            )
            start = pos + len(term)
    OUT.write_text("\n".join(blocks), encoding="utf-8")
    print(OUT)


if __name__ == "__main__":
    main()
