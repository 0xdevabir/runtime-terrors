# Web image (Next.js standalone). Build from web/:
#   docker build -t spacebio-web --build-arg API_URL=http://api:8000 web
# API_URL is baked into the /api/* rewrite at build time.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG API_URL=http://api:8000
ENV API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm build && cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
EXPOSE 3000
CMD ["node", "server.js"]
