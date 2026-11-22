# Accounts API image. The frontend is deployed separately (Vercel / GitHub Pages).
#   docker build -t college-hub-api .
#   docker run -p 8787:8787 --env-file .env.server.production college-hub-api
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:24-alpine
ENV NODE_ENV=production PORT=8787
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
# Tests are not needed at runtime.
RUN rm -f server/*.test.ts
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node", "--max-old-space-size=384", "server/index.ts"]
