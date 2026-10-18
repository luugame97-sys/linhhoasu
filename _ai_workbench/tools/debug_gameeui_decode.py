from __future__ import annotations

import struct
import zlib
from pathlib import Path


class R:
    def __init__(self, data: bytes): self.d, self.p = data, 0
    def u8(self):
        if self.p >= len(self.d): raise ValueError(f"EOF u8 {self.p}")
        x=self.d[self.p]; self.p+=1; return x
    def u16(self):
        if self.p+2>len(self.d): raise ValueError(f"EOF u16 {self.p}")
        x=struct.unpack_from('>H',self.d,self.p)[0]; self.p+=2; return x
    def raw(self,n):
        if self.p+n>len(self.d): raise ValueError(f"EOF raw {self.p} n={n}")
        x=self.d[self.p:self.p+n]; self.p+=n; return x
    def auto(self,signed=False):
        val=0; mult=1; first=True; neg=False
        while True:
            b=self.u8(); more=bool(b&128); b&=127
            if signed and first:
                neg=bool(b&64); b&=63; mult=64
            val += b*mult
            if not more: return -val if signed and neg else val
            mult*=128; first=False


def main():
    path=Path('linhhoasu/webgame/game/update/resource/assets/cfg/gameEui_18e11b8e.bin')
    r=R(zlib.decompress(path.read_bytes())); version=r.u16(); pc=r.auto(); pool=[]
    for i in range(pc): pool.append(r.raw(r.auto()).decode('utf8','replace'))
    print('version',version,'pool',pc,'root_pos',r.p)
    nodes=0
    def field(depth=0):
        nonlocal nodes
        nodes+=1
        pos=r.p; tag=r.u8()
        if nodes<30: print('  '*depth,'node',nodes,'pos',pos,'tag',tag)
        if tag==0:return None
        if tag==1:return 0
        if tag==2:return -r.u8()
        if tag==3:return -r.u16()
        if tag==4:return int.from_bytes(r.raw(4),'big')
        if tag==5:
            lo=int.from_bytes(r.raw(4),'big'); hi=int.from_bytes(r.raw(4),'big'); return -(hi*4294967296+lo)
        if tag==6:return r.u8()
        if tag==7:return r.u16()
        if tag==8:return int.from_bytes(r.raw(4),'big')
        if tag==9:
            lo=int.from_bytes(r.raw(4),'big'); hi=int.from_bytes(r.raw(4),'big'); return hi*4294967296+lo
        if tag==10:return float(pool[r.auto()])
        if tag==11:return ''
        if tag==12:return pool[r.u8()]
        if tag==13:return pool[r.u16()]
        if tag==14:return pool[r.auto()+65536]
        if tag==15:return []
        if tag in (17,18): return [r.auto(tag==18) for _ in range(r.auto())]
        if tag==19: return [pool[r.auto()] for _ in range(r.auto())]
        if tag==16: return [field(depth+1) for _ in range(r.auto())]
        if tag==20:return {}
        if tag in (22,23):
            signed=tag==23; n=r.auto(); out={}
            for _ in range(n): out[r.auto(signed)]=field(depth+1)
            return out
        if tag==21:
            n=r.auto(); out={}
            for j in range(n):
                idx=r.auto();
                if idx>=len(pool): raise ValueError(f'bad key idx {idx} at {r.p}')
                out[pool[idx]]=field(depth+1)
            return out
        if tag==24:return True
        if tag==25:return False
        raise ValueError(f'UNKNOWN tag={tag} pos={pos} nodes={nodes}')
    try:
        x=field(); print('OK pos',r.p,'nodes',nodes,'type',type(x), 'len',len(x) if hasattr(x,'__len__') else None)
    except Exception as e:
        print('ERR',e,'pos',r.p,'near',r.d[max(0,r.p-40):r.p+80].hex())


if __name__=='__main__': main()
