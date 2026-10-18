import getpass, re, statistics, paramiko
s=paramiko.SSHClient(); s.set_missing_host_key_policy(paramiko.AutoAddPolicy()); s.connect('103.116.105.154',username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
_,o,e=s.exec_command('tail -n 12000 /root/.pm2/logs/lhs-s1001-out.log'); t=o.read().decode('utf-8','replace'); s.close()
perf=re.compile(r'Perf\]\[WS\] tag=(\d+).*?totalMs=([\d.]+)'); q=re.compile(r'handler enter .*?tag=(\d+).*?queueDepth=(\d+)'); d={}; qs={}
for tag,ms in perf.findall(t): d.setdefault(int(tag),[]).append(float(ms))
for tag,depth in q.findall(t): qs.setdefault(int(tag),[]).append(int(depth))
allv=[v for vals in d.values() for v in vals]
def p95(v): return sorted(v)[max(0,int(.95*len(v))-1)] if v else 0
print('SAMPLES',len(allv),'p50',round(statistics.median(allv),1) if allv else 0,'p95',round(p95(allv),1),'over500',sum(x>=500 for x in allv),'over1000',sum(x>=1000 for x in allv))
for tag in [11,1,2600,2602,3001,3103,1103,2100,2101,2301,1000]:
 v=d.get(tag,[]); z=qs.get(tag,[]); print('TAG',tag,'n',len(v),'p95',round(p95(v),1),'max',round(max(v),1) if v else 0,'queueN',len(z),'qmax',max(z) if z else 0)
