from __future__ import annotations

import logging
from pathlib import Path

from androguard.core.dex import DEX


DEX_PATH = Path(__file__).resolve().parents[1] / "temp" / "cn_apk_full_20260831" / "classes7.dex"


def main() -> None:
    logging.disable(logging.CRITICAL)
    dex = DEX(DEX_PATH.read_bytes())
    wanted = (
        "Lcom/shiyi/ddxy/MainActivity;",
        "Lcom/shiyi/ddxy/AppConfig;",
        "Lcom/shiyi/ddxy/sdk/SDKBase;",
    )
    for klass in dex.get_classes():
        name = klass.get_name()
        if name not in wanted:
            continue
        print(f"=== CLASS {name} ===")
        for method in klass.get_methods():
            print(f"--- {method.get_name()} {method.get_descriptor()} ---")
            try:
                code = method.get_code()
                if code is None:
                    print("<no code>")
                    continue
                for ins in code.get_bc().get_instructions():
                    print(" ", ins.get_name(), ins.get_output())
            except Exception as exc:
                print("<error>", exc)


if __name__ == "__main__":
    main()
