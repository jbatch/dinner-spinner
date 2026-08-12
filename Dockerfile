FROM node:24-alpine

RUN apk add --no-cache python3 make g++
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY server.mjs ./
COPY index.html styles.css app.js ./

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/dinner-spinner.sqlite

EXPOSE 3000
CMD ["node", "server.mjs"]
