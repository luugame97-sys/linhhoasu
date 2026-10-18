#!/usr/bin/env python3
import argparse, json
from pathlib import Path

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--scan',type=Path,required=True); ap.add_argument('--output',type=Path,required=True); args=ap.parse_args()
    scan=args.scan; doc=json.loads((scan/'mapping.json').read_text(encoding='utf-8-sig'))
    groups=doc['groups']; occurrences=doc['mapping']; categories={}
    for row in occurrences: categories.setdefault(row['translation_line'],set()).add(row['category'])
    selected=[]; skipped=[]
    for i,g in enumerate(groups,1):
        cats=categories.get(i,set())
        # Large client_html occurrence is an inline script, not user-visible text.
        if 'client_html' in cats and len(g['original_text'])>1000 and cats=={'client_html'}:
            skipped.append({'line':i,'reason':'large_inline_script','length':len(g['original_text'])})
            continue
        selected.append(i)
    args.output.mkdir(parents=True,exist_ok=True)
    source=[groups[i-1]['original_text'].replace('\r','').replace('\n','\\n') for i in selected]
    (args.output/'01_CLIENT_TEXT_SAFE_SOURCE.txt').write_bytes(('\ufeff'+'\r\n'.join(source)).encode('utf-8'))
    (args.output/'02_CLIENT_TEXT_SAFE_TRANSLATION.txt').write_bytes(('\ufeff'+'\r\n'.join(source)).encode('utf-8'))
    safe_groups=[dict(groups[i-1],safe_line=n) for n,i in enumerate(selected,1)]
    selected_set=set(selected); safe_occ=[]
    for row in occurrences:
        if row['translation_line'] in selected_set:
            item=dict(row); item['translation_line']=selected.index(row['translation_line'])+1; safe_occ.append(item)
    (args.output/'mapping_safe.json').write_text(json.dumps({'source_scan':str(scan),'line_count':len(selected),'skipped':skipped,'groups':safe_groups,'mapping':safe_occ},ensure_ascii=False,indent=2),encoding='utf-8')
    (args.output/'README.txt').write_text('Dịch file 02 theo đúng số dòng. Không thêm/xóa dòng; giữ \\n, placeholder và thẻ HTML. Chuỗi inline script dài bị loại khỏi file safe vì không được dịch trực tiếp.\r\n',encoding='utf-8')
    print(json.dumps({'total_scan_groups':len(groups),'safe_groups':len(selected),'skipped':skipped,'mapping_occurrences':len(safe_occ),'output':str(args.output)},ensure_ascii=False,indent=2))

if __name__=='__main__': main()
