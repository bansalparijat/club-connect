# Club Connect

A mobile app for sports clubs to manage match availability. Members mark availability for matches, admins create matches, and the system handles waitlists, match fees, and WhatsApp notifications automatically.

## Prerequisites

Install these on a clean machine before starting:

| Tool | Version | Install |
|---|---|---|
| **Node.js** | 22+ | `nvm install 22` or [nodejs.org](https://nodejs.org/) |
| **pnpm** | 10+ | `corepack enable` (auto-installs from packageManager field) |
| **Docker Desktop** | Any recent | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| **AWS CLI** | v2 | `brew install awscli` |

For mobile development (optional):

| Tool | Install |
|---|---|
| **Expo Go** (phone) | App Store / Play Store |
| **Xcode** (iOS simulator, Mac only) | Mac App Store |
| **Android Studio** (Android emulator) | [developer.android.com/studio](https://developer.android.com/studio) |

Verify everything is ready:

```bash
node --version    # v22.x.x or higher
pnpm --version    # 10.x.x
docker --version  # Docker version 2x.x.x
aws --version     # aws-cli/2.x.x
```

## Project Structure

```
club-connect/
├── apps/
│   ├── api/           # Next.js API server (deployed as AWS Lambda)
│   └── mobile/        # React Native Expo app
├── packages/
│   ├── db/            # DynamoDB client + typed repositories
│   ├── types/         # Shared TypeScript types
│   └── notifications/ # WhatsApp provider abstraction
├── infrastructure/    # Terraform + Terragrunt (AWS infra)
├── scripts/           # Local dev helper scripts
└── plans/             # Architecture & deployment docs
```

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native (Expo SDK 54) |
| Backend | Next.js 14 (API routes only) |
| Database | AWS DynamoDB (single-table design) |
| Auth | Phone OTP (Twilio Verify) + JWT |
| WhatsApp | Meta Cloud API or Twilio (abstract provider) |
| Queue | AWS SQS + Lambda |
| Cron | AWS EventBridge Scheduler |
| IaC | Terraform + Terragrunt |
| Monorepo | Turborepo + pnpm workspaces |

---

## Getting Started (Backend API)

### Step 1 — Clone and install

```bash
git clone <repo-url> club-connect
cd club-connect
git checkout dev    # always work on dev, never commit to main
nvm use             # switches to Node 22 (reads .nvmrc)
corepack enable     # activates pnpm 10 from packageManager field
pnpm install
```

### Step 2 — Start DynamoDB Local

This starts a local DynamoDB instance in Docker and creates the required table with indexes:

```bash
bash scripts/local-dynamo.sh
```

You should see:

```
==> Starting DynamoDB Local...
==> Creating table: club-connect-dev
Table created
==> DynamoDB Local ready at http://localhost:8000
```

> DynamoDB Local runs on port 8000. Data persists as long as the Docker container exists.

### Step 3 — Configure environment

Create the API environment file:

```bash
cp .env.example apps/api/.env.local
```

Edit `apps/api/.env.local` with these values:

```env
# DynamoDB Local
DYNAMODB_TABLE_NAME="club-connect-dev"
DYNAMODB_ENDPOINT="http://localhost:8000"

# JWT — any random strings, minimum 32 characters
JWT_SECRET="local-dev-secret-at-least-32-characters"
JWT_REFRESH_SECRET="local-dev-refresh-at-least-32-chars"

# AWS — dummy credentials (DynamoDB Local ignores them, but the SDK requires them)
AWS_REGION="ap-south-1"
AWS_ACCESS_KEY_ID="local"
AWS_SECRET_ACCESS_KEY="local"

# App
NODE_ENV="development"
```

> Leave `TWILIO_VERIFY_SERVICE_SID` empty/commented — this enables mock OTP mode where `123456` works for any phone number.
>
> Leave `SQS_QUEUE_URL` empty/commented — WhatsApp notifications will log to console instead of being enqueued.

### Step 4 — Seed the database

Populates sport types (Cricket, Football, Badminton, etc.) with their parameters:

```bash
pnpm db:seed
```

### Step 5 — Start the API server

```bash
pnpm --filter @club-connect/api dev
```

The API starts at **http://localhost:3000**. Verify:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","db":"connected","timestamp":"..."}
```

### Step 6 — Verify the full flow

```bash
# Check sport types are seeded
curl -s http://localhost:3000/api/sport-types | python3 -c "
import json,sys
print(f'{len(json.load(sys.stdin)[\"sportTypes\"])} sport types loaded')
"

# Send OTP (mock mode — no SMS sent)
curl -s -X POST http://localhost:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919999900001"}'
# {"message":"OTP sent","expiresIn":300}

# Verify OTP with mock code "123456"
curl -s -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919999900001","otp":"123456"}'
# Returns { accessToken, refreshToken, user }
```

Use the `accessToken` from the response for authenticated requests:

```bash
TOKEN="<paste accessToken here>"

# Complete profile
curl -s -X PATCH http://localhost:3000/api/users/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Dev User"}'

# List clubs (empty initially)
curl -s http://localhost:3000/api/clubs \
  -H "Authorization: Bearer $TOKEN"
```

---

## Running the Mobile App

### Step 1 — Point to the local API

Edit `apps/mobile/app.json`:

```json
"extra": {
  "apiUrl": "http://localhost:3000"
}
```

> **Testing on a physical device?** Your phone and computer must be on the same Wi-Fi. Use your machine's IP instead:
>
> ```bash
> # macOS
> ipconfig getifaddr en0   # e.g. 192.168.1.42
> ```
>
> Set `"apiUrl": "http://192.168.1.42:3000"`.

### Step 2 — Start the mobile dev server

```bash
pnpm --filter @club-connect/mobile dev
```

Then:

| Target | Action |
|---|---|
| iOS Simulator | Press `i` in terminal |
| Android Emulator | Press `a` in terminal |
| Physical device | Scan the QR code with Expo Go |

### Step 3 — Log in

1. Enter any phone number (e.g. `+91 99999 00001`)
2. Tap **Send OTP**
3. Enter `123456`
4. Complete profile setup — you're in

---

## DynamoDB Local Management

```bash
# Start (idempotent — safe to re-run)
bash scripts/local-dynamo.sh

# Stop (data preserved)
docker stop dynamodb-local

# Restart
docker start dynamodb-local

# Full reset (destroys all data)
docker rm -f dynamodb-local
bash scripts/local-dynamo.sh
pnpm db:seed

# Browse table contents
aws dynamodb scan \
  --table-name club-connect-dev \
  --endpoint-url http://localhost:8000 \
  --no-cli-pager
```

---

## Running Tests

Tests require DynamoDB Local to be running (same as development setup).

A **pre-commit hook** (husky) runs lint, typecheck, and tests automatically before every commit. You don't need to run them manually unless debugging — but DynamoDB Local must be running for commits to succeed.

```bash
# Ensure DynamoDB Local is running (required for commits!)
docker start dynamodb-local || bash scripts/local-dynamo.sh

# Run individually
pnpm lint          # ESLint across API + mobile
pnpm typecheck     # TypeScript check across all packages
pnpm test          # Vitest tests (102 tests, both packages)

# Or all three (same as what the pre-commit hook runs)
pnpm lint && pnpm typecheck && pnpm test
```

### Test Structure

Tests are split into two packages:

**`packages/db`** — Unit tests for DynamoDB repository layer (60 tests)

```bash
pnpm --filter @club-connect/db test
```

| Test File | Covers |
|---|---|
| `users.test.ts` | Create, find by ID/phone, update, stub activation |
| `clubs.test.ts` | CRUD, member count atomic increment/decrement |
| `memberships.test.ts` | Create, list by club/user, filter, search, role update |
| `matches.test.ts` | Create with houses+params, update, list by club, counts |
| `availability.test.ts` | CONFIRMED/WAITLISTED upsert, position shifting, promotion, batch unavailable |
| `fee-payments.test.ts` | Create (idempotent), mark paid, list, delete |
| `houses-seasons.test.ts` | Houses CRUD, seasons CRUD, active status sync, house memberships |
| `sport-types.test.ts` | Types + parameters CRUD, list with parameters |

**`apps/api`** — Unit tests for lib + integration tests (42 tests)

```bash
pnpm --filter @club-connect/api test
```

| Test File | Type | Covers |
|---|---|---|
| `lib/jwt.test.ts` | Unit | Sign/verify access+refresh tokens, cross-type rejection |
| `lib/otp.test.ts` | Unit | Phone normalization, dev mock OTP send/verify |
| `integration/auth-flow.test.ts` | Integration | User creation, refresh token, re-login, stub activation |
| `integration/club-flow.test.ts` | Integration | Full club lifecycle: sport type → user → club → members → houses → seasons → house assignments |
| `integration/match-availability.test.ts` | Integration | Match creation → confirm → waitlist → full match → drop → waitlist promotion → position shift → fee marking → captain → close |
| `integration/unavailability.test.ts` | Integration | Specific-date rules, recurring-weekly rules, matching logic, window boundaries |

### Writing New Tests

Tests use [Vitest](https://vitest.dev/) and run against DynamoDB Local on port 8000. Each test suite gets a fresh table (created in the global `setup.ts`).

```typescript
// Import db directly — env vars are set by setupFiles
import { db } from '@club-connect/db'
import { describe, it, expect } from 'vitest'

describe('MyFeature', () => {
  it('does something', async () => {
    const user = await db.users.create({ phone: '+919000000001', name: 'Test', isStub: false })
    expect(user.id).toBeTruthy()
  })
})
```

---

## Branching & Deployment Workflow

```
dev (auto-deploys to dev environment)
 └── PR → main (protected, production deploys)
```

**`main` is protected** — no direct pushes allowed. All changes go through `dev` first.

```bash
# Daily development — always on dev
git checkout dev
# ... make changes ...
git add . && git commit -m "feat: my feature"
git push origin dev          # triggers CI + auto-deploy to dev

# When ready for production
# 1. Create PR: dev → main (on GitHub)
# 2. CI must pass on the PR
# 3. Merge the PR
# 4. Go to Actions → Deploy Production → Run workflow (on main)
```

---

## Available Scripts

From the repo root:

| Command | Description |
|---|---|
| `pnpm install` | Install all dependencies |
| `pnpm --filter @club-connect/api dev` | Start API server on port 3000 |
| `pnpm --filter @club-connect/mobile dev` | Start Expo dev server |
| `pnpm db:seed` | Seed sport types into DynamoDB |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm lint` | Lint all packages |
| `pnpm test` | Run all tests (requires DynamoDB Local) |
| `pnpm --filter @club-connect/db test` | Run DB repository unit tests only |
| `pnpm --filter @club-connect/api test` | Run API unit + integration tests only |

---

## Version Constraints

| Package | Version | Reason |
|---|---|---|
| Node.js | 22.x | Required by pnpm 10, Vitest 4; `.nvmrc` ensures consistency |
| pnpm | 10.x | Set via `packageManager` field; auto-installed by `corepack enable` |
| Next.js | 14.x | Lambda Web Adapter tested with 14; 15+ has breaking changes |
| TypeScript | 5.x | TS 6 is new with breaking changes; stay stable |
| Vitest | 4.x | Latest; uses rolldown native bindings (requires Node 22+) |
| ESLint | 9.x | Latest; flat config used for both API and mobile |
| Zod | 3.x | Zod 4 is a major rewrite; migration not trivial |
| jose | 5.x | jose 6 has breaking API changes |
| Expo | SDK 54 | Update all expo packages together via `npx expo install --fix` |

---

## Infrastructure

Deployed on AWS (ap-south-1 / Mumbai):

- **API**: Lambda container (Next.js + Lambda Web Adapter) behind API Gateway HTTP API
- **Worker**: Lambda triggered by SQS (WhatsApp notifications) and EventBridge Scheduler (cron)
- **Database**: DynamoDB (single table per environment, free tier)
- **IaC**: Terraform modules + Terragrunt (dev + production environments)

See [CI/CD Plan](plans/ci_cd_plan.md) for deployment details.

---

## Troubleshooting

**`docker: command not found`** — Install Docker Desktop and ensure it's running (whale icon in menu bar).

**`aws: command not found`** — Install AWS CLI: `brew install awscli`.

**Table creation fails with "connection refused"** — Docker may not be running. Start Docker Desktop, wait for it to be ready, then re-run `bash scripts/local-dynamo.sh`.

**`ResourceNotFoundException` when calling the API** — DynamoDB table doesn't exist. Run `bash scripts/local-dynamo.sh` to create it.

**API returns `{"status":"error","db":"disconnected"}`** — DynamoDB Local isn't running. Check with `docker ps | grep dynamodb` and start it with `docker start dynamodb-local`.

**"Network request failed" on phone** — Your phone can't reach `localhost`. Use your machine's local IP in `apiUrl` (see mobile setup above).

**OTP not working** — Confirm `TWILIO_VERIFY_SERVICE_SID` is NOT set in `.env.local`. Check API logs for `[OTP Mock]`.

**Metro bundler cache issues** — Clear with `npx expo start --clear`.

---

## Documentation

| Document | Description |
|---|---|
| [Project Plan](plans/PLAN.md) | Full feature plan, data model, API design, screen flows |
| [DynamoDB Design](plans/dynamodb_migration.md) | Single-table schema, access patterns, repository layer |
| [CI/CD Plan](plans/ci_cd_plan.md) | AWS setup, GitHub Actions pipelines, deployment strategy |
