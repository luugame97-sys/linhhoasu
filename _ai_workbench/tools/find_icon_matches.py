from pathlib import Path
import cv2
import numpy as np

ROOT = Path(r'I:\Linhhoasu\server\server\linhhoasu\webgame\game\update\resource\assets\atlas_ui')
SAMPLE = Path(r'C:\Users\vandu\AppData\Local\Temp\codex-clipboard-94c6c7a2-9c63-4f79-9694-def50bc82e8e.png')
OUT = Path(r'I:\Linhhoasu\server\server\_ai_workbench\temp\icon_match_results.tsv')

img = cv2.imdecode(np.fromfile(str(SAMPLE), dtype=np.uint8), cv2.IMREAD_UNCHANGED)
if img.shape[2] == 4:
    alpha = img[:, :, 3:4] / 255.0
    img = (img[:, :, :3] * alpha + 45 * (1 - alpha)).astype(np.uint8)
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
crops = [gray[:, 0:69], gray[:, 69:139], gray[:, 139:208]]
orb = cv2.ORB_create(nfeatures=500)
crop_desc = []
for crop in crops:
    kp, des = orb.detectAndCompute(crop, None)
    crop_desc.append((kp, des))
matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
results = [[] for _ in crops]
for p in ROOT.rglob('*.png'):
    try:
        data = cv2.imdecode(np.fromfile(str(p), dtype=np.uint8), cv2.IMREAD_UNCHANGED)
        if data is None or data.shape[0] < 30 or data.shape[1] < 30 or data.shape[0] > 600 or data.shape[1] > 600:
            continue
        if len(data.shape) == 3 and data.shape[2] == 4:
            a = data[:, :, 3:4] / 255.0
            data = (data[:, :, :3] * a + 45 * (1 - a)).astype(np.uint8)
        elif len(data.shape) == 2:
            data = cv2.cvtColor(data, cv2.COLOR_GRAY2BGR)
        g = cv2.cvtColor(data[:, :, :3], cv2.COLOR_BGR2GRAY)
        kp, des = orb.detectAndCompute(g, None)
        if des is None:
            continue
        for ci, (_, cdes) in enumerate(crop_desc):
            if cdes is None:
                continue
            pairs = matcher.knnMatch(cdes, des, k=2)
            good = [m for pair in pairs if len(pair) == 2 for m, n in [pair] if m.distance < 0.76 * n.distance]
            score = len(good)
            if score:
                results[ci].append((score, len(kp), data.shape[1], data.shape[0], str(p)))
    except Exception:
        pass
lines = ['crop\tgood_matches\tkeypoints\twidth\theight\tpath']
for ci, rows in enumerate(results, 1):
    for score, kp_count, width, height, p in sorted(rows, reverse=True)[:80]:
        lines.append(f'{ci}\t{score}\t{kp_count}\t{width}\t{height}\t{p}')
OUT.write_text('\n'.join(lines), encoding='utf-8')
print('\n'.join(lines[:50]))
