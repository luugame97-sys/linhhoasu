import getpass,re,statistics,paramiko
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect('103.116.105.154',username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 cmd="f=/root/.pm2/logs/lhs-s1001-out.log; line=$(grep -n '\[WSServer\] runtime ready revision=' $f | tail -1 | cut -d: -f1); [ -n \"$line\" ] && tail -n +$line $f || tail -n 50000 $f"
 _,o,e=s.exec_command(cmd);text=o.read().decode('utf-8','replace')
 perf={};queue=[];slow=[];save=[]
 for line in text.splitlines():
  m=re.search(r'\[Perf\]\[WS\] tag=(\d+).*?totalMs=([\d.]+).*?taskNormalizeMs=([\d.]+).*?taskPushMs=([\d.]+).*?taskPushCount=(\d+).*?taskPushPackets=(\d+).*?taskPushKinds=([^ ]+)',line)
  if m:perf.setdefault(int(m.group(1)),[]).append((float(m.group(2)),float(m.group(3)),float(m.group(4)),int(m.group(5)),int(m.group(6)),m.group(7)))
  m=re.search(r'handler enter .*?tag=(\d+).*?queueDepth=(\d+)',line)
  if m:queue.append((int(m.group(1)),int(m.group(2))))
  m=re.search(r'slow tag=(\d+).*?elapsed=(\d+)ms(?:.*?route=(\d+)ms post=(\d+)ms tail=(\d+)ms)?',line)
  if m:slow.append(tuple(int(x) if x else 0 for x in m.groups()))
  m=re.search(r'save queue backlog .*?depth=(\d+)',line)
  if m:save.append(int(m.group(1)))
 def pct(v,p):return sorted(v)[min(len(v)-1,max(0,int(len(v)*p)))] if v else 0
 allv=[x[0] for v in perf.values() for x in v];print('LINES',len(text.splitlines()));print('OVERALL',{'n':len(allv),'p50':round(pct(allv,.5),1),'p95':round(pct(allv,.95),1),'p99':round(pct(allv,.99),1),'max':round(max(allv),1) if allv else 0})
 for tag,v in sorted(perf.items(),key=lambda kv:pct([x[0] for x in kv[1]],.95),reverse=True)[:30]:
  total=[x[0] for x in v];norm=[x[1] for x in v];push=[x[2] for x in v];push_count=[x[3] for x in v];push_packets=[x[4] for x in v];kinds=sorted(set(x[5] for x in v));print('TAG',tag,'n',len(v),'avg',round(statistics.mean(total),1),'p95',round(pct(total,.95),1),'max',round(max(total),1),'normAvg',round(statistics.mean(norm),1),'normP95',round(pct(norm,.95),1),'pushAvg',round(statistics.mean(push),1),'pushCount',sum(push_count),'pushPackets',sum(push_packets),'kinds',','.join(kinds))
 print('QUEUE',{'n':len(queue),'p95':pct([x[1] for x in queue],.95),'max':max([x[1] for x in queue],default=0),'over3':sum(x[1]>3 for x in queue)});print('SAVE',{'n':len(save),'max':max(save,default=0)});print('SLOW',slow[-50:])
finally:s.close()
