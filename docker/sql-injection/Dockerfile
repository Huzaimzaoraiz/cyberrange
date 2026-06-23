FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssh-server \
    && pip install flask --no-cache-dir \
    && rm -rf /var/lib/apt/lists/*


EXPOSE 80

