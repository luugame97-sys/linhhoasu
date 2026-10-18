import os
import sys
import hashlib
from pathlib import Path
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(r"I:\Linhhoasu\server\server")
BUILD_DIR = ROOT / "_ai_workbench" / "temp" / "pc_client_build"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('103.116.104.165', username='root', password='anhduc11')

def run_cmd(cmd):
    stdin, stdout, stderr = client.exec_command(cmd)
    code = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', 'replace')
    err = stderr.read().decode('utf-8', 'replace')
    if code != 0:
        raise RuntimeError(f"Command failed (code {code}): {cmd}\nSTDERR: {err}\nSTDOUT: {out}")
    return out

try:
    print("1. Connected to VPS 103.116.104.165")
    sftp = client.open_sftp()

    # Backup directory on VPS
    run_cmd("mkdir -p /linhhoasu/_ai_workbench/backups/pc_client_20260930")

    # Files to upload
    uploads = [
        ("manifest.json", "/linhhoasu/webgame/game/manifest.json"),
        ("manifest.json", "/linhhoasu/webgame/gm/manifest.json"),
        ("sw.js", "/linhhoasu/webgame/game/sw.js"),
        ("sw.js", "/linhhoasu/webgame/gm/sw.js"),
        ("icon-192.png", "/linhhoasu/webgame/game/icon-192.png"),
        ("icon-192.png", "/linhhoasu/webgame/gm/icon-192.png"),
        ("icon-512.png", "/linhhoasu/webgame/game/icon-512.png"),
        ("icon-512.png", "/linhhoasu/webgame/gm/icon-512.png"),
        ("icon.ico", "/linhhoasu/webgame/game/icon.ico"),
        ("icon.ico", "/linhhoasu/webgame/gm/icon.ico"),
        ("LinhHoaSu.exe", "/linhhoasu/webgame/game/LinhHoaSu.exe"),
        ("LinhHoaSu.exe", "/linhhoasu/webgame/gm/LinhHoaSu.exe"),
        ("LinhHoaSu_PC.zip", "/linhhoasu/webgame/game/LinhHoaSu_PC.zip"),
        ("LinhHoaSu_PC.zip", "/linhhoasu/webgame/gm/LinhHoaSu_PC.zip"),
    ]

    print("2. Uploading assets and binaries...")
    for local_name, remote_path in uploads:
        local_path = BUILD_DIR / local_name
        sftp.put(str(local_path), remote_path)
        run_cmd(f"chmod 644 {remote_path} && chown www:www {remote_path}")
        size = local_path.stat().st_size
        print(f"  - Uploaded {local_name} -> {remote_path} ({size} bytes)")

    # 3. Update MySQL web_settings
    print("3. Updating MySQL web_settings...")
    sql = (
        "INSERT INTO web_settings(setting_key, setting_value) VALUES "
        "('download_android_url', 'https://linhhoasu.lol/linhhoasulol.apk'), "
        "('download_pc_url', 'https://linhhoasu.lol/LinhHoaSu_PC.zip') "
        "ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);"
    )
    run_cmd(f"mysql -u root -p11a72ee788bff9b4 account_linhhoasu -e \"{sql}\"")
    check_sql = run_cmd("mysql -u root -p11a72ee788bff9b4 account_linhhoasu -e \"SELECT * FROM web_settings WHERE setting_key LIKE '%download%';\"")
    print(check_sql)

    # 4. Patch /linhhoasu/webgame/game/index.html
    print("4. Patching index.html for PWA support...")
    run_cmd("cp -p /linhhoasu/webgame/game/index.html /linhhoasu/_ai_workbench/backups/pc_client_20260930/index.html.bak")
    
    with sftp.open("/linhhoasu/webgame/game/index.html", "r") as f:
        index_content = f.read().decode("utf-8")

    manifest_tag = (
        "\n\t<link rel=\"manifest\" href=\"/manifest.json\">\n"
        "\t<meta name=\"theme-color\" content=\"#0f172a\">\n"
        "\t<link rel=\"icon\" type=\"image/png\" sizes=\"192x192\" href=\"/icon-192.png\">\n"
        "\t<link rel=\"shortcut icon\" href=\"/icon-192.png\">\n"
    )
    sw_script = (
        "\n<script>\n"
        "if ('serviceWorker' in navigator) {\n"
        "  window.addEventListener('load', function() {\n"
        "    navigator.serviceWorker.register('/sw.js').catch(function() {});\n"
        "  });\n"
        "}\n"
        "</script>\n"
    )

    if "/manifest.json" not in index_content:
        # insert after <title>Linh Họa Sư</title>
        if "<title>Linh Họa Sư</title>" in index_content:
            index_content = index_content.replace("<title>Linh Họa Sư</title>", "<title>Linh Họa Sư</title>" + manifest_tag)
        elif "<head>" in index_content:
            index_content = index_content.replace("<head>", "<head>" + manifest_tag)
        
        # insert sw script before </body>
        if "</body>" in index_content:
            index_content = index_content.replace("</body>", sw_script + "</body>")

        with sftp.open("/linhhoasu/webgame/game/index.html", "w") as f:
            f.write(index_content.encode("utf-8"))
        print("  - index.html patched successfully")
    else:
        print("  - index.html already contains manifest.json")

    # 5. Patch /linhhoasu/webgame/gm/login.php
    print("5. Patching login.php for PWA support...")
    run_cmd("cp -p /linhhoasu/webgame/gm/login.php /linhhoasu/_ai_workbench/backups/pc_client_20260930/login.php.bak")
    with sftp.open("/linhhoasu/webgame/gm/login.php", "r") as f:
        login_content = f.read().decode("utf-8")

    if "/manifest.json" not in login_content:
        login_manifest = (
            "\n    <link rel=\"manifest\" href=\"/manifest.json\">\n"
            "    <meta name=\"theme-color\" content=\"#0f172a\">\n"
            "    <meta name=\"mobile-web-app-capable\" content=\"yes\">\n"
            "    <meta name=\"apple-mobile-web-app-capable\" content=\"yes\">\n"
            "    <meta name=\"application-name\" content=\"Linh Họa Sư\">\n"
        )
        login_content = login_content.replace("<head>", "<head>" + login_manifest)
        if "</body>" in login_content:
            login_content = login_content.replace("</body>", sw_script + "</body>")

        with sftp.open("/linhhoasu/webgame/gm/login.php", "w") as f:
            f.write(login_content.encode("utf-8"))
        print("  - login.php patched successfully")
    else:
        print("  - login.php already contains manifest.json")

    sftp.close()
    print("ALL STEPS COMPLETED!")

finally:
    client.close()
