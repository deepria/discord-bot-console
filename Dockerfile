FROM node:lts-alpine AS frontend-builder

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend ./
RUN npm run build

FROM python:3.13-slim AS runtime

ARG GIT_REVISION=unknown
LABEL org.opencontainers.image.revision=$GIT_REVISION

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY --from=frontend-builder /frontend/dist ./frontend/dist

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
