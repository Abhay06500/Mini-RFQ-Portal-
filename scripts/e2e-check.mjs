#!/usr/bin/env node
/**
 * End-to-end check against a running API and the seeded database (real clock, no mocks).
 * It follows the assignment's example: two vendors quote, one revises, a late quote is rejected,
 * the RFQ closes at its deadline, and the buyer awards the faster delivery.
 *
 *   node scripts/e2e-check.mjs              (API on http://localhost:4000)
 *   API_URL=http://localhost:8080/api/v1 DEADLINE_SECONDS=45 node scripts/e2e-check.mjs
 */
const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const DEADLINE_SECONDS = Number(process.env.DEADLINE_SECONDS ?? 45);
const PDF = Buffer.from('%PDF-1.4\n% e2e vendor document\n%%EOF\n');
const XLSX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('[Content_Types].xml xl/workbook.xml'), Buffer.alloc(32)]);

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  -> ${detail}` : ''}`);
}

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return { email, cookie };
}

async function call(session, method, path, body) {
  const headers = { Cookie: session.cookie };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : null;
  return { status: res.status, data, headers: res.headers };
}

function formWith(bytes, filename, mime) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), filename);
  return form;
}

const money = (x) => x;

async function main() {
  const buyer = await login('buyer@acme.example', 'Buyer@12345');
  const admin = await login('admin@rfq.example', 'Admin@12345');
  const vendorA = await login('vendor@officeworld.example', 'Vendor@12345');
  const vendorB = await login('vendor2@deskhub.example', 'Vendor@12345');
  const vendorC = await login('vendor3@seatcraft.example', 'Vendor@12345');

  const token = `E2E-${Date.now()}`;
  const deadline = new Date(Date.now() + DEADLINE_SECONDS * 1000).toISOString();
  const created = await call(buyer, 'POST', '/rfqs', {
    title: `Office supplies ${token}`,
    description: 'End-to-end verification RFQ with two line items.',
    category: 'Office Supplies',
    deliveryLocation: 'Hyderabad',
    budget: '400000',
    deadline,
    lineItems: [
      { name: 'Office chair', quantity: 100, unit: 'pcs' },
      { name: 'Standing desk', quantity: 20, unit: 'pcs' },
    ],
  });
  check('buyer creates a draft RFQ', created.status === 201, JSON.stringify(created.data));
  const rfqId = created.data.rfq.id;
  const [chair, desk] = created.data.rfq.lineItems;

  const published = await call(buyer, 'POST', `/rfqs/${rfqId}/publish`);
  check('buyer publishes the RFQ', published.status === 200 && published.data.rfq.status === 'PUBLISHED', JSON.stringify(published.data));

  const discovered = await call(vendorC, 'GET', `/rfqs?q=${token}`);
  check('vendor finds the RFQ through keyword search', discovered.data?.items?.some((r) => r.id === rfqId));

  const quoteBody = (chairPrice, deskPrice, days) => ({
    deliveryDays: days,
    notes: 'e2e',
    lineItems: [
      { rfqLineItemId: chair.id, unitPrice: chairPrice },
      { rfqLineItemId: desk.id, unitPrice: deskPrice },
    ],
  });

  const subA = await call(vendorA, 'POST', `/rfqs/${rfqId}/quotes`, quoteBody('2000', '8000', 10));
  check('vendor A quotes 100 x 2000 + 20 x 8000 = 3,60,000.00', subA.status === 201 && subA.data.quote.currentRevision.totalAmount === '360000.00', JSON.stringify(subA.data));
  const quoteA = subA.data.quote.id;

  const subB = await call(vendorB, 'POST', `/rfqs/${rfqId}/quotes`, quoteBody('2200', '7000', 7));
  check('vendor B quotes 3,60,000.00 with 7 days delivery', subB.status === 201 && subB.data.quote.currentRevision.totalAmount === '360000.00');
  const quoteB = subB.data.quote.id;

  const dupe = await call(vendorB, 'POST', `/rfqs/${rfqId}/quotes`, quoteBody('1', '1', 1));
  check('a second quotation from vendor B is refused', dupe.status === 409 && dupe.data.error.code === 'QUOTE_EXISTS');

  const revA = await call(vendorA, 'PUT', `/quotes/${quoteA}`, quoteBody('1900', '8000', 10));
  check('vendor A revises the chair price to 1900 (total 3,50,000.00)', revA.status === 200 && revA.data.quote.currentRevision.revisionNumber === 2 && revA.data.quote.currentRevision.totalAmount === '350000.00');
  const detailA = await call(vendorA, 'GET', `/quotes/${quoteA}`);
  check('the first revision is kept in history (3,60,000.00)', detailA.data?.quote?.revisions?.[0]?.totalAmount === '360000.00');

  check('vendor B cannot read vendor A\'s quotation', (await call(vendorB, 'GET', `/quotes/${quoteA}`)).status === 404);
  check('vendor B cannot revise vendor A\'s quotation', (await call(vendorB, 'PUT', `/quotes/${quoteA}`, quoteBody('1', '1', 1))).status === 404);
  check('vendor C does not see any quotation on the RFQ detail', (await call(vendorC, 'GET', `/rfqs/${rfqId}`)).data?.rfq?.myQuote === null);

  const docUp = await call(vendorB, 'POST', `/quotes/${quoteB}/attachments`, formWith(PDF, 'pricing.pdf', 'application/pdf'));
  check('vendor B uploads a PDF pricing document', docUp.status === 201);
  const docFileId = docUp.data?.attachment?.id;
  check('the buyer cannot download a quotation document before the deadline', (await call(buyer, 'GET', `/files/${docFileId}`)).status === 404);
  check('the buyer cannot compare quotations before the deadline', (await call(buyer, 'GET', `/rfqs/${rfqId}/comparison`)).status === 403);
  const badType = await call(vendorB, 'POST', `/quotes/${quoteB}/attachments`, formWith(Buffer.from('MZ\x90\x00'), 'setup.exe', 'application/octet-stream'));
  check('an executable upload is rejected', badType.status === 422);

  const waitMs = new Date(deadline).getTime() - Date.now() + 2000;
  console.log(`... waiting ${Math.round(waitMs / 1000)}s for the deadline to pass`);
  await new Promise((r) => setTimeout(r, Math.max(0, waitMs)));

  const late = await call(vendorC, 'POST', `/rfqs/${rfqId}/quotes`, quoteBody('1', '1', 1));
  check('a quotation submitted after the deadline is rejected', late.status === 409 && late.data.error.code === 'DEADLINE_PASSED', JSON.stringify(late.data));
  const lateRev = await call(vendorA, 'PUT', `/quotes/${quoteA}`, quoteBody('1', '1', 1));
  check('a revision after the deadline is rejected and changes nothing', lateRev.status === 409 && lateRev.data.error.code === 'DEADLINE_PASSED');
  const afterLate = await call(vendorA, 'GET', `/quotes/${quoteA}`);
  check('stored revisions are unchanged after the rejected late revision', afterLate.data?.quote?.revisions?.length === 2);

  const rfqNow = await call(buyer, 'GET', `/rfqs/${rfqId}`);
  check('the RFQ is closed automatically at its deadline', rfqNow.data?.rfq?.status === 'CLOSED', JSON.stringify(rfqNow.data?.rfq?.status));

  const byTime = await call(buyer, 'GET', `/rfqs/${rfqId}/comparison?sortBy=deliveryTime&order=asc`);
  check('comparison sorted by delivery time puts the 7-day offer first', byTime.data?.items?.[0]?.vendor?.name === 'DeskHub Interiors');
  const byTotal = await call(buyer, 'GET', `/rfqs/${rfqId}/comparison?sortBy=total&order=asc`);
  check('comparison sorted by total puts the 3,50,000.00 offer first', byTotal.data?.items?.[0]?.currentRevision?.totalAmount === '350000.00');
  const vendorAItem = byTotal.data?.items?.find((i) => i.vendor.name === 'OfficeWorld Supplies');
  check('comparison shows vendor A\'s latest revision (2)', vendorAItem?.currentRevision?.revisionNumber === 2);

  const docNow = await call(buyer, 'GET', `/files/${docFileId}`);
  check('after closing, the buyer can download the quotation document', docNow.status === 200 && docNow.headers.get('x-content-type-options') === 'nosniff');
  check('the download keeps the PDF content type', docNow.headers.get('content-type') === 'application/pdf');

  const award = await call(buyer, 'POST', `/rfqs/${rfqId}/award`, { quoteId: quoteB });
  check('buyer awards vendor B (faster delivery)', award.status === 200 && award.data.rfq.status === 'AWARDED', JSON.stringify(award.data));
  check('the other quotation is reported as rejected', award.data?.rejectedQuoteIds?.includes(quoteA));
  check('a second award is refused', (await call(buyer, 'POST', `/rfqs/${rfqId}/award`, { quoteId: quoteA })).status === 409);

  const finalA = await call(vendorA, 'GET', `/quotes/${quoteA}`);
  const finalB = await call(vendorB, 'GET', `/quotes/${quoteB}`);
  check('vendor A\'s quotation is Rejected', finalA.data?.quote?.status === 'REJECTED');
  check('vendor B\'s quotation is Accepted', finalB.data?.quote?.status === 'ACCEPTED');

  const history = await call(buyer, 'GET', `/rfqs/${rfqId}/history`);
  const transitions = history.data?.history?.map((h) => `${h.fromStatus ?? '∅'}→${h.toStatus}`) ?? [];
  check('RFQ history records DRAFT, PUBLISHED, CLOSED and AWARDED in order', JSON.stringify(transitions) === JSON.stringify(['∅→DRAFT', 'DRAFT→PUBLISHED', 'PUBLISHED→CLOSED', 'CLOSED→AWARDED']), JSON.stringify(transitions));
  check('the deadline closure is recorded without a user actor', history.data?.history?.find((h) => h.toStatus === 'CLOSED')?.actor === null);

  const rfqSpec = await call(buyer, 'POST', `/rfqs/${rfqId}/attachments`, formWith(XLSX, 'boq.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
  check('an RFQ cannot take new attachments once it is awarded', rfqSpec.status === 409, JSON.stringify(rfqSpec.data));

  const adminView = await call(admin, 'GET', `/admin/rfqs?pageSize=5`);
  check('admin can see the RFQ in the all-RFQs listing', adminView.status === 200 && adminView.data.items.length > 0);
  check('a non-admin cannot list users', (await call(vendorA, 'GET', '/admin/users')).status === 403);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} of ${results.length} checks passed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
