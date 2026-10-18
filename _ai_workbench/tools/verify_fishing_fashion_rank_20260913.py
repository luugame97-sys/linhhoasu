import json,hashlib
from snapshot_web_multiserver_20260906 import connect,run
if __name__=='__main__':
 s=connect()
 try:
  out={};
  for url in ['http://127.0.0.1:81/update/resource/assets/excel/config_e5ac72c2.bin?v=20260913_fishing_fashion_box_rank','http://127.0.0.1:81/update/resource/assets/excel/config_fashion_20260909.bin?v=20260913_fishing_fashion_box_rank']:
   out[url]=run(s,"curl -fsS --max-time 20 "+url+' | sha256sum | awk \'{print $1}\'').strip()
  out['ready']={str(p):run(s,"curl -fsS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:"+str(p)+'/ready').strip() for p in [8080,8083,8084]};print(json.dumps(out))
 finally:s.close()
