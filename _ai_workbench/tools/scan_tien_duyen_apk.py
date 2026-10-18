from pathlib import Path
import re
import zipfile

apk = Path(r"C:\Users\vandu\Desktop\lhs-APK_1_1743135825.apk")
names = [
    "classes.dex", "classes2.dex", "classes3.dex", "classes4.dex",
    "classes5.dex", "classes6.dex", "classes7.dex", "classes8.dex",
    "assets/dec_key", "assets/keyInfo", "assets/clientKeyInfo",
    "AndroidManifest.xml",
]
terms = [b"Activity9", b"10501", b"10502", "仙缘".encode("utf-8"), b"http", b"update", b"lhs"]
with zipfile.ZipFile(apk) as z:
    for name in names:
        data = z.read(name)
        print(f"FILE {name} len={len(data)}")
        for term in terms:
            count = data.count(term)
            if count:
                print(f"  {term!r}: {count}")
        strings = re.findall(rb"[ -~]{8,}", data)
        hits = [
            x.decode("ascii", "replace")
            for x in strings
            if any(q in x.lower() for q in (b"http", b"update", b"guang", b"lhs", b"game", b"version"))
        ]
        for hit in hits[:40]:
            print(f"  {hit}")

