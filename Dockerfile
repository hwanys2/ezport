# Multi-stage build for Railway deployment
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install dependencies
RUN cd client && npm ci && cd ../server && npm ci

# Copy source files
COPY client ./client
COPY server ./server

# Build client
RUN cd client && npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy server dependencies
COPY server/package*.json ./
RUN npm ci --only=production

# Copy server files
COPY server ./

# Copy built client files
COPY --from=builder /app/client/dist ./client/dist

# Expose port
EXPOSE 4000

# Start server
CMD ["node", "index.js"]
