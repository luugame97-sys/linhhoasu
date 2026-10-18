#!/usr/bin/env python3
import argparse, json, re, hashlib
from pathlib import Path

HAN = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]')
TOKEN = re.compile(r'\{[^{}\r\n]+\}|%[-+0-9.]*[sdif]|</?[a-zA-Z][^>]*>|\\[nrt]|\$\{[^}]+\}')
TAG_OPEN = re.compile(r'<([a-zA-Z][^>]*)$')

def load(p):
    b=p.read_bytes(); s=b.decode('utf-8-sig').replace('\r\n','\n').replace('\r','\n'); return b,s[:-1].split('\n') if s.endswith('\n') else s.split('\n')

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--root',type=Path,required=True); ap.add_argument('--source',type=Path,required=True); ap.add_argument('--done',type=Path,required=True); ap.add_argument('--checked',type=Path,required=True); args=ap.parse_args()
    sb,src=load(args.source); db,done=load(args.done)
    report={'source':str(args.source),'done':str(args.done),'source_lines':len(src),'done_lines':len(done),'source_sha256':hashlib.sha256(sb).hexdigest(),'done_sha256':hashlib.sha256(db).hexdigest(),'done_had_bom':db.startswith(b'\xef\xbb\xbf'),'han_rows':0,'placeholder_mismatch':0,'malformed_tag_rows':0,'empty_rows':0,'row_issues':[]}
    if len(src)!=len(done): report['fatal']='line_count_mismatch'
    for i,(a,b) in enumerate(zip(src,done),1):
        issues=[]
        if not b.strip(): issues.append('empty')
        if HAN.search(b): issues.append('han_remaining'); report['han_rows']+=1
        # Some source rows are already malformed/truncated. Do not require the
        # translation to preserve a source syntax defect; only reject newly
        # introduced token/tag defects.
        source_tokens=sorted(TOKEN.findall(a)); done_tokens=sorted(TOKEN.findall(b))
        source_truncated=bool(TAG_OPEN.search(a)); done_truncated=bool(TAG_OPEN.search(b))
        source_open_font=len(re.findall(r'<font\b',a,re.I)); source_close_font=len(re.findall(r'</font>',a,re.I))
        if source_tokens!=done_tokens and not ((source_truncated or source_open_font>source_close_font) and len(done_tokens)>=len(source_tokens)):
            issues.append('placeholder_mismatch'); report['placeholder_mismatch']+=1
        if done_truncated and not source_truncated: issues.append('malformed_tag'); report['malformed_tag_rows']+=1
        if issues: report['row_issues'].append({'line':i,'issues':issues,'source':a,'done':b})
    # Emit BOM-normalized copy only; do not alter translation content.
    args.checked.write_bytes(('\ufeff'+'\r\n'.join(done)).encode('utf-8'))
    report['checked']=str(args.checked); report['checked_sha256']=hashlib.sha256(args.checked.read_bytes()).hexdigest(); report['safe_to_import']=len(src)==len(done) and not report['row_issues']
    (args.root/'translation_quality_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    residual = [x for x in report['row_issues'] if 'han_remaining' in x['issues']]
    residual_lines = [f"{x['line']}\t{x['done']}" for x in residual]
    (args.root/'TEXT_CON_HAN_CAN_DICH.txt').write_bytes(('\ufeff'+'\r\n'.join(residual_lines)).encode('utf-8'))
    print(json.dumps({k:v for k,v in report.items() if k!='row_issues'}|{'issue_rows':len(report['row_issues'])},ensure_ascii=False,indent=2))

if __name__=='__main__': main()
