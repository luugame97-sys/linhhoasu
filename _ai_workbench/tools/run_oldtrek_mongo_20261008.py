from pathlib import Path
from skin_incident_remote import connect, run
ROOT=Path(__file__).resolve().parents[2]
src=ROOT/'_ai_workbench/tools/test_oldtrek_mongo_20261008.js'
remote='/tmp/test_oldtrek_mongo_20261008.js'
with connect() as c:
    s=c.open_sftp(); s.put(str(src),remote); s.close()
    out=run(c,'node '+remote)
    print(out)
    run(c,'rm -f '+remote)
