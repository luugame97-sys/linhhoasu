"""Restore explicit H5 task guides while keeping the idle-guide gate disabled."""

import sys
from pathlib import Path


OLD_START = "sOt.Start=function(t){if(!RuntimeUtil.isRuntime)return;var e;"
NEW_START = "sOt.Start=function(t){var e;"
OLD_VERSION = "20260904_double_monsters1"
NEW_VERSION = "20260904_task_guide_restore1"


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError("{} anchor expected once, found {}".format(label, count))
    return text.replace(old, new, 1)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_restore_h5_task_guide_20260904.py BUNDLE INDEX")
    bundle = Path(sys.argv[1])
    index = Path(sys.argv[2])
    source = bundle.read_text(encoding="utf-8")
    page = index.read_text(encoding="utf-8")
    if NEW_START in source and NEW_VERSION in page:
        print("already patched")
        return
    source = replace_once(source, OLD_START, NEW_START, "GuideUtil.Start H5 gate")
    page = replace_once(page, OLD_VERSION, NEW_VERSION, "client cache version")
    bundle.write_text(source, encoding="utf-8", newline="")
    index.write_text(page, encoding="utf-8", newline="")
    print("restored explicit H5 task guides; automatic idle guide remains gated")


if __name__ == "__main__":
    main()
