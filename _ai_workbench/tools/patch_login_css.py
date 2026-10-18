import os
import sys

# 1. Update login.css
with open(r'i:\Linhhoasu\server\server\_ai_workbench\temp\gm_login\login.css', 'r', encoding='utf-8') as f:
    css_content = f.read()

# Locate the old dropdown styles near bottom
old_needle = """/* Keep the server picker usable when the list reaches the shared actions. */
.card-custom:has(.custom-dropdown-menu.show),
.card-custom.server-dropdown-open {
    overflow: visible !important;
}

#serverContainer,
#registerServerContainer {"""

new_server_css = """/* ==============================================================
   LINH HỌA SƯ - BỘ CHỌN MÁY CHỦ ĐA NĂNG & DẠNG TRƯỢT CHUẨN ĐẸP
   ============================================================== */
.server-picker-box {
    position: relative;
    margin-bottom: 1.15rem;
    z-index: 5;
}

/* Thẻ máy chủ đang chọn */
.server-active-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 11px 15px;
    background: rgba(255, 255, 255, 0.95);
    border: 2px solid #e2e8f0;
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
    user-select: none;
    -webkit-tap-highlight-color: transparent;
}

.server-active-card:hover,
.server-active-card:focus-visible {
    border-color: #38bdf8;
    background: #ffffff;
    box-shadow: 0 8px 22px rgba(14, 165, 233, 0.15);
    transform: translateY(-1px);
    outline: none;
}

.server-card-main {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
}

.server-card-icon {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 12px;
    background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
    color: #0284c7;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.15rem;
    box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.3);
}

.server-card-info {
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.server-card-label {
    font-size: 0.68rem;
    font-weight: 800;
    color: #64748b;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    line-height: 1.2;
}

.server-card-name {
    font-size: 0.96rem;
    font-weight: 900;
    color: #0f172a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.25;
}

.server-card-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
}

.server-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 999px;
    background: #dcfce7;
    color: #15803d;
    font-size: 0.72rem;
    font-weight: 800;
    border: 1px solid rgba(34, 197, 94, 0.25);
}

.status-pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
    animation: statusPulse 2s infinite;
}

@keyframes statusPulse {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
    70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}

.server-change-link {
    font-size: 0.8rem;
    font-weight: 800;
    color: #0ea5e9;
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 8px;
    background: rgba(14, 165, 233, 0.08);
    transition: all 0.2s ease;
}

.server-active-card:hover .server-change-link {
    background: rgba(14, 165, 233, 0.18);
    color: #0284c7;
}

/* Thanh trượt nhanh máy chủ (Dạng trượt đẹp swipeable) */
.server-slider-wrap {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.server-slider-label {
    font-size: 0.72rem;
    font-weight: 800;
    color: #64748b;
    padding-left: 2px;
}

.server-slider-track {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 3px 2px 7px 2px;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    scrollbar-width: thin;
    scrollbar-color: #bae6fd transparent;
}

.server-slider-track::-webkit-scrollbar {
    height: 4px;
}

.server-slider-track::-webkit-scrollbar-track {
    background: transparent;
}

.server-slider-track::-webkit-scrollbar-thumb {
    background: #bae6fd;
    border-radius: 999px;
}

.server-slider-track::-webkit-scrollbar-thumb:hover {
    background: #7dd3fc;
}

.server-chip {
    flex: 0 0 auto;
    scroll-snap-align: start;
    min-width: 64px;
    height: 35px;
    padding: 0 11px;
    border-radius: 11px;
    border: 1.5px solid #e2e8f0;
    background: #ffffff;
    color: #475569;
    font-size: 0.84rem;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 2px 4px rgba(15, 23, 42, 0.03);
    user-select: none;
    -webkit-tap-highlight-color: transparent;
}

.server-chip:hover {
    border-color: #7dd3fc;
    color: #0284c7;
    background: #f0f9ff;
    transform: translateY(-1px);
}

.server-chip .chip-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #22c55e;
    transition: transform 0.2s ease;
}

.server-chip.active {
    background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%) !important;
    border-color: transparent !important;
    color: #ffffff !important;
    font-weight: 900 !important;
    box-shadow: 0 4px 14px rgba(14, 165, 233, 0.38) !important;
    transform: translateY(-1px);
}

.server-chip.active .chip-dot {
    background: #a7f3d0;
    box-shadow: 0 0 6px #34d399;
}

/* Modal Chọn Máy Chủ Toàn Diện */
.server-modal {
    z-index: 100060 !important;
}

.server-modal .modal-dialog {
    max-width: 540px;
    margin: 1.75rem auto;
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.server-modal-content {
    border: 1px solid rgba(226, 232, 240, 0.95);
    border-radius: 24px;
    box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25);
    background: #ffffff;
    overflow: hidden;
}

.server-modal-header {
    padding: 16px 20px 12px;
    border-bottom: 1px solid #f1f5f9;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: #f8fafc;
}

.sheet-handle {
    width: 40px;
    height: 4px;
    border-radius: 999px;
    background: #cbd5e1;
    margin: 0 auto 4px;
}

.server-modal-icon {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    background: linear-gradient(135deg, #0ea5e9, #0284c7);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.15rem;
    flex-shrink: 0;
    box-shadow: 0 4px 10px rgba(14, 165, 233, 0.3);
}

.btn-close-custom {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 1px solid #e2e8f0;
    background: #ffffff;
    color: #64748b;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
}

.btn-close-custom:hover {
    background: #fee2e2;
    color: #ef4444;
    border-color: #fca5a5;
}

.server-modal-body {
    padding: 18px 20px;
    max-height: min(65vh, 480px);
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: #38bdf8 #f1f5f9;
}

.server-modal-body::-webkit-scrollbar {
    width: 6px;
}

.server-modal-body::-webkit-scrollbar-track {
    background: #f1f5f9;
    border-radius: 999px;
}

.server-modal-body::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, #38bdf8, #0ea5e9);
    border-radius: 999px;
}

.server-section-title {
    font-size: 0.8rem;
    font-weight: 900;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
}

.server-featured-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
}

.server-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
}

.server-card-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 14px;
    border: 2px solid #e2e8f0;
    background: #ffffff;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    user-select: none;
    -webkit-tap-highlight-color: transparent;
}

.server-card-item:hover {
    border-color: #38bdf8;
    background: #f0f9ff;
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(14, 165, 233, 0.12);
}

.server-card-item.featured {
    background: linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%);
    border-color: #7dd3fc;
}

.server-card-item.active {
    border-color: #0ea5e9 !important;
    background: #f0f9ff !important;
    box-shadow: 0 0 0 1px #0ea5e9, 0 6px 16px rgba(14, 165, 233, 0.15) !important;
}

.server-card-item.active .server-item-check {
    color: #0ea5e9;
    opacity: 1;
    transform: scale(1);
}

.server-item-left {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.server-item-badge-featured {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    width: fit-content;
    font-size: 0.68rem;
    font-weight: 900;
    padding: 2px 7px;
    border-radius: 6px;
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: #ffffff;
    margin-bottom: 2px;
}

.server-item-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
}

.server-code {
    font-size: 0.95rem;
    font-weight: 900;
    color: #0f172a;
}

.server-status-text {
    font-size: 0.72rem;
    font-weight: 800;
    color: #16a34a;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.server-item-name {
    font-size: 0.82rem;
    font-weight: 800;
    color: #64748b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.server-item-check {
    font-size: 1.2rem;
    color: #cbd5e1;
    opacity: 0.35;
    transition: all 0.2s ease;
    transform: scale(0.85);
    flex-shrink: 0;
}

.server-modal-footer {
    padding: 12px 20px;
    border-top: 1px solid #f1f5f9;
    background: #f8fafc;
}

/* Mobile & Popup bottom-sheet style */
@media (max-width: 576px) {
    .server-modal.modal {
        padding: 0 !important;
    }
    .server-modal .modal-dialog {
        margin: 0 !important;
        margin-top: auto !important;
        max-width: 100% !important;
        width: 100% !important;
        display: flex;
        align-items: flex-end;
    }
    .server-modal-content {
        border-bottom-left-radius: 0 !important;
        border-bottom-right-radius: 0 !important;
        border-top-left-radius: 22px !important;
        border-top-right-radius: 22px !important;
        max-height: 82vh;
        width: 100%;
    }
    .server-grid {
        grid-template-columns: 1fr;
    }
}

/* Performance: disable the decorative snow layer on the login screen. */
.login-snow-layer,
.login-snow-layer::before,
.login-snow-layer::after {
    display: none !important;
    animation: none !important;
    background: none !important;
    will-change: auto !important;
}"""

if old_needle in css_content:
    parts = css_content.split(old_needle)
    css_content = parts[0] + new_server_css
    print("Replaced old dropdown block in login.css")
else:
    # Append or replace tail
    print("old_needle not exact match, checking alternative split...")
    idx = css_content.find("/* Keep the server picker usable")
    if idx != -1:
        css_content = css_content[:idx] + new_server_css
        print("Replaced from /* Keep the server picker usable to end")
    else:
        css_content = css_content + "\n\n" + new_server_css
        print("Appended new_server_css to login.css")

with open(r'i:\Linhhoasu\server\server\_ai_workbench\temp\gm_login\login.css', 'w', encoding='utf-8') as f:
    f.write(css_content)

print("Updated login.css successfully!")
