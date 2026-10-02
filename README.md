# TableServe

Restaurant ordering pilot with separate customer, kitchen, staff, and admin portals, a protected backend, SQLite persistence, and live updates.

## Run

Requires Node.js 24 or newer.

```sh
npm install
npm start
```

- Customer: http://localhost:4173/menu
- Kitchen: http://localhost:4173/kitchen
- Floor staff: http://localhost:4173/staff
- Admin and growth: http://localhost:4173/admin
- QR flyer builder: http://localhost:4173/admin#flyer

Employee portals require sign-in before the server returns the app. Initial usernames are `admin`, `kitchen`, and `staff`; random passwords are generated into `data/bootstrap-credentials.txt` on first startup. Old demo PINs no longer work. Move passwords into secure storage and rotate before launch. Admin can access every portal; other employees are limited to their role and branch. Visitors browse without signing in and need a signed table QR link to order.

Data is stored in `data/restaurant.sqlite`. Existing `data/state.json` is imported only if the database does not exist. Private files are never served as static assets. Do not open index.html directly: offline demo mode is no longer supported.

## Verification and Backup

```sh
npm test
node scripts/browser-check.js
node scripts/mobile-check.js
node scripts/kitchen-check.js
node scripts/backup.js
```

Browser checks require installed Microsoft Edge. Backup creates and verifies a consistent snapshot; schedule it externally and copy backups to protected off-machine storage.

The kitchen board groups items by their individual preparation status. A table ticket can appear in several lanes, with only matching items in each. Each ready item has a Served button for kitchen and floor staff. Other items and orders at the same table stay unchanged. The order closes when every item is served; Serve remaining items is available when all remaining items are ready. Serving never records payment. `kitchen-check.js` verifies partial serving, multiple orders at one table, live updates, reload persistence and the serving guard in an isolated restaurant database.

Admin's **Team access** control assigns kitchen and floor-staff accounts to a branch. Employees see and update only their assigned branch's orders; changing an assignment refreshes connected screens immediately. If an employee board is empty while Admin sees orders, check the branch assignment. The kitchen regression also tests this with separate kitchen/staff logins and verifies that employees cannot change their own access.

For phone testing, open Admin using this computer's local-network IP on the same Wi-Fi, then use Customer or print its table QR. Development mode accepts same-origin requests on the computer's own IPv4 addresses and generates links using the address you opened. Production still requires the configured HTTPS PUBLIC_ORIGIN. The plain `/menu` address is browse-only; ordering and staff requests need a signed table link. Missing or invalid table links now display a persistent explanation instead of silently disabling buttons.

The mobile cart summary appears after adding an item and opens Your order when tapped. `mobile-check.js` uses a separate temporary restaurant and verifies real order submission, staff requests, retry behavior and the floating cart over local-network HTTP.

Customers can use **Scan table QR** in the menu header. Camera scanning requires HTTPS (or localhost); local-network HTTP supports choosing a QR photo instead. QR decoding runs in the browser using the bundled qr-scanner library. Scans must be same-origin table links with a valid backend signature. Connecting updates the table and live stream without clearing the cart; closing the scanner stops the camera. Mobile checks cover image decoding, rejected links, retained cart and camera cleanup using a simulated camera.

## Deployment Scope

Use one process and independent database per restaurant business. Set `PUBLIC_ORIGIN` to the exact public HTTPS origin and `NODE_ENV=production` behind a TLS reverse proxy. Set `DATA_DIR` to persistent protected storage. `.env.example` lists settings; load them through your host. Same-origin POST requests are required. Proxy rate limits currently apply to the proxy's IP; configure edge rate limiting before public deployment.

Payments are pay-at-restaurant with explicit staff cash collection. Online payments, SMS/WhatsApp, POS, external printers/KDS, independent branch stock, and SaaS tenant onboarding are not live integrations. See [LAUNCH.md](LAUNCH.md) for researched decisions, remaining launch requirements and recovery instructions. This is not yet certified or deployed for immediate commercial operation.
