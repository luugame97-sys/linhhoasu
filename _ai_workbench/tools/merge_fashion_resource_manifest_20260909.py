"""Merge fashion resource rows and CN pack pointers into the Vietnamese RES manifest."""
import hashlib
import json
import struct
import sys
import zlib
from pathlib import Path
from parse_resource_config import parse

WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/fashion_cn_recovery_20260909';ROOT=WB.parent/'linhhoasu/webgame/game/update/resource';CN=OUT/'raw'

def auto(n):
    out=bytearray()
    while True:
        x=n%128;n//=128
        if n:x|=128
        out.append(x)
        if not n:return bytes(out)

def make(name,prefixes,groups,rows):
    by={}
    order=[]
    for row in rows:
        row=dict(row)
        prefix=prefixes[row['prefix']]
        if row['url'].startswith(prefix): row['url']=row['url'][len(prefix):]
        by.setdefault(row['type_code'],[]).append(row)
        if row['type_code'] not in order:order.append(row['type_code'])
    raw=bytearray(struct.pack('>H',len(prefixes)))
    for p in prefixes: raw+=auto(len(p))+p.encode()
    raw+=auto(len(order))
    for typ in order:raw+=auto(typ)+auto(len(by[typ]))
    index={}
    for typ in order:
        for row in by[typ]:
            index[row['name']]=sum(len(by[t]) for t in order[:order.index(typ)])+by[typ].index(row)
            raw+=auto(len(row['name']))+row['name'].encode()+auto(row['prefix'])+auto(len(row['url']))+row['url'].encode()+auto(row.get('size',0))
            if typ==4:
                aliases=','.join(row.get('subkeys',[]));raw+=auto(len(aliases))+aliases.encode()
            if typ==9:raw+=auto(len(row.get('scale9grid','')))+row.get('scale9grid','').encode()
    raw+=auto(len(groups))
    for group,members in groups.items():
        raw+=auto(len(group))+group.encode()+auto(len(members))
        for name in members:
            if name in index:raw+=auto(index[name])
    return bytes(raw)

def main():
    base_name=sys.argv[1] if len(sys.argv)>1 else 'default.res_main_c669f2c0.bin';base=parse(ROOT/base_name)
    cn=parse(CN/'default.res_main_13ccf8e.bin')
    selected=json.loads((OUT/'resource-audit.json').read_text(encoding='utf-8'))['files']
    selected_names={row['name'] for row in selected if row['selected']}
    rows_by={row['name']:row for row in base['resources']}
    prefixes=list(base['prefixes']);prefix_index={p:i for i,p in enumerate(prefixes)}
    cn_by={row['name']:row for row in cn['resources']}
    # Use verified CN pack names for every dynamic packed resource.
    selected_names.update({'atlas_pack_bin','skel_pack_bin','plist_pack_bin','atlas_lang_pack_bin','skel_lang_pack_bin','plist_lang_pack_bin'})
    for name in selected_names:
        if name not in cn_by:continue
        row=dict(cn_by[name]);p=cn['prefixes'][row['prefix']]
        if p not in prefix_index:prefix_index[p]=len(prefixes);prefixes.append(p)
        row['prefix']=prefix_index[p];rows_by[name]=row
    # Point the merged manifest at the scoped translated/configured tables.
    for key,url in [('config_bin','assets/excel/config_fashion_20260909.bin'),('config_lang_bin','assets/excel/lang_cn/config_lang_c2fa8585.bin')]:
        if key in rows_by:
            rows_by[key]=dict(rows_by[key]);rows_by[key]['url']=url
    # Keep existing rows and append/replace only verified selections.
    rows=list(rows_by.values());base_names=[row['name'] for row in base['resources']]
    groups={k:[base_names[i] for i in v if 0 <= i < len(base_names)] for k,v in base['groups'].items()}
    raw=make(base_name,prefixes,groups,rows);candidate=OUT/(Path(base_name).stem+'_fashion_candidate.bin');candidate.write_bytes(raw)
    # language/main resource group files are built from the same union; the
    # client loads the language table through config_lang_bin in this manifest.
    result={'candidate':str(candidate),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'resources':len(rows),'selectedNames':len(selected_names)}
    (OUT/'resource-manifest-candidate.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result))
if __name__=='__main__':main()
