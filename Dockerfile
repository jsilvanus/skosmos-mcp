FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

ENV NODE_ENV=production \
    SKOSMOS_BASE_URL=https://api.finto.fi \
    SPARQL_ENDPOINT_URL=https://api.finto.fi/sparql \
    MCP_HTTP_HOST=0.0.0.0 \
    MCP_HTTP_PORT=3000 \
    SKOSMOS_TOOL_SERVER_URL_ALLOWED=true \
    SPARQL_ALLOW_OTHER_ENDPOINTS=true

EXPOSE 3000

CMD ["node", "dist/http.js"]
