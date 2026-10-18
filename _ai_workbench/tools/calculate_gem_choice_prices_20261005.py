"""Read-only exact material valuation from the captured live gem graph.

Random shop packs are valued per resulting gem, not as guaranteed purchases
of a requested type. No exchange3904 escalation is included in this graph.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/gem_shop_pricing_20261005'
data = json.loads((OUT / 'live_config.json').read_text(encoding='utf-8'))
gems = {int(r['id']): r for r in data['gems']}
recipes = {int(k): r['consume'] for k, r in data['recipes'].items()}
shop = {int(r['id']): r for r in data['shop']}
assert [shop[i]['cost'][0]['count'] for i in [10000001, 10000002, 10000003]] == [1, 9, 81]
assert [shop[i]['cost'][0]['count'] for i in [10000004, 10000005, 10000006]] == [40, 360, 3240]
parents = {}
for row in gems.values():
    target_level = int(row.get('synthesisLevel') or 0)
    if target_level <= int(row['level']) or target_level > 12:
        continue
    targets = [r for r in gems.values() if r['type'] == row['type'] and r['level'] == target_level]
    assert len(targets) == 1
    parents[int(targets[0]['id'])] = [{'id': row['id'], 'count': max(2, int(row.get('synthesisValue') or 3))}]


def expand(gem_id, base_level, seen=()):
    row = gems[gem_id]
    if row['level'] == base_level:
        return {gem_id: 1}
    assert gem_id not in seen
    recipe = recipes.get(gem_id) or parents.get(gem_id)
    assert recipe, f'MISSING_LEGITIMATE_RECIPE:{gem_id}'
    result = {}
    for cost in recipe:
        for base_id, count in expand(int(cost['id']), base_level, (*seen, gem_id)).items():
            result[base_id] = result.get(base_id, 0) + count * int(cost['count'])
    return result


rows = []
for level in range(6, 13):
    family = sorted(r['id'] for r in gems.values() if r['level'] == level)
    expanded = [expand(gem_id, 1) for gem_id in family]
    base6 = [expand(gem_id, 6) for gem_id in family]
    counts = {sum(x.values()) for x in expanded}
    level6_counts = {sum(x.values()) for x in base6}
    assert len(counts) == len(level6_counts) == 1, f'DIFFERENT_TYPE_PRICES:{level}'
    count = counts.pop()
    assert count % 9 == count % 81 == 0
    # All three existing shop levels have identical unit material value.
    nb = count * shop[10000004]['cost'][0]['count']
    assert nb == count // 9 * shop[10000005]['cost'][0]['count']
    assert nb == count // 81 * shop[10000006]['cost'][0]['count']
    tokens = count * shop[10000001]['cost'][0]['count']
    assert tokens == count // 9 * shop[10000002]['cost'][0]['count']
    assert tokens == count // 81 * shop[10000003]['cost'][0]['count']
    rows.append({'level': level, 'choices': len(family), 'gemIds': family,
                 'level1Equivalent': count, 'level5Equivalent': count // 81,
                 'level6Equivalent': level6_counts.pop(),
                 'priceNguyenBao': nb, 'priceItem62': tokens,
                 'recipeExample': base6[0]})
assert rows[4]['priceNguyenBao'] == 1049760
result = {'basis': 'EXACT_MATERIAL_VALUE_NOT_GUARANTEED_RANDOM_TARGET_COST',
          'upgradeFee': 0, 'rows': rows, 'allChoiceTypesSamePrice': True,
          'allThreeExistingShopLevelsSameUnitPrice': True,
          'dismantleFeesExcluded': True, 'exchange3904Excluded': True,
          'liveHashes': data['files'], 'productionWrites': 0}
(OUT / 'calculation.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result, indent=2))
