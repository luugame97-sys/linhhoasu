import json, sys
from pathlib import Path
WB=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(WB/'tools'))
from snapshot_web_multiserver_20260906 import connect,run
s=connect()
try:
 p='/linhhoasu/_ai_workbench/backups/map_pet_visual_20260930_20260929_171233'
 print(run(s,'ls -l '+p+' && sha256sum '+p+'/*'))
finally:s.close()
