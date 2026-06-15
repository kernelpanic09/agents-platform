# Stage 1: Build frontend
FROM node:20-alpine AS builder
ARG APP_VERSION=dev
ENV VITE_APP_VERSION=$APP_VERSION
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app

# ssh is required for the scheduler to reach the dispatch host and run `claude -p`
RUN apk add --no-cache openssh-client

# Create non-root user
RUN addgroup -g 1001 app && adduser -D -u 1001 -G app app

# Install only production dependencies
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy server code
COPY server/ ./server/

# Copy built frontend from builder
COPY --from=builder /app/dist ./dist

# Create data directory for SQLite
RUN mkdir -p /data && chown app:app /data

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/data

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => { if(r.statusCode !== 200) process.exit(1); }).on('error', () => process.exit(1))"

USER app

CMD ["node", "server/index.js"]
