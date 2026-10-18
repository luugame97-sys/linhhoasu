from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js"
INDEX = ROOT / "linhhoasu/webgame/game/index.html"
OLD_VERSION = "20260831_input_freeze_guard2"
NEW_VERSION = "20260831_land_settle_guard3"

OLD = (
    'POe.prototype.OnOpen=function(){for(var t=this,e=[],i=0;i<arguments.length;i++)'
    'e[i]=arguments[i];this.commonWin.OnAdded(this),this.list.itemRenderer=Pu,'
    'this.list.dataProvider=new U.ArrayCollection(e[0]),this.titleSp.setAnimation(0,"a_1",!1)'
    '.waitPlayEnd().then(function(){t.titleSp.setAnimation(0,"a_2",!0)}),'
    'F.get(this.mainGroup).set({alpha:0}).to({alpha:1},400)},POe.LAYER_LEVEL=I.UI_Popup'
)

NEW = (
    'POe.prototype.OnOpen=function(){for(var t=this,e=[],i=0;i<arguments.length;i++)'
    'e[i]=arguments[i];this.commonWin.OnAdded(this),this.list.itemRenderer=Pu,'
    'this.list.dataProvider=new U.ArrayCollection(e[0]),this.titleSp.setAnimation(0,"a_1",!1)'
    '.waitPlayEnd().then(function(){t.titleSp.setAnimation(0,"a_2",!0)}),'
    'F.get(this.mainGroup).set({alpha:0}).to({alpha:1},400),'
    'this._lhsStealSettleSeq=(this._lhsStealSettleSeq||0)+1;'
    'var n=this._lhsStealSettleSeq,a=function(){t._lhsStealSettleSeq==n&&t.CloseSelf()};'
    'this._lhsStealSettleClose=a,this.touchEnabled=!0,'
    'this.addEventListener(egret.TouchEvent.TOUCH_TAP,a,this),setTimeout(a,3500)},'
    'POe.prototype.OnClose=function(){this._lhsStealSettleSeq=(this._lhsStealSettleSeq||0)+1,'
    'this._lhsStealSettleClose&&(this.removeEventListener(egret.TouchEvent.TOUCH_TAP,'
    'this._lhsStealSettleClose,this),this._lhsStealSettleClose=null)},'
    'POe.LAYER_LEVEL=I.UI_Popup'
)


def replace_exact(text, old, new, count, label):
    actual = text.count(old)
    if actual != count:
        raise RuntimeError(f"{label}: expected {count}, found {actual}")
    return text.replace(old, new)


def main():
    bundle = BUNDLE.read_text(encoding="utf-8")
    if NEW in bundle:
        print("bundle already patched")
    else:
        bundle = replace_exact(bundle, OLD, NEW, 1, "LandStealSettlementPanel.OnOpen")
        BUNDLE.write_text(bundle, encoding="utf-8", newline="")
        print("patched LandStealSettlementPanel tap/timeout terminal")

    index = INDEX.read_text(encoding="utf-8")
    if NEW_VERSION in index:
        print("index already versioned")
    else:
        index = replace_exact(index, OLD_VERSION, NEW_VERSION, 2, "index cache token")
        INDEX.write_text(index, encoding="utf-8", newline="")
        print(f"updated cache token to {NEW_VERSION}")


if __name__ == "__main__":
    main()
