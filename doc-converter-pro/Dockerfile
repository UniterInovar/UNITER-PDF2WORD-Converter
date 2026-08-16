FROM node:22-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-dejavu \
    fonts-liberation \
    libreoffice-writer \
    python3 \
    python3-pip \
  && python3 -m pip install --break-system-packages --no-cache-dir pdf2docx PyMuPDF \
  && rm -rf /var/lib/apt/lists/* /root/.cache/pip

WORKDIR /app
COPY . .

RUN npm install -g corepack@latest \
  && corepack pnpm install \
  && corepack pnpm run build

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
