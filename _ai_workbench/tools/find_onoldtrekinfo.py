from pathlib import Path

def main():
    code = Path('_ai_workbench/temp/drop46_release_20260914/main.min_drop46_s1.js').read_text(encoding='utf-8')
    pos = code.find('.onOldTrekInfo=function')
    print("onOldTrekInfo pos:", pos)
    print(code[pos:pos+2500])

if __name__ == '__main__':
    main()
