# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:20-alpine AS deps

# Install security updates and required build tools
RUN apk update && apk upgrade && \
    apk add --no-cache \
        dumb-init \
        curl \
    && rm -rf /var/cache/apk/*

WORKDIR /app


COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force


# =============================================================================
# Stage 2: Production Image
# =============================================================================
FROM node:20-alpine AS production

# Install security updates + dumb-init (proper PID 1 process management)
RUN apk update && apk upgrade && \
    apk add --no-cache \
        dumb-init \
        curl \
    && rm -rf /var/cache/apk/*

# Create a non-root user for security
RUN addgroup -g 1001 -S nodegroup && \
    adduser  -u 1001 -S nodeuser -G nodegroup

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps --chown=nodeuser:nodegroup /app/node_modules ./node_modules

# Copy application source (respect .dockerignore)
COPY --chown=nodeuser:nodegroup . .

# Create uploads directory and set ownership
RUN mkdir -p uploads && \
    chown -R nodeuser:nodegroup uploads

# Switch to non-root user
USER nodeuser

# Expose application port
EXPOSE 5000

# Healthcheck — adjust the path to your actual health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -fs http://localhost:5000/api/health || exit 1

# Use dumb-init to properly handle signals (graceful shutdown)
ENTRYPOINT ["dumb-init", "--"]

# Start the server
CMD ["node", "server.js"]
