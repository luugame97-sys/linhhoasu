from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import shlex
from pathlib import Path

import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/public_notify_20261003/postcheck.json'
FILES = {
    'ChatBus': '/linhhoasu/lhs/newServer/src/services/ChatBus.js',
    'chat': '/linhhoasu/lhs/newServer/src/handlers/chat.js',
    'index': '/linhhoasu/lhs/newServer/src/handlers/index.js',
    'PublicNotification': '/linhhoasu/lhs/newServer/src/services/PublicNotificationService.js',
    'app': '/linhhoasu/lhs/newServer/src/app.js',
    'wss': '/linhhoasu/lhs/newServer/src/net/WSServer.js',
    'ArenaSettlement': '/linhhoasu/lhs/newServer/src/services/ArenaSettlementService.js',
    'EventRewardSettlement': '/linhhoasu/lhs/newServer/src/services/EventRewardSettlementService.js',
    'CrossEventSettlement': '/linhhoasu/lhs/newServer/src/services/CrossEventSettlementService.js',
}
PORTS = {'S1': 8080, 'S2': 8083, 'S3': 8084, 'S4': 8085, 'S5': 8086, 'S6': 8087}


def sha(b: bytes) -> str: return hashlib.sha256(b).hexdigest()
def q(s: str) -> str: return shlex.quote(s)


def main():
    args, kwargs = ssh_config(); assert args[0] == '103.116.104.165'
    c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy()); c.connect(*args, **kwargs); s = c.open_sftp()
    def run(cmd, timeout=30):
        _,o,e=c.exec_command(cmd,timeout=timeout);out=o.read();err=e.read();rc=o.channel.recv_exit_status()
        if rc: raise RuntimeError(f'REMOTE_FAILED:{rc}:{err.decode("utf8","replace")[-700:]}')
        return out
    source={};hashes={}
    for name,path in FILES.items():
        with s.open(path,'rb') as f:data=f.read()
        source[name]=data.decode('utf8','replace');hashes[name]={'path':path,'sha256':sha(data),'bytes':len(data)}
    checks={
      'chatPublishesBus':'chatBus.publish' in source['chat'],
      'chatReadsBusHistory':'chatBus.getHistory' in source['chat'],
      'systemHistoryReplay':'buildChatInitPacketAsync' in source['chat'] and 'sysList' in source['chat'],
      'blockRouteFixed':'router.register(1601, chat.handleBlockPlayer)' in source['index'],
      'appStartsBus':'chatBus.start' in source['app'],
      'wssBotUsesBus':'chat.publishChatEntry' in source['wss'],
      'busGlobalNamespace':"CHANNEL = 'lhs:chat:v1'" in source['ChatBus'] and "keyPrefix: ''" in source['ChatBus'],
      'busDedupe':'messageId' in source['ChatBus'] and 'seen' in source['ChatBus'],
      'publicFirstClear':'announceFirstClear' in source['PublicNotification'],
      'publicAchievementFilter':'isPublicTask' in source['PublicNotification'],
      'publicRareReward':'isRare' in source['PublicNotification'],
      'sensitiveAdminExcluded':'isSensitivePlayer' in source['PublicNotification'] and 'SENSITIVE_TAGS' in source['PublicNotification'],
      'wssResultHook':'publicNotification.observeResult' in source['wss'],
      'settlementNamePreserved':'name: String(r.name || \'\')' in source['ArenaSettlement'],
      'busStartsBeforeSettlement':source['app'].find('chatBus.start') >= 0 and source['app'].find('chatBus.start') < source['app'].find('arenaSettlement.startArenaSettlementScheduler'),
    }
    if not all(checks.values()): raise RuntimeError('CONTRACT_FAILED:'+json.dumps(checks))
    ready={name:json.loads(run(f'curl --max-time 8 -fsS http://127.0.0.1:{port}/ready',12).decode()) for name,port in PORTS.items()}
    nums=run("redis-cli --raw PUBSUB NUMSUB lhs:chat:v1",15).decode('utf8','replace').split()
    result={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'readOnly':True,'directPlayerWrites':0,'authenticatedChatSends':0,'hashes':hashes,'checks':checks,'ready':ready,'redisPubsubNumsub':nums,'result':'PASS'}
    OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    s.close();c.close();print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__': main()
