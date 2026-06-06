FROM python:3.11-slim

WORKDIR /app

RUN pip install flask --no-cache-dir \
    && rm -rf /var/lib/apt/lists/*

COPY server.py .

EXPOSE 80

CMD ["python", "/app/server.py"]
