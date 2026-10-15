# Walkthrough script (5 to 10 minutes)

Record with Loom or a similar screen recorder at 1080p. Use the seeded demo data. Before recording, run `docker compose up --build` (or `npm run dev` locally) and confirm `http://localhost:8080` loads. Keep the terminal and the Swagger page one click away.

## Timing plan

| Time | Segment |
|---|---|
| 0:00–0:45 | Introduction, architecture slide or README diagram |
| 0:45–1:45 | Buyer: sign in, RFQ list, create and publish a new RFQ |
| 1:45–3:00 | Vendor: sign in, search and filter open RFQs, submit, revise, show old revision |
| 3:00–3:30 | Vendor privacy: another vendor cannot see the quotation (API 404 in Swagger) |
| 3:30–4:30 | Deadline: show the closed state, then a late attempt rejected |
| 4:30–6:00 | Buyer: comparison, sort by total and by delivery time, award with confirmation |
| 6:00–6:45 | Status history on the RFQ and on the winning quotation; admin view |
| 6:45–7:30 | Security and data design: roles, cookie, file checks, decimal money, transactions |
| 7:30–8:30 | Tests and the e2e script; Swagger |
| 8:30–9:30 | Limitations and what I would do next |

## Script

**Introduction (0:00).** "This is the Mini RFQ Portal. A buyer publishes a request for quotation, vendors submit and revise prices until the deadline, and the buyer compares and awards one vendor. The stack is React with Vite on the front, Node with Express 5 on the back, MySQL 8 with Prisma, and Docker Compose to run it all. Everything here runs from one command."

**Architecture (0:20).** Show `docs/system-design.md` §4. "Nginx serves the app and proxies `/api` so the browser sees one origin, which keeps the HttpOnly cookie simple. The API has three layers: routes, services that hold the business rules and transactions, and Prisma. Uploads go to a volume outside any web root."

**Buyer sign-in and RFQ (0:45).** Sign in as `buyer@acme.example` / `Buyer@12345`. Open *My RFQs* and point out the status filter. Click *New RFQ*. Enter a title, a description, category and location. Add two line items: 100 office chairs and 20 standing desks. Set the deadline in IST. Click *Save and publish*. "The server validates again on publish: at least one line item and a future deadline. Fields are locked once published, so vendors can trust what they priced."

**Vendor search and quotation (1:45).** Sign out. Sign in as `vendor@officeworld.example` / `Vendor@12345`. Open *Open RFQs*. Search "office", then filter by location. Open the new RFQ and click *Submit quotation*. Enter 2000 for chairs and 8000 for desks. Point at the live preview: "This is a preview. The server recalculates and stores 3,60,000.00." Submit. Then click *Revise quotation*, enter 1900 for chairs, and save. "Revision 2 is saved. Revision 1 stays in the history, which is the immutable snapshot."

**Vendor privacy (3:00).** Open `/api/docs` in a new tab. Expand `GET /quotes/{id}`, authorize as the second vendor (`vendor2@deskhub.example`), and call it with the first vendor's quotation id. Show the 404. "The API answers with 404 instead of 403, so it does not even confirm that the record exists."

**Deadline (3:30).** Show the RFQ with its deadline. If the deadline has not passed yet, explain it and move on to the e2e script output, which demonstrates the real-time behaviour. "After the deadline, the server rejects a submission or revision with 409 DEADLINE_PASSED and changes nothing. The check is in the same transaction as the write, so there is no race. Closure happens on the next request and also in a background sweep."

**Comparison and award (4:30).** Sign in as the buyer and open the closed RFQ's comparison (use the seeded *Pantry and canteen supplies* RFQ, or the RFQ you just closed). Sort by total ascending, then by delivery time ascending. "Sorting uses numeric values, and ties are stable." Click *Award to this vendor* on the faster offer. Show the confirmation panel, then confirm. Show the success message, and that the other quotation is marked Rejected.

**Status history (6:00).** Open the RFQ detail and show *Status history*: DRAFT, PUBLISHED, CLOSED (no user, system), AWARDED with the buyer's name. Open the winning quotation and show its history. "Each transition is written in the same transaction as the change, so history cannot disagree with the current status."

**Security and data design (6:45).** Show the cookie in DevTools (HttpOnly, SameSite=Strict). Mention that every endpoint checks ownership in the service layer. For uploads, show the signature checks and the generated file name in the database. For money, show `DECIMAL(16,2)` and that totals are computed on the server. For concurrency, explain the conditional update in the award, and point at the test that runs two awards in parallel.

**Tests (7:30).** In a terminal run `npm test` and show the backend count (51) and the frontend count (10). Then run `node scripts/e2e-check.mjs` and show the 34 passing checks. "The tests use a separate `_test` database and never touch the demo data."

**Limitations and next steps (8:30).** Read the honest list from the README: no real-browser test was run in the build environment; Docker start-up was written but not run in that environment; the audit log is status history only; uploads are on a local volume, and object storage is the next step; there is no email or password reset. "What I would do first: object storage with malware scanning, keyset pagination and a search index, a general audit log, and notifications."

**Close (9:30).** "The code, the design document, the README and the API documentation are in the repository. Thank you for watching."
