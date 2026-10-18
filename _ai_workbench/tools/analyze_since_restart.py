import getpass,re,statistics,paramiko
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect('103.116.105.154',username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 sf=s.open_sftp();p='/root/.pm2/logs/lhs-s1001-out.log';st=sf.stat(p);n=min(st.st_size,48*1024*1024);f=sf.open(p,'rb');f.seek(st.st_size-n);text=f.read().decode('utf-8','replace');f.close();sf.close()
 marker='[WSServer] runtime ready revision=';idx=text.rfind(marker);segment=text[idx:] if idx>=0 else text
 perf={};queue=[];slow=[];save=[]
 for line in segment.splitlines():
  m=re.search(r'\[Perf\]\[WS\] tag=(\d+).*?totalMs=([\d.]+)',line)
  if m:perf.setdefault(int(m.group(1)),[]).append(float(m.group(2)))
  m=re.search(r'handler enter .*?tag=(\d+).*?queueDepth=(\d+)',line)
  if m:queue.append((int(m.group(1)),int(m.group(2))))
  m=re.search(r'slow tag=(\d+).*?elapsed=(\d+)ms(?:.*?route=(\d+)ms post=(\d+)ms tail=(\d+)ms)?',line)
  if m:slow.append(tuple(int(x) if x else 0 for x in m.groups()))
  m=re.search(r'save queue backlog .*?depth=(\d+)',line)
  if m:save.append(int(m.group(1)))
 def pct(v,pct):return sorted(v)[min(len(v)-1,max(0,int(len(v)*pct)))] if v else 0
 allv=[x for v in perf.values() for x in v];print('MARKER_FOUND',idx>=0,'SEGMENT_LINES',len(segment.splitlines()));print('OVERALL',{'count':len(allv),'p50':round(pct(allv,.5),1),'p95':round(pct(allv,.95),1),'p99':round(pct(allv,.99),1),'max':round(max(allv),1) if allv else 0})
 for tag,v in sorted(perf.items(),key=lambda kv:pct(kv[1],.95),reverse=True)[:30]:print('TAG',tag,'n',len(v),'avg',round(statistics.mean(v),1),'p95',round(pct(v,.95),1),'max',round(max(v),1))
 print('QUEUE',{'n':len(queue),'p95':pct([x[1] for x in queue],.95),'max':max([x[1] for x in queue],default=0),'over3':sum(x[1]>3 for x in queue)})
 qs={}
 for tag,d in queue:qs.setdefault(tag,[]).append(d)
 for tag,v in sorted(qs.items(),key=lambda kv:max(kv[1]),reverse=True)[:20]:print('QTAG',tag,'n',len(v),'avg',round(statistics.mean(v),2),'max',max(v))
 print('SLOW_ROUTE_POST',slow[-40:]);print('SAVE_QUEUE',{'events':len(save),'max':max(save,default=0)})
finally:s.close()
