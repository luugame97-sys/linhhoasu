"""Render the complete session_report.md into a standalone readable HTML file."""
from __future__ import annotations

import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / 'reports' / 'session_report.md'
TARGET = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else ROOT / 'reports' / 'session_report.html'
PAGE_TITLE = sys.argv[3] if len(sys.argv) > 3 else 'Session Report - Linh Họa Sư'


def inline(text: str) -> str:
    escaped = html.escape(text, quote=False)
    escaped = re.sub(r'`([^`]+)`', r'<code>\1</code>', escaped)
    escaped = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', escaped)
    escaped = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', escaped)
    return escaped


def split_table_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip('|').split('|')]


def render(markdown: str) -> str:
    lines = markdown.splitlines()
    out: list[str] = []
    paragraph: list[str] = []
    list_kind = ''
    in_code = False
    code_lines: list[str] = []

    def close_paragraph() -> None:
        if paragraph:
            out.append('<p>' + inline(' '.join(paragraph).strip()) + '</p>')
            paragraph.clear()

    def close_list() -> None:
        nonlocal list_kind
        if list_kind:
            out.append(f'</{list_kind}>')
            list_kind = ''

    index = 0
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if stripped.startswith('```'):
            close_paragraph()
            close_list()
            if in_code:
                out.append('<pre><code>' + html.escape('\n'.join(code_lines)) + '</code></pre>')
                code_lines.clear()
                in_code = False
            else:
                in_code = True
            index += 1
            continue
        if in_code:
            code_lines.append(line)
            index += 1
            continue
        if not stripped:
            close_paragraph()
            close_list()
            index += 1
            continue
        if index + 1 < len(lines) and '|' in stripped and re.match(r'^\s*\|?\s*:?-{3,}', lines[index + 1]):
            close_paragraph()
            close_list()
            headers = split_table_row(line)
            index += 2
            rows: list[list[str]] = []
            while index < len(lines) and '|' in lines[index] and lines[index].strip():
                rows.append(split_table_row(lines[index]))
                index += 1
            out.append('<div class="table-wrap"><table><thead><tr>')
            out.extend(f'<th>{inline(cell)}</th>' for cell in headers)
            out.append('</tr></thead><tbody>')
            for row in rows:
                out.append('<tr>')
                out.extend(f'<td>{inline(cell)}</td>' for cell in row)
                out.append('</tr>')
            out.append('</tbody></table></div>')
            continue
        heading = re.match(r'^(#{1,6})\s+(.+)$', stripped)
        if heading:
            close_paragraph()
            close_list()
            level = len(heading.group(1))
            title = heading.group(2)
            anchor = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
            out.append(f'<h{level} id="{html.escape(anchor)}">{inline(title)}</h{level}>')
            index += 1
            continue
        if re.match(r'^-{3,}$', stripped):
            close_paragraph()
            close_list()
            out.append('<hr>')
            index += 1
            continue
        bullet = re.match(r'^[-*]\s+(.+)$', stripped)
        numbered = re.match(r'^\d+\.\s+(.+)$', stripped)
        if bullet or numbered:
            close_paragraph()
            wanted = 'ul' if bullet else 'ol'
            if list_kind != wanted:
                close_list()
                out.append(f'<{wanted}>')
                list_kind = wanted
            out.append('<li>' + inline((bullet or numbered).group(1)) + '</li>')
            index += 1
            continue
        close_list()
        paragraph.append(stripped)
        index += 1

    close_paragraph()
    close_list()
    if in_code:
        out.append('<pre><code>' + html.escape('\n'.join(code_lines)) + '</code></pre>')
    return '\n'.join(out)


body = render(SOURCE.read_text(encoding='utf-8'))
document = f'''<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(PAGE_TITLE)}</title>
<style>
:root{{--bg:#eef3f6;--card:#fff;--ink:#1f2937;--muted:#64748b;--line:#d9e2e8;--brand:#155e75;--code:#edf4f6}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.65 "Segoe UI",Arial,sans-serif}}
main{{max-width:1120px;margin:28px auto;padding:38px 48px;background:var(--card);border-radius:18px;box-shadow:0 10px 35px #0f172a14}}
h1{{font-size:30px;color:#0f4c5c;border-bottom:3px solid #8dd3df;padding-bottom:10px;margin-top:48px}} h1:first-child{{margin-top:0}}
h2{{font-size:22px;color:var(--brand);margin-top:32px}} h3{{font-size:18px;color:#334155}} p{{margin:9px 0}}
ul,ol{{padding-left:24px}} li{{margin:4px 0}} code{{background:var(--code);padding:2px 5px;border-radius:5px;color:#0f4c5c}}
pre{{overflow:auto;background:#102a33;color:#e6f4f1;padding:16px;border-radius:10px}} pre code{{background:none;color:inherit;padding:0}}
.table-wrap{{overflow:auto;margin:14px 0}} table{{border-collapse:collapse;width:100%;min-width:620px}} th,td{{border:1px solid var(--line);padding:9px 11px;text-align:left;vertical-align:top}} th{{background:#e8f4f6;color:#164e63}}
hr{{border:0;border-top:1px solid var(--line);margin:38px 0}} a{{color:#0369a1}} strong{{color:#0f172a}}
@media(max-width:720px){{main{{margin:0;padding:24px 18px;border-radius:0}}h1{{font-size:25px}}}}
</style></head><body><main>{body}</main></body></html>'''
TARGET.write_text(document, encoding='utf-8')
print(f'RENDERED {TARGET} bytes={TARGET.stat().st_size}')
