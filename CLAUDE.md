@AGENTS.md

# Session conventions

- Whenever a change is a significant, user-facing improvement (a new page/feature, or a meaningfully better version of an existing flow) - not a small tweak or bugfix - add a post about it on /nyheder, with a real screenshot of the actual running feature (desktop and, if the feature is used on mobile, a mobile-width screenshot too). Screenshots go in public/news/ and get wired in via DEFAULT_POSTS + ensureDefaultNewsPosts in src/lib/actions/news.ts (this sandbox can only write to its own local dev DB, not production, so news posts are seeded this way rather than inserted directly).
