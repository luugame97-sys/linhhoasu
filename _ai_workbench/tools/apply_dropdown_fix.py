import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

print("Reading login.css directly from Linux...")
sftp = ssh.open_sftp()
with sftp.open('/linhhoasu/webgame/gm/assets/css/login.css', 'r') as f:
    content = f.read().decode('utf-8')

# Normalize to LF
content = content.replace('\r\n', '\n')

# Check needles
print("Has old_auth:", ".auth-panel {\n    min-height: 300px;\n}" in content)
print("Has old_shared:", ".login-shared-actions {\n    display: grid;\n    gap: 12px;\n    margin-top: 22px;\n    padding-top: 18px;\n    position: relative;\n}" in content)
print("Has old_fade:", "@keyframes loginPanelFade {\n    from { opacity: 0; filter: blur(1px); }\n    to { opacity: 1; filter: blur(0); }\n}" in content)
print("Has custom-dropdown-menu:", ".custom-dropdown-menu {" in content)

# A. auth-panel
old_auth = ".auth-panel {\n    min-height: 300px;\n}"
new_auth = ".auth-panel {\n    min-height: 300px;\n    position: relative;\n    z-index: 30;\n}"
if old_auth in content:
    content = content.replace(old_auth, new_auth, 1)
    print("Replaced auth-panel!")

# B. login-shared-actions
old_shared = ".login-shared-actions {\n    display: grid;\n    gap: 12px;\n    margin-top: 22px;\n    padding-top: 18px;\n    position: relative;\n}"
new_shared = ".login-shared-actions {\n    display: grid;\n    gap: 12px;\n    margin-top: 22px;\n    padding-top: 18px;\n    position: relative;\n    z-index: 10;\n}"
if old_shared in content:
    content = content.replace(old_shared, new_shared, 1)
    print("Replaced login-shared-actions!")

# C. loginPanelFade
old_fade = "@keyframes loginPanelFade {\n    from { opacity: 0; filter: blur(1px); }\n    to { opacity: 1; filter: blur(0); }\n}"
new_fade = "@keyframes loginPanelFade {\n    from { opacity: 0; }\n    to { opacity: 1; }\n}"
if old_fade in content:
    content = content.replace(old_fade, new_fade, 1)
    print("Replaced loginPanelFade!")

# D. custom-dropdown-menu block at bottom
old_dropdown_block = """#serverContainer,
#registerServerContainer {
    position: relative;
    z-index: 2;
}

#serverContainer:has(.custom-dropdown-menu.show),
#registerServerContainer:has(.custom-dropdown-menu.show),
#serverContainer.server-dropdown-open,
#registerServerContainer.server-dropdown-open {
    z-index: 1086;
}

.custom-dropdown-menu {
    z-index: 1085 !important;
    max-height: min(320px, calc(100dvh - 220px));
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: #38bdf8 rgba(226, 232, 240, 0.72);
}

.custom-dropdown-menu::-webkit-scrollbar {
    width: 8px;
}

.custom-dropdown-menu::-webkit-scrollbar-track {
    background: rgba(226, 232, 240, 0.72);
    border-radius: 999px;
}

.custom-dropdown-menu::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, #38bdf8, #0ea5e9);
    border: 2px solid #fff;
    border-radius: 999px;
}

/* Performance: disable the decorative snow layer on the login screen. */
.login-snow-layer,
.login-snow-layer::before,
.login-snow-layer::after {
    display: none !important;
    animation: none !important;
    background: none !important;
    will-change: auto !important;
}

/* Open the server picker upward on short viewports so the last option stays clickable. */
@media (max-height: 900px) {
    #serverContainer.server-dropdown-open > .custom-dropdown-menu.show,
    #registerServerContainer.server-dropdown-open > .custom-dropdown-menu.show {
        top: auto !important;
        bottom: calc(100% + 8px) !important;
        transform: none !important;
        margin: 0 !important;
    }
}""".replace('\r\n', '\n')

new_dropdown_block = """#serverContainer,
#registerServerContainer {
    position: relative;
    z-index: 40;
}

#serverContainer:has(.custom-dropdown-menu.show),
#registerServerContainer:has(.custom-dropdown-menu.show),
#serverContainer.server-dropdown-open,
#registerServerContainer.server-dropdown-open {
    z-index: 1086;
}

.custom-dropdown-menu {
    position: absolute;
    top: 100% !important;
    left: 0 !important;
    right: 0 !important;
    width: 100% !important;
    margin-top: 6px !important;
    z-index: 1085 !important;
    max-height: 205px !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    overscroll-behavior: contain !important;
    touch-action: pan-y !important;
    -webkit-overflow-scrolling: touch !important;
    scroll-behavior: smooth !important;
    scrollbar-width: thin !important;
    scrollbar-color: #38bdf8 #f1f5f9 !important;
    border-radius: 16px !important;
    padding: 6px !important;
    background: #ffffff !important;
    border: 1px solid rgba(226, 232, 240, 0.95) !important;
    box-shadow: 0 16px 36px -4px rgba(15, 23, 42, 0.16), 0 6px 12px -2px rgba(15, 23, 42, 0.08) !important;
}

.custom-dropdown-menu::-webkit-scrollbar {
    width: 6px !important;
}

.custom-dropdown-menu::-webkit-scrollbar-track {
    background: #f1f5f9 !important;
    border-radius: 999px !important;
    margin: 4px 2px !important;
}

.custom-dropdown-menu::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, #38bdf8, #0ea5e9) !important;
    border-radius: 999px !important;
}

.custom-dropdown-menu::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, #0ea5e9, #0284c7) !important;
}

.custom-dropdown-menu .dropdown-item {
    display: flex !important;
    align-items: center !important;
    padding: 10px 14px !important;
    font-size: 0.92rem !important;
    font-weight: 700 !important;
    color: #334155 !important;
    border-radius: 10px !important;
    margin-bottom: 2px !important;
    border: 1px solid transparent !important;
    transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
    white-space: nowrap !important;
}

.custom-dropdown-menu .dropdown-item i {
    font-size: 1rem !important;
    transition: transform 0.18s ease !important;
}

.custom-dropdown-menu .dropdown-item:hover {
    background: linear-gradient(90deg, #f0f9ff 0%, #e0f2fe 100%) !important;
    color: #0284c7 !important;
    transform: translateX(4px) !important;
    border-color: rgba(56, 189, 248, 0.35) !important;
    padding-left: 18px !important;
}

.custom-dropdown-menu .dropdown-item:hover i {
    transform: scale(1.15) !important;
}

.custom-dropdown-menu .dropdown-item.active,
.custom-dropdown-menu .dropdown-item:active {
    background: linear-gradient(135deg, #0ea5e9, #0284c7) !important;
    color: #ffffff !important;
    border-color: transparent !important;
}

.custom-dropdown-menu .dropdown-item.active i,
.custom-dropdown-menu .dropdown-item:active i {
    color: #ffffff !important;
}

.custom-dropdown-btn .fa-chevron-down {
    transition: transform 0.25s ease !important;
}

.form-floating.server-dropdown-open .custom-dropdown-btn .fa-chevron-down,
.custom-dropdown-btn[aria-expanded="true"] .fa-chevron-down {
    transform: rotate(180deg) !important;
}

/* Performance: disable the decorative snow layer on the login screen. */
.login-snow-layer,
.login-snow-layer::before,
.login-snow-layer::after {
    display: none !important;
    animation: none !important;
    background: none !important;
    will-change: auto !important;
}""".replace('\r\n', '\n')

if old_dropdown_block in content:
    content = content.replace(old_dropdown_block, new_dropdown_block, 1)
    print("Replaced old_dropdown_block!")
else:
    print("WARNING: old_dropdown_block still not matching!")

with sftp.open('/linhhoasu/webgame/gm/assets/css/login.css', 'w') as f:
    f.write(content)

sftp.close()
ssh.close()
print("login.css successfully saved!")
