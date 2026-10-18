"""Patch only the WebGM prefix-aware asset URL and remove the player notice."""
import hashlib,json,posixpath,re,shlex,stat,sys
from datetime import datetime,timezone
from snapshot_web_multiserver_20260906 import WB,connect,run

REMOTE='/linhhoasu/webgame/gm';ROOT=WB/'temp/portal_bg_fix_20260907';ROOT.mkdir(parents=True,exist_ok=False)
FILES=['config.php','login.php'];BACKUP='/linhhoasu/_ai_workbench/backups/portal_bg_fix_20260907_'+datetime.now(timezone.utc).strftime('%H%M%S')
OLD_CONFIG="function site_absolute_asset_url($path) { $path=trim((string)$path);if($path===''||preg_match('#^https?://#i',$path)||strpos($path,'/')===0)return $path;$script=isset($_SERVER['SCRIPT_NAME'])?str_replace('\\\\','/',(string)$_SERVER['SCRIPT_NAME']):'';$base=str_replace('\\\\','/',dirname($script));if($base==='/'||$base==='.'||$base==='\\\\')$base='';if(substr($base,-6)==='/admin')$base=substr($base,0,-6);return rtrim($base,'/').'/'.ltrim($path,'/'); }"
NEW_CONFIG="""function site_absolute_asset_url($path) {
    $path = trim((string)$path);
    if ($path === '' || preg_match('#^https?://#i', $path)) return $path;
    $prefix = isset($_SERVER['HTTP_X_FORWARDED_PREFIX']) ? trim((string)$_SERVER['HTTP_X_FORWARDED_PREFIX']) : '';
    if ($prefix !== '' && $prefix[0] === '/' && !preg_match('#[^A-Za-z0-9/_-]#', $prefix) && strpos($prefix, '//') === false) {
        return rtrim($prefix, '/') . '/' . ltrim($path, '/');
    }
    if (strpos($path, '/') === 0) return $path;
    $script = isset($_SERVER['SCRIPT_NAME']) ? str_replace('\\\\', '/', (string)$_SERVER['SCRIPT_NAME']) : '';
    $base = str_replace('\\\\', '/', dirname($script));
    if ($base === '/' || $base === '.' || $base === '\\\\') $base = '';
    if (substr($base, -6) === '/admin') $base = substr($base, 0, -6);
    return rtrim($base, '/') . '/' . ltrim($path, '/');
}"""

def main():
    sys.stdout.reconfigure(encoding='utf-8');ssh=connect()
    try:
        with ssh.open_sftp() as f:
            current={}
            attrs={}
            for rel in FILES:
                with f.open(REMOTE+'/'+rel,'rb') as h:current[rel]=h.read()
                attrs[rel]=f.stat(REMOTE+'/'+rel)
        if OLD_CONFIG.encode() not in current['config.php']:
            raise RuntimeError('CONFIG_ASSET_FUNCTION_DRIFT')
        patched_config=current['config.php'].decode('utf-8').replace(OLD_CONFIG,NEW_CONFIG,1)
        if patched_config==current['config.php'].decode('utf-8') or patched_config.count('function site_absolute_asset_url')!=1:raise RuntimeError('CONFIG_PATCH_NOT_APPLIED')
        login=current['login.php'].decode('utf-8')
        notice=re.compile(r'\s*<div class="alert alert-info bg-info bg-opacity-10 text-info border-info border-opacity-25 rounded-4 small fw-bold mb-3">\s*<i class="fa-solid fa-circle-info me-1"></i>\s*Tài khoản được đăng ký trực tiếp trong game\. Web quản lý tài khoản Linh Họa Sư dùng để đăng nhập và quản lý tài khoản đã có; hãy chọn đúng máy chủ của nhân vật\.\s*</div>\s*',re.I)
        login2,n=notice.subn('\n',login,count=1)
        if n!=1 or 'Tài khoản được đăng ký trực tiếp trong game.' in login2:raise RuntimeError('PLAYER_NOTICE_NOT_REMOVED')
        next_data={'config.php':patched_config.encode('utf-8'),'login.php':login2.encode('utf-8')}
        manifest={'before':{k:hashlib.sha256(v).hexdigest()for k,v in current.items()},'after':{k:hashlib.sha256(v).hexdigest()for k,v in next_data.items()},'backup':BACKUP,'at':datetime.now(timezone.utc).isoformat(),'files':FILES}
        (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
        run(ssh,'install -d -m 700 '+shlex.quote(BACKUP+'/before')+' '+shlex.quote(BACKUP+'/next'))
        with ssh.open_sftp() as f:
            for rel in FILES:
                run(ssh,'cp -p '+shlex.quote(REMOTE+'/'+rel)+' '+shlex.quote(BACKUP+'/before/'+rel))
                with f.open(BACKUP+'/next/'+rel,'wb') as h:h.write(next_data[rel])
                f.chmod(BACKUP+'/next/'+rel,stat.S_IMODE(attrs[rel].st_mode));f.chown(BACKUP+'/next/'+rel,attrs[rel].st_uid,attrs[rel].st_gid)
                run(ssh,'php -l '+shlex.quote(BACKUP+'/next/'+rel))
        # Atomic per-file rename after both staged files lint successfully.
        with ssh.open_sftp() as f:
            for rel in FILES:f.posix_rename(BACKUP+'/next/'+rel,REMOTE+'/'+rel)
        out={'result':'DEPLOYED','backup':BACKUP,'before':manifest['before'],'after':manifest['after'],'liveSourceFiles':FILES}
        (ROOT/'deploy.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(out))
    finally:ssh.close()
if __name__=='__main__':main()
