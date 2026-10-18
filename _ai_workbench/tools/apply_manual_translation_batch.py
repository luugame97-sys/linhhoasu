#!/usr/bin/env python3
import argparse, json, shutil, re
from pathlib import Path

HAN=re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]')
TOKEN=re.compile(r'\{[^{}\r\n]+\}|%[-+0-9.]*[sdif]|</?[a-zA-Z][^>]*>|\\[nrt]|\$\{[^}]+\}')

def load(p):
 s=p.read_text(encoding='utf-8-sig').replace('\r\n','\n').replace('\r','\n'); return s[:-1].split('\n') if s.endswith('\n') else s.split('\n')

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--root',type=Path,required=True); ap.add_argument('--batch',type=Path,required=True); ap.add_argument('--done',type=Path,required=True); ap.add_argument('--apply',action='store_true'); args=ap.parse_args()
 meta=json.loads((args.batch/'mapping.json').read_text(encoding='utf-8-sig')); trans=json.loads((args.batch/'manual_translations.json').read_text(encoding='utf-8-sig')); lines=load(args.done)
 if len(trans)!=len(meta['lines']): raise SystemExit('translation count mismatch')
 issues=[]
 for n,(global_line,value) in enumerate(zip(meta['lines'],trans),1):
  original=lines[global_line-1]
  if HAN.search(value): issues.append({'batch_line':n,'global_line':global_line,'reason':'han_remaining','value':value})
  if sorted(TOKEN.findall(original))!=sorted(TOKEN.findall(value)): issues.append({'batch_line':n,'global_line':global_line,'reason':'placeholder_mismatch','original':original,'value':value})
 if issues: (args.batch/'manual_batch_audit.json').write_text(json.dumps({'ok':False,'issues':issues},ensure_ascii=False,indent=2),encoding='utf-8'); raise SystemExit(f'issues={len(issues)}')
 out=list(lines)
 for global_line,value in zip(meta['lines'],trans): out[global_line-1]=value
 (args.batch/'manual_batch_audit.json').write_text(json.dumps({'ok':True,'count':len(trans),'global_lines':meta['lines']},ensure_ascii=False,indent=2),encoding='utf-8')
 if args.apply:
  backup=args.done.with_name(args.done.stem+'_before_batch01'+args.done.suffix); shutil.copy2(args.done,backup)
  args.done.write_bytes(('\ufeff'+'\r\n'.join(out)).encode('utf-8')); print('backup='+str(backup))
 print(json.dumps({'ok':True,'count':len(trans),'applied':args.apply,'done':str(args.done)},ensure_ascii=False,indent=2))

if __name__=='__main__': main()
