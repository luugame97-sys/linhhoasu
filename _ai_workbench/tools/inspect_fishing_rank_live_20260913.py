from snapshot_web_multiserver_20260906 import connect, run
if __name__=='__main__':
 s=connect()
 try: print(run(s, "sha256sum /linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin /linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin /linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin"))
 finally:s.close()
