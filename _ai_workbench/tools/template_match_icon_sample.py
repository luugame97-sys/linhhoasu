from pathlib import Path
import cv2, numpy as np

ROOT=Path(r'I:\Linhhoasu\server\server\linhhoasu\webgame\game\update\resource\assets\atlas_ui')
SAMPLE=Path(r'C:\Users\vandu\AppData\Local\Temp\codex-clipboard-94c6c7a2-9c63-4f79-9694-def50bc82e8e.png')
OUT=Path(r'I:\Linhhoasu\server\server\_ai_workbench\temp\icon_template_matches.tsv')
sample=cv2.imdecode(np.fromfile(str(SAMPLE),dtype=np.uint8),cv2.IMREAD_UNCHANGED)
if sample.shape[2]==4:
 a=sample[:,:,3:4]/255.; sample=(sample[:,:,:3]*a+48*(1-a)).astype(np.uint8)
sg=cv2.cvtColor(sample,cv2.COLOR_BGR2GRAY)
se=cv2.Canny(sg,60,150)
rows=[]
for p in ROOT.rglob('*.png'):
 try:
  im=cv2.imdecode(np.fromfile(str(p),dtype=np.uint8),cv2.IMREAD_UNCHANGED)
  if im is None: continue
  h,w=im.shape[:2]
  if min(h,w)<35 or max(h,w)>350: continue
  if len(im.shape)==3 and im.shape[2]==4:
   alpha=im[:,:,3:4]/255.; im=(im[:,:,:3]*alpha+48*(1-alpha)).astype(np.uint8)
  elif len(im.shape)==2: im=cv2.cvtColor(im,cv2.COLOR_GRAY2BGR)
  g=cv2.cvtColor(im[:,:,:3],cv2.COLOR_BGR2GRAY)
  best=-1.; bestsize=None; bestloc=None
  for width in (38,42,46,50,54,58,62,66):
   height=max(8,round(h*width/w))
   if height>=se.shape[0] or width>=se.shape[1] or height<20: continue
   small=cv2.resize(g,(width,height),interpolation=cv2.INTER_AREA)
   edge=cv2.Canny(small,60,150)
   score,_,_,loc=cv2.minMaxLoc(cv2.matchTemplate(se,edge,cv2.TM_CCOEFF_NORMED))
   if score>best: best,bestsize,bestloc=score,(width,height),loc
  if best>0.35: rows.append((best,bestsize[0],bestsize[1],bestloc[0],bestloc[1],w,h,str(p)))
 except Exception: pass
rows.sort(reverse=True)
lines=['score\tmatch_w\tmatch_h\tx\ty\tsource_w\tsource_h\tpath']+[f'{s:.6f}\t{mw}\t{mh}\t{x}\t{y}\t{w}\t{h}\t{p}' for s,mw,mh,x,y,w,h,p in rows[:500]]
OUT.write_text('\n'.join(lines),encoding='utf-8')
print('\n'.join(lines[:100]))
