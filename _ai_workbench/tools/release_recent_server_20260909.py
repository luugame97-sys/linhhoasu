import sys,json,hashlib,shlex,time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
from install_log_maintenance_20260909 import state
WB=Path(__file__).resolve().parents[1]
APP='/linhhoasu/lhs/newServer'
STAGE='/linhhoasu/_ai_workbench/temp/recent_server_20260909_r8'
BACKUP='/linhhoasu/_ai_workbench/backups/recent_server_20260909_r8'
FILES=['handlers/account.js','handlers/serverList.js','net/HTTPServer.js']
def sha(b):return hashlib.sha256(b).hexdigest()
def ready(s,p):
 for _ in range(30):
  if run(s,"curl --max-time 3 -s -o /dev/null -w '%{http_code}' http://127.0.0.1:"+str(p)+'/ready || true').strip()=='200':return
  time.sleep(1)
 raise RuntimeError('READY_FAILED')
def main():
 s=connect();installed=[];before=state(s);result={'before':before,'backup':BACKUP}
 try:
  run(s,'test ! -e '+STAGE+' && test ! -e '+BACKUP)
  run(s,'install -d -m 700 '+STAGE+'/src/handlers '+STAGE+'/src/net '+BACKUP)
  with s.open_sftp() as f:
   originals={};candidates={}
   for rel in FILES:
    with f.open(APP+'/src/'+rel,'rb') as h:old=h.read()
    new=(WB.parent/'linhhoasu/lhs/newServer/src'/rel).read_bytes()
    # Require exact source baseline except line endings, applying only intended edits.
    expected=new.decode().replace('\r\n','\n')
    if rel=='handlers/account.js':
     a=expected.index('  // The native client may authenticate on S1');b=expected.index('  return loginBatch;',a)
     expected=expected[:a]+expected[b:]
    elif rel=='handlers/serverList.js':
     expected=expected.replace('      // SDK authentication precedes server selection; do not overwrite login history here.','      await accountService.markRoleLogin(accountId, selectedRole.roleId, serverId);').replace('    if (!(Number(summary.lastLoginTime) > 0)) return;\n','').replace('defaultServerData: recentLoginServers[0] || selectedServerData','defaultServerData: selectedServerData')
    else:
     expected=expected.replace('      // Issuing a token is not a successful game-server login.','      await accountService.markRoleLogin(accountObj.accountId, selectedRole.roleId, serverId);')
    assert expected==old.decode().replace('\r\n','\n'),'SOURCE_DRIFT:'+rel
    new=new.decode().replace('\r\n','\n')
    if b'\r\n' in old:new=new.replace('\n','\r\n')
    new=new.encode();originals[rel]=old;candidates[rel]=new
    with f.open(STAGE+'/src/'+rel,'wb') as h:h.write(new)
    with f.open(BACKUP+'/'+rel.replace('/','_')+'.before','wb') as h:h.write(old)
   for name in ['test_recent_server_20260909.js','qa_recent_server_20260909.js']:
    f.put(str(WB/'tools'/name),STAGE+'/'+name)
  for rel in FILES:run(s,'node --check '+STAGE+'/src/'+rel)
  result['fixture']=run(s,'LHS_APP_ROOT='+STAGE+' node '+STAGE+'/test_recent_server_20260909.js').strip();print(result['fixture'],flush=True)
  for rel in FILES:
   assert run(s,'sha256sum '+APP+'/src/'+rel).split()[0]==sha(originals[rel]),'CAS_DRIFT'
   run(s,'cp -p '+STAGE+'/src/'+rel+' '+APP+'/src/'+rel);installed.append(rel)
  for name,p in [('lhs-s1002',8083),('lhs-s1001',8080)]:
   run(s,'pm2 restart '+name);ready(s,p);print(name+' READY200',flush=True)
  if __import__('os').environ.get('SKIP_E2E') == '1':
   result['qa']='SKIPPED_E2E_QUEUE_GUARD'
   assert run(s,'for p in 9200 9201; do ss -lnt "sport = :$p" | grep -q LISTEN; done') is not None
  else:
   result['qa']=run(s,'timeout 45s node '+STAGE+'/qa_recent_server_20260909.js');assert '"result":"PASS"' in result['qa'] and 'QA_ACCOUNT_PLAYER_CLEANUP=0' in result['qa'];print(result['qa'],flush=True)
  result['after']=state(s)
  assert [p for p in before if p['name'] not in ['lhs-s1001','lhs-s1002']]==[p for p in result['after'] if p['name'] not in ['lhs-s1001','lhs-s1002']]
  result['hashes']={rel:run(s,'sha256sum '+APP+'/src/'+rel).split()[0] for rel in FILES}
  assert all(result['hashes'][r]==sha(candidates[r]) for r in FILES)
  result['status']='DEPLOYED'
 except Exception as e:
  result['error']=str(e)
  if installed:
   for rel in installed:
    assert run(s,'sha256sum '+APP+'/src/'+rel).split()[0]==sha(candidates[rel]),'ROLLBACK_DRIFT'
    run(s,'cp -p '+BACKUP+'/'+rel.replace('/','_')+'.before '+APP+'/src/'+rel)
   for name,p in [('lhs-s1002',8083),('lhs-s1001',8080)]:run(s,'pm2 restart '+name);ready(s,p)
   result['status']='ROLLED_BACK'
  raise
 finally:
  s.close();out=WB/'temp/recent_server_20260909';out.mkdir(exist_ok=True)
  (out/'release.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
  print(json.dumps({'status':result.get('status'),'error':result.get('error')}))
if __name__=='__main__':main()
