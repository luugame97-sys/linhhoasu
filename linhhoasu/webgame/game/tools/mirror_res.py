import zlib, os, re, urllib.request, urllib.error, urllib.parse

OUT = r"C:\Users\admin\Documents\123 2\ctf_linghuashi\lhs_h5_mirror"
BASE = "http://192.168.200.130:18081"
RESROOT = "update/resource/"

def load_dec(path):
    raw = open(path, "rb").read()
    try:
        return zlib.decompress(raw)
    except Exception:
        return raw

def printable_utf8(b):
    try:
        s = b.decode("utf-8")
    except Exception:
        return None
    for ch in s:
        o = ord(ch)
        if o < 32 or o == 127:
            return None
    return s

def extract_strings(data):
    out = set()
    n = len(data)
    i = 0
    while i < n:
        l1 = data[i]
        cands = []
        if 1 <= l1 <= 127:
            cands.append((i+1, l1))
        if i+1 < n:
            l2 = (l1 << 8) | data[i+1]
            if 4 <= l2 <= 4000 and i+2+l2 <= n:
                cands.append((i+2, l2))
        for start, ln in cands:
            if start+ln <= n:
                s = printable_utf8(data[start:start+ln])
                if s and len(s) >= 3:
                    out.add(s)
        i += 1
    return out

allstr = set()
for root, dirs, files in os.walk(OUT):
    for fn in files:
        if fn.endswith(".bin") and fn.startswith("default.res"):
            p = os.path.join(root, fn)
            allstr |= extract_strings(load_dec(p))
print("total strings:", len(allstr))

EXT = re.compile(r"\.(png|jpg|jpeg|webp|gif|bmp|json|bin|wasm|mp3|ogg|wav|m4a|atlas|skel|txt|csv|xml|fnt|plist|cur|ani|mp4|db|ttf|eot|woff|woff2|svg|js|zip)$", re.I)

files = set()
for s in allstr:
    if EXT.search(s):
        files.add(s)
print("candidate files:", len(files))

with open(os.path.join(OUT, "resource_urls.txt"), "w", encoding="utf-8") as f:
    for s in sorted(files):
        f.write(s + "\n")

def get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception as e:
        return -1, str(e).encode()

ok = 0; fail = 0; failed = []
for s in sorted(files):
    path = s
    if path.startswith("/"):
        path = path[1:]
    url = BASE + "/" + RESROOT + urllib.parse.quote(path, safe="/")
    st, body = get(url)
    if st == 200 and body:
        dest = os.path.join(OUT, RESROOT.replace("/", os.sep), *path.split("/"))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as f:
            f.write(body)
        ok += 1
    else:
        fail += 1
        failed.append((path, st))
    if (ok+fail) % 200 == 0:
        print("progress", ok+fail, "ok", ok, "fail", fail)

print("DONE ok:", ok, "fail:", fail)
with open(os.path.join(OUT, "download_failed.txt"), "w", encoding="utf-8") as f:
    for p, st in failed:
        f.write(str(st) + "\t" + p + "\n")
