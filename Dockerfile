FROM python:3.12-slim

WORKDIR /home/user/app

ENV PYTHONUNBUFFERED=1
ENV SERVE_STATIC=1
ENV AGENT_MEMORY_DB=/mnt/workspace/agent_memory.sqlite

COPY requirements.txt .
RUN python -m pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 7860

CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "7860"]
