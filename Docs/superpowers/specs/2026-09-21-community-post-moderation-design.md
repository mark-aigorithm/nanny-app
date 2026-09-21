# Community post moderation (all types) — design

**Date:** 2026-09-21

## Problem
Only marketplace listings are reviewed before publication. Q&A and event posts go live the
moment a mother writes them, and an admin has no way to take one down with a reason.

## Decision
Apply the existing listing moderation model to every `CommunityPost` type.

- **Gate:** `createPost` and `updatePost` set `moderation_status = PENDING` for QA, MARKETPLACE and
  EVENT alike. An edit to a live post re-enters review (as listings do today).
- **Visibility:** unchanged — approved posts are public; the author additionally sees her own
  pending/rejected posts in the feed, detail, comments and "My posts". `toggleEventRsvp` gains the
  same `assertPostVisible` gate as like/comment.
- **Takedown:** rejecting an approved post with a reason hides it; the author sees the reason and
  can edit & resubmit. No separate "removed" state.
- **Existing rows:** untouched (`moderation_status` defaults to `APPROVED`). No migration.
- **Admin console:** the Marketplace page becomes **Community** (`/community`): one table with a
  Type filter (All / Marketplace / Q&A / Events) and the Status filter; a Type badge; a Details
  column (price · event date + place · —). Approve / Reject / Take down, plus official-listing
  Edit / Delete, as today. The official-listing form stays on the page. The permission section
  key stays `marketplace` (stored operator grants keep working); its label becomes "Community".
- **API:** moderation moves to `GET /admin/community/posts?type=&status=`,
  `POST /admin/community/posts/:id/approve`, `POST /admin/community/posts/:id/reject`.
  Official-listing CRUD stays under `/admin/marketplace/listings`.
- **Notifications:** reuse `MARKETPLACE_LISTING_APPROVED / _REJECTED` with type-aware copy
  ("Your event is live", "Your post needs changes"; marketplace copy unchanged).
- **Mobile:** "My listings" → **"My posts"** at `/(parent)/my-posts`, every type, per-type row
  (type chip; price / event date + place / question excerpt). Shortcut on every community filter.
  The review notice on Create post applies to every type; editing any post shows "Resubmit".

## Out of scope
Per-type moderation toggle; admin notification on submission; a distinct "removed" state.
