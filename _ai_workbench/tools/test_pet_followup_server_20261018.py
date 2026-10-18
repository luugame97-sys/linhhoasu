"""Run existing auto/receipt regressions against candidate and current VPS config; RAM only."""
from pathlib import Path
import json, hashlib, sys
from auction_ops_20261015 import connect, run

root=Path(__file__).resolve().parents[2]
task=root/'_ai_workbench/temp/pet_followup_20261018'
source=(task/'candidate/pet.js').read_text(encoding='utf-8')
suite=(root/'_ai_workbench/tools/test_pet_auto_continuous_server_20261005.js').read_text(encoding='utf-8')
anchor="const source = fs.readFileSync(path.join(app, 'src/handlers/pet.js'), 'utf8');"
assert suite.count(anchor)==1
suite=suite.replace(anchor,'const source = '+json.dumps(source)+';')
old='await assert.rejects(h.handler.handlePetAutoCompose(params,h.session,1));'
assert suite.count(old)==2
suite=suite.replace(old,"const rejected=ack(await h.handler.handlePetAutoCompose(params,h.session,1)); assert.equal(rejected.result,-1); assert.equal(rejected.requiresReconnect,true); assert.equal(Object.hasOwn(rejected,'retryable'),false); assert.equal(rejected.code,'PET_AUTO_SAVE_UNCONFIRMED');")
suite="process.env.FEATURE_APP='/linhhoasu/lhs/newServer';\n"+suite
c=connect()
try:
 out=run(c,"cd /linhhoasu/lhs/newServer && node - <<'PET_FOLLOWUP_TEST'\n"+suite+"\nPET_FOLLOWUP_TEST",timeout=90)
 result=json.loads(out)
 assert not result['regressionFailures'] and result['networkAttempts']==0
 result.update(status='PASS',sourceSha256=hashlib.sha256((task/'candidate/pet.js').read_bytes()).hexdigest(),limits='Current VPS binary tables, actual receipt journal/role lock, fixture persistence only; no Mongo/player writes.')
 (task/'server-tests.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
 sys.stdout.reconfigure(encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
finally:c.close()
