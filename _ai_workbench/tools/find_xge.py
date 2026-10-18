from pathlib import Path

def main():
    code = Path('_ai_workbench/temp/drop46_release_20260914/main.min_drop46_s1.js').read_text(encoding='utf-8')
    pos = 6228945
    init_pos = code.rfind('function xGe(', 0, pos)
    print("function xGe pos:", init_pos)
    print(code[init_pos:init_pos+4000])

if __name__ == '__main__':
    main()
