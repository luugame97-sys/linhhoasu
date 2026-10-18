"""Read-only production-data comparison in isolated JS VMs; no upload/deploy."""
import json
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'linhhoasu/lhs/newServer'

def main():
    sources = {name: (APP / 'src/services' / (name + '.js')).read_text(encoding='utf8')
               for name in ['NativeBonusService', 'BattleService']}
    scaffold = (ROOT / '_ai_workbench/tools/audit_power_pipeline_readonly_20260913.js').read_text(encoding='utf8')
    scaffold = scaffold[:scaffold.index("const battle = load('BattleService');")]
    scaffold = scaffold.replace("new Set(['BattleService',", "new Set(['NativeBonusService', 'BattleService',")
    scaffold = scaffold.replace("fs.readFileSync(filename, 'utf8')", "(candidateSources[name] || fs.readFileSync(filename, 'utf8'))")
    script = 'const candidateSources=' + json.dumps(sources) + ';\n' + scaffold + r'''
const next=load('BattleService'), bonus=load('NativeBonusService');
const oldModule={exports:{}};
vm.runInNewContext(fs.readFileSync(path.join(services,'BattleService.js'),'utf8'),{
 module:oldModule,exports:oldModule.exports,require:rel=>load(rel.replace(/^\.\//,''))
});
const before=oldModule.exports, clone=v=>JSON.parse(JSON.stringify(v));
(async()=>{
 const {MongoClient}=require(path.join(app,'node_modules/mongodb'));
 const client=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});
 await client.connect();const rows=[];
 try {for(const serverId of [1001,1002]) {
  const players=client.db('lhs_s'+serverId).collection('players');
  const candidates=await players.find({isBot:{$ne:true},$or:[{name:'nicky'},{arenaScore:{$gt:1000}}]})
    .sort({arenaScore:-1}).limit(6).maxTimeMS(5000).toArray();
  const named=await players.findOne({name:'nicky'},{maxTimeMS:5000});
  if(named&&!candidates.some(p=>String(p._id)===String(named._id)))candidates.push(named);
  for(const p of candidates){const a=before.calcPlayerPower(clone(p)),b=next.calcPlayerPower(clone(p));
    rows.push({serverId,name:p.name==='nicky'?'nicky':undefined,level:p.level,
      specSpiritAttrs:bonus.specSpirit(p),formationAttrs:bonus.valhallaFormation(p),
      beforePower:before.calcPowerScore(a),afterPower:next.calcPowerScore(b),
      delta:Object.fromEntries([...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>(a[k]||0)!==(b[k]||0)).map(k=>[k,{before:a[k]||0,after:b[k]||0}]))});
  }
 }}finally{await client.close();}
 console.log(JSON.stringify({readOnly:true,productionWrites:0,liveFight:false,at:new Date().toISOString(),rows}));
})().catch(err=>{console.log(JSON.stringify({error:err.message}));process.exitCode=1;});
'''
    ssh = connect()
    try:
        result = json.loads(run(ssh, 'POWER_AUDIT_ROOT=/linhhoasu node -', script))
        print(json.dumps(result, ensure_ascii=True))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
