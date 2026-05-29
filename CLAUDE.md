# Club Connect — Claude Directives

## Plan Files
- Full project plan: `plans/PLAN.md` — read this before making architectural decisions.
- CI/CD & deployment plan: `plans/ci_cd_plan.md` — AWS setup, pipelines, migrations, security practices.
- DynamoDB migration plan: `plans/dynamodb_migration.md` — single-table design, access patterns, repository layer.

## Project Structure
```
club-connect/
├── apps/
│   ├── api/        # Next.js API routes only (no frontend), deployed as Lambda container
│   └── mobile/     # React Native (Expo)
├── packages/
│   ├── db/         # DynamoDB client + typed repositories
│   ├── types/      # Shared TypeScript types
│   └── notifications/  # WhatsApp provider abstraction
└── infrastructure/
    └── terraform/  # Terraform modules + Terragrunt
```

## Tech Stack
- **Mobile**: React Native (Expo SDK 54), expo-router for navigation
- **Backend**: Next.js 14 App Router (API routes only), deployed via Lambda Web Adapter
- **Database**: AWS DynamoDB (single-table design, free tier)
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

### Monorepo / DynamoDB
- Database layer lives in `packages/db/src/` — typed repositories wrapping DynamoDB Document Client
- Single table `club-connect-{env}` with PK/SK patterns and 2 GSIs (GSI1, GSI2)
- Access via `import { db } from '@club-connect/db'` then `db.users.findById(id)`, `db.matches.create(...)`, etc.
- No schema migrations — DynamoDB is schema-less; table created via Terraform
- Seed sport types: `pnpm db:seed` (idempotent, safe to re-run)
- Local dev: set `DYNAMODB_TABLE_NAME` and optionally `DYNAMODB_ENDPOINT` for local DynamoDB
- **DynamoDB reserved words**: Use `#alias` in UpdateExpression for reserved words (e.g., `capacity`, `status`, `date`, `name`). See [AWS reserved words list](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ReservedWords.html).

### Testing
- **Framework**: Vitest 3.x (pinned for Node 20 compat; Vitest 4 needs Node 22)
- **Run all**: `pnpm test` — requires DynamoDB Local running on port 8000
- **DB unit tests**: `packages/db/src/__tests__/repos/` — one file per repository, tests against DynamoDB Local
- **API unit tests**: `apps/api/src/__tests__/lib/` — JWT, OTP lib tests
- **Integration tests**: `apps/api/src/__tests__/integration/` — full flows (auth, club, match+availability, unavailability)
- Each test suite gets a fresh DynamoDB table via `setupFiles`
- Tests run sequentially (`fileParallelism: false`) to avoid DynamoDB Local contention

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
- When a CONFIRMED player drops OR is marked UNAVAILABLE: promote position-1 waitlisted member, shift all positions down, delete fee payment
- When a WAITLISTED player drops OR is marked UNAVAILABLE: shift positions for players below them, delete fee payment
- Self-availability changes (AVAILABLE/UNAVAILABLE) always use `POST /availability` — PATCH is for admin/captain overrides and explicit DROPPED
- Players without a slot (UNAVAILABLE/DROPPED/null) cannot mark UNAVAILABLE when match is completely full (confirmed=capacity AND waitlist=waitlistSize)
- `CLOSED` match status = completed, no further edits allowed (PATCH returns 422)
- `User.isStub = true` — bulk-imported user who hasn't completed OTP activation
- Match cancellation is a soft delete: set `status = CANCELLED`
- Fee marking is one-way: mark paid only (no unmark via API)
- `HouseMembership` is unique per `(userId, seasonId)` — one house per member per season
- Preferred house when adding member: pass `houseId` → creates `HouseMembership` in the active season
- Bulk house assignment: `POST /clubs/:id/members/bulk-houses` with `{ seasonId, assignments: [{userId, houseId}] }`
- Match create requires exactly 2 `houseIds`; supports optional `seasonId`
- `GET /clubs/:id/matches?seasonId=X` returns all matches for that season sorted date desc (no date floor)
- Match detail includes `house` (color/logoUrl) and `hasPaid` per confirmed/waitlisted player
