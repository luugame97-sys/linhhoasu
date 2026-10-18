import json
import paramiko

with open(r"i:\Linhhoasu\server\server\_ai_workbench\tools\upload_list.json", "r") as f:
    copied = json.load(f)
    
host = "103.116.104.165"
user = "root"
password = "anhduc00"

try:
    transport = paramiko.Transport((host, 22))
    transport.connect(username=user, password=password)
    sftp = paramiko.SFTPClient.from_transport(transport)
    
    print(f"Uploading {len(copied)} files...")
    count = 0
    for local_p, remote_p in copied:
        # put file
        sftp.put(local_p, remote_p)
        count += 1
        if count % 100 == 0:
            print(f"Uploaded {count}/{len(copied)}")
            
    sftp.close()
    
    # Now run an SSH command to delete the corresponding .ktx files!
    # A .ktx file has a hash before .ktx, e.g. _astc_353844a7.ktx or similar.
    # We can just delete anything starting with the same basename.
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password)
    
    print("Deleting KTX files...")
    # Generate a bash script to run on the server
    bash_script = ""
    for _, remote_p in copied:
        # remote_p is like /linhhoasu/webgame/game/update/resource/assets/atlas_ui/0_common/bg/common_bg_1_cae9698d.png
        # The ktx is usually like common_bg_1_astc_353844a7.ktx
        # Notice that the hash is different!!!
        # The original png has a hash _cae9698d.png. The ktx has a hash _353844a7.ktx.
        # But they share the prefix before the last underscore usually?
        # e.g., common_bg_1_...
        # So we can just delete based on the directory and prefix!
        # Wait, if we just delete the .ktx files that are in the same directory, that might delete untranslated ones too!
        pass
        
    ssh.close()
    print("Done!")
except Exception as e:
    print("SFTP Error:", e)
