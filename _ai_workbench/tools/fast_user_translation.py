#!/usr/bin/env python3
"""Translate short residual lines via low-rate Google; leave long lines for review."""
import argparse, json, re, urllib.parse, urllib.request, urllib.error, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

HAN=re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]')
TOKEN=re.compile(r'\{[^{}\r\n]+\}|%[-+0-9.]*[sdif]|</?[a-zA-Z][^>]*>|\\[nrt]|\$\{[^}]+\}')
SEP=' ZXQSEP{:04d}QXZ '

def lines(p):
 s=p.read_text(encoding='utf-8-sig').replace('\r\n','\n').replace('\r','\n'); return s[:-1].split('\n') if s.endswith('\n') else s.split('\n')
def toks(s): return sorted(TOKEN.findall(s))
def translate_one(text):
 saved=[]
 def repl(m): saved.append(m.group(0)); return f' ZXQKEEP{len(saved)-1:04d}QXZ '
 protected=TOKEN.sub(repl,text)
 url='https://api.mymemory.translated.net/get?'+urllib.parse.urlencode({'q':protected,'langpair':'zh-CN|vi'})
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}); raw=urllib.request.urlopen(req,timeout=15).read(); payload=json.loads(raw.decode('utf-8')); out=payload.get('responseData',{}).get('translatedText','')
  if not out or payload.get('quotaFinished'): return None
  for i,val in enumerate(saved): out=out.replace(f'ZXQKEEP{i:04d}QXZ',val)
  return out.strip()
 except Exception:
  return None

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--root',type=Path,required=True); ap.add_argument('--input',type=Path,required=True); ap.add_argument('--output',type=Path,required=True); ap.add_argument('--max-chars',type=int,default=180); ap.add_argument('--workers',type=int,default=2); args=ap.parse_args()
 groups=json.loads((args.root/'mapping.json').read_text(encoding='utf-8-sig'))['groups']; inp=lines(args.input)
 if len(inp)!=len(groups): raise SystemExit(f'line count mismatch {len(inp)} != {len(groups)}')
 out=list(inp); candidates=[]
 for i,(g,text) in enumerate(zip(groups,inp)):
  if HAN.search(text) and len(text)<=args.max_chars: candidates.append((i,text))
 translated=0; failed=0
 with ThreadPoolExecutor(max_workers=max(1,args.workers)) as ex:
  futs={ex.submit(translate_one,x[1]):x for x in candidates}
  total=len(futs)
  for n,f in enumerate(as_completed(futs),1):
   idx,text=futs[f]; value=f.result()
   if value and not HAN.search(value) and toks(groups[idx]['original_text'])==toks(value): out[idx]=value; translated+=1
   else: failed+=1
   if n%20==0 or n==total: print(f'progress {n}/{total} translated={translated} failed={failed}',flush=True)
 report={'groups':len(groups),'short_candidates':len(candidates),'translated':translated,'failed_or_skipped':failed,'long_or_not_candidate':len(groups)-len(candidates)}
 (args.root/'fast_translation_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 args.output.write_bytes(('\ufeff'+'\r\n'.join(out)).encode('utf-8'))
 print(json.dumps({'ok':True,'output':str(args.output),**report},ensure_ascii=False,indent=2))

if __name__=='__main__': main()
