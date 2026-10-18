import urllib.request
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from build_pet_resource_manifest_20260929 import parse

def check_manifest(url):
    print('Checking manifest:', url)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    raw = urllib.request.urlopen(req, timeout=10).read()
    data = parse(raw)
    print(f'Total resources: {len(data["resources"])}')
    
    # Check 810401
    matches = [r for r in data['resources'] if '810401' in r['name'] or '810401' in r['url']]
    print(f'Matches for 810401 in {url.split("/")[-1]}:')
    for m in matches:
        print(' ', m['name'], m['type'], m['url'])

    # Check 87401
    matches87 = [r for r in data['resources'] if '87401' in r['name'] or '87401' in r['url']]
    print(f'Matches for 87401 in {url.split("/")[-1]}: {len(matches87)}')
    for m in matches87[:5]:
        print(' ', m['name'], m['type'], m['url'])

check_manifest('http://103.116.105.154:81/update/resource/default.res_main_c669f2c0_pet_vusa_20260929.bin')
check_manifest('http://103.116.105.154:81/update/resource/default.res_cn_main_f70d4753_pet_vusa_20260929.bin')
