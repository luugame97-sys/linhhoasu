import os, urllib.request, urllib.error, urllib.parse, sys
from concurrent.futures import ThreadPoolExecutor
import time, threading

OUT = r"C:\Users\admin\Documents\123 2\ctf_linghuashi\lhs_h5_mirror"
RESROOT = "update/resource/"
BASE = "http://192.168.200.130:18081/" + RESROOT

urls = [l.strip() for l in open(os.path.join(OUT, "resource_urls.txt"), encoding="utf-8") if l.strip()]
print("total urls:", len(urls), flush=True)

lock = threading.Lock()
done = [0]; ok = [0]; fail = [0]; fail_list = []
start = time.time()

def fetch(u):
    path = u[1:] if u.startswith("/") else u
    dest = os.path.join(OUT, RESROOT.replace("/", os.sep), *path.split("/"))
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        with lock:
            done[0] += 1; ok[0] += 1
        return None
    url = BASE + urllib.parse.quote(path, safe="/")
    last_err = ""
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=20) as r:
                body = r.read()
            if not body:
                raise Exception("empty body")
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "wb") as f:
                f.write(body)
            with lock:
                done[0] += 1; ok[0] += 1
                if done[0] % 1000 == 0:
                    el = time.time()-start
                    print(f"[{done[0]}/{len(urls)}] ok={ok[0]} fail={fail[0]} {el:.0f}s {el/max(done[0],1)*1000:.1f}ms/req", flush=True)
            return None
        except Exception as e:
            last_err = str(e)[:120]
            if attempt < 2:
                time.sleep(0.3)
    with lock:
        done[0] += 1; fail[0] += 1
        fail_list.append((path, last_err))
    return None

if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=12) as ex:
        list(ex.map(fetch, urls))
    print("DONE ok:", ok[0], "fail:", fail[0], "elapsed:", round(time.time()-start,1), "s", flush=True)
    with open(os.path.join(OUT, "download_failed.txt"), "w", encoding="utf-8") as f:
        for p, e in fail_list:
            f.write(p + "\t" + e + "\n")
    print("failed:", len(fail_list))
