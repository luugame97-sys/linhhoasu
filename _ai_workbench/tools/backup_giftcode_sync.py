import paramiko, time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('103.116.104.165', username='root', password='anhduc11')

ts = time.strftime('%Y%m%d_%H%M%S')
files = [
    '/linhhoasu/webgame/game/index.html',
    '/linhhoasu/webgame/gm/index.php',
    '/linhhoasu/webgame/gm/login.php',
    '/linhhoasu/webgame/gm/config.php',
    '/linhhoasu/webgame/gm/api/user_api.php',
]

for f in files:
    backup = f"{f}.bak_{ts}"
    _, out, err = c.exec_command(f"cp -p {f} {backup} && echo 'BACKED UP: {backup}'")
    print(out.read().decode('utf-8'))
    e = err.read().decode('utf-8')
    if e:
        print("ERR:", e)

c.close()
