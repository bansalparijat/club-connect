# ─── Builder stage ────────────────────────────────────────────────────────────
FROM public.ecr.aws/docker/library/node:20-slim AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@8.15.1

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY packages/notifications/package.json ./packages/notifications/
COPY apps/api/package.json ./apps/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
COPY tsconfig.base.json ./

# Build Next.js
WORKDIR /app/apps/api
RUN pnpm run build

# ─── Production stage ─────────────────────────────────────────────────────────
FROM public.ecr.aws/docker/library/node:20-slim AS runner

# Install Lambda Web Adapter
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 \
     /lambda-adapter /opt/extensions/lambda-adapter

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV AWS_LWA_PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy built app
COPY --from=builder /app/apps/api/.next/standalone ./
COPY --from=builder /app/apps/api/.next/static ./apps/api/.next/static
COPY --from=builder /app/apps/api/public ./apps/api/public 2>/dev/null || true

EXPOSE 3000

CMD ["node", "apps/api/server.js"]
