import json,sys
from pathlib import Path
from parse_resource_config import parse
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/webshop_upgrade_20260906';ROOT=WB.parent/'linhhoasu/webgame/game/update/resource'
resources={}
for filename in['default.res_main_c669f2c0.bin','default.res_cn_main_f70d4753.bin','default.res_tw_main_2ff8859f.bin']:
 for r in parse(ROOT/filename)['resources']:
  if r['type']=='image' and r['url'].endswith('.png') and (ROOT/r['url']).is_file():resources[r['name']]=r['url']
rows={};mapping={}
for a in json.loads((OUT/'assets_meta.json').read_text(encoding='utf-8')):
 key=str(a['id']);p=resources.get(a['icon']);kind='direct'
 if not p:p=resources.get(a['parentIcon']);kind='parent'
 if not p:p='';kind='default'
 rows[key]={'id':a['id'],'name':a['name'],'path':p,'source':kind,'image_url':'api/item_icon.php?id='+key}
 mapping[key]=rows[key]['image_url']
# Preserve link coverage for every legacy GM catalog entry, even absent assets.
for line in (OUT/'baseline/assets/item/gmitem.txt').read_text(encoding='utf-8-sig').splitlines():
 import re
 match=re.match(r'^\s*(\d+)\s*[;:=|\t -]+\s*(.*)$',line)
 if match and match[1]not in rows:
  key=match[1];rows[key]={'id':int(key),'name':match[2],'path':'','source':'default','image_url':'api/item_icon.php?id='+key};mapping[key]=rows[key]['image_url']
(OUT/'candidate/assets/item/item_images.json').write_text(json.dumps({'version':1,'default':'assets/images/item-default.svg','items':rows},ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
(OUT/'candidate/assets/item/item_icon_map.json').write_text(json.dumps({'version':3,'default':'assets/images/item-default.svg','items':mapping},ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
summary={k:sum(r['source']==k for r in rows.values())for k in['direct','parent','default']};(OUT/'image_summary.json').write_text(json.dumps(summary));print(json.dumps({'items':len(rows),**summary}))
