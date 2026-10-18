"""Double native normal-map animBorns with deterministic handle-compatible clones."""
from pathlib import Path
import re
import sys

main, index = map(Path, sys.argv[1:3])
s = main.read_text(encoding='utf-8')
old = 'cZe.initMapCreeps=function(){if(null!=Fq.animBorns)for(var t=0;t<Fq.animBorns.length;t++)'
new = 'cZe.initMapCreeps=function(){if(null!=Fq.animBorns&&!Fq.animBorns._lhsDensity2){for(var e=Fq.animBorns.slice(),i=[[64,0],[-64,0],[0,64],[0,-64]],n=0;n<e.length;n++){var a=e[n],s=i[n%i.length];Fq.animBorns.push({id:a.id,x:Math.min(Fq.MAX_WIDTH-1,Math.max(1,a.x+s[0])),y:Math.min(Fq.MAX_HEIGHT-1,Math.max(1,a.y+s[1]))})}Fq.animBorns._lhsDensity2=!0}if(null!=Fq.animBorns)for(var t=0;t<Fq.animBorns.length;t++)'
if s.count(old) != 1:
    raise RuntimeError('normal-map creep anchor count=' + str(s.count(old)))
s = s.replace(old, new, 1)
main.write_text(s, encoding='utf-8', newline='')
h = index.read_text(encoding='utf-8')
h = re.sub(r'(main\.min_a6195824\.js)(?:\?v=[^"\']*)?', r'\1?v=20260904_double_monsters1', h, count=1)
index.write_text(h, encoding='utf-8', newline='')
print('PATCHED_DOUBLE_MONSTERS')
