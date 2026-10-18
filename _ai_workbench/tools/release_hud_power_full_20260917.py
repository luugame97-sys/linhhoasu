"""Static-only HUD release; no backend reloads and no player writes."""
import hashlib
import json
import shlex
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

sys.dont_write_bytecode=True
from snapshot_web_multiserver_20260906 import connect,run,WB
from release_huyenvu_daily_20260906 import hashes,pm2

ROOT=WB.parent
OUT=WB/'temp/hud_power_full_20260917'
GAME='/linhhoasu/webgame/game'
ADDON=GAME+'/js/lhs-hud-power-full-v1.js'
INDEX=GAME+'/index.html'
LOCAL=ROOT/'linhhoasu/webgame/game/js/lhs-hud-power-full-v1.js'
TEST=WB/'tools/test_hud_power_full_20260917.js'
def sha(b):return hashlib.sha256(b).hexdigest()
def save(r):(OUT/'release.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def main():
    assert not (OUT/'release.json').exists(),'RELEASE_ALREADY_EXISTS_INSPECT_FIRST'
    baseline=json.loads((OUT/'baseline.json').read_text(encoding='utf-8'))
    addon=LOCAL.read_bytes();newhash=sha(addon)
    visual={mode:json.loads((OUT/('visual-'+mode+'.json')).read_text(encoding='utf-8')) for mode in ['desktop','mobile']}
    for mode,v in visual.items():
        assert v['result']=='PASS' and not v['errors'] and v['addonHash']==newhash,'VISUAL_NOT_CURRENT:'+mode
        assert len(v['checks'])==26 and all(x['textHeight']<=80 and x['text']==x['expected'] for x in v['checks'])
    assert visual['mobile']['viewport']=={'width':390,'height':844}
    subprocess.run(['node','--check',str(LOCAL)],check=True,cwd=ROOT)
    localtest=json.loads(subprocess.check_output(['node',str(TEST)],cwd=ROOT,text=True))
    assert localtest['result']=='PASS'
    before=(OUT/'index.before.html').read_bytes()
    anchor=b'\t\t"js/lhs-player-healthbar-v1.js?v=20260917_player_healthbar_reanchor_v8",\n'
    addition=b'\t\t"js/lhs-hud-power-full-v1.js?v=20260917_hud_power_full_v1",\n'
    assert before.count(anchor)==1 and b'lhs-hud-power-full' not in before
    candidate=before.replace(anchor,anchor+addition)
    assert candidate==(ROOT/'linhhoasu/webgame/game/index.html').read_bytes(),'LOCAL_INDEX_UNRELATED_CHANGES'
    assert b'main.min_a6195824.js' not in candidate and candidate.count(b'main.min_drop100.js')==1
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    stage='/linhhoasu/_ai_workbench/temp/hud_power_full_'+stamp;backup=stage.replace('/temp/','/backups/')
    report={'status':'STAGING','stage':stage,'backup':backup,'beforeIndex':sha(before),'afterIndex':sha(candidate),'addonHash':newhash,'unit':localtest,'visual':{k:{'result':v['result'],'cases':len(v['checks']),'viewport':v['viewport'],'hash':v['addonHash']} for k,v in visual.items()},'serverRestarted':[],'playerWrites':0,'applied':[]}
    s=connect()
    try:
        assert hashes(s,list(baseline['hashes']))==baseline['hashes'],'BASELINE_DRIFT'
        assert hashes(s,[ADDON])[ADDON] is None,'ADDON_ALREADY_EXISTS'
        report['beforePm2']=pm2(s)
        run(s,'install -d -m 700 '+shlex.quote(stage)+' '+shlex.quote(backup))
        with s.open_sftp() as f:
            for name,data in [('addon.js',addon),('index.html',candidate),('test.js',TEST.read_bytes())]:
                with f.open(stage+'/'+name,'wb') as w:w.write(data)
            with f.open(backup+'/index.html.before','wb') as w:w.write(before)
        assert hashes(s,[stage+'/addon.js',stage+'/index.html'])=={stage+'/addon.js':newhash,stage+'/index.html':sha(candidate)}
        run(s,'node --check '+shlex.quote(stage+'/addon.js'))
        report['stagedTest']=json.loads(run(s,'HUD_POWER_SCRIPT='+shlex.quote(stage+'/addon.js')+' node '+shlex.quote(stage+'/test.js')))
        assert report['stagedTest']['result']=='PASS'
        save(report)
        assert hashes(s,list(baseline['hashes']))==baseline['hashes'],'PREINSTALL_DRIFT'
        with s.open_sftp() as f:
            try:f.stat(ADDON);raise RuntimeError('ADDON_CAS_EXISTS')
            except FileNotFoundError:pass
            for target,data in [(ADDON,addon),(INDEX,candidate)]:
                if target==INDEX:assert sha(f.open(INDEX,'rb').read())==sha(before),'INDEX_CAS_MISMATCH'
                tmp=target+'.hud-full-tmp'
                with f.open(tmp,'wx') as w:w.write(data)
                f.chmod(tmp,0o644);f.posix_rename(tmp,target);report['applied'].append(target);save(report)
        publicAddon=urlopen('http://103.116.105.154:81/js/lhs-hud-power-full-v1.js?v=20260917_hud_power_full_v1',timeout=20).read()
        publicIndex=urlopen('http://103.116.105.154:81/?verify=hud_power_full_20260917',timeout=20).read()
        assert sha(publicAddon)==newhash and sha(publicIndex)==sha(candidate),'PUBLIC_HASH_MISMATCH'
        unchanged={k:v for k,v in baseline['hashes'].items() if k!=INDEX}
        assert hashes(s,list(unchanged))==unchanged,'UNRELATED_CLIENT_CHANGED'
        assert pm2(s)==report['beforePm2'],'PROCESS_CHANGED'
        report.update(status='DEPLOYED',publicAddonHash=sha(publicAddon),publicIndexHash=sha(publicIndex),processesUnchanged=True,finishedAt=datetime.now(timezone.utc).isoformat());save(report)
        print(json.dumps({k:report[k] for k in ['status','backup','addonHash','processesUnchanged','playerWrites','serverRestarted']}))
    except Exception as e:
        report['error']=str(e)
        with s.open_sftp() as f:
            if INDEX in report['applied'] and sha(f.open(INDEX,'rb').read())==sha(candidate):
                with f.open(INDEX+'.hud-full-rollback','wb') as w:w.write(before)
                f.posix_rename(INDEX+'.hud-full-rollback',INDEX)
            if ADDON in report['applied'] and sha(f.open(ADDON,'rb').read())==newhash:f.posix_rename(ADDON,backup+'/addon.failed.js')
        report['status']='FAILED_ROLLED_BACK' if report['applied'] else 'FAILED_BEFORE_INSTALL';save(report);raise
    finally:s.close()
def hotfix():
    out=OUT/'hotfix';manifest=out/'release.json'
    assert not manifest.exists(),'HOTFIX_RELEASE_EXISTS_INSPECT_FIRST'
    baseline=json.loads((out/'baseline.json').read_text(encoding='utf-8'))
    addon=LOCAL.read_bytes();newhash=sha(addon)
    visuals={name:json.loads((out/('visual-'+name+'.json')).read_text(encoding='utf-8')) for name in ['desktop','mobile','cold-desktop','cold-mobile','cold-late']}
    for name,v in visuals.items():
        assert v['result']=='PASS' and not v['errors'] and v['addonHash']==newhash,'VISUAL_NOT_CURRENT:'+name
        if name.startswith('cold'):
            assert all(x['scaleX']==1 and x['textWidth']==0 for x in v['before'])
            assert all(x['scaleX']>0.5 and x['textWidth']>100 and not x['retryPending'] for x in v['after'])
        else:assert len(v['checks'])==26
    assert visuals['cold-late']['fontDelay']>3000
    assert visuals['mobile']['viewport']==visuals['cold-mobile']['viewport']=={'width':390,'height':844}
    subprocess.run(['node','--check',str(LOCAL)],check=True,cwd=ROOT)
    unit=json.loads(subprocess.check_output(['node',str(TEST)],cwd=ROOT,text=True));assert unit['result']=='PASS' and unit['checks']>=316
    old_addon=(out/'addon.before.js').read_bytes();old_index=(out/'index.before.html').read_bytes()
    old_token=b'20260917_hud_power_full_v1';new_token=b'20260917_hud_power_full_v2'
    assert old_index.count(old_token)==1
    new_index=old_index.replace(old_token,new_token)
    assert new_index==(ROOT/'linhhoasu/webgame/game/index.html').read_bytes(),'HOTFIX_UNRELATED_INDEX_CHANGES'
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');stage='/linhhoasu/_ai_workbench/temp/hud_power_font_'+stamp;backup=stage.replace('/temp/','/backups/')
    r={'status':'STAGING','stage':stage,'backup':backup,'beforeAddonHash':sha(old_addon),'addonHash':newhash,'beforeIndexHash':sha(old_index),'indexHash':sha(new_index),'unit':unit,'visuals':{k:{'result':v['result'],'hash':v['addonHash'],'viewport':v['viewport']} for k,v in visuals.items()},'applied':[],'serverRestarted':[],'playerWrites':0}
    def write_report():manifest.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    s=connect()
    try:
        assert hashes(s,list(baseline['hashes']))==baseline['hashes'],'HOTFIX_BASELINE_DRIFT'
        r['beforePm2']=pm2(s)
        run(s,'install -d -m 700 '+shlex.quote(stage)+' '+shlex.quote(backup))
        with s.open_sftp() as f:
            for path,data in [(stage+'/addon.js',addon),(stage+'/index.html',new_index),(stage+'/test.js',TEST.read_bytes()),(backup+'/addon.js.before',old_addon),(backup+'/index.html.before',old_index)]:
                with f.open(path,'wx') as w:w.write(data)
        assert hashes(s,[stage+'/addon.js',stage+'/index.html'])=={stage+'/addon.js':newhash,stage+'/index.html':sha(new_index)}
        run(s,'node --check '+shlex.quote(stage+'/addon.js'))
        r['stagedTest']=json.loads(run(s,'HUD_POWER_SCRIPT='+shlex.quote(stage+'/addon.js')+' node '+shlex.quote(stage+'/test.js')))
        assert r['stagedTest']['result']=='PASS';write_report()
        with s.open_sftp() as f:
            assert hashes(s,list(baseline['hashes']))==baseline['hashes'],'HOTFIX_PREINSTALL_DRIFT'
            for target,data,previous in [(ADDON,addon,old_addon),(INDEX,new_index,old_index)]:
                assert sha(f.open(target,'rb').read())==sha(previous),'HOTFIX_CAS_FAILED'
                temp=target+'.font-hotfix-tmp'
                with f.open(temp,'wx') as w:w.write(data)
                f.chmod(temp,0o644);f.posix_rename(temp,target);r['applied'].append(target);write_report()
        publicAddon=urlopen('http://103.116.105.154:81/js/lhs-hud-power-full-v1.js?v=20260917_hud_power_full_v2',timeout=20).read()
        publicIndex=urlopen('http://103.116.105.154:81/?verify=hud_font_v2',timeout=20).read()
        assert sha(publicAddon)==newhash and sha(publicIndex)==sha(new_index),'HOTFIX_PUBLIC_HASH_MISMATCH'
        unchanged={k:v for k,v in baseline['hashes'].items() if k not in [ADDON,INDEX]}
        assert hashes(s,list(unchanged))==unchanged;assert pm2(s)==r['beforePm2'],'HOTFIX_PROCESS_CHANGED'
        r['ready']={str(p):int(run(s,"curl -s --max-time 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:"+str(p)+'/ready')) for p in [8080,8083,8084,8085]}
        assert all(v==200 for v in r['ready'].values())
        r.update(status='DEPLOYED',processesUnchanged=True,publicAddonHash=sha(publicAddon),finishedAt=datetime.now(timezone.utc).isoformat());write_report()
        print(json.dumps({k:r[k] for k in ['status','backup','addonHash','ready','processesUnchanged','playerWrites']}))
    except Exception as e:
        r['error']=str(e)
        with s.open_sftp() as f:
            for target,candidate,old in [(INDEX,new_index,old_index),(ADDON,addon,old_addon)]:
                if target in r['applied'] and sha(f.open(target,'rb').read())==sha(candidate):
                    temp=target+'.font-hotfix-rollback'
                    with f.open(temp,'wb') as w:w.write(old)
                    f.chmod(temp,0o644);f.posix_rename(temp,target)
        r['status']='FAILED_ROLLED_BACK' if r['applied'] else 'FAILED_BEFORE_INSTALL';write_report();raise
    finally:s.close()

def power_cells():
    out=WB/'temp/power_cells_full_20260917';manifest=out/'release.json'
    assert not manifest.exists(),'POWER_CELLS_RELEASE_EXISTS_INSPECT_FIRST'
    baseline=json.loads((out/'baseline.json').read_text(encoding='utf-8'))
    local=ROOT/'linhhoasu/webgame/game/js/lhs-power-cells-full-v1.js';target=GAME+'/js/lhs-power-cells-full-v1.js'
    addon=local.read_bytes();newhash=sha(addon);test=WB/'tools/test_power_cells_full_20260917.js'
    visuals={name:json.loads((out/('visual-'+name+'.json')).read_text(encoding='utf-8')) for name in ['desktop','mobile','cold-desktop','cold-mobile','cold-late']}
    for name,v in visuals.items():
        assert v['result']=='PASS' and not v['errors'] and v['addonHash']==newhash,'POWER_VISUAL_NOT_CURRENT:'+name
        if not name.startswith('cold'):assert len(v['checks'])==217 and v['catalogEntries']==54 and v['animationCallback']
        else:assert v['before']['scale']==1 and v['before']['width']==0 and not v['after']['timer']
    assert visuals['mobile']['viewport']==visuals['cold-mobile']['viewport']=={'width':390,'height':844}
    subprocess.run(['node','--check',str(local)],check=True,cwd=ROOT)
    unit=json.loads(subprocess.check_output(['node',str(test)],cwd=ROOT,text=True))
    hudunit=json.loads(subprocess.check_output(['node',str(TEST)],cwd=ROOT,text=True))
    assert unit['result']==hudunit['result']=='PASS'
    before=(out/'index.before.html').read_bytes()
    anchor=b'\t\t"js/lhs-hud-power-full-v1.js?v=20260917_hud_power_full_v2",\n'
    extra=b'\t\t"js/lhs-power-cells-full-v1.js?v=20260917_power_cells_full_v1",\n'
    assert before.count(anchor)==1 and b'lhs-power-cells-full' not in before
    candidate=before.replace(anchor,anchor+extra)
    assert candidate==(ROOT/'linhhoasu/webgame/game/index.html').read_bytes(),'POWER_INDEX_UNRELATED_CHANGES'
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');stage='/linhhoasu/_ai_workbench/temp/power_cells_full_'+stamp;backup=stage.replace('/temp/','/backups/')
    r={'status':'STAGING','stage':stage,'backup':backup,'beforeIndexHash':sha(before),'indexHash':sha(candidate),'addonHash':newhash,'unit':unit,'hudRegression':hudunit,'visuals':{k:{'result':v['result'],'hash':v['addonHash'],'cases':len(v['checks']),'viewport':v['viewport']} for k,v in visuals.items()},'applied':[],'serverRestarted':[],'playerWrites':0}
    def record():manifest.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    s=connect()
    try:
        assert hashes(s,list(baseline['hashes']))==baseline['hashes'],'POWER_BASELINE_DRIFT'
        assert hashes(s,[target])[target] is None,'POWER_ADDON_EXISTS';r['beforePm2']=pm2(s)
        run(s,'install -d -m 700 '+shlex.quote(stage)+' '+shlex.quote(backup))
        with s.open_sftp() as f:
            for name,data in [('addon.js',addon),('index.html',candidate),('test.js',test.read_bytes())]:
                with f.open(stage+'/'+name,'wx') as w:w.write(data)
            with f.open(backup+'/index.html.before','wx') as w:w.write(before)
        assert hashes(s,[stage+'/addon.js',stage+'/index.html'])=={stage+'/addon.js':newhash,stage+'/index.html':sha(candidate)}
        run(s,'node --check '+shlex.quote(stage+'/addon.js'))
        cmd='HUD_POWER_SCRIPT='+shlex.quote(ADDON)+' POWER_CELLS_SCRIPT='+shlex.quote(stage+'/addon.js')+' node '+shlex.quote(stage+'/test.js')
        r['stagedTest']=json.loads(run(s,cmd));assert r['stagedTest']['result']=='PASS';record()
        with s.open_sftp() as f:
            assert hashes(s,list(baseline['hashes']))==baseline['hashes'],'POWER_PREINSTALL_DRIFT'
            assert hashes(s,[target])[target] is None,'POWER_ADDON_CAS_EXISTS'
            for remote,data in [(target,addon),(INDEX,candidate)]:
                if remote==INDEX:assert sha(f.open(INDEX,'rb').read())==sha(before),'POWER_INDEX_CAS'
                temp=remote+'.power-cells-tmp'
                with f.open(temp,'wx') as w:w.write(data)
                f.chmod(temp,0o644);f.posix_rename(temp,remote);r['applied'].append(remote);record()
        served=urlopen('http://103.116.105.154:81/js/lhs-power-cells-full-v1.js?v=20260917_power_cells_full_v1',timeout=20).read()
        index=urlopen('http://103.116.105.154:81/?verify=power_cells_v1',timeout=20).read()
        assert sha(served)==newhash and sha(index)==sha(candidate),'POWER_PUBLIC_HASH'
        unchanged={k:v for k,v in baseline['hashes'].items() if k!=INDEX};assert hashes(s,list(unchanged))==unchanged
        assert pm2(s)==r['beforePm2'],'POWER_PROCESS_CHANGED'
        r['ready']={str(p):int(run(s,"curl -s --max-time 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:"+str(p)+'/ready')) for p in [8080,8083,8084,8085]};assert all(v==200 for v in r['ready'].values())
        r.update(status='DEPLOYED',processesUnchanged=True,publicAddonHash=sha(served),finishedAt=datetime.now(timezone.utc).isoformat());record();print(json.dumps({k:r[k] for k in ['status','backup','addonHash','ready','processesUnchanged','playerWrites']}))
    except Exception as e:
        r['error']=str(e)
        with s.open_sftp() as f:
            if INDEX in r['applied'] and sha(f.open(INDEX,'rb').read())==sha(candidate):
                with f.open(INDEX+'.power-cells-rollback','wb') as w:w.write(before)
                f.chmod(INDEX+'.power-cells-rollback',0o644);f.posix_rename(INDEX+'.power-cells-rollback',INDEX)
            if target in r['applied'] and sha(f.open(target,'rb').read())==newhash:f.posix_rename(target,backup+'/addon.failed.js')
        r['status']='FAILED_ROLLED_BACK' if r['applied'] else 'FAILED_BEFORE_INSTALL';record();raise
    finally:s.close()

if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='hotfix':hotfix()
    elif len(sys.argv)>1 and sys.argv[1]=='power-cells':power_cells()
    else:main()
