# Google Maps API Key — Setup Guide

This guide is written **specifically for NannyNow**. It tells you exactly how to
get a Google Maps API key so we can let nannies and mothers **pick their location
on a map** during registration.

Once you finish, just give me the key and I'll wire it into the app. You do
**not** need to touch any code — this document is only about obtaining the key in
the Google Cloud Console.

---

## What we already have (so you don't redo it)

| Thing | Status | Value |
|---|---|---|
| `react-native-maps` | ✅ installed | `~1.20.1` |
| `expo-location` | ✅ installed & configured | permissions already set |
| Google Cloud project | ✅ exists (via Firebase) | **`nanny-now-d8518`** |
| Android package name | ✅ | `com.nannyapp.mobile` |
| iOS bundle identifier | ✅ | `com.nannyapp.mobile` |

> **Important:** A Firebase project **is** a Google Cloud project. So we do **not**
> create a new project — we add the Maps key inside the existing `nanny-now-d8518`
> project. This keeps billing, quotas, and credentials in one place.

---

## Step 0 — Open the right project

1. Go to **https://console.cloud.google.com/**
2. Sign in with the Google account that owns the Firebase project.
3. At the top of the page, click the **project picker** (the dropdown next to
   "Google Cloud").
4. Select the project named **`nanny-now-d8518`** (it may be shown as
   "nanny-now" — confirm the ID is `nanny-now-d8518`).

⚠️ If you pick the wrong project, the keys won't be able to talk to our Firebase
setup cleanly. Double-check the project ID in the top bar before continuing.

---

## Step 1 — Billing (already done ✅)

Google Maps Platform **requires** a billing account. You're already on the
Firebase **Blaze** plan, which means billing is enabled on `nanny-now-d8518` —
so there is **nothing to do here**. Skip straight to Step 2.

> You will not be charged unless usage exceeds Google's free monthly credit,
> which our registration map screen is very unlikely to hit during development.

---

## Step 2 — Enable the required APIs

Left menu (☰) → **APIs & Services** → **Library**. Search for each of the
following by name, open it, and click **Enable**.

**Required (the map itself):**
- **Maps SDK for Android**
- **Maps SDK for iOS**

**Strongly recommended (so registration is actually usable):**
- **Geocoding API** — converts the map pin (latitude/longitude) into a readable
  address like "123 Nasr St, Cairo". We need this to store a real address, not
  just coordinates.
- **Places API** — powers the "search for your address" box so users can type a
  place name instead of dragging the pin. Highly recommended for a smooth
  registration flow.

> Enable all four. Enabling an API is free — you only ever pay for actual usage.

---

## Step 3 — Create the API key

For now we'll create **one single key** that works for both Android and iOS. This
is the fastest way to start development.

> **Why one key?** Google lets you lock a key to *one* platform — Android **or**
> iOS, never both. So a single shared key has to stay **unrestricted by platform**.
> That's fine for development. Before launch we'll split it into a locked-down
> Android key and a locked-down iOS key (Google's recommended practice) — I'll
> walk you through that when we get there.

Left menu (☰) → **APIs & Services** → **Credentials**.

1. Click **+ Create Credentials** → **API key**.
2. A key is created and shown (starts with `AIza…`). Click **Edit API key**
   (or the pencil icon) to configure it.
3. **Name** it clearly: `NannyNow Maps`.
4. Under **Application restrictions**, leave it on **None** for now (a single key
   can't be restricted to both Android and iOS at once — so no SHA-1 is needed yet
   either).
5. Under **API restrictions**, choose **Restrict key** and tick all four:
   - Maps SDK for Android
   - Maps SDK for iOS
   - Geocoding API
   - Places API
6. Click **Save**.

> **Copy the key somewhere safe.** Send it to me (see "What to give me" at the
> bottom). Treat it like a password — don't paste it into public chats,
> screenshots, or commits.

---

## Step 4 — Android SHA-1 fingerprint (later, before launch)

You **don't need this now.** The single key from Step 3 is unrestricted by
platform, so it already works on Android in development with no SHA-1. This step
only matters later, when we harden the setup by creating a locked-down Android key.
I'm leaving the instructions here so they're ready when we get to it.

Once a key is restricted to **Android apps**, it's locked to your app's signing
certificate via its SHA-1 fingerprint. You'll need the SHA-1 for whichever build
you're testing.

### For local development (debug builds)

Run this in a terminal on your machine:

```bash
keytool -list -v \
  -keystore ~/.android/debug.keystore \
  -alias androiddebugkey \
  -storepass android \
  -keypass android
```

Look for the line beginning **`SHA1:`** and copy that value (it looks like
`AB:CD:12:…`). You'll paste it into the Android app restriction when we create the
locked-down Android key.

> If `keytool` isn't found, it ships with the Java JDK. On macOS you can install
> it with `brew install openjdk`, or point to Android Studio's bundled JDK.

### For real builds (EAS / Play Store) — do this before release

When we build with EAS, the app is signed with a different key. Get that SHA-1
with:

```bash
cd apps/mobile
npx eas credentials
```

Choose **Android** → your build profile → and it will display the SHA-1 of the
upload/signing keystore. Add **that** SHA-1 to the same Android key as an
additional fingerprint (a key can hold multiple SHA-1s — keep both debug and
release).

> You can add more SHA-1 fingerprints to the key at any time, so it's fine to
> start with just the debug one and add the release one later.

---

## Step 5 — Put the key in an env var (NOT in the repo)

⚠️ **Never paste the key into chat, a screenshot, or any committed file.** This
repo is **public** — a key committed here must be treated as leaked and rotated.

`app.config.ts` is already wired to read the key from the environment (same key
on both platforms):

```ts
const GOOGLE_MAPS_API_KEY = process.env['GOOGLE_MAPS_API_KEY'] ?? '';
// → android.config.googleMaps.apiKey  and  ios.config.googleMapsApiKey
```

So all you do is set the value where it will **not** be committed:

1. **Local dev:** create `apps/mobile/.env` (already gitignored):
   ```
   GOOGLE_MAPS_API_KEY=your-key-here
   ```
2. **Builds:** add it as an EAS secret:
   ```bash
   cd apps/mobile
   npx eas secret:create --scope project --name GOOGLE_MAPS_API_KEY --value your-key-here
   ```
3. Rebuild the dev client (`npx expo prebuild` + a fresh EAS/dev build) — **maps
   will not appear in Expo Go**, only in a native/dev-client build, because
   Google Maps is a native module.
4. Then I'll build the map location-picker into the nanny & mother registration
   screens.

---

## What to do (don't send me the key)

1. ✅ Create the key (Step 3) and set it as `GOOGLE_MAPS_API_KEY` yourself
   (Step 5) — **do not paste it into chat or commit it.**
2. ✅ Make sure these 4 APIs are enabled: Maps SDK for Android, Maps SDK for iOS,
   Geocoding API, Places API.
3. ✅ Tell me only *"the key is set"* — I don't need the value to build the
   map screens against `process.env['GOOGLE_MAPS_API_KEY']`.

Billing is already sorted via your Firebase **Blaze** plan. This one key is all
we need to start; we'll harden it into restricted Android/iOS keys before launch.

---

## Quick reference

| Field | Value |
|---|---|
| Google Cloud project | `nanny-now-d8518` |
| Android package name | `com.nannyapp.mobile` |
| iOS bundle ID | `com.nannyapp.mobile` |
| Key | one shared key (unrestricted by platform for now) |
| APIs to enable | Maps SDK Android, Maps SDK iOS, Geocoding, Places |
| Billing | already enabled (Firebase Blaze) |
| Console URL | https://console.cloud.google.com/ |
| Credentials page | APIs & Services → Credentials |
