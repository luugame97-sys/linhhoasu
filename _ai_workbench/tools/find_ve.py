import sys
from pathlib import Path

def main():
    code = Path('_ai_workbench/temp/drop46_release_20260914/main.min_drop46_s1.js').read_text(encoding='utf-8')
    pos1 = code.find('$Ve.openCheck')
    print('openCheck:', pos1)
    if pos1 != -1:
        print(code[pos1-100:pos1+500])
    pos2 = code.find('i($Ve')
    print('i($Ve:', pos2)
    if pos2 != -1:
        print(code[pos2-100:pos2+500])

if __name__ == '__main__':
    main()
