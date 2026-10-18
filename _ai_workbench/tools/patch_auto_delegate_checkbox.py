from pathlib import Path
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 occurrence, got {count}')
    return text.replace(old, new, 1)


def patch_main(path: Path) -> None:
    text = path.read_text(encoding='utf-8')
    text = replace_once(
        text,
        'autoDelegate:!!(U9.isOpen&&U9.autoConfig.enoughPower)',
        'autoDelegate:!!(U9.isOpen&&U9.autoConfig.autoDelegate)',
        'auto sale flag',
    )
    text = replace_once(
        text,
        'U9.autoConfig.enoughPower?this.autoDelegateEquip(t,e,i):',
        'U9.autoConfig.autoDelegate?this.autoDelegateEquip(t,e,i):',
        'auto equip flag',
    )
    text = replace_once(
        text,
        'this.powerCheckBox.selected=e.enoughPower,this.powerLab.text="Tự mặc đồ mạnh, bán đồ yếu",this.equipMaxQualityBox.selected=e.maxQualitySelect.isSelected',
        'this.powerCheckBox.selected=e.enoughPower,this.equipMaxQualityBox.selected=e.maxQualitySelect.isSelected,this.autoDelegateBox.selected=!!e.autoDelegate',
        'remove hidden label and bind checkbox',
    )
    text = replace_once(
        text,
        'this.summonBossCheckBox.addEventListener(egret.Event.CHANGE,this.onSummonBossCheckBox,this),this.bothCheckBox.addEventListener',
        'this.summonBossCheckBox.addEventListener(egret.Event.CHANGE,this.onSummonBossCheckBox,this),this.autoDelegateBox.addEventListener(egret.Event.CHANGE,this.autoDelegateCheckBox,this),this.bothCheckBox.addEventListener',
        'checkbox listener',
    )
    text = replace_once(
        text,
        '_.powerConditionCheckBox=function(){U9.autoConfig.enoughPower=!U9.autoConfig.enoughPower,this.orCheckBox.selected=U9.autoConfig.enoughPower&&!1,this.bothCheckBox.selected=U9.autoConfig.enoughPower&&!0,U9.autoConfig.isBoth=!0},_.maxQualityCheckBox=',
        '_.powerConditionCheckBox=function(){U9.autoConfig.enoughPower=!U9.autoConfig.enoughPower,this.orCheckBox.selected=U9.autoConfig.enoughPower&&!1,this.bothCheckBox.selected=U9.autoConfig.enoughPower&&!0,U9.autoConfig.isBoth=!0},_.autoDelegateCheckBox=function(){U9.autoConfig.autoDelegate=!U9.autoConfig.autoDelegate},_.maxQualityCheckBox=',
        'checkbox handler',
    )
    text = replace_once(
        text,
        't.writeBoolean(e.oldTrek_recruit_reward)',
        't.writeBoolean(e.oldTrek_recruit_reward),t.writeBoolean(e.autoDelegate)',
        'persist checkbox',
    )
    text = replace_once(
        text,
        'e.position<e.length&&(i.oldTrek_recruit_reward=e.readBoolean())',
        'e.position<e.length&&(i.oldTrek_recruit_reward=e.readBoolean()),e.position<e.length&&(i.autoDelegate=e.readBoolean())',
        'restore checkbox',
    )
    text = replace_once(
        text,
        't.oldTrek_recruit_reward=null!=t.oldTrek_recruit_reward&&t.oldTrek_recruit_reward',
        't.oldTrek_recruit_reward=null!=t.oldTrek_recruit_reward&&t.oldTrek_recruit_reward,t.autoDelegate=null!=t.autoDelegate&&t.autoDelegate',
        'default checkbox',
    )
    path.write_text(text, encoding='utf-8', newline='')


def patch_index(path: Path) -> None:
    text = path.read_text(encoding='utf-8')
    markers = ('20260831_auto_delegate1', '20260830_name_rename_fix2')
    old = next((marker for marker in markers if marker in text), None)
    if not old:
        raise RuntimeError(f'cache marker missing: {path}')
    text = text.replace(old, '20260831_auto_delegate_ui1')
    path.write_text(text, encoding='utf-8', newline='')


def main() -> None:
    if len(sys.argv) < 3 or len(sys.argv[1:]) % 2:
        raise SystemExit('usage: patch_auto_delegate_checkbox.py <main.js> <index.html> [pairs...]')
    args = [Path(value) for value in sys.argv[1:]]
    for index in range(0, len(args), 2):
        patch_main(args[index])
        patch_index(args[index + 1])
        print(f'PATCHED={args[index]} INDEX={args[index + 1]}')


if __name__ == '__main__':
    main()
