from pathlib import Path

def main():
    code = Path('_ai_workbench/temp/drop46_release_20260914/main.min_drop46_s1.js').read_text(encoding='utf-8')
    pos = 6694153
    end = 6716053
    update_ui_pos = code.find('.updateUI=function', pos, end)
    print("Found updateUI at:", update_ui_pos)
    print(code[update_ui_pos:update_ui_pos+3000])

if __name__ == '__main__':
    main()
