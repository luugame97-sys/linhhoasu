import json, shlex
from snapshot_web_multiserver_20260906 import connect, run

def main():
    ssh=connect()
    try:
        js="""let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const c=require('crypto'),i=s.indexOf('main.min_drop100.js?v=');console.log(JSON.stringify({bundleBytes:Buffer.byteLength(s),bundleSha256:c.createHash('sha256').update(s).digest('hex'),indexCache:i>=0?s.slice(i+22,s.indexOf('"',i+22)):'' ,composeGuard:s.includes('if(!t||t.result!==0||!t.data)return void(c&&c(t))'),eggGuard:s.includes('!t||t.result!==0||!Array.isArray(t.data)'),eatGuard:s.includes('if(!t||t.result!==0||!t.data)return void(h&&h(t))'),buyGuard:s.includes('if(!t||t.result!==0){S.ins().showTips')}))});"""
        print(run(ssh,"curl -fsS 'http://127.0.0.1:81/js/main.min_drop100.js?v=20260924_pet_result_guard_v1' | node -e "+shlex.quote(js)))
        idx_js="""let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=/main\\.min_drop100\\.js\\?v=([^\"']+)/.exec(s);console.log(JSON.stringify({indexBytes:Buffer.byteLength(s),cacheKey:m&&m[1]}));});"""
        print(run(ssh,"curl -fsS 'http://127.0.0.1:81/index.html' | node -e "+shlex.quote(idx_js)))
        print('REMOTE_BACKUP='+run(ssh,"find /linhhoasu/_ai_workbench/backups/pet_client_result_guard_20260924 -maxdepth 1 -type f -printf '%f\\n' | sort").strip())
    finally: ssh.close()
if __name__=='__main__':main()
