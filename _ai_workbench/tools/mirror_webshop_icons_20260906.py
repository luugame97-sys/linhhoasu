"""Copy mapped icon PNGs inside the WebGM allowed directory; no permission widening."""
import json,hashlib,sys
from pathlib import Path
import paramiko
from stage_webshop_upgrade_20260906 import WB,ROOT,CAND,run
mapping=json.loads((CAND/'assets/item/item_images.json').read_text(encoding='utf-8'))['items'];paths=sorted(set(v['path']for v in mapping.values()if v['path']));byname={}
for p in paths:
 name=Path(p).name
 if name in byname and byname[name]!=p:raise RuntimeError('icon basename collision')
 byname[name]=p
code=r"""const fs=require('fs'),path=require('path'),crypto=require('crypto');const files=__FILES__,src='/linhhoasu/webgame/game/update/resource',dst='/linhhoasu/webgame/gm/assets/images/catalog';fs.mkdirSync(dst,{recursive:true,mode:0o755});const out={copied:0,existing:0,missing:[],bytes:0,hashes:{}};for(const [name,relative]of Object.entries(files)){if(!/^assets\/[A-Za-z0-9_./-]+\.png$/.test(relative)||relative.includes('..')||path.basename(relative)!==name)throw new Error('PATH');const p=path.join(src,relative);if(!fs.existsSync(p)){out.missing.push(relative);continue;}const b=fs.readFileSync(p),h=crypto.createHash('sha256').update(b).digest('hex');if(b.readUInt32BE(0)!==0x89504e47)throw new Error('NOT_PNG');const target=path.join(dst,name);if(fs.existsSync(target)){if(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')!==h)throw new Error('ICON_DRIFT');out.existing++;}else{fs.writeFileSync(target,b,{flag:'wx',mode:0o644});out.copied++;}out.bytes+=b.length;out.hashes[name]=h;}console.log(JSON.stringify(out));""".replace('__FILES__',json.dumps(byname))
c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 data=json.loads(run(s,'node -',code));assert not data['missing'],'Mapped icons missing production';(ROOT/'icon_mirror.json').write_text(json.dumps(data,indent=2)+'\n');print(json.dumps({k:v for k,v in data.items()if k!='hashes'}))
finally:s.close()
