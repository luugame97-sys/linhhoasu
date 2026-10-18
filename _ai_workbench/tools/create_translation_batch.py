#!/usr/bin/env python3
import argparse, json, re
from pathlib import Path

HAN=re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]')

def load(p):
 s=p.read_text(encoding='utf-8-sig').replace('\r\n','\n').replace('\r','\n'); return s[:-1].split('\n') if s.endswith('\n') else s.split('\n')

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--root',type=Path,required=True); ap.add_argument('--input',type=Path,required=True); ap.add_argument('--batch',type=Path,required=True); ap.add_argument('--size',type=int,default=100); args=ap.parse_args()
 m=json.loads((args.root/'mapping.json').read_text(encoding='utf-8-sig')); lines=load(args.input); cats={}
 for row in m['mapping']: cats.setdefault(row['translation_line'],set()).add(row['category'])
 selected=[]
 for i,(g,line) in enumerate(zip(m['groups'],lines),1):
  if HAN.search(line) and g['priority']=='P0' and cats.get(i,set()).intersection({'game_eui','client_html'}): selected.append(i)
 selected=selected[:args.size]
 args.batch.mkdir(parents=True,exist_ok=True)
 source=[lines[i-1] for i in selected]
 (args.batch/'01_SOURCE.txt').write_bytes(('\ufeff'+'\r\n'.join(source)).encode('utf-8'))
 (args.batch/'02_TRANSLATION.txt').write_bytes(('\ufeff'+'\r\n'.join(source)).encode('utf-8'))
 (args.batch/'mapping.json').write_text(json.dumps({'source_root':str(args.root),'input_file':str(args.input),'line_count':len(selected),'lines':selected,'groups':[m['groups'][i-1] for i in selected]},ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'count':len(selected),'first_line':selected[0] if selected else None,'last_line':selected[-1] if selected else None,'batch':str(args.batch)},ensure_ascii=False,indent=2))

if __name__=='__main__': main()
