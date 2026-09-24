# API server image. Build from the repository root:
#   docker build -f docker/server.Dockerfile -t outcomelink-api .
# (the root is the build context because the server depends on the shared workspace package)

FROM node:24-slim AS build
WORKDIR /app
# Prisma's query engine needs OpenSSL.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# Dependencies first, so this layer is cached until a package.json changes.
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
# --ignore-scripts skips husky's git-hook install (no git here); the Prisma client is generated explicitly below.
RUN npm ci --workspace shared --workspace server --ignore-scripts

COPY shared shared
COPY server server
RUN npm run build --workspace shared \
  && npx prisma generate --schema server/prisma/schema.prisma \
  # Fetch the CLI's own migration engine now, so the running container never needs to download anything.
  && npx prisma --version \
  && npm run build --workspace server

FROM node:24-slim
WORKDIR /app/server
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=4000 \
    UPLOADS_DIR=/data/uploads

# node_modules holds the workspace link to the shared package (and the Prisma CLI, used to apply migrations on start).
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/shared /app/shared
COPY --from=build /app/server /app/server

RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
VOLUME /data/uploads
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply any pending database migrations, then start. Migrating on start is fine for a single API instance;
# with several, run `prisma migrate deploy` once as a separate step instead.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/index.js"]
