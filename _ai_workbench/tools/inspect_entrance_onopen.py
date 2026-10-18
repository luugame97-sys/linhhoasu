from pathlib import Path

def main():
    code = Path('_ai_workbench/temp/drop46_release_20260914/main.min_drop46_s1.js').read_text(encoding='utf-8')
    pos = code.find('t(j4=$Ve,"OldTrekEntranceView")')
    # search backwards from pos for OnOpen
    on_open_pos = code.rfind('.OnOpen=function', 0, pos)
    print("Found OnOpen at:", on_open_pos)
    print(code[on_open_pos:on_open_pos+3000])

if __name__ == '__main__':
    main()
