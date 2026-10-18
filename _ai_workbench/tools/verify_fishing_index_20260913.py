from snapshot_web_multiserver_20260906 import connect,run
if __name__=='__main__':
 s=connect()
 try: print(run(s,"curl -fsS --max-time 20 http://127.0.0.1:81/index.html | sed -n '/translationVersion/p'"))
 finally:s.close()
