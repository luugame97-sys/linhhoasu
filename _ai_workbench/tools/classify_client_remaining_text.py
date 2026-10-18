#!/usr/bin/env python3
import argparse, json, re
from pathlib import Path

LOGIC_RE = re.compile(r'(p_smoke|waitGoodsOrders|firstRechargBtn|addChild|\bnode\b|\bJSON\b|\bExcel\b|\bSpine\b|\bBuffEffect\b|\bid\b|console|前置|节点|顶点|点位|六边形|连接箭头|剪贴板|导出配置|模拟战斗|查找最近)', re.I)
UI_HINT_RE = re.compile(r'(加载|错误|失败|禁用|支付|账号|订单|次数|活动|奖励|特效|选择|绑定|有效|层数|怪物|武器|装备|神秘|宠|血|到账|数量|转换|文字|时间|提示)', re.I)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--scan',type=Path,required=True); args=ap.parse_args(); mapping_file=args.scan/'mapping.json'; mapping_file=mapping_file if mapping_file.exists() else args.scan/'mapping_safe.json'; doc=json.loads(mapping_file.read_text(encoding='utf-8-sig')); groups=doc['groups']; rows=[]
    for n,g in enumerate(groups,1):
        occ=[x for x in doc['mapping'] if x['translation_line']==n]; keys=';'.join(x['source_key'] for x in occ[:3]); text=g['original_text'].replace('\r','').replace('\n','\\n')
        if LOGIC_RE.search(text) and not UI_HINT_RE.search(text): kind='KEEP_LOGIC_OR_LOG'
        elif LOGIC_RE.search(text): kind='REVIEW_MIXED'
        else: kind='LIKELY_UI_TRANSLATE'
        rows.append((n,kind,keys,text))
    out=args.scan/'CLIENT_TEXT_REVIEW_CLASSIFIED.tsv'; out.write_bytes(('\ufeffline\tkind\tsource_key\ttext\r\n'+'\r\n'.join(f'{n}\t{k}\t{key}\t{text}' for n,k,key,text in rows)).encode('utf-8'))
    from collections import Counter
    print(json.dumps({'groups':len(rows),'by_kind':Counter(x[1] for x in rows),'output':str(out)},ensure_ascii=False,indent=2))

if __name__=='__main__': main()
