"""Whitelist Webshop patch and verified mirrored PNGs; never include secrets/QA."""
import json,hashlib,zipfile
from pathlib import Path
WB=Path(__file__).resolve().parents[1];ROOT=WB/'temp/webshop_upgrade_20260906';CAND=ROOT/'candidate';final=json.loads((ROOT/'final_verification.json').read_text());entries={r:CAND/r for r in final['hashes']}
mapping=json.loads((CAND/'assets/item/item_images.json').read_text(encoding='utf-8'))['items'];mirror=json.loads((ROOT/'icon_mirror.json').read_text())
game=WB.parent/'linhhoasu/webgame/game/update/resource'
for row in mapping.values():
 if row['path']:
  p=game/row['path'];name=p.name;assert hashlib.sha256(p.read_bytes()).hexdigest()==mirror['hashes'][name];entries['assets/images/catalog/'+name]=p
for name in ['webshop_upgrade_20260906.md','webshop_upgrade_20260906.html','hidden_fashion_sets_20260906.md','hidden_fashion_sets_20260906.html','hidden_fashion_sets_20260906.txt','item_image_links_20260906.txt']:entries['reports/'+name]=WB/'reports'/name
for name in ['test_webshop_bundle_20260906.php','test_webshop_ui_contract_20260906.js']:entries['tests/'+name]=WB/'tools'/name
readme='''Webshop patch 2026-09-06 — already deployed.
Not a standalone WebGM. Merge only listed files into the existing verified runtime.
config.php and .env are intentionally excluded. Existing config.php needs:
require_once __DIR__ . '/webshop_bundle.php';
Schema required (already applied on this VPS): webshop_items.reward_items LONGTEXT NULL;
webshop_orders.request_key VARCHAR(64) NULL, reward_snapshot LONGTEXT NULL;
status ENUM includes pending_delivery; unique(account_name, request_key).
Do not rerun payments or QA/repair scripts. Do not remove pending orders on rollback.
No products/prices were auto-created or changed. Admin chooses which bundles to sell.
Tests require the workspace/database temporary-fixture harness. Read reports first.
'''
manifest={'release':'webshop_upgrade_20260906','alreadyDeployed':True,'standalone':False,'configIncluded':False,'files':{r:hashlib.sha256(p.read_bytes()).hexdigest()for r,p in entries.items()}}
target=WB/'temp/webshop_upgrade_source_20260906.zip';assert not target.exists()
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED)as z:
 for rel,p in entries.items():
  assert not any(x in rel.lower()for x in['config.php','.env','preview.html','preimage','credential'])
  z.write(p,rel)
 z.writestr('README.txt',readme);z.writestr('manifest.json',json.dumps(manifest,indent=2)+'\n')
with zipfile.ZipFile(target)as z:
 assert z.testzip()is None
 for rel,h in manifest['files'].items():assert hashlib.sha256(z.read(rel)).hexdigest()==h
out={'path':str(target),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'entries':len(entries)+2,'crc':'PASS'};(ROOT/'package.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
