# Epic 6: Moms' Marketplace

## Context

NannyMom's marketplace allows verified mothers to buy and sell pre-loved children's items within the community. Listings support photos (uploaded to S3 via presigned URLs), categorization, keyword search, and favoriting. Transactions in v1.0 are peer-to-peer — the platform provides in-app messaging for buyer/seller negotiation but does not process payments for marketplace items. Sellers must agree to marketplace guidelines before creating their first listing, and content moderation enforces a prohibited items list.

**PRD references:** Section 6.9 (Moms' Marketplace M-11), Section 6.10 (Mother Profile & Wallet), FR-11-01 through FR-11-07, Table 15
**Architecture references:** S3 + CloudFront (photo storage), PostgreSQL (listings), Redis (cache), existing chat system (buyer/seller messaging)

---

## Prerequisites (Prisma Models)

### MRKT-01: Prisma schema — ListingCategory enum and Listing model
**As a** developer
**I want** the Prisma schema to define the `ListingCategory` enum and `Listing` model
**So that** marketplace services can persist and query item listings.

**Acceptance criteria:**
- Enum `ListingCategory { TOYS CLOTHES GEAR NURSERY STROLLERS }`
- Enum `ListingStatus { ACTIVE SOLD REMOVED }`
- `Listing` model with fields: `id` (UUID), `sellerId` (FK to User), `title` (string, max 100 chars), `description` (text, max 2000 chars), `price` (Decimal, precision 10 scale 2), `category` (ListingCategory), `status` (ListingStatus, default ACTIVE), `neighborhood` (string, auto-populated from seller profile), `guidelinesAcceptedAt` (DateTime, nullable), `createdAt`, `updatedAt`
- Index on `(status, category, createdAt)` for filtered feed queries
- Index on `sellerId` for seller history queries
- Full-text search index on `(title, description)` for keyword search
- Migration generated and applied: `pnpm db:migrate:dev`
- Prisma client generated: `pnpm db:generate`

**Unit tests:**
- Migration applies cleanly on a fresh database
- Enum values match expected set

### MRKT-02: Prisma schema — ListingPhoto model
**As a** developer
**I want** the Prisma schema to define the `ListingPhoto` model
**So that** each listing can have 1-6 associated photos stored in S3.

**Acceptance criteria:**
- `ListingPhoto` model with fields: `id` (UUID), `listingId` (FK to Listing, onDelete CASCADE), `url` (string — CloudFront URL), `s3Key` (string), `displayOrder` (integer, 0-5), `createdAt`
- Unique constraint on `(listingId, displayOrder)` to prevent duplicate ordering
- Relation: `Listing` has many `ListingPhoto` (1-6 enforced at service layer, not DB)
- Migration generated and applied

**Unit tests:**
- Photo record creation with valid listing FK
- Cascade delete removes photos when listing is deleted

### MRKT-03: Prisma schema — SavedItem model
**As a** developer
**I want** the Prisma schema to define the `SavedItem` model
**So that** mothers can favorite listings and retrieve them later.

**Acceptance criteria:**
- `SavedItem` model with fields: `id` (UUID), `userId` (FK to User), `listingId` (FK to Listing, onDelete CASCADE), `createdAt`
- Unique constraint on `(userId, listingId)` to prevent duplicate saves
- Index on `userId` for retrieving a user's saved items
- Migration generated and applied

**Unit tests:**
- SavedItem creation with valid user and listing FKs
- Unique constraint prevents duplicate saves (returns appropriate error)

---

## Shared Zod Schemas

### MRKT-04: Marketplace Zod schemas in @nanny-app/shared
**As a** developer
**I want** Zod schemas for all marketplace request/response types defined in `packages/shared`
**So that** backend validation and mobile typing share a single source of truth.

**Acceptance criteria:**
- `packages/shared/src/marketplace.ts` exports:
  - `ListingCategoryEnum` — Zod enum matching Prisma `ListingCategory`
  - `ListingStatusEnum` — Zod enum matching Prisma `ListingStatus`
  - `CreateListingSchema` — `{ title, description, price, category }` (neighborhood auto-populated server-side)
  - `UpdateListingSchema` — partial of `CreateListingSchema`
  - `ListingResponseSchema` — full listing with photos, seller summary, isSaved flag
  - `ListingFeedQuerySchema` — `{ category?, keyword?, sortBy?: "date" | "price_asc" | "price_desc", cursor?, limit? }`
  - `MarketplaceGuidelinesAcceptSchema` — `{ accepted: true }`
  - `ReportListingSchema` — `{ reason: string }` (max 500 chars)
- All types inferred with `z.infer<>` and re-exported
- Barrel export updated in `packages/shared/src/index.ts`
- `pnpm build --filter=@nanny-app/shared` succeeds

**Unit tests:**
- Valid and invalid payloads for each schema
- Price rejects negative values and values with more than 2 decimal places
- Title rejects empty strings and strings exceeding 100 chars

---

## Feature Stories

### MRKT-05: Accept marketplace guidelines (first-time seller gate)
**As a** mother creating her first listing
**I want** to review and accept the marketplace guidelines
**So that** I understand the rules before selling items.

**Acceptance criteria:**
- `POST /marketplace/guidelines/accept` (requires auth, role: MOTHER)
- Request body validated with `MarketplaceGuidelinesAcceptSchema`: `{ accepted: true }`
- Sets `guidelinesAcceptedAt` on the user's profile (or a dedicated field) to current timestamp
- Returns `200 { data: { acceptedAt } }`
- If already accepted, returns `200` with existing timestamp (idempotent)
- Subsequent listing creation checks `guidelinesAcceptedAt` is not null; returns `403 { data: null, error: "Marketplace guidelines must be accepted before listing" }` if null

**Unit tests:**
- Happy path: first-time acceptance sets timestamp
- Idempotent: second call returns existing timestamp without error
- Guidelines not accepted blocks listing creation (tested in MRKT-07)

### MRKT-06: S3 presigned URL generation for listing photos
**As a** mother creating a listing
**I want** to receive presigned S3 upload URLs for my listing photos
**So that** I can upload images directly to S3 from my device.

**Acceptance criteria:**
- `POST /marketplace/listings/upload-url` (requires auth, role: MOTHER)
- Request body: `{ contentType: "image/jpeg" | "image/png", count: 1-6 }`
- Generates `count` presigned PUT URLs with 15-minute expiry
- S3 key format: `marketplace/{userId}/{listingId}/{uuid}.{ext}`
- Accepted content types: `image/jpeg`, `image/png` only; max 5MB per file (enforced via presigned URL conditions)
- Returns `200 { data: { uploads: [{ uploadUrl, s3Key }] } }`
- Rejects `count > 6` with `400 { data: null, error: "Maximum 6 photos per listing" }`
- Rejects unsupported content types with `400`

**Unit tests:**
- URL generation for valid content type and count
- Rejection of count > 6
- Rejection of unsupported content type (e.g., `image/gif`)
- Presigned URL includes correct content-type and content-length conditions

### MRKT-07: Create listing
**As a** mother
**I want** to create a new marketplace listing with photos, title, price, and category
**So that** other mothers can discover and buy my item.

**Acceptance criteria:**
- `POST /marketplace/listings` (requires auth, role: MOTHER)
- Request body validated with `CreateListingSchema`: `{ title, description, price, category, photoKeys: string[] }` (1-6 S3 keys from MRKT-06)
- Validates `guidelinesAcceptedAt` is not null (403 if not)
- Validates `photoKeys` length is 1-6; returns `400` if outside range
- Auto-populates `neighborhood` from the seller's profile address
- Runs prohibited items keyword check against title and description (service-layer check against a configurable blocklist stored in Redis)
- Creates `Listing` record with status `ACTIVE` and associated `ListingPhoto` records
- Returns `201 { data: { listing } }` with full listing including photos
- Prohibited item match returns `400 { data: null, error: "Listing contains prohibited content" }`

**Unit tests:**
- Happy path: listing created with 3 photos, correct neighborhood auto-populated
- Rejected: 0 photos, 7 photos
- Rejected: guidelines not accepted
- Rejected: prohibited keyword in title
- Rejected: negative price

### MRKT-08: Get listing feed (2-column grid with pagination)
**As a** mother browsing the marketplace
**I want** to see listings in a paginated 2-column grid, newest first by default
**So that** I can discover items for sale.

**Acceptance criteria:**
- `GET /marketplace/listings` (requires auth)
- Query params validated with `ListingFeedQuerySchema`: `{ category?, keyword?, sortBy?, cursor?, limit? }`
- Only returns listings with status `ACTIVE`
- Default sort: `createdAt DESC` (newest first)
- Sort options: `date` (newest first), `price_asc` (lowest price), `price_desc` (highest price)
- Keyword search matches against `title` and `description` (case-insensitive, partial match via PostgreSQL `ILIKE` or full-text search)
- Category filter: exact match on `ListingCategory` enum
- Cursor-based pagination using `createdAt` + `id` composite cursor; default `limit: 20`
- Each listing in response includes: first photo URL, title, price, seller neighborhood, `isSaved` (boolean, based on authenticated user)
- Returns `200 { data: { listings }, meta: { nextCursor, hasMore } }`

**Unit tests:**
- Default feed returns newest first, only ACTIVE listings
- Category filter returns only matching category
- Keyword search matches title and description
- Sort by price ascending/descending
- Cursor pagination returns correct next page
- SOLD and REMOVED listings excluded

### MRKT-09: Get listing detail
**As a** mother
**I want** to view the full details of a listing including all photos and seller info
**So that** I can decide whether to contact the seller.

**Acceptance criteria:**
- `GET /marketplace/listings/:id` (requires auth)
- Returns full listing with: all photos (ordered by `displayOrder`), seller summary (name, avatar, neighborhood, member since), `isSaved` flag
- ACTIVE and SOLD listings are viewable (SOLD shows a "Sold" badge); REMOVED listings return `404`
- Non-existent listing returns `404 { data: null, error: "Listing not found" }`
- Returns `200 { data: { listing } }`

**Unit tests:**
- Happy path: returns listing with all photos and seller summary
- SOLD listing is viewable with sold indicator
- REMOVED listing returns 404
- Non-existent ID returns 404

### MRKT-10: Update listing
**As a** seller
**I want** to edit my listing's title, description, price, or category
**So that** I can correct mistakes or adjust the price.

**Acceptance criteria:**
- `PATCH /marketplace/listings/:id` (requires auth, role: MOTHER)
- Request body validated with `UpdateListingSchema` (partial update)
- Only the listing owner can update; non-owner returns `403 { data: null, error: "Not authorized to update this listing" }`
- Only ACTIVE listings can be updated; SOLD/REMOVED returns `400 { data: null, error: "Cannot update a listing with status SOLD/REMOVED" }`
- Prohibited items keyword check runs on updated title/description
- Returns `200 { data: { listing } }`

**Unit tests:**
- Happy path: partial update (price only)
- Rejected: non-owner attempt
- Rejected: update SOLD listing
- Rejected: prohibited keyword in updated description

### MRKT-11: Delete listing (seller removes own listing)
**As a** seller
**I want** to remove my listing from the marketplace
**So that** it no longer appears in the feed.

**Acceptance criteria:**
- `DELETE /marketplace/listings/:id` (requires auth, role: MOTHER)
- Only the listing owner can delete; non-owner returns `403`
- Sets listing status to `REMOVED` (soft delete — listing remains in DB for audit)
- Removes associated `SavedItem` records for this listing
- Returns `200 { data: { message: "Listing removed" } }`
- Already-removed listing returns `200` (idempotent)

**Unit tests:**
- Happy path: status set to REMOVED
- Non-owner returns 403
- Idempotent: second delete returns 200
- SavedItems for the listing are cleaned up

### MRKT-12: Mark listing as sold
**As a** seller
**I want** to mark my listing as sold
**So that** it is hidden from the marketplace feed but remains in my seller history.

**Acceptance criteria:**
- `POST /marketplace/listings/:id/sold` (requires auth, role: MOTHER)
- Only the listing owner can mark as sold; non-owner returns `403`
- Only ACTIVE listings can be marked sold; already SOLD returns `200` (idempotent); REMOVED returns `400`
- Sets status to `SOLD`, records `updatedAt`
- Listing no longer appears in the feed (MRKT-08) but is viewable via direct link (MRKT-09) with sold badge
- Returns `200 { data: { listing } }`

**Unit tests:**
- Happy path: status changes to SOLD
- Non-owner returns 403
- Idempotent: already SOLD returns 200
- REMOVED listing returns 400

### MRKT-13: Save/unsave a listing (favorite)
**As a** mother
**I want** to save listings I'm interested in and remove saves
**So that** I can find them later in my saved items list.

**Acceptance criteria:**
- `POST /marketplace/listings/:id/save` (requires auth, role: MOTHER)
  - Creates a `SavedItem` record linking user and listing
  - If already saved, returns `200` (idempotent)
  - Only ACTIVE listings can be saved; SOLD/REMOVED returns `400`
  - Returns `200 { data: { saved: true } }`
- `DELETE /marketplace/listings/:id/save` (requires auth, role: MOTHER)
  - Removes the `SavedItem` record
  - If not saved, returns `200` (idempotent)
  - Returns `200 { data: { saved: false } }`

**Unit tests:**
- Save: creates SavedItem, idempotent on duplicate
- Unsave: removes SavedItem, idempotent when not saved
- Save rejected for SOLD listing

### MRKT-14: Get saved items list
**As a** mother
**I want** to view all my saved/favorited listings
**So that** I can easily revisit items I'm interested in.

**Acceptance criteria:**
- `GET /marketplace/saved` (requires auth, role: MOTHER)
- Returns paginated list of saved listings (cursor-based, default limit 20)
- Each listing includes: first photo, title, price, seller neighborhood, listing status
- Includes SOLD items (so user knows it's no longer available); excludes REMOVED
- Sorted by `SavedItem.createdAt DESC` (most recently saved first)
- Returns `200 { data: { listings }, meta: { nextCursor, hasMore } }`

**Unit tests:**
- Returns saved listings for the authenticated user only
- SOLD items included with sold indicator
- REMOVED items excluded
- Pagination works correctly

### MRKT-15: Get seller's listing history
**As a** seller
**I want** to see all my listings (active, sold, and removed)
**So that** I can manage my marketplace presence.

**Acceptance criteria:**
- `GET /marketplace/my-listings` (requires auth, role: MOTHER)
- Returns all listings owned by the authenticated user, regardless of status
- Sorted by `createdAt DESC`
- Cursor-based pagination, default limit 20
- Each listing includes: first photo, title, price, category, status
- Returns `200 { data: { listings }, meta: { nextCursor, hasMore } }`

**Unit tests:**
- Returns only the authenticated user's listings
- Includes ACTIVE, SOLD, and REMOVED listings
- Pagination works correctly

### MRKT-16: Initiate buyer-seller conversation from listing
**As a** buyer
**I want** to message a seller directly from a listing
**So that** I can ask questions or negotiate before purchasing.

**Acceptance criteria:**
- `POST /marketplace/listings/:id/contact` (requires auth, role: MOTHER)
- Creates a `Conversation` of type `MARKETPLACE` linked to the listing (see Epic 7: Messaging)
- If a conversation already exists between buyer and seller for this listing, returns the existing conversation (idempotent)
- Buyer cannot message their own listing — returns `400 { data: null, error: "Cannot message your own listing" }`
- Only ACTIVE listings allow new conversations; SOLD returns `400`
- Returns `200 { data: { conversationId } }`
- Sends a push notification to the seller: "New inquiry on your listing: {title}"

**Unit tests:**
- Happy path: conversation created, notification sent
- Idempotent: returns existing conversation
- Rejected: messaging own listing
- Rejected: SOLD listing

### MRKT-17: Report a listing
**As a** mother
**I want** to report a listing that violates marketplace guidelines
**So that** moderators can review and take action.

**Acceptance criteria:**
- `POST /marketplace/listings/:id/report` (requires auth)
- Request body validated with `ReportListingSchema`: `{ reason }` (max 500 chars)
- Creates a report record (can reuse a generic `Report` model or a dedicated `ListingReport`)
- Users cannot report their own listing — returns `400`
- Duplicate reports from the same user for the same listing are rejected — returns `409`
- Returns `200 { data: { message: "Report submitted" } }`
- Triggers an internal notification to the moderation queue (SQS message for admin review)

**Unit tests:**
- Happy path: report created
- Rejected: self-report
- Rejected: duplicate report from same user
- Notification sent to moderation queue

---

## API Route Summary

| Method | Path | Auth | Role | Story |
|--------|------|------|------|-------|
| `POST` | `/marketplace/guidelines/accept` | Yes | MOTHER | MRKT-05 |
| `POST` | `/marketplace/listings/upload-url` | Yes | MOTHER | MRKT-06 |
| `POST` | `/marketplace/listings` | Yes | MOTHER | MRKT-07 |
| `GET` | `/marketplace/listings` | Yes | any | MRKT-08 |
| `GET` | `/marketplace/listings/:id` | Yes | any | MRKT-09 |
| `PATCH` | `/marketplace/listings/:id` | Yes | MOTHER | MRKT-10 |
| `DELETE` | `/marketplace/listings/:id` | Yes | MOTHER | MRKT-11 |
| `POST` | `/marketplace/listings/:id/sold` | Yes | MOTHER | MRKT-12 |
| `POST` | `/marketplace/listings/:id/save` | Yes | MOTHER | MRKT-13 |
| `DELETE` | `/marketplace/listings/:id/save` | Yes | MOTHER | MRKT-13 |
| `GET` | `/marketplace/saved` | Yes | MOTHER | MRKT-14 |
| `GET` | `/marketplace/my-listings` | Yes | MOTHER | MRKT-15 |
| `POST` | `/marketplace/listings/:id/contact` | Yes | MOTHER | MRKT-16 |
| `POST` | `/marketplace/listings/:id/report` | Yes | any | MRKT-17 |

---

## Implementation Order

```
MRKT-01  Prisma: ListingCategory enum + Listing model
    |
MRKT-02  Prisma: ListingPhoto model
    |
MRKT-03  Prisma: SavedItem model
    |
MRKT-04  Shared Zod schemas
    |
MRKT-05  Accept marketplace guidelines
    |
MRKT-06  S3 presigned URL generation
    |
MRKT-07  Create listing
    |
MRKT-08  Get listing feed ──── MRKT-09  Get listing detail
    |                               |
MRKT-10  Update listing        MRKT-13  Save/unsave listing
    |                               |
MRKT-11  Delete listing        MRKT-14  Get saved items
    |                               |
MRKT-12  Mark as sold          MRKT-15  Seller history
    |
MRKT-16  Buyer-seller conversation (depends on Epic 7)
    |
MRKT-17  Report listing
```

---

## Non-Functional Requirements (from PRD Table 18)

| Requirement | Target |
|---|---|
| Feed initial render | < 1.5 seconds |
| Pagination load | < 1 second |
| Photo upload (presigned URL) | 15-minute URL expiry |
| Photo size limit | 5 MB per image |
| Photos per listing | 1 minimum, 6 maximum |
| Accepted image types | `image/jpeg`, `image/png` |
| Keyword search | Case-insensitive partial match on title + description |
| General API rate limit | 100 req / 15 min per user |
| Content moderation | Prohibited keyword blocklist enforced at creation and update |
| Data retention | Listings retained until deleted by author or moderated |
| Marketplace payments | Peer-to-peer only in v1.0 (no platform payment processing) |
