from pathlib import Path

def main():
    code = Path('_ai_workbench/temp/drop46_release_20260914/main.min_drop46_s1.js').read_text(encoding='utf-8')
    pos = code.find('f.isEntranceUnlock=function')
    if pos != -1:
        print(code[pos:pos+2000])
    else:
        pos2 = code.find('.isEntranceUnlock=function')
        print(code[pos2:pos2+2000])

if __name__ == '__main__':
    main()
