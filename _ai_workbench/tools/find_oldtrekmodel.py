from pathlib import Path

def main():
    code = Path('_ai_workbench/temp/drop46_release_20260914/main.min_drop46_s1.js').read_text(encoding='utf-8')
    pos = 0
    while True:
        pos = code.find('"OldTrekModel"', pos)
        if pos == -1:
            break
        print("POS:", pos)
        print(code[max(0, pos-300):min(len(code), pos+300)])
        pos += 14

if __name__ == '__main__':
    main()
