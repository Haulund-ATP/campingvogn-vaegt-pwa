# syntax=docker/dockerfile:1

FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:22-alpine AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev

COPY --from=server-build /app/server/dist ./server/dist
COPY --from=frontend-build /app/dist ./dist

RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 8080
CMD ["node", "server/dist/server.js"]
