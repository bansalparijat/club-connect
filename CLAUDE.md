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
- **Always use `SafeAreaView` from `react-native-safe-area-context`**, never from `react-native` — the built-in one ignores the Android status bar, hiding headers/back buttons.
- **Never use `autoFocus` on the first visible screen** — on Android it fires the keyboard before layout is measured, making the screen appear blank.
- **Hidden TextInput for OTP**: use `width: 1, height: 1, left: -1000` (off-screen), not `width: 0, height: 0` — Android won't show keyboard for zero-size inputs. Add 150 ms `setTimeout` before `.focus()`.
- **Expo Router tab bar**: every file in `app/(app)/` auto-registers as a tab. Hide sub-screens with `options={{ href: null }}` in `_layout.tsx`.
- **Expo Router state persistence**: navigation stack survives JS reloads. Guard screens that require prior state (e.g. OTP requires `pendingPhone`) with a redirect on mount.
- Config file is `next.config.mjs` (not `.js`) for the API app
- API base URL set in `app.json` under `extra.apiUrl`
- Last verified phone saved to AsyncStorage key `last_verified_phone`; shown as suggestion on phone screen

### API (Next.js)
- All routes validate with Zod; return 400 on validation failure before any DB call
- Dev OTP mock: returns `true` when `NODE_ENV === development` and no `TWILIO_VERIFY_SERVICE_SID` and `otp === '123456'`
- Standard error format: `{ error: { code, message, details } }`
- New users created with `name: ''` (empty string) — mobile checks `!data.user.name` to route to profile setup
- `GET /api/clubs/:id` uses `withAuth` (any active member); includes `admins[]` in response

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
