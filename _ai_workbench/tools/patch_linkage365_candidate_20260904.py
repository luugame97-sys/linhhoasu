"""Patch linkage 7 window in production-snapshot candidate files."""
import sys
from pathlib import Path

START=1788517080000;END=1820053080000;OLD_START=1784044800000;OLD_END=1788278400000
def once(text,old,new,label):
 count=text.count(old)
 if count!=1:raise RuntimeError('{} expected once, found {}'.format(label,count))
 return text.replace(old,new,1)
def main():
 root=Path(sys.argv[1])
 for name in ('serverList.js','serverList1.js'):
  p=root/'server'/name;s=p.read_text(encoding='utf8');s=once(s,'start: {},'.format(OLD_START),'start: {},'.format(START),name+' start');s=once(s,'end: {},'.format(OLD_END),'end: {},'.format(END),name+' end');p.write_text(s,encoding='utf8',newline='')
 p=root/'client/js/start.min_52ac8d58.js';s=p.read_text(encoding='utf8');s=once(s,'17840448e5',str(START),'start bundle linkage start');s=once(s,'17882784e5',str(END),'start bundle linkage end');p.write_text(s,encoding='utf8',newline='')
 p=root/'client/index.html';s=p.read_text(encoding='utf8');s=once(s,"var translationVersion = '20260831_tien_duyen_fix_v1';","var translationVersion = '20260904_linkage365_v1';",'translation cache');s=once(s,'"js/start.min_52ac8d58.js",','"js/start.min_52ac8d58.js?v=20260904_linkage365_v1",','start cache');p.write_text(s,encoding='utf8',newline='')
 print('PATCHED_LINKAGE365 start={} end={} duration={}'.format(START,END,END-START))
if __name__=='__main__':main()
