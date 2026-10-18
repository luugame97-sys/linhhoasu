import re
from pathlib import Path

def patch_index_html(file_path):
    content = Path(file_path).read_text(encoding='utf-8')
    
    # 1. Update data-src
    content = content.replace('data-src="/web-panel/"', 'data-src="/web-panel/?is_popup=1"')
    
    # 2. Pattern to replace modal CSS
    old_css_pattern = r'\.lhs-web-modal\[hidden\]\{display:none\}.*?@media \(max-width:\s*420px\)\s*\{.*?\.lhs-web-modal__panel\{width:100%;height:100%;border-radius:0\}\s*\}'
    
    new_css = """	.lhs-web-modal[hidden]{display:none}
	.lhs-web-modal{
		position:fixed;
		inset:0;
		z-index:10001;
		display:flex;
		align-items:center;
		justify-content:center;
		padding:clamp(6px, 1.8vw, 24px);
	}
	.lhs-web-modal__backdrop{
		position:absolute;
		inset:0;
		background:rgba(0,0,0,.68);
		backdrop-filter:blur(3px);
	}
	.lhs-web-modal__panel{
		position:relative;
		width:min(1240px, 96vw);
		height:min(860px, 94vh);
		display:flex;
		flex-direction:column;
		overflow:hidden;
		border:1px solid rgba(255,255,255,.35);
		border-radius:16px;
		background:#0f172a;
		box-shadow:0 24px 64px rgba(0,0,0,.65);
	}
	.lhs-web-modal__header{
		flex:0 0 42px;
		display:flex;
		align-items:center;
		justify-content:space-between;
		padding:0 12px 0 16px;
		background:linear-gradient(135deg,#0284c7,#0369a1);
		color:#fff;
		font:800 13px/1 "Segoe UI",Arial,sans-serif;
		letter-spacing:.04em;
	}
	.lhs-web-modal__close{
		width:30px;height:30px;padding:0;border:0;border-radius:50%;
		background:rgba(0,0,0,.25);color:#fff;cursor:pointer;font-size:22px;line-height:28px;
		display:flex;align-items:center;justify-content:center;
		transition:background .2s;
	}
	.lhs-web-modal__close:hover,.lhs-web-modal__close:focus-visible{background:rgba(239,68,68,.85);outline:none}
	.lhs-web-modal__frame{flex:1;width:100%;height:100%;border:0;background:#f8fafc}
	body.lhs-web-modal-open{overflow:hidden}
	@media (max-width: 900px){
		.lhs-web-modal{padding:6px}
		.lhs-web-modal__panel{width:100%;height:100%;border-radius:12px}
	}
	@media (max-width: 576px){
		#lhs-web-popup{width:56px;height:56px;border-radius:16px}
		.lhs-web-popup__image{border-radius:14px}
		.lhs-web-modal{padding:0}
		.lhs-web-modal__panel{width:100%;height:100%;border-radius:0;border:0}
	}"""

    matched = re.search(old_css_pattern, content, re.DOTALL)
    if matched:
        content = content[:matched.start()] + new_css + content[matched.end():]
        Path(file_path).write_text(content, encoding='utf-8')
        print(f"Patched {file_path} successfully")
        return True
    else:
        print(f"Pattern not found in {file_path}")
        return False

if __name__ == '__main__':
    local_path = Path(r"I:\Linhhoasu\server\server\linhhoasu\webgame\game\index.html")
    patch_index_html(local_path)
