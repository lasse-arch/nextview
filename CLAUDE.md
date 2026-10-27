@AGENTS.md

# Session conventions

- Whenever a change is a significant, user-facing improvement (a new page/feature, or a meaningfully better version of an existing flow) - not a small tweak or bugfix - add a post about it on /nyheder, with a real screenshot of the actual running feature (desktop and, if the feature is used on mobile, a mobile-width screenshot too). Screenshots go in public/news/ and get wired in via DEFAULT_POSTS + ensureDefaultNewsPosts in src/lib/actions/news.ts (this sandbox can only write to its own local dev DB, not production, so news posts are seeded this way rather than inserted directly).
- Addresses: nextview360.dk is the website ("/" = public/site), the one login (/login - the team with Google, customers with a link on e-mail) and Arpo under /arpo (src/app/arpo); customers' own page is /kunde. Tours go on tour.nextview360.dk. arpo.dk only redirects. Arpo's internal links always start with /arpo.
