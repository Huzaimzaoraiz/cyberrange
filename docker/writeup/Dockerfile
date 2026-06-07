FROM python:3.11-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssh-server passwd \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN for group in staff cdrom floppy audio dip video plugdev netdev; do getent group "$group" >/dev/null || groupadd "$group"; done \
    && groupadd jkr \
    && useradd -m -g jkr -G staff,cdrom,floppy,audio,dip,video,plugdev,netdev -s /bin/bash jkr \
    && echo 'jkr:raykayjay9' | chpasswd \
    && mkdir -p /run/sshd /var/www/writeup \
    && chgrp staff /usr/local /usr/local/bin \
    && chmod 2775 /usr/local /usr/local/bin \
    && sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config \
    && sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config \
    && printf 'DYNAMIC MOTD\n' > /etc/motd

WORKDIR /app

COPY server.py /app/server.py
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 22 80

CMD ["/entrypoint.sh"]
