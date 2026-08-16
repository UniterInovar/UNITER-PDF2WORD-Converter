FROM node:18-bullseye AS builder
WORKDIR /app

# Install build deps and npm packages
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

FROM node:18-bullseye-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive

# Install runtime deps: Python + LibreOffice + fonts/libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  python3-pip \
  libreoffice-core \
  libreoffice-writer \
  fonts-dejavu \
  libglib2.0-0 \
  libx11-6 \
  libxext6 \
  libsm6 \
  libxrender1 \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install Python runtime packages used by conversion scripts
RUN python3 -m pip install --no-cache-dir pdf2docx pymupdf

WORKDIR /app

# Copy built server and package files
COPY --from=builder /app/dist ./dist
COPY package*.json ./

# Install production node modules
RUN npm ci --production --no-audit --no-fund

ENV NODE_ENV=production
EXPOSE 3000

# Start the built server
CMD ["node", "dist/index.js"]
