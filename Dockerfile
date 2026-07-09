# Base stage with dependencies and build
FROM node:20-alpine AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

# HTTP variant stage
FROM node:20-alpine AS http

WORKDIR /app

# Note: ENV variables are redefined here because Docker multi-stage builds don't inherit
# environment variables between FROM statements. Each stage starts fresh.
ENV NODE_ENV=production \
    SKOSMOS_BASE_URL=https://api.finto.fi \
    SPARQL_ENDPOINT_URL=https://api.finto.fi/sparql \
    MCP_HTTP_HOST=0.0.0.0 \
    MCP_HTTP_PORT=3000 \
    SKOSMOS_TOOL_SERVER_URL_ALLOWED=true \
    SPARQL_ALLOW_OTHER_ENDPOINTS=true

# Note: COPY statements cannot be moved to base stage because COPY --from=base
# only copies files from base, it doesn't inherit the base's environment or filesystem.
COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json

EXPOSE 3000

CMD ["node", "dist/http.js"]

# Stdio variant stage
FROM node:20-alpine AS stdio

WORKDIR /app

# Note: ENV variables are redefined here because Docker multi-stage builds don't inherit
# environment variables between FROM statements. Each stage starts fresh.
ENV NODE_ENV=production \
    SKOSMOS_BASE_URL=https://api.finto.fi \
    SPARQL_ENDPOINT_URL=https://api.finto.fi/sparql \
    SKOSMOS_TOOL_SERVER_URL_ALLOWED=true \
    SPARQL_ALLOW_OTHER_ENDPOINTS=true

# Note: COPY statements cannot be moved to base stage because COPY --from=base
# only copies files from base, it doesn't inherit the base's environment or filesystem.
COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json

CMD ["node", "dist/index.js"]
