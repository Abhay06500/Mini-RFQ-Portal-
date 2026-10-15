import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { at, createUser, DAY_MS, PDF_BYTES, pinClock, publishedRfq, resetDatabase, signIn, XLSX_BYTES } from './helpers.js';
import { prisma } from '../src/db.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { UPLOAD_ROOT } from '../src/services/file.service.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('specification file upload and download', () => {
  beforeEach(async () => {
    await resetDatabase();
    pinClock(at(0));
  });
  afterEach(() => pinClock(null));

  async function buyerWithRfq() {
    const buyer = await signIn((await createUser('BUYER')).email);
    const rfq = await publishedRfq(buyer, { deadline: at(5 * DAY_MS).toISOString() });
    return { buyer, rfq };
  }

  it('uploads a valid PDF, stores it under a generated name, and streams the same bytes back safely', async () => {
    const { buyer, rfq } = await buyerWithRfq();
    const up = await buyer.post(`/api/v1/rfqs/${rfq.id}/attachments`).attach('file', PDF_BYTES, {
      filename: 'site-plan.pdf',
      contentType: 'application/pdf',
    });
    expect(up.status).toBe(201);
    expect(up.body.attachment.originalName).toBe('site-plan.pdf');
    expect(up.body.attachment).not.toHaveProperty('storageKey');

    const row = await prisma.fileAttachment.findUniqueOrThrow({ where: { id: up.body.attachment.id } });
    expect(row.storageKey).not.toContain('site-plan');
    await fs.access(path.join(UPLOAD_ROOT, row.storageKey));

    const down = await buyer.get(`/api/v1/files/${row.id}`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(down.status).toBe(200);
    expect(down.headers['x-content-type-options']).toBe('nosniff');
    expect(down.headers['content-disposition']).toContain('attachment');
    expect(Buffer.compare(down.body as Buffer, PDF_BYTES)).toBe(0);
  });

  it('accepts an XLSX workbook and records the canonical spreadsheet MIME type', async () => {
    const { buyer, rfq } = await buyerWithRfq();
    const up = await buyer.post(`/api/v1/rfqs/${rfq.id}/attachments`).attach('file', XLSX_BYTES, {
      filename: 'boq.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(up.status).toBe(201);
    expect(up.body.attachment.kind).toBe('XLSX');
    expect(up.body.attachment.mimeType).toContain('spreadsheetml');
  });

  it('rejects executable and unsupported extensions, including double extensions', async () => {
    const { buyer, rfq } = await buyerWithRfq();
    for (const filename of ['setup.exe', 'payload.html', 'notes.txt', 'invoice.exe.pdf', '.hidden.pdf']) {
      const res = await buyer.post(`/api/v1/rfqs/${rfq.id}/attachments`).attach('file', PDF_BYTES, {
        filename,
        contentType: 'application/pdf',
      });
      expect(res.status, filename).toBe(422);
    }
  });

  it('rejects a file whose content does not match its extension', async () => {
    const { buyer, rfq } = await buyerWithRfq();
    const res = await buyer.post(`/api/v1/rfqs/${rfq.id}/attachments`).attach('file', Buffer.from('<script>alert(1)</script>'), {
      filename: 'trick.pdf',
      contentType: 'application/pdf',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FILE_SIGNATURE_MISMATCH');
  });

  it('rejects a client MIME type that contradicts the extension', async () => {
    const { buyer, rfq } = await buyerWithRfq();
    const res = await buyer.post(`/api/v1/rfqs/${rfq.id}/attachments`).attach('file', PDF_BYTES, {
      filename: 'plan.pdf',
      contentType: 'text/html',
    });
    expect(res.status).toBe(422);
  });

  it('rejects files above the configured size limit (MAX_UPLOAD_MB is 1 in tests)', async () => {
    const { buyer, rfq } = await buyerWithRfq();
    const big = Buffer.concat([PDF_BYTES, Buffer.alloc(2 * 1024 * 1024, 0x20)]);
    const res = await buyer.post(`/api/v1/rfqs/${rfq.id}/attachments`).attach('file', big, {
      filename: 'huge.pdf',
      contentType: 'application/pdf',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('strips path components from the client filename', async () => {
    const { buyer, rfq } = await buyerWithRfq();
    const res = await buyer.post(`/api/v1/rfqs/${rfq.id}/attachments`).attach('file', PDF_BYTES, {
      filename: '../../../etc/plan.pdf',
      contentType: 'application/pdf',
    });
    expect(res.status).toBe(201);
    expect(res.body.attachment.originalName).toBe('plan.pdf');
  });

  it('returns 404 for a file the actor cannot see, and for a file whose bytes are missing from disk', async () => {
    const { buyer, rfq } = await buyerWithRfq();
    const up = await buyer.post(`/api/v1/rfqs/${rfq.id}/attachments`).attach('file', PDF_BYTES, {
      filename: 'spec.pdf',
      contentType: 'application/pdf',
    });
    const id = up.body.attachment.id;

    const vendor = await signIn((await createUser('VENDOR')).email);
    expect((await vendor.get(`/api/v1/files/${id}`)).status).toBe(200);
    const drafts = await buyer.post('/api/v1/rfqs').send({
      title: 'Draft RFQ for file test', description: 'Only a draft for this test case.', category: 'Misc',
      deliveryLocation: 'Pune', deadline: at(5 * DAY_MS).toISOString(), lineItems: [],
    });
    const draftUp = await buyer.post(`/api/v1/rfqs/${drafts.body.rfq.id}/attachments`).attach('file', PDF_BYTES, {
      filename: 'draft.pdf',
      contentType: 'application/pdf',
    });
    expect((await vendor.get(`/api/v1/files/${draftUp.body.attachment.id}`)).status).toBe(404);

    const row = await prisma.fileAttachment.findUniqueOrThrow({ where: { id } });
    await fs.rm(path.join(UPLOAD_ROOT, row.storageKey));
    expect((await buyer.get(`/api/v1/files/${id}`)).status).toBe(404);
  });
});
