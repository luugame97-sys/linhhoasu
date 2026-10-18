from skin_incident_remote import connect, run

with connect() as client:
    print(run(client, "python3 -", r'''
from pathlib import Path
import re
targets=[Path('/linhhoasu/lhs/LHS-admin/server.js'),Path('/linhhoasu/lhs/newServer/src/services/XtPayService.js'),Path('/linhhoasu/lhs/newServer/src/net/HTTPServer.js')]
targets+=list(Path('/linhhoasu/lhs/LHS-dist/src').rglob('*.js'))
for p in targets:
    s=p.read_text(errors='replace')
    lines=s.splitlines()
    found=[(i+1,line.strip()) for i,line in enumerate(lines) if re.search(r'ConfigService|RechargeRewardResolver|handleRecharge|/api/internal/recharge|newServer|xtpay|proxy|axios\.|fetch\(',line,re.I)]
    if found:
        print('SOURCE',str(p))
        for n,line in found[:30]:
            if not re.search(r'secret|password|api[_-]?key|token|authorization',line,re.I): print(n,line[:260])
'''))
    print(run(client, "python3 -", r'''
from pathlib import Path
import re
for name in ['/linhhoasu/lhs/LHS-admin/server.js','/linhhoasu/lhs/LHS-dist/src/app.js']:
    p=Path(name); print('ENTRY',name)
    for n,line in enumerate(p.read_text(errors='replace').splitlines()[:85],1):
        if not re.search(r'secret|password|api[_-]?key|token|authorization',line,re.I): print(n,line[:220])
p=Path('/linhhoasu/lhs/newServer/src/services/XtPayService.js'); lines=p.read_text().splitlines()
for n in range(280,min(318,len(lines))): print(n+1,lines[n])
'''))
    print(run(client, "python3 -", r'''
from pathlib import Path
import re
for root in ['/etc/nginx/sites-enabled','/www/server/panel/vhost/nginx']:
    for p in Path(root).glob('*.conf'):
        s=p.read_text(errors='replace')
        if 'linhhoasu' not in s and '3000' not in s and '8080' not in s: continue
        print('NGINX', str(p))
        for line in s.splitlines():
            if re.search(r'^\s*(server_name|listen|location|proxy_pass)\b',line): print(line.strip())
'''))
