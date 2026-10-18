#!/usr/bin/env python3
"""Translate residual Chinese in a user TXT with cached NLLB; preserve syntax tokens."""
import argparse, json, re, sys
from pathlib import Path
from collections import Counter

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

HAN = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]')
TOKEN = re.compile(r'\{[^{}\r\n]+\}|%[-+0-9.]*[sdif]|</?[a-zA-Z][^>]*>|\\[nrt]|\$\{[^}]+\}')

def load_lines(p):
    s=p.read_text(encoding='utf-8-sig').replace('\r\n','\n').replace('\r','\n')
    if s.endswith('\n'): s=s[:-1]
    return s.split('\n') if s else []

def protect(s):
    saved=[]
    def sub(m):
        mark=f' ZXQKEEP{len(saved):04d}QXZ '
        saved.append((mark,m.group(0)))
        return mark
    return TOKEN.sub(sub,s), saved

def restore(s,saved):
    s=s.replace('ZXQNEWLINEQXZ','\\n')
    for mark,value in saved:
        s=s.replace(mark,value).replace(mark.strip(),value)
    return s.strip()

def token_multiset(s): return sorted(TOKEN.findall(s))

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--root',type=Path,required=True); ap.add_argument('--input',type=Path,required=True); ap.add_argument('--output',type=Path,required=True); ap.add_argument('--workers',type=int,default=1); args=ap.parse_args()
    root=args.root; groups=json.loads((root/'mapping.json').read_text(encoding='utf-8-sig'))['groups']; lines=load_lines(args.input)
    if len(lines)!=len(groups): raise SystemExit(f'line count mismatch input={len(lines)} groups={len(groups)}')
    model_root=Path(r'C:\Users\vandu\.cache\huggingface\hub\models--facebook--nllb-200-distilled-600M\snapshots')
    snapshots=sorted(model_root.iterdir());
    if not snapshots: raise SystemExit('cached NLLB model not found')
    model_path=str(snapshots[-1]); print('model='+model_path,flush=True)
    tokenizer=AutoTokenizer.from_pretrained(model_path,local_files_only=True,src_lang='zho_Hans')
    model=AutoModelForSeq2SeqLM.from_pretrained(model_path,local_files_only=True)
    model.eval(); target=tokenizer.convert_tokens_to_ids('vie_Latn')
    outputs=list(lines); pending=[]; reused=0
    for i,(g,line) in enumerate(zip(groups,lines)):
        if line.strip() and not HAN.search(line) and token_multiset(g['original_text'])==token_multiset(line): reused+=1
        else: pending.append((i,line or g['original_text']))
    print(json.dumps({'groups':len(groups),'reused':reused,'pending':len(pending)},ensure_ascii=False),flush=True)
    cache_path=root/'nllb_translation_cache.json'; cache=json.loads(cache_path.read_text(encoding='utf-8')) if cache_path.exists() else {}
    todo=[]
    for i,text in pending:
        original=groups[i]['original_text']; cached=cache.get(original,'')
        if cached and not HAN.search(cached) and token_multiset(original)==token_multiset(cached): outputs[i]=cached
        else: todo.append((i,text))
    batch_size=8; total=(len(todo)+batch_size-1)//batch_size; done_batches=0; bad=[]
    for start in range(0,len(todo),batch_size):
        batch=todo[start:start+batch_size]; protected=[]; saved=[]
        for _,text in batch:
            p,s=protect(text); protected.append(p); saved.append(s)
        encoded=tokenizer(protected,return_tensors='pt',padding=True,truncation=True,max_length=512)
        generated=model.generate(**encoded,forced_bos_token_id=target,max_new_tokens=512)
        translated=tokenizer.batch_decode(generated,skip_special_tokens=True)
        for (idx,text),out,s in zip(batch,translated,saved):
            restored=restore(out,s); original=groups[idx]['original_text']
            # NLLB may retain Han names; keep the result for review only if syntax is valid.
            if not restored.strip() or HAN.search(restored) or token_multiset(original)!=token_multiset(restored):
                bad.append({'line':idx+1,'reason':'han_or_placeholder','original':original,'translated':restored})
            else:
                outputs[idx]=restored; cache[original]=restored
        done_batches+=1
        if done_batches%10==0 or done_batches==total:
            cache_path.write_text(json.dumps(cache,ensure_ascii=False,indent=2),encoding='utf-8')
            print(f'progress {done_batches}/{total} bad={len(bad)}',flush=True)
    report={'groups':len(groups),'reused':reused,'pending':len(pending),'translated_cached':len(cache),'validation_bad':len(bad),'bad_rows':bad[:200]}
    (root/'nllb_autofix_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    # Always emit candidate; caller promotes only after review/validation.
    content='\r\n'.join(outputs); args.output.write_text('\ufeff'+content,encoding='utf-8')
    print(json.dumps({'ok':not bad,'output':str(args.output),**report},ensure_ascii=False,indent=2))
    raise SystemExit(2 if bad else 0)

if __name__=='__main__': main()
