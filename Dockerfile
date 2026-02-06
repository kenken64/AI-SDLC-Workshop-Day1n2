FROM node:20-alpine

# Install Python and build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Build Next.js app
ENV NODE_ENV=production
RUN npm run build

# Create persistent data directory for SQLite on Railway volume
RUN mkdir -p /app/data
ENV DATA_DIR=/app/data

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "start"]
