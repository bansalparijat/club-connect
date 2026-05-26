# Club Connect — Claude Directives

## Plan File
Full project plan: `plans/PLAN.md` — read this before making architectural decisions.

## Project Structure
```
club-connect/
├── apps/
│   ├── api/        # Next.js API routes only (no frontend), deployed as Lambda container
│   └── mobile/     # React Native (Expo)
├── packages/
│   ├── db/         # Prisma schema + migrations
│   ├── types/      # Shared TypeScript types
│   └── notifications/  # WhatsApp provider abstraction
└── infrastructure/
    └── terraform/  # Terraform modules + Terragrunt
```

## Tech Stack
- **Mobile**: React Native (Expo SDK 54), expo-router for navigation
- **Backend**: Next.js 14 App Router (API routes only), deployed via Lambda Web Adapter
- **Database**: Supabase PostgreSQL + Prisma ORM
- **Auth**: Phone OTP via Twilio Verify, JWT (jose library), tokens stored in Expo SecureStore
- **Queue**: AWS SQS + Lambda (no BullMQ — must stay serverless compatible)
- **Cron**: AWS EventBridge Scheduler
- **Monorepo**: Turborepo

## Development Rules

### General
- Never add features or refactor beyond what is explicitly requested
- Prefer editing existing files over creating new ones
- Do not add comments unless logic is non-obvious
- Do not add error handling for impossible scenarios

### Monorepo / Prisma
- Always use `dotenv-cli` when running Prisma commands that need env vars:
  `dotenv -e ../../.env -- npx prisma migrate dev`
- Lambda uses the pooler DB URL (`pgbouncer=true&connection_limit=1`); migrations use the direct URL
- Prisma schema lives in `packages/db/prisma/schema.prisma`

### Mobile (Expo)
- **Never pass `+` phone numbers as URL params** — expo-router decodes `+` as a space. Use Zustand store (`pendingPhone`) for cross-screen phone state during auth flow.
- Config file is `next.config.mjs` (not `.js`) for the API app
- API base URL set in `app.json` under `extra.apiUrl`

### API (Next.js)
- All routes validate with Zod; return 400 on validation failure before any DB call
- Dev OTP mock: returns `true` when `NODE_ENV === development` and no `TWILIO_VERIFY_SERVICE_SID` and `otp === '123456'`
- Standard error format: `{ error: { code, message, details } }`

### Git / GitHub
- Remote alias: `git@github.com-bansalparijat:bansalparijat/club-connect.git`
- Pre-push hook may require `SECRET_SCAN_LOCAL=false git push ...` to bypass secret scanning

## Key Domain Rules
- `MatchAvailability.position` is only set for WAITLISTED rows (1 = next in line)
- When a CONFIRMED player drops: promote position-1 waitlisted member, shift all positions down
- `User.isStub = true` — bulk-imported user who hasn't completed OTP activation
- Match cancellation is a soft delete: set `status = CANCELLED`
- Fee marking is one-way: mark paid only (no unmark via API)
- `HouseMembership` is unique per `(userId, seasonId)` — one house per member per season
