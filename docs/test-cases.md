# Test case register

Status key: **Pass** = automated and executed in this build, with the result shown. **Manual** = not automated; a manual check is described in `docs/walkthrough-script.md`. **Not run** = planned but not executed in this environment.

Run the automated suites with `npm test` from the repository root (backend and frontend). Backend integration tests need MySQL and the `TEST_DATABASE_URL` database, which must end in `_test`.

## Backend integration tests (51 pass)

### Authentication and authorization (`backend/tests/auth.test.ts`, 7 tests)

| ID | Scenario | Expected | Status |
|---|---|---|---|
| AU-01 | Buyer registers, signs in, reads own profile | 201, then `/auth/me` returns the buyer; password hash never returned | Pass |
| AU-02 | Admin registration without invite code, with a wrong code, then with the right code | 403, 403, 201 | Pass |
| AU-03 | Wrong password, unknown email, duplicate email | Same generic 401 message for both logins; duplicate → 409 | Pass |
| AU-04 | Protected endpoint without session | 401 `UNAUTHENTICATED` | Pass |
| AU-05 | Vendor calls buyer-only and admin-only endpoints | 403 | Pass |
| AU-06 | Admin disables a vendor who holds a valid session | Existing session → 401; re-login → 403 | Pass |
| AU-07 | Non-admin lists users; admin tries to demote self | 403; 422 `SELF_CHANGE_FORBIDDEN` | Pass |

### RFQ lifecycle (`backend/tests/rfq.test.ts`, 10 tests)

| ID | Scenario | Expected | Status |
|---|---|---|---|
| RF-01 | Create draft; reject invalid deadline and zero quantity; history records creation | 422 for invalid; 201 draft; history `∅ → DRAFT` | Pass |
| RF-02 | Publish with no line items; publish with a past deadline | 422 with `details` naming `lineItems` and `deadline` | Pass |
| RF-03 | Publish valid RFQ | `PUBLISHED`; history `DRAFT → PUBLISHED` | Pass |
| RF-04 | Buyer B reads, edits, or publishes buyer A's RFQ | 404 for each; owner's data unchanged | Pass |
| RF-05 | Edit a published RFQ: lock title and lines; shorten deadline; extend deadline | 409 `RFQ_LOCKED`; 422 `DEADLINE_CAN_ONLY_EXTEND`; 200 when extending | Pass |
| RF-06 | Vendor discovery: drafts hidden; keyword, category and location filters | Draft not shown; each filter returns the right RFQ | Pass |
| RF-07 | Discovery pagination is deterministic across pages; invalid `pageSize` | Pages combine to the full ordered list; 422 for `pageSize=500` | Pass |
| RF-08 | Deadline passes while the RFQ is published | Status becomes `CLOSED`; history row with null actor and reason `deadline_passed` | Pass |
| RF-09 | Publish an already published RFQ; filter buyer list by status | 409 `INVALID_TRANSITION`; filter returns the right rows | Pass |
| RF-10 | Invalid status filter value | 422 | Pass |

### Quotations (`backend/tests/quote.test.ts`, 12 tests)

| ID | Scenario | Expected | Status |
|---|---|---|---|
| QU-01 | Submit 100 × 2000 + 20 × 8000 | Line totals 2,00,000.00 and 1,60,000.00; total 3,60,000.00 | Pass |
| QU-02 | Body contains a client `totalAmount` | Ignored; server total used | Pass |
| QU-03 | Missing, negative, or duplicate line price | 422 `QUOTE_INCOMPLETE` / validation | Pass |
| QU-04 | Second quotation by the same vendor for the same RFQ | 409 `QUOTE_EXISTS` | Pass |
| QU-05 | Revise before deadline | Revision 2 with new total; revision 1 still present | Pass |
| QU-06 | Submit one millisecond before deadline; at the exact deadline | 201; 409 `DEADLINE_PASSED` | Pass |
| QU-07 | Late submission and late revision | 409 `DEADLINE_PASSED`; revision count unchanged | Pass |
| QU-08 | Vendor B reads, revises or reads history of vendor A's quotation | 404 each; discovery contains no other vendor's quotation id | Pass |
| QU-09 | Vendor calls comparison; buyer compares before closure | 403 for vendor; 403 with message for buyer | Pass |
| QU-10 | Vendor uploads PDF; buyer downloads before/after closure; other vendor downloads | 201; 404 before close; 200 after close; 404 for other vendor | Pass |
| QU-11 | Vendor uploads document after deadline | 409 | Pass |
| QU-12 | Quotation history on creation | One row, `∅ → SUBMITTED` | Pass |

### Comparison (`backend/tests/comparison.test.ts`, 3 tests)

| ID | Scenario | Expected | Status |
|---|---|---|---|
| CO-01 | Sort by total and by delivery time, ascending and descending, with a tie | Correct order each time; tie broken by submission time | Pass |
| CO-02 | Comparison with no quotations | 200, empty `items`, RFQ status CLOSED | Pass |
| CO-03 | Another buyer requests the comparison | 404 | Pass |

### Award (`backend/tests/award.test.ts`, 8 tests)

| ID | Scenario | Expected | Status |
|---|---|---|---|
| AW-01 | Award one of three quotations | Winner ACCEPTED; others REJECTED; RFQ AWARDED; history rows written | Pass |
| AW-02 | Award while RFQ is published | 409 `RFQ_NOT_CLOSED` | Pass |
| AW-03 | Award a quotation from another RFQ | 422 `QUOTE_NOT_IN_RFQ` | Pass |
| AW-04 | Second award for the same RFQ | 409 `RFQ_ALREADY_AWARDED`; still one ACCEPTED | Pass |
| AW-05 | Two different awards sent at the same time | Exactly one 200 and one 409; one ACCEPTED quotation | Pass |
| AW-06 | Different buyer tries to award | 404; RFQ still CLOSED | Pass |
| AW-07 | Vendor tries to award | 403 | Pass |
| AW-08 | Shortlist after close, then award the shortlisted quotation | Shortlist 200; award 200 | Pass |

### Files (`backend/tests/files.test.ts`, 8 tests)

| ID | Scenario | Expected | Status |
|---|---|---|---|
| FI-01 | Upload valid PDF; download bytes back | 201; identical bytes; `nosniff`; attachment disposition | Pass |
| FI-02 | Upload valid XLSX | 201; canonical spreadsheet MIME | Pass |
| FI-03 | `setup.exe`, `payload.html`, `notes.txt`, `invoice.exe.pdf`, `.hidden.pdf` | 422 each | Pass |
| FI-04 | `.pdf` containing HTML | 422 `FILE_SIGNATURE_MISMATCH` | Pass |
| FI-05 | PDF with client MIME `text/html` | 422 | Pass |
| FI-06 | File above the size limit | 422 `FILE_TOO_LARGE` | Pass |
| FI-07 | Path traversal in the file name | Stored name is `plan.pdf` | Pass |
| FI-08 | Download by unauthorized user; download when bytes are missing | 404; 404 with no path leaked | Pass |

### Money (`backend/tests/money.test.ts`, 3 tests)

| ID | Scenario | Expected | Status |
|---|---|---|---|
| MO-01 | 0.1 + 0.2 | Exactly 0.30 | Pass |
| MO-02 | 1999.99 × 3; 2000 × 100 | 5999.97; 200000.00 | Pass |
| MO-03 | Revision built from RFQ lines and revised prices | Total 3,50,000.00 | Pass |

## Frontend tests (10 pass)

| ID | Scenario | Status |
|---|---|---|
| FE-01 | Login form shows required-field messages without calling the API | Pass |
| FE-02 | Login shows the server's generic invalid-credentials message | Pass |
| FE-03 | INR formatting uses Indian grouping; null shows an em dash | Pass |
| FE-04 | IST wall-clock ↔ UTC instant conversion (17:00 IST = 11:30 UTC) | Pass |
| FE-05 | Money preview: paise arithmetic, 360,000 total, null for invalid input | Pass |
| FE-06 | Error mapping: every server detail message, and the fallback message | Pass |

## End-to-end against the live API (34 checks pass)

`node scripts/e2e-check.mjs` runs the assignment's workflow with real time, including a 45-second deadline. It covers: create and publish; vendor discovery; two quotations totalling 3,60,000.00; duplicate refusal; revision to 3,50,000.00 with history kept; vendor privacy (404 for another vendor's quotation and documents); a PDF upload; an executable rejected; pre-deadline download and comparison refused; a late submission and revision refused with unchanged data; automatic closure; comparison by delivery time and by total; post-close download with correct headers; the award; second award refused; Accepted and Rejected statuses; history order; system-made closure row; attachments blocked after award; admin and non-admin access.

## Manual checks (not automated in this build)

| ID | Scenario | How to check | Status |
|---|---|---|---|
| MN-01 | Full UI flow in a real browser (all three roles) | Follow `docs/walkthrough-script.md` | Manual |
| MN-02 | Responsive layout on a phone-width screen | Chrome DevTools device mode, 375 px wide | Manual |
| MN-03 | Keyboard-only use of forms and the award confirmation | Tab through the RFQ form and comparison page | Manual |
| MN-04 | Docker one-command start from an empty machine | `cp .env.example .env && docker compose up --build`, then open http://localhost:8080 | Not run (no Docker daemon in the build environment) |
| MN-05 | Data persists across `docker compose down` and `up` | Create an RFQ, restart the stack, confirm it is still listed | Manual |
| MN-06 | Background sweeper fires on its interval, with no request in between | Set `CLOSURE_SWEEP_INTERVAL_MS=5000`, publish an RFQ with a 10 s deadline, wait without requests, check the database | Manual |
| MN-07 | Migrations match the Prisma schema | Run the drift check in the README | Manual |
| MN-08 | Concurrency under real load | Many concurrent awards and submissions with a load tool | Not run |
