#!/usr/bin/env python3
"""Fast local Marian pass for remaining translated TXT lines."""
import argparse, json, re, sys, time, glob
from pathlib import Path
import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HAN = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]')
TOKEN = re.compile(r'\{[^{}\r\n]+\}|%[-+0-9.]*[sdif]|</?[a-zA-Z][^>]*>|\\[nrt]|\$\{[^}]+\}')

def load_lines(p):
    s = p.read_text(encoding='utf-8-sig').replace('\r\n','\n').replace('\r','\n')
    return s[:-1].split('\n') if s.endswith('\n') else s.split('\n')

def protect(text):
    saved=[]
    def sub(m):
        marker=f' ZXQKEEP{len(saved):04d}QXZ '
        saved.append((marker,m.group(0)))
        return marker
    return TOKEN.sub(sub,text), saved

def restore(text,saved):
    text=text.replace('ZXQNEWLINEQXZ','\\n')
    for marker,value in saved:
        text=text.replace(marker,value).replace(marker.strip(),value)
    return text.strip()

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--root',type=Path,required=True); ap.add_argument('--input',type=Path,required=True); ap.add_argument('--output',type=Path,required=True); ap.add_argument('--batch-size',type=int,default=32); ap.add_argument('--max-input',type=int,default=512); ap.add_argument('--max-output',type=int,default=512); ap.add_argument('--pure-only',action='store_true'); args=ap.parse_args()
    groups=json.loads((args.root/'mapping.json').read_text(encoding='utf-8-sig'))['groups']; inp=load_lines(args.input)
    if len(groups)!=len(inp): raise SystemExit(f'line count mismatch {len(inp)} != {len(groups)}')
    model_path=sorted(glob.glob(r'C:\Users\vandu\.cache\huggingface\hub\models--Helsinki-NLP--opus-mt-zh-vi\snapshots\*'))[-1]
    torch.set_num_threads(max(1,min(8,torch.get_num_threads())))
    tok=AutoTokenizer.from_pretrained(model_path,local_files_only=True); model=AutoModelForSeq2SeqLM.from_pretrained(model_path,local_files_only=True); model.eval()
    out=list(inp); todo=[]; reused=0
    for i,(g,line) in enumerate(zip(groups,inp)):
        if line.strip() and not HAN.search(line) and sorted(TOKEN.findall(g['original_text']))==sorted(TOKEN.findall(line)): reused+=1
        elif HAN.search(line) and (not args.pure_only or not re.search(r'[ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửựýỳỷỹỵ]', line, re.I)): todo.append((i,line))
    print(json.dumps({'groups':len(groups),'reused_clean':reused,'todo':len(todo),'model':model_path},ensure_ascii=False),flush=True)
    translated=0; bad=[]; total=(len(todo)+args.batch_size-1)//args.batch_size
    for bi in range(0,len(todo),args.batch_size):
        batch=todo[bi:bi+args.batch_size]; protected=[]; saved_rows=[]
        for _,text in batch:
            p,s=protect(text); protected.append(p); saved_rows.append(s)
        enc=tok(protected,return_tensors='pt',padding=True,truncation=True,max_length=args.max_input)
        with torch.no_grad(): gen=model.generate(**enc,max_length=args.max_output,num_beams=1)
        vals=tok.batch_decode(gen,skip_special_tokens=True)
        for (idx,_),val,saved in zip(batch,vals,saved_rows):
            value=restore(val,saved); original=groups[idx]['original_text']
            if value.strip() and not HAN.search(value) and sorted(TOKEN.findall(original))==sorted(TOKEN.findall(value)):
                out[idx]=value; translated+=1
            else: bad.append({'line':idx+1,'original':original,'translated':value})
        print(f'progress {(bi//args.batch_size)+1}/{total} translated={translated} bad={len(bad)}',flush=True)
    report={'groups':len(groups),'reused_clean':reused,'todo':len(todo),'translated':translated,'bad':len(bad),'bad_rows':bad[:200]}
    (args.root/'marian_autofix_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    args.output.write_bytes(('\ufeff'+'\r\n'.join(out)).encode('utf-8'))
    print(json.dumps({'ok':not bad,'output':str(args.output),**report},ensure_ascii=False,indent=2))
    raise SystemExit(2 if bad else 0)

if __name__=='__main__': main()
