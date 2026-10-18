#!/usr/bin/env python3
"""Translate only Han spans with cached Marian; preserve all code/HTML tokens."""
import argparse
import json
import re
import sys
import glob
from pathlib import Path
import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HAN = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]')
TOKEN = re.compile(r'\{[^{}\r\n]+\}|%[-+0-9.]*[sdif]|</?[a-zA-Z][^>]*>|\\[nrt]|\$\{[^}]+\}|https?://[^\s<]+')
# One Chinese prose span. Latin/Vietnamese text, numbers and tokens stay untouched.
SPAN = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff][\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff，。！？；：、（）《》【】“”‘’…—·,.!?;:()\[\]\s]*')

def load_lines(path):
    text=path.read_text(encoding='utf-8-sig').replace('\r\n','\n').replace('\r','\n')
    return text[:-1].split('\n') if text.endswith('\n') else text.split('\n')

def split_long(text, max_chars=350):
    if len(text)<=max_chars: return [text]
    parts=re.split(r'(?<=[。！？；!?;])',text); out=[]; cur=''
    for part in parts:
        if cur and len(cur)+len(part)>max_chars: out.append(cur); cur=''
        cur+=part
    if cur: out.append(cur)
    return out

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--input',type=Path,required=True); ap.add_argument('--output',type=Path,required=True); ap.add_argument('--report',type=Path,required=True); ap.add_argument('--batch-size',type=int,default=64); args=ap.parse_args()
    lines=load_lines(args.input); references=[]; unique=[]; index={}
    for li,line in enumerate(lines):
        masked=[]; pos=0
        for token in TOKEN.finditer(line):
            masked.append((pos,token.start(),False)); masked.append((token.start(),token.end(),True)); pos=token.end()
        masked.append((pos,len(line),False))
        for start,end,is_token in masked:
            if is_token: continue
            piece=line[start:end]
            for match in SPAN.finditer(piece):
                raw=match.group(0)
                if not HAN.search(raw): continue
                lead=raw[:len(raw)-len(raw.lstrip())]; trail=raw[len(raw.rstrip()):] if raw.rstrip()!=raw else ''
                core=raw.strip()
                for chunk in split_long(core):
                    if chunk not in index: index[chunk]=len(unique); unique.append(chunk)
                # Store full core; it will be translated piecewise then concatenated.
                references.append({'line':li,'start':start+match.start(),'end':start+match.end(),'raw':raw,'lead':lead,'trail':trail,'chunks':split_long(core)})
    model_path=sorted(glob.glob(r'C:\Users\vandu\.cache\huggingface\hub\models--Helsinki-NLP--opus-mt-zh-vi\snapshots\*'))[-1]
    tok=AutoTokenizer.from_pretrained(model_path,local_files_only=True); model=AutoModelForSeq2SeqLM.from_pretrained(model_path,local_files_only=True); model.eval(); torch.set_num_threads(min(8,max(1,torch.get_num_threads())))
    translations={}; total=(len(unique)+args.batch_size-1)//args.batch_size
    for bi in range(0,len(unique),args.batch_size):
        batch=unique[bi:bi+args.batch_size]; enc=tok(batch,return_tensors='pt',padding=True,truncation=True,max_length=512)
        with torch.no_grad(): gen=model.generate(**enc,max_length=512,num_beams=1)
        vals=tok.batch_decode(gen,skip_special_tokens=True)
        for source,value in zip(batch,vals): translations[source]=value.strip()
        if (bi//args.batch_size+1)%10==0 or bi+args.batch_size>=len(unique): print(f'progress {bi//args.batch_size+1}/{total}',flush=True)
    replacements={}
    for ref in references:
        value=''.join(translations.get(chunk,chunk) for chunk in ref['chunks'])
        replacements.setdefault(ref['line'],[]).append((ref['start'],ref['end'],ref['lead']+value+ref['trail']))
    output=list(lines)
    for li,repls in replacements.items():
        text=output[li]
        for start,end,value in sorted(repls,reverse=True): text=text[:start]+value+text[end:]
        output[li]=text
    residual=[{'line':i+1,'text':line} for i,line in enumerate(output) if HAN.search(line)]
    report={'input_lines':len(lines),'spans':len(references),'unique_spans':len(unique),'residual_han_rows':len(residual),'residual':residual[:500]}
    args.output.write_bytes(('\ufeff'+'\r\n'.join(output)).encode('utf-8')); args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='residual'},ensure_ascii=False,indent=2))

if __name__=='__main__': main()
