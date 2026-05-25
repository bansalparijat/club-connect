# Club Connect

A mobile app for sports clubs to manage match availability. Members mark availability for matches, admins create matches, and the system handles waitlists, match fees, and WhatsApp notifications automatically.

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native (Expo) |
| Backend | Next.js (API routes only) |
| Database | Supabase PostgreSQL + Prisma ORM |
| Auth | Phone OTP via Twilio Verify + JWT |
| WhatsApp | Meta Cloud API or Twilio (abstract provider) |
| Queue | AWS SQS + Lambda |
| Cron | AWS EventBridge Scheduler |
| IaC | Terraform + Terragrunt |
| Monorepo | Turborepo + pnpm workspaces |

## Project Structure

```
club-connect/
├── apps/
│   ├── api/          # Next.js API server (deployed as Lambda container)
│   └── mobile/       # React Native Expo app
├── packages/
│   ├── db/           # Prisma schema + client
│   ├── types/        # Shared TypeScript types
│   └── notifications/ # WhatsApp provider abstraction
└── infrastructure/
    ├── terraform/    # Terraform modules
    └── terragrunt/   # Terragrunt config (staging + production)
```

---

## Testing the Mobile App Locally

### Prerequisites

```bash
node --version   # >= 18
pnpm --version   # >= 8
```

Install Expo CLI:

```bash
npm install -g expo-cli
```

You also need one of:

- **iOS**: Xcode + iOS Simulator (Mac only)
- **Android**: Android Studio + AVD emulator
- **Physical device**: Expo Go app from App Store / Play Store

---

### Step 1 — Set up the local database

The easiest option is the Supabase CLI:

```bash
npm install -g supabase
supabase start   # starts local Postgres + Studio on http://localhost:54323
```

This outputs connection strings — note the `DB URL`.

Alternatively, use Docker:

```bash
docker run -d --name pg -e POSTGRES_PASSWORD=password -p 5432:5432 postgres:15
```

---

### Step 2 — Configure the API environment

```bash
cp .env.example apps/api/.env.local
```

Edit `apps/api/.env.local` with your local values:

```env
# Database (Supabase local or Docker postgres)
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# JWT — any random strings work locally
JWT_SECRET="local-dev-secret-32-chars-minimum"
JWT_REFRESH_SECRET="local-dev-refresh-secret-32-chars"

# OTP — leave TWILIO vars empty to use the dev mock (OTP code is always "123456")
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
# TWILIO_VERIFY_SERVICE_SID=

# WhatsApp — leave empty locally (notifications will just log to console)
WHATSAPP_PROVIDER="meta"
# META_WHATSAPP_TOKEN=
# META_PHONE_NUMBER_ID=

# SQS — leave empty locally (notifications log + skip)
# SQS_QUEUE_URL=
```

---

### Step 3 — Run database migrations

```bash
pnpm install
pnpm db:generate   # generate Prisma client
pnpm db:migrate    # run migrations against local DB
pnpm db:seed       # seed sport types (Cricket, Football, etc.)
```

---

### Step 4 — Start the API server

```bash
pnpm --filter @club-connect/api dev
# API running at http://localhost:3000
```

Verify:

```bash
curl http://localhost:3000/api/health
# {"status":"ok"}
```

---

### Step 5 — Configure the mobile app to point to local API

Edit `apps/mobile/app.json`:

```json
"extra": {
  "eas": { "projectId": "your-eas-project-id" },
  "apiUrl": "http://localhost:3000"
}
```

> **Testing on a physical device?** Use your machine's local IP instead (phone and computer must be on the same Wi-Fi):
>
> ```bash
> ipconfig getifaddr en0   # macOS — e.g. 192.168.1.42
> ```
>
> Then set `"apiUrl": "http://192.168.1.42:3000"`.

---

### Step 6 — Start the mobile app

```bash
cd apps/mobile
pnpm dev
```

Then:

| Target | Action |
|---|---|
| iOS Simulator | Press `i` in terminal |
| Android Emulator | Press `a` in terminal |
| Physical device | Scan the QR code with Expo Go |

---

### Step 7 — Log in with the dev OTP

Since `TWILIO_VERIFY_SERVICE_SID` is not set, the OTP is always **`123456`**:

1. Enter any phone number (e.g. `+91 99999 00001`)
2. Tap **Send OTP**
3. Enter `123456`
4. Complete profile setup — you're in

---

### Troubleshooting

**"Network request failed" on device** — Your phone can't reach `localhost`. Use your machine's IP in `apiUrl` (Step 5).

**Prisma errors on startup** — Run `pnpm db:generate` again after any schema change.

**OTP not working** — Confirm `TWILIO_VERIFY_SERVICE_SID` is empty/unset in `.env.local`. Check API logs for `[OTP dev mock]`.

**Metro bundler cache issues** — Clear with:

```bash
npx expo start --clear
```

---

## Available Scripts

From the repo root:

```bash
pnpm dev              # start all apps in dev mode
pnpm build            # build all packages and apps
pnpm typecheck        # typecheck all packages
pnpm lint             # lint all packages
pnpm db:generate      # generate Prisma client
pnpm db:migrate       # run DB migrations
pnpm db:seed          # seed initial data
```

---

## Infrastructure

Deployed on AWS (ap-south-1 / Mumbai):

- **API**: Lambda container (Next.js + Lambda Web Adapter) behind API Gateway HTTP API
- **Worker**: Lambda triggered by SQS (WhatsApp notifications) and EventBridge Scheduler (daily cron jobs)
- **Database**: Supabase PostgreSQL (free tier)
- **Storage**: Supabase Storage (profile photos, import files)

To deploy infrastructure (requires AWS credentials + Terraform/Terragrunt):

```bash
cd infrastructure/terragrunt/staging
terragrunt run-all apply
```
