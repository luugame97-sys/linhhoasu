import os

search_terms = ['Android', 'iOS', 'S1001', 'server', 'Server']

for root, dirs, files in os.walk(r'linhhoasu\webgame'):
    for f in files:
        if f.endswith(('.html', '.php', '.js', '.css')):
            fp = os.path.join(root, f)
            try:
                with open(fp, 'r', encoding='utf-8', errors='ignore') as fh:
                    content = fh.read()
                    if 'Android' in content and 'iOS' in content:
                        print(f'Match (Android & iOS): {fp}')
                    if 'S1001' in content:
                        print(f'Match (S1001): {fp}')
            except Exception as e:
                pass
