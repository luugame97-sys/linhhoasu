import glob
import json

path = glob.glob('_ai_workbench/tools/lhs-s1001-inspector-*.cpuprofile')[-1]
payload = json.load(open(path, encoding='utf-8'))
nodes = {node['id']: node for node in payload.get('nodes', [])}
parents = {}
for node in payload.get('nodes', []):
    for child in node.get('children', []):
        parents.setdefault(child, node['id'])

targets = [
    node for node in payload.get('nodes', [])
    if node.get('callFrame', {}).get('functionName') == 'normalizeEquip'
]
for node in sorted(targets, key=lambda row: row.get('hitCount', 0), reverse=True)[:25]:
    print('TARGET', node['id'], 'hits', node.get('hitCount', 0))
    current = node
    path_parts = []
    visited = set()
    while current and current.get('id') not in visited and len(path_parts) < 15:
        visited.add(current.get('id'))
        frame = current.get('callFrame', {})
        url = frame.get('url', '')
        path_parts.append(
            f"{frame.get('functionName', '(anonymous)')}@{url.rsplit('/', 1)[-1]}:{frame.get('lineNumber', -1) + 1}"
        )
        current = nodes.get(parents.get(current.get('id')))
    print(' <- '.join(path_parts))
