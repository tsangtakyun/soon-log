# SOON-LOG ↔ SOON-CORE Bridge Status

## Shared Supabase Project

- Project ID: `fqnnjwxxwxggreoognkv`
- SOON-CORE URL: `https://soon-core.vercel.app`
- Auth: Supabase Auth shared through the same `auth.users` table.

## Shared Tables

- `auth.users`: shared login identity for SOON-CORE and SOON-LOG.
- `public.profiles`: creator profile data, including SOON-LOG notification cursor `last_seen_at`.
- `public.logs`: SOON-LOG posts shown in mobile feed and linked from SOON-CORE routes.
- `public.comments`: comments used for log detail and unread profile badge.
- `public.likes`: shared like state/count for logs.
- `public.follows`: creator follow graph.
- `public.activities`: bridge activity stream for SOON-CORE dashboard events.

## SOON-LOG Only Tables / Storage

- `storage.buckets.log-media`: mobile log image uploads.
- `storage.objects` under bucket `log-media`: creator-owned image files for SOON-LOG entries.

## API / Route Endpoints Used

- Supabase Auth: `signInWithPassword`, `signUp`, `signOut`, persisted with AsyncStorage.
- Supabase PostgREST:
  - `profiles`: read/write current profile, `last_seen_at` read cursor.
  - `logs`: feed, detail, profile grids, create log.
  - `comments`: detail comments and unread badge count.
  - `likes`: toggle like and realtime count refresh.
  - `follows`: follow/unfollow and profile counts.
  - `activities`: insert `{ type: 'log_published', reference_id, user_id }` after mobile log creation.
- Supabase Realtime:
  - `logs`: new public logs appear at top of feed.
  - `comments`: new comments appear in detail and refresh Profile tab unread state.
  - `likes`: detail like count updates live.
- SOON-CORE deep link:
  - `https://soon-core.vercel.app/logs/[id]`
  - Opened from SOON-LOG with `expo-web-browser` in-app browser.

## Known Limitations

- The Profile tab badge counts unread comments by querying own log IDs first, then counting comments newer than `profiles.last_seen_at`; very large creator accounts may need a database view or RPC for better performance.
- Own comments are excluded from unread badge counts.
- Opening Profile marks all current comments as read by updating `profiles.last_seen_at` immediately.
- Activity sync is best-effort on the client: log creation still succeeds if the `activities` insert fails, and the failure is logged with `console.warn`.
- SOON-CORE must implement/serve `/logs/[id]` for the deep link to land on a meaningful web page.
