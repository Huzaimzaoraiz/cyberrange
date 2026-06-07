#!/bin/sh
set -eu

printf '%s\n' "${FLAG:-flag{default}}" > /root/root.txt
chmod 600 /root/root.txt
printf 'CMS Made Simple user recovered. Keep going.\n' > /home/jkr/user.txt
chown jkr:jkr /home/jkr/user.txt
chmod 640 /home/jkr/user.txt

/usr/sbin/sshd
exec python /app/server.py
