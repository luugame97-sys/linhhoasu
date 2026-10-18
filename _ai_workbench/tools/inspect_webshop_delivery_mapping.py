import getpass,paramiko
ssh=paramiko.SSHClient();ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy());ssh.connect('103.116.105.154',username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
try:
 cmd="grep -Rni --include='*.php' 'function gm_role_id\|function vht6ur_sdk_web_send_items\|function gm_mail_item_name' /linhhoasu/webgame/gm | head -30"
 _,o,e=ssh.exec_command(cmd); locations=o.read().decode('utf-8','replace');print(locations)
 for line in locations.splitlines():
  parts=line.split(':',2)
  if len(parts)<2: continue
  path=parts[0];num=int(parts[1]); start=max(1,num-8);end=num+80
  _,a,b=ssh.exec_command(f"sed -n '{start},{end}p' {path}"); print('###',path,num);print(a.read().decode('utf-8','replace'))
finally:ssh.close()
