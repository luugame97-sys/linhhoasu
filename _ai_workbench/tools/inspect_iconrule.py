from pathlib import Path

def main():
    code = Path('_ai_workbench/temp/drop46_release_20260914/main.min_drop46_s1.js').read_text(encoding='utf-8')
    pos = 8692184
    print(code[pos-1000:pos+1000])

if __name__ == '__main__':
    main()
