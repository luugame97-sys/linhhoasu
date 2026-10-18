"""Classify only newly appended restart warnings; never emit raw player log lines."""
import json
from snapshot_web_multiserver_20260906 import connect,run
from preflight_fishing_rank_x10_20260907 import ROOT
s=connect()
try:
    pre=json.loads((ROOT/'preflight.json').read_text())
    rows=[{'name':r['name'],'path':r['errorLog'],'start':r['errorLogSize']} for r in pre['runtime']]
    script="const fs=require('fs'),rows="+json.dumps(rows)+r""";
    const result=rows.map(r=>{const n=fs.statSync(r.path).size,bytes=Math.min(Math.max(0,n-r.start),65536),b=Buffer.alloc(bytes),fd=fs.openSync(r.path,'r');fs.readSync(fd,b,0,bytes,Math.max(r.start,n-bytes));fs.closeSync(fd);const text=b.toString();return{name:r.name,bytes,duplicateMongooseIndex:/Duplicate schema index/.test(text),mongooseWarning:/MONGOOSE/.test(text),circularDependency:/circular dependency/.test(text),deprecationWarning:/DeprecationWarning/.test(text),fatalMarkers:(text.match(/TypeError|ReferenceError|SyntaxError|FATAL|UnhandledPromiseRejection/g)||[]).length};});console.log(JSON.stringify(result));
    """
    result=json.loads(run(s,'node -',script));(ROOT/'restart-warnings.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
finally:s.close()
