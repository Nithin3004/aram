# Design changelog

## Implemented: Claude Design handoff v2 (`Stock System v2.dc.html`)

- Source: `Stock and sales management system-handoff/…/project/Stock System v2.dc.html`, copied to `/design/web` and `/design/android` (one file covers both surfaces).
- Tokens (colours, fonts, radii, tap sizes) extracted to `packages/shared/src/tokens.ts`.
- Web: Overview, Shops, Dispatches & transfers, Requests, Issues, Items & prices, Vendors & purchases, Admins & permissions, Activity log.
- Android: Receive delivery (4 steps), Home online/offline, Daily closing (count → money → review), Login & OTP, Raise a request, Supervisor (small shops + HO-ordered transfer).

### Deliberate differences from the design (CLAUDE.md / owner decisions win)
- **Language**: the design shows English and Tamil side by side (Android Tamil-first). Per the owner, the UI shows **one language at a time** with an English/தமிழ் switch on every screen including login.
- **Admins table** has 6 permissions: the design's 5 plus **Manage items** (CLAUDE.md lists it). No permissions = view-only.
- The prototype's "Head Office — Web / Shop Staff — Android" tab switch is not a product feature and was dropped.
- Receive screen pre-fills received qty with the sent qty, as the design does (the shop must still confirm, and HO sees ordered vs sent vs received).

### Screens not in the design (built plain from existing tokens/components, marked "Plain layout")
- Web: login/OTP, Settings (thresholds), and all create/edit dialogs (new dispatch, order transfer, confirm sent, delivery slip with QR, approve partially, reject, add item, record purchase, vendor, create admin, add shop).
- Android: settings, my stock, my requests & issues, report a problem, confirm transfer sent, recount.
