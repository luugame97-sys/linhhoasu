import paramiko
import sys
import os

host = "103.116.104.165"
user = "root"
password = "anhduc00"

files_to_upload = [
    (
        r"I:\Linhhoasu\server\server\linhhoasu\webgame\game\js\main.min_a6195824.js",
        "/linhhoasu/webgame/game/js/main.min_a6195824.js"
    )
]

try:
    transport = paramiko.Transport((host, 22))
    transport.connect(username=user, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)
    
    for local_path, remote_path in files_to_upload:
        if os.path.exists(local_path):
            print(f"Uploading {os.path.basename(local_path)}...")
            sftp.put(local_path, remote_path)
            print(f"Success: {remote_path}")
        else:
            print(f"Error: Local file not found {local_path}")
            
    sftp.close()
    transport.close()
    print("All files uploaded successfully.")
except Exception as e:
    print(f"Upload failed: {e}")
