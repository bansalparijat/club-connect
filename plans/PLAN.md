# Club Connect — App Plan

## Context

Sports clubs currently rely on WhatsApp groups and spreadsheets to coordinate match availability, which is error-prone and hard to manage at scale. Club Connect provides a structured mobile app where club admins can organize matches, members can mark availability, and the system handles waitlists, match fees, and WhatsApp notifications automatically.

---

## Scope

**In scope:** Club management, member management, match creation, availability tracking, waitlists, match fees (marking only), WhatsApp notifications, advance unavailability, bulk import, houses/seasons.

**Out of scope:** Payment processing, result tracking, stats, scoring, team selection.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Mobile | React Native (Expo) | iOS + Android, good ecosystem |
| Backend | Next.js (API routes) | User preference, serves REST API |
| Database | PostgreSQL via Supabase | Free tier, includes PgBouncer pooler |
| ORM | Prisma | Type-safe, works well with Next.js |
| Auth | Phone OTP | Matches minimum member info (phone + name) |
| OTP provider | Twilio Verify | Easy OTP delivery |
| WhatsApp | Abstract `NotificationService` | Provider (Meta Cloud API / Twilio) decided later |
| File parsing | `papaparse` (CSV) + `xlsx` (Excel) | Bulk import |
| Storage | Supabase Storage | Free tier (1GB); profile photos, import files |
| Infra | AWS Serverless (ap-south-1) | Lambda + API Gateway + SQS + EventBridge |

---

## Data Model (Prisma Schema)

### Enums

```prisma
enum ClubRole {
  ADMIN
  MEMBER
}

enum MembershipStatus {
  ACTIVE
  INVITED    // added via bulk import or admin add, not yet signed up
  SUSPENDED
  LEFT
}

enum ParameterType {
  SELECT     // dropdown, options stored in SportParameter.options JSON
  TEXT       // free text
  BOOLEAN    // yes/no
}

enum MatchStatus {
  DRAFT
  OPEN       // accepting availability
  CLOSED     // no more availability changes
  CANCELLED
}

enum AvailabilityStatus {
  CONFIRMED    // within capacity
  WAITLISTED   // beyond capacity, in queue
  UNAVAILABLE  // marked unavailable
  DROPPED      // was confirmed/waitlisted, then withdrew
}

enum UnavailabilityType {
  SPECIFIC_DATE
  RECURRING_WEEKLY
}

enum NotificationType {
  MATCH_CREATED
  WAITLIST_CONFIRMED
  FEE_REMINDER
  MATCH_CANCELLED
  MATCH_REMINDER_24H
}
```

### Full Schema

```prisma
model User {
  id              String   @id @default(cuid())
  phone           String   @unique
  name            String
  profilePhotoUrl String?
  isStub          Boolean  @default(false)
  // isStub = true for bulk-imported users who haven't activated their account yet
  // They have a profile but can't log in until they complete phone OTP
  createdAt       DateTime @default(now())

  clubMemberships   ClubMembership[]
  houseMemberships  HouseMembership[]
  matchAvailability MatchAvailability[]
  feePayments       MatchFeePayment[]
  unavailabilities  UserUnavailability[]
  captainMatches    MatchCaptain[]
  createdClubs      Club[]   @relation("ClubCreatedBy")
  createdMatches    Match[]  @relation("MatchCreatedBy")
}

model Club {
  id          String   @id @default(cuid())
  name        String
  description String?
  logoUrl     String?
  sportTypeId String
  createdById String
  createdAt   DateTime @default(now())

  sportType   SportType        @relation(fields: [sportTypeId], references: [id])
  createdBy   User             @relation("ClubCreatedBy", fields: [createdById], references: [id])
  memberships ClubMembership[]
  houses      House[]
  seasons     Season[]
  matches     Match[]
}

model ClubMembership {
  id                   String           @id @default(cuid())
  clubId               String
  userId               String
  role                 ClubRole         @default(MEMBER)
  status               MembershipStatus @default(ACTIVE)
  notificationsEnabled Boolean          @default(true)
  joinedAt             DateTime         @default(now())

  club Club @relation(fields: [clubId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([clubId, userId])
  @@index([clubId, status])
}

model Season {
  id        String    @id @default(cuid())
  clubId    String
  name      String
  startDate DateTime
  endDate   DateTime?
  isActive  Boolean   @default(false)
  isEnded   Boolean   @default(false)
  // isEnded = true when manually marked ended by admin OR when endDate has passed
  // isActive is computed lazily: startDate <= now AND !isEnded AND (endDate IS NULL OR endDate > now)
  createdAt DateTime  @default(now())

  club             Club              @relation(fields: [clubId], references: [id], onDelete: Cascade)
  houseMemberships HouseMembership[]
  matches          Match[]

  @@index([clubId, isActive])
}

model House {
  id      String  @id @default(cuid())
  clubId  String
  name    String
  color   String? // hex color, e.g. "#FF5733"
  logoUrl String? // optional image URL for house logo

  club        Club              @relation(fields: [clubId], references: [id], onDelete: Cascade)
  memberships HouseMembership[]
  matchHouses MatchHouse[]

  @@unique([clubId, name])
}

model HouseMembership {
  id       String @id @default(cuid())
  houseId  String
  userId   String
  seasonId String

  house  House  @relation(fields: [houseId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  season Season @relation(fields: [seasonId], references: [id], onDelete: Cascade)

  @@unique([userId, seasonId])
  // One house per user per season — user switches house by updating this row
}

model SportType {
  id         String           @id @default(cuid())
  name       String           @unique // "Cricket", "Football", "Badminton" etc.
  parameters SportParameter[]
  clubs      Club[]
}

model SportParameter {
  id           String        @id @default(cuid())
  sportTypeId  String
  name         String        // e.g. "Ball Type", "Dress Code"
  type         ParameterType
  options      Json?         // ["Leather", "Tennis"] for SELECT type, null otherwise
  isRequired   Boolean       @default(false)
  displayOrder Int           @default(0)

  sportType SportType @relation(fields: [sportTypeId], references: [id])

  @@unique([sportTypeId, name])
}

model Match {
  id           String      @id @default(cuid())
  clubId       String
  seasonId     String?     // optional: links match to a season
  title        String
  date         DateTime    // stores date + time (UTC)
  venue        String
  capacity     Int         // max confirmed players
  waitlistSize Int         @default(0)
  feeAmount    Decimal?    // null = no fee for this match
  feeCurrency  String?     @default("INR")
  status       MatchStatus @default(OPEN)
  createdById  String
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  club         Club                @relation(fields: [clubId], references: [id], onDelete: Cascade)
  season       Season?             @relation(fields: [seasonId], references: [id])
  createdBy    User                @relation("MatchCreatedBy", fields: [createdById], references: [id])
  parameters   MatchParameter[]
  availability MatchAvailability[]
  feePayments  MatchFeePayment[]
  captains     MatchCaptain[]
  houses       MatchHouse[]
  // Exactly 2 MatchHouse rows per match (Team A vs Team B)

  @@index([clubId, date])
  @@index([clubId, status])
  @@index([seasonId])
}

model MatchHouse {
  id      String @id @default(cuid())
  matchId String
  houseId String

  match Match @relation(fields: [matchId], references: [id], onDelete: Cascade)
  house House @relation(fields: [houseId], references: [id])

  @@unique([matchId, houseId])
}

model MatchParameter {
  id           String  @id @default(cuid())
  matchId      String
  key          String  // parameter name (display label)
  value        String  // always stored as string
  sportParamId String? // references SportParameter.id, null for custom params
  isCustom     Boolean @default(false)

  match Match @relation(fields: [matchId], references: [id], onDelete: Cascade)

  @@unique([matchId, key])
}

model MatchAvailability {
  id          String             @id @default(cuid())
  matchId     String
  userId      String
  status      AvailabilityStatus
  position    Int?
  // position is set for WAITLISTED rows only (1 = next in line)
  // When a CONFIRMED player drops, waitlisted position 1 is auto-confirmed
  // and all remaining waitlist positions shift down by 1
  respondedAt DateTime           @default(now())
  updatedAt   DateTime           @updatedAt

  match Match @relation(fields: [matchId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([matchId, userId])
  @@index([matchId, status])
  @@index([matchId, position]) // fast waitlist ordering
}

model MatchFeePayment {
  id         String    @id @default(cuid())
  matchId    String
  userId     String
  markedPaid Boolean   @default(false)
  markedAt   DateTime?
  // Row created when user is CONFIRMED for a fee match
  // markedPaid flipped to true by the player themselves
  // Daily reminder job queries: WHERE markedPaid = false AND match has feeAmount

  match Match @relation(fields: [matchId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([matchId, userId])
  @@index([matchId, markedPaid])
}

model MatchCaptain {
  id      String @id @default(cuid())
  matchId String
  userId  String
  // Captain can: update other members' availability for this match
  // Assigned per match by a club admin

  match Match @relation(fields: [matchId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([matchId, userId])
}

model UserUnavailability {
  id         String             @id @default(cuid())
  userId     String
  clubId     String?            // null = applies to all clubs the user is in
  type       UnavailabilityType
  date       DateTime?          // used when type = SPECIFIC_DATE
  dayOfWeek  Int?               // 0=Sun ... 6=Sat, used when type = RECURRING_WEEKLY
  startFrom  DateTime?          // start of recurring window
  weeksAhead Int?               // how many weeks forward the recurring rule applies
  createdAt  DateTime           @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, clubId])
}

model NotificationLog {
  id            String           @id @default(cuid())
  userId        String
  channel       String           @default("whatsapp")
  type          NotificationType
  referenceId   String?          // e.g. matchId
  referenceType String?          // e.g. "match"
  sentAt        DateTime         @default(now())
  status        String           @default("sent") // sent | failed | pending

  @@index([userId, type, sentAt])
  @@index([referenceId, type]) // deduplicate daily fee reminders per match
}
```

### Key Design Decisions

| Decision | Reasoning |
|---|---|
| `User.isStub = true` | Bulk-imported users exist in DB but can't log in until OTP activated |
| `HouseMembership @@unique([userId, seasonId])` | One house per member per season; update row to switch house |
| `MatchAvailability.position` | Only set for WAITLISTED rows; shift positions on drop-out |
| `MatchParameter.sportParamId` nullable | Links to predefined param or null for admin custom params |
| `MatchFeePayment` row created on confirm | Created when user transitions to CONFIRMED; deleted if they drop or mark unavailable |
| `UserUnavailability.clubId` nullable | Supports "unavailable globally" or "unavailable for this club only" |
| `ClubMembership.notificationsEnabled` | Per-club WhatsApp opt-out; filtered before sends |
| `onDelete: Cascade` | Matches/memberships clean up when club or user is deleted |
| Soft delete not used | Hard delete with cascades; match cancellation uses `status = CANCELLED` |
| Match requires exactly 2 houses | Always Team A vs Team B — two distinct houses from the club |
| `Match.seasonId` nullable | Optional season link; `GET /matches?seasonId=` returns sorted desc for season view |
| `Season.isEnded` | Manually set by admin or auto-set when endDate passes; computed lazily in `syncSeasonStatuses()` |
| `House.logoUrl` | Optional image URL displayed alongside house color in player lists |
| Match `CLOSED` status | Admin marks match complete; blocks all edits and availability changes |
| Self-availability via POST only | POST handles all self-transitions correctly; PATCH is for admin/captain overrides |
| Slot-freeing on UNAVAILABLE | Marking unavailable (or DROPPED) when holding a CONFIRMED/WAITLISTED slot frees it and triggers waitlist promotion |
| Blocking unavailable on full match | If player has no slot AND match is fully booked (confirmed + waitlist), marking unavailable is rejected 422 |

---

## Key Features & Flows

### 1. Auth
- User enters phone number → receives OTP → enters OTP → lands on home screen
- First login: prompted to complete profile (name, optional photo)
- JWT tokens stored securely on device (Expo SecureStore)

### 2. Club Creation & Management
- Any signed-up user can create a club
- Club creation: name, sport type, description, logo
- On creation: creator becomes Club Admin
- Admin can:
  - Add members (phone + name minimum)
  - Bulk import via CSV / Excel (columns: name, phone, [optional extras])
    - For each row: look up by phone → link existing user OR create a stub profile
  - Define houses
  - Define seasons, assign members to houses per season
  - Promote members to admin role

### 3. Match Creation (Admin only)
- Fields: title, date, time, venue, capacity, waitlist size, optional match fee
- Select predefined sport parameters (from SportParameter for club's sport type)
- Add custom key-value parameters (admin-defined)
- Specify exactly 2 houses playing (Team A and Team B, must be different)
- Optionally link to a season (non-ended seasons shown; active season pre-selected)
- On save → WhatsApp notification sent to ALL club members (async via SQS)
- UserUnavailability checked → auto-mark unavailable for matching members

### 4. Match Editing & Lifecycle (Admin only)
- Admin can edit: title, venue, date/time, capacity, waitlist size, fee
- Editing blocked when match is CLOSED
- Admin can mark match complete (status → CLOSED); no edits or availability changes allowed after
- Admin can cancel match (status → CANCELLED); sends WhatsApp to confirmed + waitlisted

### 5. Availability Marking (Members)
- Members see upcoming matches in their feed
- Per match: tap Available / Unavailable (always via POST — handles all transitions)
- System logic:
  - AVAILABLE:
    - If confirmed count < capacity → status = CONFIRMED, create MatchFeePayment if fee
    - Else if waitlisted count < waitlistSize → status = WAITLISTED with next position
    - Else → 422 MATCH_FULL
    - Idempotent: no-op if already CONFIRMED or WAITLISTED
  - UNAVAILABLE:
    - If player holds a CONFIRMED/WAITLISTED slot → frees the slot (delete fee payment, promote waitlist)
    - If player has no slot AND match is completely full → 422 (cannot mark unavailable)
    - Otherwise → stores as UNAVAILABLE
  - DROPPED (explicit button in UI):
    - Frees the slot (same as above), transitions to DROPPED
    - First WAITLISTED member (position=1) auto-confirmed, positions shift down, WhatsApp sent
- Captain (match-specific role): can update other members' availability via PATCH endpoint

### 6. Advance Unavailability
- Members can mark:
  - Specific future dates (calendar picker)
  - Recurring weekly (pick day of week + number of weeks ahead)
  - Per-club or applies to all clubs
- When a match is created: system checks unavailability records and auto-marks those members as UNAVAILABLE
- Member can still override and mark available for a specific match

### 7. Match Fee
- If match has a fee:
  - Fee section shown on match detail screen
  - Member taps "Mark as Paid" (self-reporting, no processing, one-way)
  - Daily WhatsApp reminder sent to all CONFIRMED members who haven't marked paid
  - Reminders stop once marked paid or match is cancelled/closed

### 8. Notifications (WhatsApp)
- All sends go through abstract `NotificationService` with pluggable provider
- MATCH_CREATED / MATCH_CANCELLED: async via SQS queue
- WAITLIST_CONFIRMED: immediate (synchronous)
- FEE_REMINDER / MATCH_REMINDER_24H: EventBridge cron → SQS → worker Lambda

### 9. Guests
- Admin/Captain adds a guest to a specific match
- System creates stub user profile (phone + name) if not found
- Guest automatically gets ClubMembership (role: MEMBER, status: ACTIVE)
- Guest added as CONFIRMED if capacity available, else WAITLISTED

### 10. Multi-club
- Users see a club switcher on home screen
- Each club context is independent (roles, houses, matches)

---

## API Design (Next.js API Routes)

### Auth Middleware

Every route except `/api/auth/*` requires `Authorization: Bearer <accessToken>`.

```
withAuth            → verifies JWT, attaches req.user
withClubAdmin       → verifies ClubMembership.role = ADMIN for :clubId
withMatchAccess     → verifies user is a member of the match's club
withCaptainOrAdmin  → verifies MatchCaptain OR ClubMembership.role = ADMIN
```

### Standard Error Format

```json
{
  "error": {
    "code": "MATCH_FULL",
    "message": "Match is at capacity. You have been added to the waitlist.",
    "details": {}
  }
}
```

| HTTP | Error Code | Meaning |
|---|---|---|
| 400 | VALIDATION_ERROR | Invalid request body |
| 401 | UNAUTHORIZED | Missing/invalid token |
| 403 | FORBIDDEN | Insufficient role |
| 404 | NOT_FOUND | Resource not found |
| 409 | ALREADY_EXISTS | e.g. already a member |
| 422 | UNPROCESSABLE | e.g. reduce capacity below confirmed count |
| 429 | RATE_LIMITED | OTP too many attempts |

---

### Auth Endpoints

```
POST /api/auth/send-otp
  Body:     { phone: "+919876543210" }
  Response: { message: "OTP sent", expiresIn: 300 }
  Errors:   429 rate limit, 400 invalid phone format

POST /api/auth/verify-otp
  Body:     { phone: "+919876543210", otp: "123456" }
  Response: { accessToken, refreshToken, user: { id, name, phone, isStub } }
  Errors:   401 invalid OTP, 410 OTP expired
  Note:     If isStub=true, client prompts user to complete profile

POST /api/auth/refresh
  Body:     { refreshToken }
  Response: { accessToken }
```

### User Endpoints

```
GET  /api/users/me
  Response: { user: User }

PATCH /api/users/me
  Body:     { name?, profilePhotoUrl? }
  Response: { user: User }
```

### Club Endpoints

```
GET /api/clubs
  Response: { clubs: Array<Club & { myRole: ClubRole, memberCount: number }> }

POST /api/clubs
  Body:     { name, sportTypeId, description?, logoUrl? }
  Response: { club: Club }
  Side effect: creator gets ClubMembership(role=ADMIN)

GET /api/clubs/:id
  Response: { club: Club, sportType: SportType, myMembership: ClubMembership,
              activeSeason: Season | null, memberCount: number }

PATCH /api/clubs/:id                        [withClubAdmin]
  Body:     Partial<{ name, description, logoUrl }>
  Response: { club: Club }
```

### Members Endpoints

```
GET /api/clubs/:id/members                  [withClubAdmin]
  Query:    ?status=ACTIVE&role=MEMBER&page=1&limit=50&search=
  Response: { members: Array<ClubMembership & { user: User, house: House | null }>, total: number }

POST /api/clubs/:id/members                 [withClubAdmin]
  Body:     { phone, name, houseId?: string }
  Response: { membership: ClubMembership, user: User, isNew: boolean }
  Note:     isNew=true if stub profile was created
            houseId (optional) assigns member to that house in the active season
            Creates/upserts HouseMembership if houseId provided and active season exists

POST /api/clubs/:id/members/import          [withClubAdmin]
  Body:     multipart/form-data: { file: CSV|XLSX }
  Required columns: name, phone
  Response: { imported: number, existing: number,
              errors: Array<{ row: number, phone: string, reason: string }>, total: number }
  Note:     Sync for <= 200 rows; larger files return jobId for polling

GET /api/clubs/:id/members/import/:jobId    [withClubAdmin]
  Response: { status: "pending"|"done", result: ImportResult | null }

PATCH /api/clubs/:id/members/:userId        [withClubAdmin]
  Body:     { role?: ClubRole, status?: MembershipStatus }
  Response: { membership: ClubMembership }

PATCH /api/clubs/:id/members/:userId        [withClubAdmin]
  Body:     { role?: ClubRole, status?: MembershipStatus }
  Response: { membership: ClubMembership }

DELETE /api/clubs/:id/members/:userId       [withClubAdmin]
  Response: 204 No Content

POST /api/clubs/:id/members/bulk-houses     [withClubAdmin]
  Body:     { seasonId: string, assignments: Array<{ userId: string, houseId: string }> }
  Response: { updated: number }
  Note:     Upserts HouseMembership for each assignment in bulk
            Validates seasonId belongs to club; validates each houseId and userId
```

### Houses & Seasons

```
GET  /api/clubs/:id/houses
  Response: { houses: House[] }

POST /api/clubs/:id/houses                  [withClubAdmin]
  Body:     { name, color?, logoUrl? }
  Response: { house: House }

PATCH /api/clubs/:id/houses/:houseId        [withClubAdmin]
  Body:     Partial<{ name, color, logoUrl }>
  Response: { house: House }

DELETE /api/clubs/:id/houses/:houseId       [withClubAdmin]
  Response: 204
  Error:    422 if house is referenced by future matches

GET  /api/clubs/:id/seasons
  Response: { seasons: Season[] }

POST /api/clubs/:id/seasons                 [withClubAdmin]
  Body:     { name, startDate, endDate? }
  Response: { season: Season }

PATCH /api/clubs/:id/seasons/:seasonId      [withClubAdmin]
  Body:     Partial<{ name, startDate, endDate, isActive, isEnded }>
  Note:     Setting isEnded=true permanently marks season as ended
            isActive is computed lazily via syncSeasonStatuses() on GET; not directly settable
  Response: { season: Season }

POST /api/clubs/:id/seasons/:seasonId/house-memberships   [withClubAdmin]
  Body:     { userId, houseId }
  Response: { houseMembership: HouseMembership }
  Note:     Upsert — replaces existing house assignment for (userId, seasonId)
```

### Sport Types

```
GET /api/sport-types
  Response: { sportTypes: Array<SportType & { parameters: SportParameter[] }> }
```

### Match Endpoints

```
GET /api/clubs/:id/matches
  Query:    ?status=OPEN&from=ISO&to=ISO&seasonId=&page=1&limit=20
  Note:     ?seasonId= filters to that season, sorted date DESC (for season match list view)
            Normal feed (no seasonId) sorts date ASC, skips past matches
  Response: { matches: Array<MatchSummary>, total: number }
  MatchSummary: { id, title, date, venue, status, capacity, confirmedCount,
                  waitlistedCount, myStatus: AvailabilityStatus | null,
                  hasFeeDue: boolean, houses: House[] }

POST /api/clubs/:id/matches                 [withClubAdmin]
  Body: {
    title: string
    date: ISO8601
    venue: string
    capacity: number
    waitlistSize: number
    feeAmount?: number
    feeCurrency?: string  // default "INR"
    houseIds: [string, string]  // exactly 2, must be distinct, must belong to club
    seasonId?: string           // optional link to a season
    parameters: Array<{ key: string, value: string, sportParamId?: string, isCustom?: boolean }>
  }
  Response: { match: Match }
  Side effects:
    - WhatsApp MATCH_CREATED enqueued to SQS for all ACTIVE members
    - UserUnavailability checked -> auto-mark unavailable for matching members

GET /api/matches/:id                        [withMatchAccess]
  Response: {
    match: Match & { seasonId: string | null },
    parameters: MatchParameter[],
    houses: House[],
    availability: {
      confirmed: Array<{ user: User, respondedAt, house: { id, name, color, logoUrl } | null, hasPaid: boolean }>,
      waitlisted: Array<{ user: User, position, respondedAt, house: { id, name, color, logoUrl } | null, hasPaid: boolean }>,
      unavailable: Array<{ user: User }>,
      dropped: Array<{ user: User }>
    },
    myStatus: AvailabilityStatus | null,
    fee: { amount, currency, myMarkedPaid } | null,
    captains: User[]
  }
  Note: house per player resolved via HouseMembership for match's seasonId

PATCH /api/matches/:id                      [withClubAdmin]
  Body:     Partial<{ title, venue, date: ISO8601, capacity, waitlistSize, feeAmount, status }>
  Errors:   422 if match is CLOSED
            422 if reducing capacity below current confirmed count
  Response: { match: Match }

DELETE /api/matches/:id                     [withClubAdmin]
  Note:     Sets status=CANCELLED, enqueues MATCH_CANCELLED to SQS
  Response: 204
```

### Availability Endpoints

```
POST /api/matches/:id/availability          [withMatchAccess — self only]
  Body:     { status: "AVAILABLE" | "UNAVAILABLE" }
  Note:     Use POST for ALL self-availability changes (handles all status transitions correctly)
  Logic:
    AVAILABLE ->
      Already CONFIRMED/WAITLISTED -> no-op (idempotent)
      confirmed count < capacity   -> CONFIRMED, create MatchFeePayment if fee
      waitlisted count < waitlistSize -> WAITLISTED with next position
      else -> 422 MATCH_FULL
    UNAVAILABLE ->
      If held CONFIRMED/WAITLISTED slot:
        -> releaseSlot() (delete fee payment, promote next waitlisted if was CONFIRMED, shift positions)
        -> status = UNAVAILABLE
      If no slot AND match fully booked (confirmed >= capacity AND waitlisted >= waitlistSize):
        -> 422 (cannot mark unavailable when match is full)
      else -> store/update as UNAVAILABLE
  Response: { availability: MatchAvailability }

PATCH /api/matches/:id/availability         [withMatchAccess — self for DROPPED, Captain/Admin for others]
  Body:     { status: "DROPPED" | "UNAVAILABLE" | "CONFIRMED" }
  Query:    ?userId= (for captain/admin updating others)
  Logic:
    DROPPED/UNAVAILABLE ->
      If held CONFIRMED/WAITLISTED slot -> releaseSlot() (promotes waitlist, sends WhatsApp)
      else -> update status directly
    CONFIRMED (admin only) ->
      Manually confirm a player; shifts waitlist positions if they were WAITLISTED
      Creates MatchFeePayment if match has fee
  Response: { availability: MatchAvailability, newlyConfirmed: User | null }
```

### Fee Endpoints

```
GET /api/matches/:id/fees                   [withMatchAccess]
  Note:     Members see own row only; Admin/Captain see all
  Response: { payments: Array<{ user, markedPaid, markedAt }>,
              summary: { total, paid, unpaid } | null }

PATCH /api/matches/:id/fees/me              [withMatchAccess]
  Body:     { markedPaid: true }
  Note:     One-way — cannot unmark (contact admin if error)
  Response: { payment: MatchFeePayment }
```

### Guests & Captains

```
POST /api/matches/:id/guests                [withCaptainOrAdmin]
  Body:     { phone, name }
  Logic:    lookup by phone -> create stub if not found -> ensure ClubMembership ->
            MatchAvailability CONFIRMED or WAITLISTED
  Response: { user, membership, availability, isNew }

POST /api/matches/:id/captains              [withClubAdmin]
  Body:     { userId }
  Note:     User must be CONFIRMED for the match
  Response: { captain: MatchCaptain }

DELETE /api/matches/:id/captains/:userId    [withClubAdmin]
  Response: 204
```

### Unavailability Endpoints

```
GET /api/users/me/unavailability
  Query:    ?clubId=
  Response: { rules: UserUnavailability[] }

POST /api/users/me/unavailability
  Body: {
    clubId?: string
    type: "SPECIFIC_DATE" | "RECURRING_WEEKLY"
    date?: ISO8601              // SPECIFIC_DATE only
    dayOfWeek?: number          // 0-6, RECURRING_WEEKLY only
    startFrom?: ISO8601         // RECURRING_WEEKLY only
    weeksAhead?: number         // default 4
  }
  Response: { rule: UserUnavailability }

DELETE /api/users/me/unavailability/:id
  Response: 204
```

---

## Notification Flows

### Provider Abstraction

```typescript
// packages/notifications/src/whatsapp.ts
interface WhatsAppProvider {
  sendTemplate(phone: string, templateName: string, params: Record<string, string>): Promise<{ messageId: string }>
}

class MetaCloudProvider implements WhatsAppProvider { ... }
class TwilioProvider    implements WhatsAppProvider { ... }

export function createWhatsAppProvider(): WhatsAppProvider {
  return process.env.WHATSAPP_PROVIDER === 'twilio' ? new TwilioProvider() : new MetaCloudProvider()
}
```

All sends go through `NotificationService` which calls the provider, writes NotificationLog, marks `status = failed` on error without throwing.

### Notification Triggers

| Type | Trigger | Recipients | Delivery |
|---|---|---|---|
| `MATCH_CREATED` | Match saved | All ACTIVE club members | SQS async |
| `WAITLIST_CONFIRMED` | Player drops → next confirmed | Newly confirmed member | Immediate |
| `MATCH_CANCELLED` | Status → CANCELLED | All CONFIRMED + WAITLISTED | SQS async |
| `MATCH_REMINDER_24H` | EventBridge daily 08:00 IST | CONFIRMED members for next-24h matches | Cron |
| `FEE_REMINDER` | EventBridge daily 09:00 IST | CONFIRMED with `markedPaid = false` | Cron |

### WhatsApp Message Templates

> All templates must be pre-registered in WhatsApp Business API dashboard before going live.

**`club_connect_match_created`**
```
New match scheduled!

Club: {{1}}
Date: {{2}} at {{3}}
Venue: {{4}}
Teams: {{5}}
{{6}}

Open the app to mark your availability.
```
Params: club_name, date, time, venue, "House A vs House B", fee_line ("Fee: Rs200" or "")

**`club_connect_waitlist_confirmed`**
```
You're IN!

A spot has opened for the {{1}} match on {{2}} at {{3}}.
{{4}}

See you on the field!
```
Params: club_name, date, time, fee_reminder_line

**`club_connect_match_cancelled`**
```
Match Cancelled

The {{1}} match on {{2}} at {{3}} ({{4}}) has been cancelled.
Check the app for updates.
```
Params: club_name, date, time, venue

**`club_connect_match_reminder`**
```
Match tomorrow!

{{1}} | {{2}} at {{3}}
Venue: {{4}}
{{5}}
```
Params: club_name, date, time, venue, fee_status_line

**`club_connect_fee_reminder`**
```
Match fee reminder

Club: {{1}}
Match: {{2}} at {{3}}
Fee due: {{4}}

Please pay and mark as paid in the app.
```
Params: club_name, date, time, fee_with_currency

### SQS Queue Design

```
club-connect-notifications-{env}  (visibility timeout 60s)
  Redrive after 3 failures ->
  club-connect-notifications-dlq-{env}  (retention 14 days)
```

Message schema: `{ type, payload: { userId, phone, templateName, params } }`

Worker Lambda: batch size 10, max concurrency 5, uses `batchItemFailures` for per-message retries.

### Cron Job Queries

**Fee Reminder (09:00 IST daily):**
```sql
SELECT mfp.userId, u.phone, m.date, m.feeAmount, m.feeCurrency, c.name
FROM MatchFeePayment mfp
JOIN Match m ON mfp.matchId = m.id
JOIN User u ON mfp.userId = u.id
JOIN Club c ON m.clubId = c.id
WHERE mfp.markedPaid = false AND m.status = 'OPEN' AND m.date > NOW()
```

**Dedup check before send:**
```sql
SELECT 1 FROM NotificationLog
WHERE userId = :userId AND type = 'FEE_REMINDER'
  AND referenceId = :matchId AND sentAt > NOW() - INTERVAL '24 hours'
```

**Match Reminder (08:00 IST daily):**
```sql
SELECT DISTINCT ma.userId, u.phone, m.*, c.name, mfp.markedPaid
FROM MatchAvailability ma
JOIN Match m ON ma.matchId = m.id
JOIN User u ON ma.userId = u.id
JOIN Club c ON m.clubId = c.id
LEFT JOIN MatchFeePayment mfp ON mfp.matchId = m.id AND mfp.userId = ma.userId
WHERE ma.status = 'CONFIRMED' AND m.status = 'OPEN'
  AND m.date BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
```

### Failure Handling

| Scenario | Handling |
|---|---|
| WhatsApp API down | Job retried 3x (SQS redrive). Marked `failed` after 3. Cron retries next day. |
| Member has no WhatsApp | Log as failed, do not block match creation |
| Member opts out | `ClubMembership.notificationsEnabled = false`, filtered before sends |
| Duplicate fee reminder | NotificationLog dedup prevents double-sending within 24h |

---

## Mobile Screen Flows (React Native + Expo)

### Navigation Structure

```
RootNavigator (Stack)
├── AuthStack
│   ├── PhoneEntryScreen              (/(auth)/phone)
│   ├── OTPVerifyScreen               (/(auth)/otp)
│   └── ProfileSetupScreen            (/(auth)/profile) <- stub users on first login
│
└── AppStack (BottomTabNavigator)
    ├── Tab: Home                     (/(app)/) <- match feed for current club
    ├── Tab: Availability             (/(app)/availability)
    ├── Tab: Profile                  (/(app)/my-profile)
    ├── Stack Group: club/            (/(app)/club/) <- href: null, hidden from tab bar
    │   ├── management                <- ClubManagementHome
    │   ├── members                   <- MemberListScreen
    │   ├── add-member
    │   ├── import                    <- BulkImportScreen
    │   ├── houses
    │   ├── seasons
    │   ├── season-matches            <- matches for a specific season (sorted desc)
    │   ├── bulk-houses               <- bulk assign members to houses
    │   ├── settings
    │   ├── profile                   <- club profile view
    │   └── create                    <- create new club
    └── Stack Group: match/           (/(app)/match/) <- href: null, hidden from tab bar
        ├── [id]                      <- match detail
        ├── create                    <- create match (admin)
        └── edit                      <- edit match details (admin)
```

Note: `app/(app)/club/_layout.tsx` and `app/(app)/match/_layout.tsx` are Stack navigators,
registered in the parent tabs `_layout.tsx` with `href: null` so they don't appear in the tab bar.
Back navigation within each Stack group works correctly (goes back within the stack, not to home).

### Auth Flow

```
PhoneEntryScreen
  -> phone input (country code picker, default +91)
  -> OTPVerifyScreen (6-digit, auto-submit, 30s resend timer)
     -> new/stub user: ProfileSetupScreen (name required, photo optional)
     -> existing user: Home
```

### Home Tab

```
HomeScreen
  Header: [Club name chip -> ClubSwitcherSheet] [Gear icon (admin)]
  Match list (date ASC, upcoming only):
    MatchCard: date/time/venue, houses, confirmed N/capacity, my status badge, fee indicator
    -> MatchDetailScreen
  Admin FAB (+) -> CreateMatchScreen

ClubSwitcherSheet (bottom sheet):
  List of clubs (name + role badge)
  "+ Create a new club" button
```

### Match Detail Screen

```
MatchDetailScreen
  Header: title + status chip (OPEN / CLOSED="Completed" / CANCELLED)
  Admin header menu (•••): Edit Match | Mark Complete | Cancel Match
  Admin quick actions bar (if OPEN): [Edit] [Mark Complete] buttons
  Info: date/time, venue, houses (Team A vs Team B)
  Parameters (collapsible): key-value chips
  My Availability card:
    [Mark Available] [Mark Unavailable] toggles (POST-based)
    If CONFIRMED: "You're confirmed"
    If WAITLISTED: "You're #N on the waitlist"
    If CONFIRMED/WAITLISTED: "Drop Out" button (confirmation dialog, uses PATCH DROPPED)
    Disabled if match CLOSED/CANCELLED
  Fee card (if match has fee):
    Amount shown, [Mark as Paid] button -> read-only [Paid] after marking
  Players section (tabs): Confirmed (N) | Waitlisted (N) | Unavailable (N)
    Confirmed: avatar + name + HouseDot (colored dot/initial) + captain badge + fee icon (✓ paid / ○ unpaid)
    Waitlisted: avatar + name + position number + HouseDot + fee icon
    Unavailable: name only
```

### Create Match Screen (Admin)

```
CreateMatchScreen
  Title, Date (picker), Time (picker), Venue
  Team A / Team B two-column selector (must pick 2 distinct houses)
  Season chip selector (non-ended seasons; active season pre-selected)
  Capacity + Waitlist size (steppers)
  Sport parameters (predefined dropdowns)
  Custom parameters (key-value rows, + Add button)
  Match fee toggle -> amount input + currency selector
  "Create Match" -> POST /api/clubs/:id/matches
```

### Edit Match Screen (Admin)

```
EditMatchScreen (/(app)/match/edit)
  Receives match data via router params
  Editable: title, venue, date (picker), time (picker), capacity, waitlist size, fee toggle + amount
  Save -> PATCH /api/matches/:id
  Blocked (no-op): if match is CLOSED
```

### Availability Tab

```
AvailabilityScreen
  "My Upcoming Matches": CONFIRMED/WAITLISTED match cards + fee status
  "Advance Unavailability":
    Tab: Specific Dates -> calendar multi-select + per-club toggle
    Tab: Recurring Weekly -> day-of-week chips + weeks ahead stepper + start date + per-club toggle
```

### Profile Tab

```
MyProfileScreen
  Avatar (tappable), Name (editable), Phone (read-only)
  My Clubs list: name + role + Leave option
  Sign Out
```

### Club Management Stack (Admin)

```
ClubManagementHome -> Members | Houses | Seasons | Club Settings

MemberListScreen: search, filter (ACTIVE/ALL/INVITED/SUSPENDED)
  Tap member (•••) -> Alert: Change Role | Remove from Club
  Footer: [Bulk Import Members] [Assign Houses in Bulk]

AddMemberScreen:
  Phone + name inputs
  Optional preferred house chip selector (None + each house with color dot)
  -> POST /api/clubs/:id/members (with optional houseId)

BulkImportScreen:
  Download template (CSV/Excel)
  File picker -> preview 5 rows -> Import
  Result: X imported, Y existing, Z errors (with row details)

HouseManagementScreen:
  Color swatch + name list; tap to edit (name, color, logoUrl), swipe to delete

SeasonManagementScreen:
  List of seasons with Active (green) / Ended (red) badges
  Create form: name, start date, optional end date
  Per season: tap to view matches (-> SeasonMatchesScreen) | "Mark Ended" button
  -> PATCH /api/clubs/:id/seasons/:id { isEnded: true }

SeasonMatchesScreen (/(app)/club/season-matches):
  Receives { seasonId, seasonName } params
  Shows match cards sorted latest first
  Each card: status badge, date, venue, houses, confirmed count, my-status badge
  Taps through to match detail

BulkHousesScreen (/(app)/club/bulk-houses):
  Loads members (active, limit 200), houses, seasons
  Warning banner if no active season
  House color legend at top
  Per member: avatar + name + round house-initial chips (tap to assign/clear)
  Save -> POST /api/clubs/:id/members/bulk-houses { seasonId, assignments }

ClubSettingsScreen: name, description, logo
```

### Key UX Decisions

| Decision | Choice |
|---|---|
| Club context | Club name pill in header; tap to switch |
| Admin entry | Gear icon in Home header (admin only) |
| Quick availability | Togglable on match card AND in detail (POST-based) |
| Drop-out confirmation | Dialog: next waitlisted player will be notified |
| Fee marking | One-tap, no undo |
| Waitlist position | Shown prominently: "#3 on waitlist" |
| Stub first login | ProfileSetupScreen between OTP and Home |
| Captain label | "C" badge next to name in player lists |
| House display per player | Colored dot (HouseDot component) + house initial, resolved from HouseMembership |
| Fee payment display per player | Green checkmark (paid) or gray circle (unpaid) icon in player list |
| Match complete | Admin taps "Mark Complete" → CLOSED; shown as "Completed" badge; all actions disabled |
| Season matches view | Tap season → SeasonMatchesScreen sorted desc; shows all statuses including cancelled |
| Team selection | Two-column Team A / Team B selector; validation prevents same house on both sides |
| Bulk house assignment | Round house-initial chips per member row; tap to select/deselect |

---

## Infrastructure & Deployment

### AWS Serverless Architecture (ap-south-1 / Mumbai)

```
Mobile App (Expo)
      | HTTPS
      v
API Gateway HTTP API  (aws_apigatewayv2_api)
      | Lambda proxy
      v
api-lambda: Next.js + Lambda Web Adapter  <- ECR container image
      |                      |
  Supabase client         SQS send
      v                      v
  Supabase PostgreSQL    SQS notification-queue
  + Storage (free)              |  batch 10
                                v
                          worker-lambda (SQS consumer)
                                ^ sends WhatsApp

EventBridge Scheduler:
  fee-reminder   (daily 09:00 IST) -> worker-lambda { job: "fee_reminder" }
  match-reminder (daily 08:00 IST) -> worker-lambda { job: "match_reminder" }
```

### Services

| Service | Provider | Notes |
|---|---|---|
| API runtime | AWS Lambda | Lambda Web Adapter + Next.js ECR container |
| API routing | AWS API Gateway HTTP API | Catch-all proxy to Lambda |
| Container registry | AWS ECR | Next.js Docker images |
| Background jobs | AWS SQS + Lambda | Lambda triggered by SQS |
| Cron jobs | AWS EventBridge Scheduler | Fee + match reminders |
| Database | Supabase PostgreSQL | Free tier, PgBouncer pooler |
| File storage | Supabase Storage | Free tier (1GB) |
| Secrets | AWS Secrets Manager | Single JSON secret per env |
| OTP | Twilio Verify | Phone OTP |
| Mobile builds | Expo EAS | iOS + Android, OTA updates |
| Error tracking | Sentry | Expo SDK + Next.js SDK |
| Terraform state | AWS S3 + DynamoDB | Remote state backend |

### Lambda Web Adapter (Dockerfile)

```dockerfile
FROM public.ecr.aws/docker/library/node:20-slim AS builder
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM public.ecr.aws/docker/library/node:20-slim
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 \
     /lambda-adapter /opt/extensions/lambda-adapter
ENV PORT=3000
ENV AWS_LWA_PORT=3000
WORKDIR /app
COPY --from=builder /app/.next .next
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/package.json .
CMD ["node_modules/.bin/next", "start"]
```

### Supabase Connection Strings

```
DATABASE_URL  = postgresql://...@pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL    = postgresql://...@db.supabase.com:5432/postgres
```

Lambda uses pooler URL; Prisma migrations use direct URL.

### Monorepo Structure

```
club-connect/
├── apps/
│   ├── api/
│   │   ├── src/app/api/           # Next.js route handlers
│   │   ├── src/middleware/        # withAuth, withClubAdmin, etc.
│   │   ├── src/lib/               # Prisma client, SQS client
│   │   ├── src/worker/
│   │   │   ├── handler.ts         # sqsHandler + eventBridgeHandler exports
│   │   │   └── jobs/              # fee-reminder.ts, match-reminder.ts
│   │   └── Dockerfile
│   └── mobile/
│       ├── src/screens/
│       ├── src/components/
│       ├── src/navigation/
│       ├── src/hooks/
│       ├── src/api/               # Typed fetch client
│       ├── app.json
│       └── eas.json
├── packages/
│   ├── db/                        # Prisma schema + migrations
│   ├── types/                     # Shared TypeScript DTOs
│   └── notifications/             # WhatsApp provider abstraction
├── infrastructure/
│   ├── terraform/modules/
│   │   ├── api-lambda/            # ECR + Lambda + IAM
│   │   ├── worker-lambda/         # Lambda + SQS trigger + EventBridge
│   │   ├── sqs/                   # Queue + DLQ
│   │   ├── api-gateway/           # HTTP API + routes
│   │   └── eventbridge/           # Scheduler rules
│   └── terragrunt/
│       ├── terragrunt.hcl         # Root: S3 backend, provider, common vars
│       ├── _env/staging.hcl
│       ├── _env/production.hcl
│       ├── staging/{sqs,api-lambda,worker-lambda,api-gateway,eventbridge}/terragrunt.hcl
│       └── production/...
├── turbo.json
└── package.json
```

### Key Terraform Modules

**`modules/sqs/main.tf`**
```hcl
resource "aws_sqs_queue" "dlq" {
  name                      = "${var.app_name}-notifications-dlq-${var.env}"
  message_retention_seconds = 1209600
}
resource "aws_sqs_queue" "main" {
  name                       = "${var.app_name}-notifications-${var.env}"
  visibility_timeout_seconds = 60
  redrive_policy = jsonencode({ deadLetterTargetArn = aws_sqs_queue.dlq.arn, maxReceiveCount = 3 })
}
output "queue_arn" { value = aws_sqs_queue.main.arn }
output "queue_url" { value = aws_sqs_queue.main.url }
```

**`modules/api-lambda/main.tf`**
```hcl
resource "aws_ecr_repository" "api" { name = "${var.app_name}-api-${var.env}" }
resource "aws_iam_role" "api_lambda" { name = "${var.app_name}-api-lambda-${var.env}", assume_role_policy = data.aws_iam_policy_document.lambda_assume.json }
resource "aws_lambda_function" "api" {
  function_name = "${var.app_name}-api-${var.env}"
  role          = aws_iam_role.api_lambda.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
  timeout       = 30
  memory_size   = 512
  environment { variables = { AWS_SECRETS_ARN = var.secrets_arn, SQS_QUEUE_URL = var.sqs_queue_url, NODE_ENV = var.env } }
}
output "lambda_arn"        { value = aws_lambda_function.api.arn }
output "lambda_invoke_arn" { value = aws_lambda_function.api.invoke_arn }
```

**`modules/api-gateway/main.tf`**
```hcl
resource "aws_apigatewayv2_api" "main" { name = "${var.app_name}-${var.env}", protocol_type = "HTTP" }
resource "aws_apigatewayv2_integration" "lambda" {
  api_id = aws_apigatewayv2_api.main.id, integration_type = "AWS_PROXY"
  integration_uri = var.lambda_invoke_arn, payload_format_version = "2.0"
}
resource "aws_apigatewayv2_route" "catch_all" { api_id = aws_apigatewayv2_api.main.id, route_key = "$default", target = "integrations/${aws_apigatewayv2_integration.lambda.id}" }
resource "aws_apigatewayv2_stage" "default" { api_id = aws_apigatewayv2_api.main.id, name = "$default", auto_deploy = true }
resource "aws_lambda_permission" "api_gw" { action = "lambda:InvokeFunction", function_name = var.lambda_function_name, principal = "apigateway.amazonaws.com", source_arn = "${aws_apigatewayv2_api.main.execution_arn}/*/*" }
output "api_endpoint" { value = aws_apigatewayv2_stage.default.invoke_url }
```

**`modules/worker-lambda/main.tf`**
```hcl
resource "aws_lambda_function" "worker" {
  function_name = "${var.app_name}-worker-${var.env}"
  role = aws_iam_role.worker_lambda.arn, package_type = "Image"
  image_uri = "${var.ecr_repository_url}:${var.image_tag}", timeout = 120, memory_size = 256
  image_config { command = ["dist/worker/handler.sqsHandler"] }
}
resource "aws_lambda_event_source_mapping" "sqs" {
  event_source_arn = var.sqs_queue_arn, function_name = aws_lambda_function.worker.arn
  batch_size = 10, function_response_types = ["ReportBatchItemFailures"]
  scaling_config { maximum_concurrency = 5 }
}
```

**`modules/eventbridge/main.tf`**
```hcl
resource "aws_scheduler_schedule" "fee_reminder" {
  name = "${var.app_name}-fee-reminder-${var.env}"
  schedule_expression = "cron(30 3 * * ? *)"   # 09:00 IST
  schedule_expression_timezone = "Asia/Kolkata"
  flexible_time_window { mode = "OFF" }
  target { arn = var.worker_lambda_arn, role_arn = aws_iam_role.scheduler.arn, input = jsonencode({ job = "fee_reminder" }) }
}
resource "aws_scheduler_schedule" "match_reminder" {
  name = "${var.app_name}-match-reminder-${var.env}"
  schedule_expression = "cron(30 2 * * ? *)"   # 08:00 IST
  schedule_expression_timezone = "Asia/Kolkata"
  flexible_time_window { mode = "OFF" }
  target { arn = var.worker_lambda_arn, role_arn = aws_iam_role.scheduler.arn, input = jsonencode({ job = "match_reminder" }) }
}
```

**Root `terragrunt/terragrunt.hcl`**
```hcl
remote_state {
  backend = "s3"
  config = { bucket = "club-connect-tf-state", key = "${path_relative_to_include()}/terraform.tfstate", region = "ap-south-1", encrypt = true, dynamodb_table = "club-connect-tf-locks" }
}
inputs = { app_name = "club-connect", aws_region = "ap-south-1" }
```

### Secrets (AWS Secrets Manager, one JSON per env)

```json
{
  "JWT_SECRET": "...", "JWT_REFRESH_SECRET": "...",
  "SUPABASE_DB_URL": "postgresql://...@pooler...",
  "SUPABASE_DIRECT_URL": "postgresql://...@db...",
  "SUPABASE_SERVICE_KEY": "...",
  "TWILIO_ACCOUNT_SID": "...", "TWILIO_AUTH_TOKEN": "...", "TWILIO_VERIFY_SERVICE_SID": "...",
  "WHATSAPP_PROVIDER": "meta", "META_WHATSAPP_TOKEN": "...", "META_PHONE_NUMBER_ID": "...",
  "SENTRY_DSN": "..."
}
```

Lambda fetches and caches on cold start via `@aws-sdk/client-secrets-manager`.

### CI/CD (GitHub Actions)

```
On PR:          lint + typecheck + unit tests + terraform validate
On merge main:  Docker build -> ECR (staging) -> terragrunt apply (staging) -> prisma migrate -> EAS Update (staging OTA)
On tag vX.Y.Z:  Docker build -> ECR (prod) -> terragrunt apply (prod) -> prisma migrate -> EAS Build + Submit (stores)
```

### Expo EAS Config

```json
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "staging":     { "distribution": "internal", "channel": "staging" },
    "production":  { "distribution": "store",    "channel": "production" }
  }
}
```

---

## Milestones

| # | Milestone | Includes |
|---|---|---|
| 1 | Foundation | Monorepo setup, Prisma schema, Auth (OTP), User profile |
| 2 | Club & Members | Club CRUD, member add, bulk import, houses, seasons |
| 3 | Matches | Match creation with parameters, match listing |
| 4 | Availability | Mark available/unavailable, waitlist auto-confirm, drop-out flow |
| 5 | Notifications | Abstract WhatsApp service, SQS queue, match created + waitlist + reminders |
| 6 | Fees | Fee marking, daily fee reminders via cron |
| 7 | Advance Unavailability | Date picker, recurring weekly, auto-apply on match creation |
| 8 | Captain & Guests | Captain role, guest add + auto-membership |
| 9 | Infrastructure | Terraform modules, Terragrunt envs, CI/CD pipeline (see `plans/ci_cd_plan.md`) |
| 10 | Polish | Push notifications, edge cases, performance, app store prep |

---

## Verification Plan

- **Auth**: OTP flow works on real device with a real phone number; stub user sees ProfileSetupScreen
- **Club creation**: Create club -> verify sport parameters load -> add member -> verify ClubMembership row in Supabase
- **Bulk import**: Upload CSV with mix of existing + new phones -> existing users linked, new stubs created with `isStub=true`
- **Match flow**: Create match -> verify SQS message enqueued -> worker sends WhatsApp -> mark availability -> confirm count updates
- **Waitlist**: Fill match to capacity -> next availability request -> WAITLISTED status -> drop a confirmed player -> auto-confirm + WhatsApp sent
- **Fee reminders**: Create match with fee -> mark some paid -> trigger cron manually -> verify only unpaid members receive reminder, dedup prevents duplicate
- **Advance unavailability**: Mark unavailable recurring Sunday -> create a Sunday match -> verify auto-marked UNAVAILABLE in MatchAvailability
- **Multi-club**: Join 2 clubs -> switch between them -> verify independent match feeds and roles
- **Infra**: `terragrunt plan` on staging shows no unexpected changes; Lambda cold start under 3s; SQS DLQ is empty after normal operations

---

## Implementation Notes & Bug Fixes

### Expo SDK
- Project uses **Expo SDK 54** (upgraded from 51). Run `npx expo install --fix` twice after changing the `expo` version — first pass resolves against cached SDK 51 manifests, second pass resolves correctly against SDK 54.
- `eas.json` CLI version must be `>= 16.0.0` for SDK 54.
- Removed deprecated `fallbackToCacheTimeout` from `app.json`.

### Next.js Config
- Next.js 14 does **not** support `next.config.ts`. Use `next.config.mjs` (ES module) instead.

### Prisma in Monorepo
- Prisma CLI running from `packages/db/` only reads `.env` in that directory, not `apps/api/.env.local`.
- All `packages/db` scripts are prefixed with `dotenv -e ../../apps/api/.env.local --` using `dotenv-cli` so they pick up the correct `DATABASE_URL` and `DIRECT_URL`.

### Docker Postgres Authentication
- The password in `DATABASE_URL` must exactly match the `POSTGRES_PASSWORD` used in `docker run`. A mismatch causes Prisma error `P1000: Authentication failed`.
- If wrong password was used, recreate the container: `docker rm -f pg && docker run -d --name pg -e POSTGRES_PASSWORD=password -p 5432:5432 postgres:15`.

### OTP 400 Error (Phone URL-encoding bug)
- **Symptom**: `POST /api/auth/verify-otp 400` when submitting OTP "123456" from the mobile app.
- **Root cause**: expo-router passes URL params as a query string. The `+` in E.164 phone numbers (e.g. `+919999900001`) is the URL encoding for a space, so `useLocalSearchParams` decoded it as ` 919999900001` (leading space). When JSON-serialised, the `phone` field became malformed, failing the Zod schema (`z.string().min(7).max(16)`).
- **Fix**: Added `pendingPhone: string | null` to the Zustand auth store. `phone.tsx` calls `setPendingPhone(normalized)` before navigating, and `otp.tsx` reads `useAuthStore(s => s.pendingPhone)` — no URL params used for the phone.
- **Confirmed working**: `curl -X POST http://localhost:3000/api/auth/verify-otp -H "Content-Type: application/json" -d '{"phone":"+919999900001","otp":"123456"}'` returns 200 with tokens.

### Prisma where clause — duplicate `OR` key
- TypeScript object literals cannot have duplicate keys. When building a Prisma `where` clause with two `OR` conditions, wrap them in an `AND` array:
  ```typescript
  where: {
    AND: [
      { OR: [{ clubId }, { clubId: null }] },
      { OR: [{ type: 'SPECIFIC_DATE', ... }, { type: 'RECURRING_WEEKLY', ... }] },
    ],
  }
  ```

### Secret Scanning Hook (Rippling)
- A pre-push hook scans for secrets. Placeholder values in `.env.example` (e.g. `postgresql://postgres:password@...`) trigger false positives.
- Bypass with: `SECRET_SCAN_LOCAL=false git push ...`

### GitHub Push (SSH alias)
- Remote uses SSH alias: `git@github.com-bansalparijat:bansalparijat/club-connect.git`
- Full push command: `SECRET_SCAN_LOCAL=false git push git@github.com-bansalparijat:bansalparijat/club-connect.git main`

### Android SafeAreaView
- React Native's built-in `SafeAreaView` does **not** account for the Android status bar — headers and back buttons render behind the system UI and are invisible.
- **Fix**: Always use `SafeAreaView` from `react-native-safe-area-context` (already a dependency) in all screens that have a visible header.
- The home screen tab (`(app)/index.tsx`) and all sub-screens (club/*, match/*) have been updated.

### Android OTP Keyboard
- A `TextInput` with `width: 0, height: 0` or `opacity: 0` **does not** trigger the Android soft keyboard — the OS ignores focus events on zero-size views.
- **Fix**: Position the hidden input off-screen (`position: 'absolute', width: 1, height: 1, left: -1000`) rather than making it zero-size. Also add a 150 ms `setTimeout` before calling `.focus()` to give Android time to finish layout.

### Android autoFocus on first screen
- Adding `autoFocus` to a `TextInput` inside a `KeyboardAvoidingView + ScrollView` on Android triggers the keyboard before the layout is measured, pushing all content off-screen and making the screen appear blank.
- **Fix**: Do not use `autoFocus` on the phone entry screen. Let the user tap to focus.

### Expo Router navigation state persistence
- Expo Router persists the navigation stack across JS reloads (hot reload or Expo Go reload). If the user was on OTP screen at last close, it restores that route — but the Zustand store re-initialises fresh with `pendingPhone = null`.
- **Fix**: Add a guard in `otp.tsx`: if `!phone` on mount, call `router.replace('/(auth)/phone')` immediately.

### New User Profile Setup
- The `verify-otp` route originally created new users with `name: phone` (the phone number as their name). This made the mobile check `!data.user.name` always false, bypassing the profile setup screen.
- **Fix**: Create new users with `name: ''` (empty string). The mobile check `!data.user.name` is then `true` for new users, routing them to `ProfileSetupScreen`.

### Expo Router Tab Bar — hiding screens
- Every file inside `app/(app)/` is auto-registered as a tab screen. Sub-screens (club/create, club/profile, match/[id], etc.) must be explicitly hidden with `options={{ href: null }}` in the `_layout.tsx` Tabs config, otherwise they appear as unexpected tab bar buttons.

### Club Profile & Admins API
- `GET /api/clubs/:id` uses `withAuth` (not `withClubAdmin`), so all active club members can call it.
- Extended to include `admins[]` in the response by adding a `memberships` include filtered by `role: 'ADMIN', status: 'ACTIVE'`. No separate endpoint needed.

### last_verified_phone (AsyncStorage)
- After a successful OTP verification, the phone number is saved to AsyncStorage under key `last_verified_phone`.
- The phone entry screen reads this on mount and shows it as a "Continue as …" tappable suggestion chip.

### Expo Router Back Navigation (Nested Stack Groups)
- **Problem**: All club/match screens were flat siblings of the tab screens. Pressing back from any sub-screen went to Home instead of the previous screen.
- **Fix**: Created `app/(app)/club/_layout.tsx` and `app/(app)/match/_layout.tsx` as `<Stack>` navigators. These directories become Stack groups in Expo Router, giving proper back navigation within each group.
- In the parent tabs `_layout.tsx`, register them as `<Tabs.Screen name="club" options={{ href: null }} />` and `<Tabs.Screen name="match" options={{ href: null }} />` — replacing the 10+ individual `href: null` screens that were there before.

### Season Status (Lazy syncSeasonStatuses)
- `Season.isActive` is computed lazily via `syncSeasonStatuses(clubId)` called on every `GET /clubs/:id/seasons`.
- Logic: a season is active if `startDate <= now AND !isEnded AND (endDate IS NULL OR endDate > now)`.
- This avoids needing a cron job for season status. Admin can also manually mark ended via `PATCH /seasons/:id { isEnded: true }`.

### Prisma Client Regeneration (Monorepo)
- After adding fields to the Prisma schema and running `prisma migrate dev`, you must regenerate the client from the correct directory: `cd packages/db && npx prisma generate`.
- Running `npx prisma generate` at the repo root picks up a different Prisma version (v7) incompatible with Node 20.16 and fails silently or with version errors.

### Slot-Freeing Logic (releaseSlot helper)
- Three availability transitions all need slot-freeing: POST UNAVAILABLE (self), PATCH UNAVAILABLE (admin), PATCH DROPPED (self or admin).
- Extracted into `releaseSlot(matchId, existingAvail, targetStatus)`:
  1. Deletes MatchFeePayment for this user
  2. Updates MatchAvailability status to targetStatus, clears position
  3. If was CONFIRMED: calls `promoteNextWaitlisted()` (promotes position-1, shifts others, sends WhatsApp)
  4. If was WAITLISTED: shifts positions > existingAvail.position down by 1
