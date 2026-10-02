# Restaurant Launch Review

Status: strengthened local pilot, not yet a launch-approved hosted service.

## Research and Decisions

- [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): permissions must be checked on requests, including private resources. Separate URLs are useful for workflow but are not an access-control boundary. The server now checks roles, branches, and guest order ownership; kitchen accounts cannot edit restaurant configuration.
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): use protected cookies and session expiry. Sessions now expire after eight hours, rotate on login, revoke on logout, and use HttpOnly/SameSite cookies, with Secure cookies in production. Passwords use salted scrypt hashes; initial passwords are random.
- [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/): verify payment-provider signatures and handle duplicate notifications. The old UI's simulated UPI/card authorization was removed. No real online payment is claimed. Cash collection requires a separate staff action and exact bill amount.

## Implemented

- Public menu at `/menu`; employee pages at `/kitchen`, `/staff`, and `/admin` behind dedicated sign-in pages. No employee navigation or login in the customer screen. Admin links open the other portals.
- SQLite transactions and persistent sessions, audit records, JSON data import on first launch, health endpoint, and a verified database backup command.
- Signed table links, locally generated QR images, editable printable flyer, guest-specific order history, real-time projected updates, item priority and enforced preparation transitions.
- Server-calculated item/modifier prices, coupons, stock validation across duplicate lines, idempotent order submission, rate limiting, input limits, cross-origin write rejection, and a static asset allowlist.
- Admin menu editing with conflict detection; kitchen orders and staff requests are branch-scoped. Staff can resolve requests and record cash payments. Growth shows actual order totals and popular dishes, not a feature roadmap.

## Before Accepting Live Orders

1. Choose a public domain and HTTPS host, set PUBLIC_ORIGIN to its exact origin without a trailing slash, and use persistent storage. localhost QR codes cannot be used by diners' phones. Generate and test new flyers after choosing the domain.
2. Install one independent instance/database per restaurant business. This is not a multi-tenant SaaS platform. Branches currently share a menu and stock pool. Run one Node process per database; in-memory SSE and snapshots are not designed for multiple workers.
3. Replace imported sample branches/menu, configure pricing and tax with the owner, and remove sample orders before live use. Tax invoices, refunds, cancellations and reconciliation still need complete restaurant-specific workflows. Current order receipts are not a full tax-invoice system.
4. Move bootstrap passwords into a password manager. Rotate them using Account in kitchen/staff (admin can open either portal), then remove the plaintext bootstrap file. Named employee provisioning, account disablement, password recovery, MFA, and restaurant onboarding remain commercial-service work.
5. Configure automatic encrypted off-machine backups, test restoration in staging, configure restart/uptime/error monitoring, and validate outage handling. `node scripts/backup.js` creates a consistent snapshot and checks integrity; it does not schedule or store backups offsite. Protect data with OS permissions and encrypted disks.
6. Connect and test provider checkout, signature-verified webhooks, refunds, reconciliation, tips and actual split transactions before advertising UPI/card payments. Current split values are estimates and cash is recorded manually.
7. Connect WhatsApp/SMS, POS and printers before selling those capabilities. They are marked not connected. The kitchen display works; external KDS integration is not implemented.
8. Define customer data retention, consent, deletion/export, support ownership and incident handling before collecting live phone numbers. Loyalty automation and messaging consent are not implemented. Phone collection is optional.
9. Complete a supervised restaurant pilot covering peak-hour load, reconnects, unavailable dishes, incorrect orders, cancellations, kitchen handoff, cash reconciliation, physical QR scans and independent security review. Signed static QR links can be copied; they do not prove physical presence. Expiring table sessions or staff activation remain needed where remote-order abuse is a concern.

## Restore Procedure

Stop the server. Retain the current database and its WAL/SHM files as an incident copy. Restore a verified backup as `restaurant.sqlite` in an empty DATA_DIR, set the same PUBLIC_ORIGIN, and start one process. Test login, menu, historical orders and one staging order before resuming traffic. Backups contain customer records, password hashes, sessions and the table-link signing secret; restrict access. Backed-up sessions may remain valid until expiry, so revoke them during incident recovery.

## Verification

`npm test` runs isolated security and workflow checks against a temporary database. `node scripts/browser-check.js` checks desktop/mobile screens using installed Microsoft Edge and stores screenshots in test-results. The browser check does not submit orders to the working database. These checks are pilot evidence, not a penetration-test certificate or production availability guarantee.
