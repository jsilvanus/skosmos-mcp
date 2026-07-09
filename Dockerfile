# Base stage with dependencies and build
FROM node:20-alpine AS base

WORKDIR /app

ENV NODE_ENV=production \
    SKOSMOS_BASE_URL=https://api.finto.fi \
    SPARQL_ENDPOINT_URL=https://api.finto.fi/sparql \
    SKOSMOS_TOOL_SERVER_URL_ALLOWED=false \
    SPARQL_ALLOW_OTHER_ENDPOINTS=false

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build
RUN npm prune --omit=dev

# HTTP variant stage
FROM base AS http

ENV MCP_HTTP_HOST=0.0.0.0 \
    MCP_HTTP_PORT=3000

EXPOSE 3000

CMD ["node", "dist/http.js"]

# Stdio variant stage
FROM base AS stdio

CMD ["node", "dist/index.js"]
