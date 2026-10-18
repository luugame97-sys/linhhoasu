import json, shlex, time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
from backfill_s5_arena_one_cutoff_20260925 import REMOTE
ROOT=Path(__file__).resolve().parents[2];REMOTE_DIR='/linhhoasu/_ai_workbench/temp/competition_auto_pool_20260925';CUTOFFS=[1790265600000]
def main():
 s=connect()
 try:
  worker=REMOTE.replace("Number(process.argv[1])","Number(process.argv[2])").replace("await mongo.disconnect()})().catch(e=>{console.error(e.stack);process.exitCode=1})", "await mongo.disconnect();process.exit(0)})().catch(e=>{console.error(e.stack);process.exit(1)})")
  with s.open_sftp() as f:
   path=REMOTE_DIR+'/s5_arena_backfill_worker.js'
   run(s,'install -d -m 700 '+shlex.quote(REMOTE_DIR))
   with f.open(path,'wb') as h:h.write(worker.encode())
   f.chmod(path,0o700)
  allres=[]
  for cutoff in CUTOFFS:
   out=REMOTE_DIR+f'/job_{cutoff}.out';done=REMOTE_DIR+f'/job_{cutoff}.done'
   run(s,'rm -f -- '+shlex.quote(out)+' '+shlex.quote(done))
   cmd='nohup node '+shlex.quote(REMOTE_DIR+'/s5_arena_backfill_worker.js')+' '+str(cutoff)+' > '+shlex.quote(out)+' 2>&1; echo $? > '+shlex.quote(done)+' & echo $!'
   pid=run(s,'sh -c '+shlex.quote(cmd)).strip()
   result=None
   for _ in range(42):
    time.sleep(10)
    text=run(s,'test -f '+shlex.quote(done)+' && cat '+shlex.quote(done)+' || true').strip()
    if text:
     output=run(s,'cat '+shlex.quote(out))
     lines=[x.strip() for x in output.splitlines() if 'ONE_BACKFILL=' in x]
     if not lines: raise RuntimeError(f'BACKFILL_NO_RESULT cutoff={cutoff} exit={text} tail={output[-1000:]}')
     result=json.loads(lines[-1].split('ONE_BACKFILL=',1)[1]);break
    alive=run(s,'kill -0 '+shlex.quote(pid)+' 2>/dev/null; echo $?').strip()
    if alive!='0': raise RuntimeError(f'BACKFILL_PROCESS_EXITED cutoff={cutoff} output='+run(s,'tail -50 '+shlex.quote(out)))
   if result is None: raise TimeoutError(f'BACKFILL_TIMEOUT cutoff={cutoff} pid={pid}')
   allres.append(result);print(json.dumps(result,ensure_ascii=False),flush=True)
  out=ROOT/'_ai_workbench/temp/competition_auto_pool_20260925/s5_arena_backfill_jobs.json';out.write_text(json.dumps({'directPlayerWrites':0,'results':allres},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 finally:s.close()
if __name__=='__main__':main()
