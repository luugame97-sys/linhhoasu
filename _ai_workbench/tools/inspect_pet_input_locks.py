"""Extract Pet UI lock/replacement contexts from the production client bundle."""
from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js"
OUTPUT = ROOT / "_ai_workbench/temp/pet_input_lock_contexts.txt"
PATTERNS = (
    "Y.PetModel.sendUseEgg",
    "Y.PetModel.sendCompose",
    "Y.PetModel.sendPetEat",
    "Y.PetModel.sendPetSwap",
    "Pet_ReplaceMent_View_Update",
    "e_hit",
)


def main() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    output: list[str] = []
    for pattern in PATTERNS:
        shown = 0
        for match in re.finditer(re.escape(pattern), source):
            start = max(0, match.start() - 2800)
            end = min(len(source), match.end() + 4200)
            context = source[start:end]
            if pattern == "e_hit" and "Pet" not in context and "pet" not in context:
                continue
            shown += 1
            pretty = context.replace(";", ";\n").replace("},", "},\n")
            output.append(f"===== pattern={pattern} offset={match.start()} =====\n{pretty}")
        output.append(f"===== pattern={pattern} shown={shown} =====")
    OUTPUT.write_text("\n".join(output), encoding="utf-8")
    print(f"source={SOURCE}")
    print(f"output={OUTPUT}")


if __name__ == "__main__":
    main()
