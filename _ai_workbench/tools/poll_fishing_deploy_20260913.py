from snapshot_web_multiserver_20260906 import connect,run
if __name__=='__main__':
 s=connect()
 try: print(run(s,"ps -eo pid,cmd | grep -E 'node.*config_e5ac|pm2|app.js' | grep -v grep | tail -20"))
 finally:s.close()
