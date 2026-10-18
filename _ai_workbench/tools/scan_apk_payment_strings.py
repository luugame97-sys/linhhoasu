from pathlib import Path
import re
import zipfile

apk = Path(r"C:\Users\vandu\Desktop\lhs-APK_1_1743135825.apk")
terms = ("activity9", "10501", "10502", "仙缘", "loginprivileges", "recharge", "pay")
with zipfile.ZipFile(apk) as z:
    for name in [x for x in z.namelist() if x.endswith(".dex")]:
        data = z.read(name)
        strings = re.findall(rb"[ -~]{5,}", data)
        hits = [x.decode("ascii", "replace") for x in strings
                if any(t in x.decode("ascii", "replace").lower() for t in terms if t.isascii())]
        print(f"{name}: {len(hits)} ascii hits")
        for hit in hits[:200]:
            print(hit[:500])
        for term in ("仙缘".encode(), "登录豪礼".encode()):
            positions = [m.start() for m in re.finditer(re.escape(term), data)]
            if positions:
                print(f"utf8 {term!r}: {len(positions)} positions {positions[:20]}")

