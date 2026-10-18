from pathlib import Path
import re
import time
import glob
import json
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

r = Path('_ai_workbench/temp/Chinese_Text_Remaining_20260830')
lines = (r / '01_TEXT_TRUNG_CAN_DICH_done.txt').read_text(encoding='utf-8-sig').splitlines()
han = re.compile(r'[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]')
xs = [x for x in lines if han.search(x) and len(x) < 180][:32]
p = sorted(glob.glob(r'C:\Users\vandu\.cache\huggingface\hub\models--Helsinki-NLP--opus-mt-zh-vi\snapshots\*'))[-1]
t0 = time.time()
tok = AutoTokenizer.from_pretrained(p, local_files_only=True)
model = AutoModelForSeq2SeqLM.from_pretrained(p, local_files_only=True)
print('load', time.time() - t0, flush=True)
t0 = time.time()
b = tok(xs, return_tensors='pt', padding=True, truncation=True, max_length=256)
out = model.generate(**b, max_length=256, num_beams=1)
ys = tok.batch_decode(out, skip_special_tokens=True)
print('generate', time.time() - t0, 'rows', len(ys), 'han', sum(bool(han.search(y)) for y in ys), flush=True)
(r / 'benchmark_marian.json').write_text(json.dumps(ys, ensure_ascii=False, indent=2), encoding='utf-8')
