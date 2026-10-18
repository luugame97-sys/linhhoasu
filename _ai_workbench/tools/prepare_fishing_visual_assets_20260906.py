import json,re,sys,subprocess
from pathlib import Path
from decode_bin_manifest import decode
WB=Path(__file__).resolve().parents[1];ROOT=Path(sys.argv[1]).resolve();GAME=WB.parent/'linhhoasu/webgame/game'
files={}
for p in (GAME/'update/resource/assets').rglob('*'):
 if not p.is_file()or p.suffix not in ['.png','.jpg','.skel','.atlas','.json','.bin']:continue
 m=re.match(r'(.+)_([a-f0-9]{6,8})$',p.stem)
 if m:files[m[1]+('_skel'if p.suffix=='.skel'else '_atlas'if p.suffix=='.atlas'else '')]='/game/'+p.relative_to(GAME).as_posix()
for k,p in {'skel_pack_bin':'skel_pack_b4a3c2eb.bin','atlas_pack_bin':'atlas_pack_8acc2b4d.bin'}.items():files[k]='/game/update/resource/assets/cfg/'+p
files['skel_lang_pack_bin']='/game/update/resource/assets/cfg/lang_cn/skel_lang_pack_74f32a18.bin'
files['atlas_lang_pack_bin']='/game/update/resource/assets/cfg/lang_cn/atlas_lang_pack_8a832f37.bin'
(ROOT/'visual-assets.json').write_text(json.dumps(files),encoding='utf-8')
skins=decode((GAME/'update/resource/assets/cfg/gameEui_18e11b8e.bin').read_bytes())['value']
(ROOT/'visual-skins.json').write_text(json.dumps(skins,ensure_ascii=False),encoding='utf-8')
node_code="const f=require.resolve("+json.dumps(str(ROOT/'app/src/logger'))+");require.cache[f]={id:f,filename:f,loaded:true,exports:{info(){},warn(){},error(){}}};const c=require("+json.dumps(str(ROOT/'app/src/services/ConfigService'))+");console.log(JSON.stringify(c.reload("+json.dumps(str(ROOT/'lang.bin'))+").LanguageConfig||{}));"
lang=json.loads(subprocess.check_output(['node','-e',node_code],encoding='utf-8'))
(ROOT/'visual-lang.json').write_text(json.dumps(lang,ensure_ascii=False),encoding='utf-8')
print(json.dumps({'resources':len(files),'skins':len(skins),'language':len(lang)}))
