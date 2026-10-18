from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];BUNDLE=ROOT/'linhhoasu/webgame/game/js/main.min_a6195824.js';INDEX=ROOT/'linhhoasu/webgame/game/index.html'
OLD_VERSION='20260831_web_no_idle_guide_guard8';NEW_VERSION='20260831_web_no_guide_mask_guard9'
OLD='sOt.Start=function(t){var e;'
NEW='sOt.Start=function(t){if(!RuntimeUtil.isRuntime)return;var e;'
def main():
 raise RuntimeError('DEPRECATED: blanket H5 GuideUtil.Start gate removed because it breaks task-click guidance; use patch_restore_h5_task_guide_20260904.py')
 text=BUNDLE.read_text(encoding='utf-8')
 if NEW in text:print('bundle already patched')
 else:
  c=text.count(OLD)
  if c!=1:raise RuntimeError(f'GuideUtil.Start anchor expected once, found {c}')
  BUNDLE.write_text(text.replace(OLD,NEW),encoding='utf-8',newline='');print('disabled GuideUtil.Start on H5; native guides preserved')
 idx=INDEX.read_text(encoding='utf-8')
 if NEW_VERSION in idx:print('index already versioned')
 else:
  c=idx.count(OLD_VERSION)
  if c!=2:raise RuntimeError(f'old token expected twice, found {c}')
  INDEX.write_text(idx.replace(OLD_VERSION,NEW_VERSION),encoding='utf-8',newline='');print('updated token '+NEW_VERSION)
if __name__=='__main__':main()
