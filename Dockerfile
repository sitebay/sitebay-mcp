# Generated by https://smithery.ai. See: https://smithery.ai/docs/build/project-config
FROM python:3.10-slim

WORKDIR /app
COPY . /app
RUN pip install --no-cache-dir .

CMD ["sitebay-mcp"]
