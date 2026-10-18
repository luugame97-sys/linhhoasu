from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TARGETS = [
    ROOT / "linhhoasu/webgame/game/js/main.min_a6195824.js",
    ROOT / "linhhoasu/lhs/js/main.min_a6195824.js",
]

REPLACEMENTS = [
    (
        'f.GetInitShowDataByKungfu=function(t,e){for(var t=Y.Config.RoleGenderConfig[t][e=void 0===e?0:e],i={},n=0,a=t.initShows;n<a.length;n++){var s=a[n],o=Y.Config.FashionConfig[s];i[x.FashionTypeToShowType[o.type]]=s}return i[it.lian]=t.faceShow,i[it.gender]=t.gender,i},',
        'f.GetInitShowDataByKungfu=function(t,e){var i=Y.Config.RoleGenderConfig||{},n=void 0===e?0:e,a=i[t]||i[4]||i[1]||i[0]||{},a=a[n]||a[0]||a[1]||{},s={},o=Array.isArray(a.initShows)?a.initShows:[];for(var r=0;r<o.length;r++){var l=o[r],h=Y.Config.FashionConfig[l];h&&(s[x.FashionTypeToShowType[h.type]]=l)}return s[it.lian]=a.faceShow||0,s[it.gender]=a.gender||0,s},',
    ),
    (
        'f.CreteShowDataByInfo=function(t){var e,i;return t=t&&"object"==typeof t?t:this.CreateEmptyShowInfo(4,0),AppInfo.ckState?',
        'f.CreteShowDataByInfo=function(t){var e,i;return t=t&&"object"==typeof t?t:this.CreateEmptyShowInfo(4,0),t.fashionMap=t.fashionMap&&"object"==typeof t.fashionMap?t.fashionMap:{},t.equipMap=t.equipMap&&"object"==typeof t.equipMap?t.equipMap:{},AppInfo.ckState?',
    ),
    (
        'i=Y.Config.RoleGenderConfig[t.kungfuId][t.subJob],e[it.gender]=i.gender,',
        'i=(Y.Config.RoleGenderConfig[t.kungfuId]||Y.Config.RoleGenderConfig[4]||Y.Config.RoleGenderConfig[1]||Y.Config.RoleGenderConfig[0]||{})[t.subJob],i=i||(Y.Config.RoleGenderConfig[t.kungfuId]||Y.Config.RoleGenderConfig[4]||Y.Config.RoleGenderConfig[1]||Y.Config.RoleGenderConfig[0]||{})[0]||{gender:0},e[it.gender]=i.gender||0,',
    ),
    (
        'n=Y.Config.RoleGenderConfig[t.kungfuId][n],o=n?n.gender:0;',
        'n=(Y.Config.RoleGenderConfig[t.kungfuId]||Y.Config.RoleGenderConfig[4]||Y.Config.RoleGenderConfig[1]||Y.Config.RoleGenderConfig[0]||{})[n]||(Y.Config.RoleGenderConfig[t.kungfuId]||Y.Config.RoleGenderConfig[4]||Y.Config.RoleGenderConfig[1]||Y.Config.RoleGenderConfig[0]||{})[0],o=n?n.gender:0;',
    ),
    (
        'e=Y.Config.RoleGenderConfig[a][t],this.isMale=0==e.gender,',
        'e=(Y.Config.RoleGenderConfig[a]||Y.Config.RoleGenderConfig[4]||Y.Config.RoleGenderConfig[1]||Y.Config.RoleGenderConfig[0]||{})[t]||(Y.Config.RoleGenderConfig[a]||Y.Config.RoleGenderConfig[4]||Y.Config.RoleGenderConfig[1]||Y.Config.RoleGenderConfig[0]||{})[0]||{gender:0},this.isMale=0==e.gender,',
    ),
    (
        'f=Y.Config.RoleGenderConfig[a][p],this.isMale=0==f.gender,',
        'f=(Y.Config.RoleGenderConfig[a]||Y.Config.RoleGenderConfig[4]||Y.Config.RoleGenderConfig[1]||Y.Config.RoleGenderConfig[0]||{})[p]||(Y.Config.RoleGenderConfig[a]||Y.Config.RoleGenderConfig[4]||Y.Config.RoleGenderConfig[1]||Y.Config.RoleGenderConfig[0]||{})[0]||{gender:0},this.isMale=0==f.gender,',
    ),
]


def patch_file(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    changed = False
    for old, new in REPLACEMENTS:
        old_count = text.count(old)
        new_count = text.count(new)
        if old_count == 1:
            text = text.replace(old, new, 1)
            changed = True
        elif old_count == 0 and new_count == 1:
            continue
        else:
            raise RuntimeError(
                f"Unexpected replacement count for {path}: old={old_count}, new={new_count}"
            )
    if changed:
        path.write_text(text, encoding="utf-8", newline="")
    print(f"{path}: {'patched' if changed else 'already patched'}")


def main() -> None:
    for target in TARGETS:
        if target.is_file():
            patch_file(target)


if __name__ == "__main__":
    main()
