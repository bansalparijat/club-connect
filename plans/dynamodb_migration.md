# Club Connect — DynamoDB Migration Plan

## Why DynamoDB

- **Free tier**: 25 GB storage, 25 RCU/WCU provisioned (or 200M requests/month on-demand) — sufficient for dev + initial production
- **Fully managed**: No connection pooling issues (removes PgBouncer/Supabase pooler complexity)
- **Same cloud**: Lambda + DynamoDB in ap-south-1 = single-digit ms latency
- **No schema migrations**: Schema-less — no `prisma migrate` in CI/CD
- **Removes**: Supabase dependency, Prisma ORM, PgBouncer, direct/pooler URL distinction

## Single-Table Design

One DynamoDB table per environment: `club-connect-{env}` (e.g., `club-connect-dev`, `club-connect-production`).

All entities stored in the same table with PK/SK patterns. Three Global Secondary Indexes (GSIs) cover all access patterns.

### Table Schema

```
Table: club-connect-{env}
  PK     (S)  — Partition Key
  SK     (S)  — Sort Key
  GSI1PK (S)  — Global Secondary Index 1 Partition Key
  GSI1SK (S)  — Global Secondary Index 1 Sort Key
  GSI2PK (S)  — Global Secondary Index 2 Partition Key
  GSI2SK (S)  — Global Secondary Index 2 Sort Key
```

### Entity Key Patterns

| Entity | PK | SK | GSI1PK | GSI1SK | GSI2PK | GSI2SK |
|---|---|---|---|---|---|---|
| User | `USER#<id>` | `#META` | `PHONE#<phone>` | `USER` | — | — |
| RefreshToken | `USER#<userId>` | `RTOKEN#<tokenHash>` | `TOKEN#<token>` | `RTOKEN` | — | — |
| Club | `CLUB#<id>` | `#META` | — | — | — | — |
| ClubMembership | `CLUB#<clubId>` | `MEMBER#<userId>` | `USER#<userId>` | `CLUB_MEMBER#<clubId>` | `CLUB#<clubId>#ROLE#<role>` | `STATUS#<status>#<userId>` |
| House | `CLUB#<clubId>` | `HOUSE#<houseId>` | `CLUB_HOUSE_NAME#<clubId>#<name>` | `HOUSE` | — | — |
| Season | `CLUB#<clubId>` | `SEASON#<seasonId>` | — | — | — | — |
| HouseMembership | `SEASON#<seasonId>` | `HMEMBER#<userId>` | `USER#<userId>` | `HMEMBER#<seasonId>` | — | — |
| SportType | `SPORT` | `TYPE#<id>` | `SPORT_NAME#<name>` | `TYPE` | — | — |
| SportParameter | `SPORT#<typeId>` | `SPARAM#<paramId>` | — | — | — | — |
| Match | `MATCH#<matchId>` | `#META` | — | — | `CLUB_MATCHES#<clubId>` | `<isoDate>#<matchId>` |
| MatchHouse | `MATCH#<matchId>` | `MHOUSE#<houseId>` | — | — | — | — |
| MatchParameter | `MATCH#<matchId>` | `MPARAM#<key>` | — | — | — | — |
| MatchAvailability | `MATCH#<matchId>` | `AVAIL#<userId>` | `USER#<userId>` | `MATCH_AVAIL#<matchId>` | `MATCH_STATUS#<matchId>#<status>` | `POS#<padded_position>#<userId>` |
| MatchFeePayment | `MATCH#<matchId>` | `FEE#<userId>` | — | — | — | — |
| MatchCaptain | `MATCH#<matchId>` | `CAPTAIN#<userId>` | — | — | — | — |
| UserUnavailability | `USER#<userId>` | `UNAVAIL#<ruleId>` | — | — | — | — |
| NotificationLog | `NOTIFLOG#<userId>` | `<isoSentAt>#<id>` | `NOTIF_REF#<refId>#<type>` | `<isoSentAt>` | — | — |
| OtpAttempt | `OTP#<phone>` | `<isoCreatedAt>#<id>` | — | — | — | — |
| SeasonMatch (link) | `SEASON_MATCHES#<seasonId>` | `<isoDate>#<matchId>` | — | — | — | — |

### GSI Definitions

| GSI | PK Attribute | SK Attribute | Projection |
|---|---|---|---|
| GSI1 | GSI1PK | GSI1SK | ALL |
| GSI2 | GSI2PK | GSI2SK | ALL |

**Note**: GSI2 serves double duty:
- Club match listings: `GSI2PK = CLUB_MATCHES#<clubId>`, sorted by date
- Availability by status: `GSI2PK = MATCH_STATUS#<matchId>#<status>`, sorted by position

### Access Patterns → Key Mapping

| # | Access Pattern | Operation | Key Used |
|---|---|---|---|
| 1 | Get user by ID | GetItem | PK=`USER#id`, SK=`#META` |
| 2 | Get user by phone | Query GSI1 | GSI1PK=`PHONE#phone` |
| 3 | Create user | PutItem | PK=`USER#id`, SK=`#META` |
| 4 | Update user | UpdateItem | PK=`USER#id`, SK=`#META` |
| 5 | Get refresh token by value | Query GSI1 | GSI1PK=`TOKEN#token` |
| 6 | Get user's refresh tokens | Query | PK=`USER#id`, SK begins_with `RTOKEN#` |
| 7 | Get club by ID | GetItem | PK=`CLUB#id`, SK=`#META` |
| 8 | Get club membership | GetItem | PK=`CLUB#clubId`, SK=`MEMBER#userId` |
| 9 | List club members | Query | PK=`CLUB#clubId`, SK begins_with `MEMBER#` |
| 10 | Get user's clubs | Query GSI1 | GSI1PK=`USER#userId`, SK begins_with `CLUB_MEMBER#` |
| 11 | List club houses | Query | PK=`CLUB#clubId`, SK begins_with `HOUSE#` |
| 12 | Get house by name (unique check) | Query GSI1 | GSI1PK=`CLUB_HOUSE_NAME#clubId#name` |
| 13 | List club seasons | Query | PK=`CLUB#clubId`, SK begins_with `SEASON#` |
| 14 | Get house memberships for season | Query | PK=`SEASON#seasonId`, SK begins_with `HMEMBER#` |
| 15 | Get user's house for season | GetItem | PK=`SEASON#seasonId`, SK=`HMEMBER#userId` |
| 16 | List sport types | Query | PK=`SPORT`, SK begins_with `TYPE#` |
| 17 | Get sport type by name | Query GSI1 | GSI1PK=`SPORT_NAME#name` |
| 18 | List sport parameters | Query | PK=`SPORT#typeId`, SK begins_with `SPARAM#` |
| 19 | Get match by ID | GetItem | PK=`MATCH#matchId`, SK=`#META` |
| 20 | List club matches (by date) | Query GSI2 | GSI2PK=`CLUB_MATCHES#clubId`, range on SK |
| 21 | List season matches | Query | PK=`SEASON_MATCHES#seasonId`, SK range |
| 22 | Get match availability | Query | PK=`MATCH#matchId`, SK begins_with `AVAIL#` |
| 23 | Get specific availability | GetItem | PK=`MATCH#matchId`, SK=`AVAIL#userId` |
| 24 | Get match houses | Query | PK=`MATCH#matchId`, SK begins_with `MHOUSE#` |
| 25 | Get match parameters | Query | PK=`MATCH#matchId`, SK begins_with `MPARAM#` |
| 26 | Get match fee payments | Query | PK=`MATCH#matchId`, SK begins_with `FEE#` |
| 27 | Get match captains | Query | PK=`MATCH#matchId`, SK begins_with `CAPTAIN#` |
| 28 | Get user unavailability rules | Query | PK=`USER#userId`, SK begins_with `UNAVAIL#` |
| 29 | Notification dedup check | Query GSI1 | GSI1PK=`NOTIF_REF#refId#type`, SK > cutoff |
| 30 | Search members (name/phone) | Query + filter | PK=`CLUB#clubId`, SK begins_with `MEMBER#`, filter on name/phone |

### Denormalization Strategy

DynamoDB requires denormalization for efficient reads. Key denormalized fields:

1. **ClubMembership items** include `userName`, `userPhone`, `userProfilePhotoUrl`, `userIsStub` — avoids separate User lookups when listing members
2. **MatchAvailability items** include `userName`, `userPhone`, `userProfilePhotoUrl` — avoids N+1 user lookups in match detail
3. **Match #META items** include `confirmedCount`, `waitlistedCount` — maintained via atomic counters on availability changes, avoids count queries
4. **SeasonMatch link items** are write-time copies with `matchTitle`, `matchVenue`, `matchStatus` — avoids cross-partition reads for season match list

When a user updates their name/photo, update denormalized copies in their memberships and recent availability records (background, eventual consistency acceptable).

### Waitlist Position Management

The `$executeRaw` SQL for bulk position shifting is replaced with:

1. Query all WAITLISTED items for the match (PK=`MATCH#matchId`, SK begins_with `AVAIL#`, filter status=WAITLISTED)
2. Sort by position client-side
3. BatchWrite updates to shift positions
4. For small waitlists (typically < 20), this is efficient

### Member Count

Instead of `_count: { select: { memberships: ... } }`:
- Store `memberCount` as an attribute on the Club `#META` item
- Increment/decrement atomically when members are added/removed
- Same pattern for `confirmedCount` / `waitlistedCount` on Match `#META`

---

## Repository Layer Design

`packages/db` exports a typed `db` object:

```typescript
import { db } from '@club-connect/db'

// Instead of: prisma.user.findUnique({ where: { phone } })
const user = await db.users.findByPhone(phone)

// Instead of: prisma.clubMembership.findUnique({ where: { clubId_userId: { clubId, userId } } })
const membership = await db.memberships.get(clubId, userId)

// Instead of: prisma.match.create({ data: { ... } })
const match = await db.matches.create({ clubId, title, date, ... })
```

### Repository Methods

**UserRepo**: `findById`, `findByPhone`, `create`, `update`
**RefreshTokenRepo**: `create`, `findByToken`, `deleteByUserId`
**ClubRepo**: `findById`, `create`, `update`
**MembershipRepo**: `get`, `listByClub`, `listByUser`, `create`, `update`, `countByClub`
**HouseRepo**: `listByClub`, `findById`, `findByName`, `create`, `update`, `delete`
**SeasonRepo**: `listByClub`, `findById`, `create`, `update`
**HouseMembershipRepo**: `get`, `listBySeason`, `listByUserIds`, `upsert`
**SportTypeRepo**: `list`, `findById`, `findByName`
**MatchRepo**: `findById`, `create`, `update`, `listByClub`, `listBySeason`
**MatchAvailabilityRepo**: `get`, `listByMatch`, `upsert`, `update`, `countByStatus`, `shiftPositions`
**MatchFeePaymentRepo**: `get`, `listByMatch`, `create`, `update`, `deleteForUser`
**MatchCaptainRepo**: `get`, `listByMatch`, `create`, `delete`
**MatchHouseRepo**: `listByMatch`, `create`
**MatchParameterRepo**: `listByMatch`, `createBatch`
**UnavailabilityRepo**: `listByUser`, `findById`, `create`, `delete`, `findMatching`
**NotificationLogRepo**: `create`, `hasSentRecently`

---

## Infrastructure Changes

### New Terraform Module: `modules/dynamodb/main.tf`

```hcl
resource "aws_dynamodb_table" "main" {
  name         = "${var.app_name}-${var.env}"
  billing_mode = "PAY_PER_REQUEST"  # On-demand, stays in free tier for low traffic
  hash_key     = "PK"
  range_key    = "SK"

  attribute { name = "PK",     type = "S" }
  attribute { name = "SK",     type = "S" }
  attribute { name = "GSI1PK", type = "S" }
  attribute { name = "GSI1SK", type = "S" }
  attribute { name = "GSI2PK", type = "S" }
  attribute { name = "GSI2SK", type = "S" }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "GSI2"
    hash_key        = "GSI2PK"
    range_key       = "GSI2SK"
    projection_type = "ALL"
  }

  point_in_time_recovery { enabled = true }
  tags = { Environment = var.env }
}
```

### Lambda IAM Policy Update

Add DynamoDB permissions to both api-lambda and worker-lambda roles:

```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
    "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan",
    "dynamodb:BatchWriteItem", "dynamodb:BatchGetItem",
    "dynamodb:TransactWriteItems"
  ],
  "Resource": [
    "arn:aws:dynamodb:ap-south-1:*:table/club-connect-{env}",
    "arn:aws:dynamodb:ap-south-1:*:table/club-connect-{env}/index/*"
  ]
}
```

### Removed Infrastructure

- No more Supabase PostgreSQL dependency
- No more PgBouncer / pooler URL / direct URL distinction
- No more `prisma migrate deploy` in CI/CD pipeline
- No more `DATABASE_URL` / `DIRECT_URL` in secrets

### Updated Secrets (AWS Secrets Manager)

Remove: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`
Add: `DYNAMODB_TABLE_NAME` (or derive from env: `club-connect-${NODE_ENV === 'production' ? 'production' : 'dev'}`)

---

## Seed Data Strategy

SportTypes and SportParameters are seeded at deploy time via a seed script (`packages/db/src/seed.ts`) that uses `PutItem` with condition expressions to avoid overwriting existing data.

---

## CI/CD Changes

- Remove `prisma migrate deploy` step from deploy workflows
- Remove `prisma generate` step from Dockerfile and CI
- Remove `prisma validate` from pre-push hook
- Add DynamoDB table creation to Terragrunt dependency chain
- Seed script runs after table creation (idempotent)

---

## Local Development

- Use `dynamodb-local` Docker container for local dev
- Or use a shared dev table in AWS (simpler, recommended)
- Environment variable `DYNAMODB_TABLE_NAME` controls which table to use
- `DYNAMODB_ENDPOINT` for local DynamoDB override

---

## Migration Checklist

- [ ] Create `packages/db` DynamoDB client + repository layer
- [ ] Remove Prisma schema, migrations, and dependencies
- [ ] Rewrite `apps/api/src/lib/prisma.ts` → `apps/api/src/lib/db.ts`
- [ ] Rewrite `apps/api/src/middleware/auth.ts`
- [ ] Rewrite all API route handlers (27 files)
- [ ] Rewrite `apps/api/src/lib/notifications.ts`
- [ ] Update `apps/api/Dockerfile` (remove Prisma generate)
- [ ] Add `modules/dynamodb/` Terraform module
- [ ] Update Lambda IAM policies
- [ ] Update Terragrunt dependency chain
- [ ] Update `packages/db/src/seed.ts`
- [ ] Update `.env.example`
- [ ] Update all documentation
