#!/usr/bin/env python3
import getpass
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.105.154', username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    commands = [
        "php -i 2>/dev/null | grep -E '^opcache.(enable|validate_timestamps|revalidate_freq|file_update_protection)' || true",
        "ps -eo pid,user,cmd | grep -E 'php-fpm|php-cgi' | grep -v grep | head -30",
        "find /www/server/php -maxdepth 3 -type f -name 'php-fpm.conf' -o -name 'php.ini' 2>/dev/null | head -30",
        "grep -E '^(opcache.enable|opcache.validate_timestamps|opcache.revalidate_freq|opcache.file_update_protection)' /www/server/php/72/etc/php.ini /www/server/php/74/etc/php.ini 2>/dev/null || true",
    ]
    for command in commands:
        _, out, err = ssh.exec_command(command)
        print(f"$ {command}\n{out.read().decode('utf-8','replace')}")
        out.channel.recv_exit_status()
finally:
    ssh.close()
