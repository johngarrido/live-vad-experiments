# Serviço único para o Cloud Run: agente (ADK + genai) + API mock (/mock) + webapp buildada (/).

FROM node:22-slim AS web
WORKDIR /web
COPY webapp/package.json webapp/package-lock.json ./
RUN npm ci
COPY webapp/ ./
# Mesma origem: API do agente em "/" e API mock em "/mock".
RUN VITE_API_BASE= VITE_MOCK_API_BASE=/mock npm run build

FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project
COPY agents/ agents/
COPY mock_api/ mock_api/
COPY server.py ./
COPY --from=web /web/dist webapp/dist

ENV PATH="/app/.venv/bin:$PATH" \
    WEBAPP_DIST=webapp/dist \
    MOCK_API_URL=http://127.0.0.1:8080/mock \
    PYTHONUNBUFFERED=1
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}"]
