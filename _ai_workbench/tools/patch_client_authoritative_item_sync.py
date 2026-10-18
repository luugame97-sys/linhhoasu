from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js"
INDEX = ROOT / "linhhoasu/webgame/game/index.html"
OLD_VERSION = "20260831_input_freeze_guard1"
NEW_VERSION = "20260831_artifact_item_sync2"


OLD = (
    "m.onItemChange=function(t){if(this.isFreeze)this.cacheMsg.push(t);else{"
    "for(var e=0,i=t.items;e<i.length;e++){"
)

NEW = (
    "m.onItemChange=function(t){if(this.isFreeze)this.cacheMsg.push(t);else{"
    "if(t&&Array.isArray(t.changed)&&t.changed.length){"
    "for(var _lhsAbs={},_lhsSeen={},_lhsItems=[],_lhsRows=Array.isArray(t.items)?t.items:[],"
    "_lhsIdx=0;_lhsIdx<t.changed.length;_lhsIdx++){"
    "var _lhsChanged=t.changed[_lhsIdx],_lhsChangedId=Number(_lhsChanged&&_lhsChanged.id);"
    "if(0<_lhsChangedId&&Number.isFinite(_lhsChangedId))"
    "_lhsAbs[_lhsChangedId]=Math.max(0,Math.floor(Number(_lhsChanged.count)||0))}"
    "for(_lhsIdx=0;_lhsIdx<_lhsRows.length;_lhsIdx++){"
    "var _lhsRow=_lhsRows[_lhsIdx],_lhsId=Number(_lhsRow&&_lhsRow.id);"
    "Object.prototype.hasOwnProperty.call(_lhsAbs,_lhsId)?"
    "(_lhsSeen[_lhsId]||(_lhsItems.push({id:_lhsId,count:_lhsAbs[_lhsId]-(Number(this._itemMap[_lhsId])||0)}),"
    "_lhsSeen[_lhsId]=1)):_lhsItems.push(_lhsRow)}"
    "for(var _lhsKey in _lhsAbs)_lhsSeen[_lhsKey]||"
    "_lhsItems.push({id:Number(_lhsKey),count:_lhsAbs[_lhsKey]-(Number(this._itemMap[_lhsKey])||0)});"
    "t.items=_lhsItems}"
    "for(var e=0,i=t.items||[];e<i.length;e++){"
)


def replace_exact(text, old, new, expected, label):
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"{label}: expected {expected} match, found {count}")
    return text.replace(old, new)


def main():
    bundle = BUNDLE.read_text(encoding="utf-8")
    if NEW in bundle:
        print("bundle already patched")
    else:
        bundle = replace_exact(bundle, OLD, NEW, 1, "ItemModel.onItemChange anchor")
        BUNDLE.write_text(bundle, encoding="utf-8", newline="")
        print("patched client ItemModel authoritative changed sync")

    index = INDEX.read_text(encoding="utf-8")
    if NEW_VERSION in index:
        print("index version already updated")
    else:
        index = replace_exact(index, OLD_VERSION, NEW_VERSION, 2, "index cache version")
        INDEX.write_text(index, encoding="utf-8", newline="")
        print(f"updated cache version to {NEW_VERSION}")


if __name__ == "__main__":
    main()
