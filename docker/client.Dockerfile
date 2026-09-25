# Web image: the built React app served by nginx, which also proxies /api to the API container.
# Build from the repository root:
#   docker build -f docker/client.Dockerfile -t outcomelink-web .

FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/package.json
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --workspace shared --workspace client --ignore-scripts

COPY shared shared
COPY client client
# An empty API URL makes the app call /api on whatever host served it — nginx forwards that to the API,
# so the browser only ever talks to one origin (no CORS, and the refresh cookie stays same-site).
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build --workspace shared && npm run build --workspace client

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
