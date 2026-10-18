"""Search exact bundled source and typed configuration for missing base-odds evidence."""
import hashlib,json,sys,zipfile
from pathlib import Path
WB=Path(__file__).resolve().parents[1];ROOT=WB/'temp/fishing_full_candidate_20260906'
sys.stdout.reconfigure(encoding='utf-8')
with zipfile.ZipFile(WB.parent/'server.zip') as z:
 names=['linhhoasu/lhs/newServer/src/handlers/fish.js','linhhoasu/lhs/newServer/src/handlers/fish-soul.js','linhhoasu/lhs/lhs-local-run2/src/handlers/fish.js','linhhoasu/lhs/lhs-local-run2/src/handlers/fish-soul.js']
 archived=[]
 for name in names:
  data=z.read(name);text=data.decode('utf-8');archived.append({'path':name,'sha256':hashlib.sha256(data).hexdigest(),'escapesAlwaysEmptyLiteral':'escapes: []'in text,'soulSequentialIds':'soulIds[index %'in text,'fishUniformPick':'Math.floor(Math.random() * rows.length)'in text})
 tables={}
 for name in z.namelist():
  if '/scripts/_tables_dump/Fish'in name and name.endswith('.json'):
   raw=json.loads(z.read(name));keys=set()
   def walk(v):
    if isinstance(v,dict):
     for k,x in v.items():keys.add(k);walk(x)
    elif isinstance(v,list):
     for x in v:walk(x)
   walk(raw);tables[Path(name).stem]=sorted(k for k in keys if any(t in k.lower()for t in ['rate','weight','prob','escape','drop','odds','chance','kg']))
 report={'archiveHandlers':archived,'candidateSourceOrigin':'production snapshot 20260906T093353Z, not archive','archiveFishProbabilityFields':tables,
 'notFoundInInspectedSources':['base miss versus escape probability','normal fish quality/species base distribution','fish-soul drop weights','relic drop frequency','event occurrence frequency'],
 'supportedNativeSkins':[190051,190052],'unsupportedNativeSkins':[190053,190054,190055],
 'decisionNeeded':'Owner authorization for a new custom balance covering missing RNG; previous custom table covers wash/boxes only.', 'productionWrites':0}
(ROOT/'source-matrix.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False))
