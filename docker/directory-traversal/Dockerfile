FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
    && pip install flask --no-cache-dir \
    && rm -rf /var/lib/apt/lists/*

COPY server.py .

# Create a safe files directory (the "legitimate" content)
RUN mkdir -p /app/files
RUN echo "Welcome to the file server! Try viewing readme.txt." > /app/files/readme.txt
RUN echo "Contact support@example.com for issues." > /app/files/contact.txt

EXPOSE 80

CMD ["python", "/app/server.py"]
