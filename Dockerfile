# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:20-alpine AS deps

RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init curl && \
    rm -rf /var/cache/apk/*

WORKDIR /app

COPY backend/package*.json ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

# =============================================================================
# Stage 2: Production Image
# =============================================================================
FROM node:20-alpine AS production

RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init curl && \
    rm -rf /var/cache/apk/*

RUN addgroup -g 1001 -S nodegroup && \
    adduser  -u 1001 -S nodeuser -G nodegroup

WORKDIR /app

COPY --from=deps --chown=nodeuser:nodegroup /app/node_modules ./node_modules

COPY --chown=nodeuser:nodegroup backend/ .

RUN mkdir -p uploads && chown -R nodeuser:nodegroup uploads

USER nodeuser

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -fs http://localhost:5000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
