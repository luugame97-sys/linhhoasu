from __future__ import annotations

from pathlib import Path

from androguard.core.analysis.analysis import Analysis
from androguard.core.dex import DEX


DEX_PATH = Path(__file__).resolve().parents[1] / "temp" / "cn_apk_full_20260831" / "classes7.dex"


def main() -> None:
    dex = DEX(DEX_PATH.read_bytes())
    analysis = Analysis(dex)
    analysis.create_xref()
    wanted = ("lhsi.guangzhougy.com", "lhsitest.guangzhougy.com", "agent/", "agentID", "firstName", "res_url")
    for value in dex.get_strings():
        text = value.decode("utf-8", "ignore") if isinstance(value, bytes) else str(value)
        if not any(item.lower() in text.lower() for item in wanted):
            continue
        print(f"STRING: {text}")
        try:
            string_obj = analysis.get_strings_analysis().get(text)
            if string_obj is None:
                continue
            for method, offset in string_obj.get_xref_from():
                print("  XREF:", method, "offset", offset)
        except Exception as exc:
            print("  XREF_ERROR:", exc)


if __name__ == "__main__":
    main()
