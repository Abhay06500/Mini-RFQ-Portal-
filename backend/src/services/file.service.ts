import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Response } from 'express';
import type { FileAttachment } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { conflict, notFound, unprocessable } from '../errors.js';
import type { AuthUser } from '../types/express.js';
import { now } from '../clock.js';
import { MAX_UPLOAD_BYTES } from '../middleware/upload.js';
import { closeExpiredRfqs } from './closure.js';
import { serializeFile } from './serializers.js';

export const UPLOAD_ROOT = path.resolve(config.UPLOAD_DIR);
const RFQ_ATTACHMENT_LIMIT = 10;
const QUOTE_ATTACHMENT_LIMIT = 5;

const CANONICAL = {
  PDF: { ext: '.pdf', mimeType: 'application/pdf' },
  XLSX: {
    ext: '.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
} as const;

/** Client-declared MIME types accepted for each kind. Used only as a first filter, never as proof. */
const DECLARED_MIME: Record<'PDF' | 'XLSX', string[]> = {
  PDF: ['application/pdf', 'application/x-pdf', 'application/octet-stream'],
  XLSX: [
    CANONICAL.XLSX.mimeType,
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
  ],
};

/** Extensions that must never appear anywhere in an upload name, even in the middle (e.g. "a.exe.pdf"). */
const BLOCKED_NAME_SEGMENTS = new Set([
  'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'ps1', 'sh', 'js', 'jar', 'vbs', 'php', 'html', 'htm', 'svg', 'dll',
]);

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface InspectedFile {
  kind: 'PDF' | 'XLSX';
  safeName: string;
  mimeType: string;
  extension: string;
}

/** Strips directories and rejects names that are hidden, control-character laden, or contain executable segments. */
export function sanitizeFilename(raw: string): string {
  const base = path.basename(raw.replace(/\\/g, '/')).trim();
  if (!base || base.length > 200 || base.startsWith('.')) {
    throw unprocessable('FILENAME_INVALID', 'The file name is not allowed');
  }
  if (/[\x00-\x1f\x7f]/.test(base) || /[/\\:*?"<>|]/.test(base)) {
    throw unprocessable('FILENAME_INVALID', 'The file name contains characters that are not allowed');
  }
  const segments = base.toLowerCase().split('.');
  if (segments.slice(1).some((s) => BLOCKED_NAME_SEGMENTS.has(s))) {
    throw unprocessable('FILENAME_INVALID', 'The file name contains an executable or script extension');
  }
  return base;
}

/**
 * Validates an upload before anything is written. Checks, in order: size, filename, allowed
 * extension, declared MIME type, and the file's own signature (magic bytes). The signature is what
 * actually decides the type, because a client can lie about the MIME type.
 */
export function inspectUpload(file: UploadedFile): InspectedFile {
  if (file.size === 0 || file.buffer.length === 0) {
    throw unprocessable('FILE_EMPTY', 'The uploaded file is empty');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw unprocessable('FILE_TOO_LARGE', 'The file exceeds the maximum allowed size');
  }
  const safeName = sanitizeFilename(file.originalname);
  const extension = path.extname(safeName).toLowerCase();

  let kind: 'PDF' | 'XLSX';
  if (extension === '.pdf') kind = 'PDF';
  else if (extension === '.xlsx') kind = 'XLSX';
  else throw unprocessable('FILE_TYPE_NOT_ALLOWED', 'Only PDF and XLSX files are accepted');

  if (!DECLARED_MIME[kind].includes(file.mimetype)) {
    throw unprocessable('FILE_TYPE_NOT_ALLOWED', 'The file type does not match its extension');
  }

  const head = file.buffer.subarray(0, 5);
  if (kind === 'PDF') {
    if (!head.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw unprocessable('FILE_SIGNATURE_MISMATCH', 'The file content is not a valid PDF');
    }
  } else {
    // XLSX is a ZIP container. Require the ZIP signature and the OOXML markers inside it.
    const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    if (!head.subarray(0, 4).equals(zipMagic)) {
      throw unprocessable('FILE_SIGNATURE_MISMATCH', 'The file content is not a valid XLSX workbook');
    }
    const text = file.buffer.toString('latin1');
    if (!text.includes('[Content_Types].xml') || !text.includes('xl/')) {
      throw unprocessable('FILE_SIGNATURE_MISMATCH', 'The file content is not a valid XLSX workbook');
    }
  }

  return { kind, safeName, mimeType: CANONICAL[kind].mimeType, extension };
}

/** Writes the validated bytes under a generated name. If the database write fails, the file is removed. */
async function persistFile(
  input: UploadedFile,
  inspected: InspectedFile,
  owner: { rfqId?: string; quoteId?: string; uploadedById: string },
): Promise<FileAttachment> {
  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
  const storageKey = `${randomUUID()}${inspected.extension}`;
  const fullPath = path.join(UPLOAD_ROOT, storageKey);
  await fs.writeFile(fullPath, input.buffer, { flag: 'wx', mode: 0o640 });
  try {
    return await prisma.fileAttachment.create({
      data: {
        rfqId: owner.rfqId ?? null,
        quoteId: owner.quoteId ?? null,
        kind: inspected.kind,
        originalName: inspected.safeName,
        storageKey,
        mimeType: inspected.mimeType,
        sizeBytes: input.buffer.length,
        uploadedById: owner.uploadedById,
      },
    });
  } catch (error) {
    await fs.rm(fullPath, { force: true });
    throw error;
  }
}

export async function attachToRfq(actor: AuthUser, rfqId: string, file: UploadedFile | undefined) {
  if (!file) throw unprocessable('FILE_REQUIRED', 'Attach a file in the "file" field');
  await closeExpiredRfqs();
  const rfq = await prisma.rfq.findUnique({ where: { id: rfqId }, select: { buyerId: true, status: true } });
  if (!rfq || rfq.buyerId !== actor.id) throw notFound('RFQ not found');
  if (rfq.status !== 'DRAFT' && rfq.status !== 'PUBLISHED') {
    throw conflict('RFQ_NOT_EDITABLE', 'Attachments can be added only to draft or published RFQs');
  }
  const count = await prisma.fileAttachment.count({ where: { rfqId } });
  if (count >= RFQ_ATTACHMENT_LIMIT) {
    throw conflict('ATTACHMENT_LIMIT', `An RFQ can have at most ${RFQ_ATTACHMENT_LIMIT} attachments`);
  }
  const inspected = inspectUpload(file);
  const saved = await persistFile(file, inspected, { rfqId, uploadedById: actor.id });
  return serializeFile(saved);
}

export async function attachToQuote(actor: AuthUser, quoteId: string, file: UploadedFile | undefined) {
  if (!file) throw unprocessable('FILE_REQUIRED', 'Attach a file in the "file" field');
  await closeExpiredRfqs();
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { vendorId: true, status: true, rfq: { select: { status: true, deadline: true } } },
  });
  if (!quote || quote.vendorId !== actor.id) throw notFound('Quotation not found');
  if (now().getTime() >= quote.rfq.deadline.getTime()) {
    throw conflict('DEADLINE_PASSED', 'The submission deadline has passed. Documents can no longer be added.');
  }
  if (quote.rfq.status !== 'PUBLISHED' || quote.status !== 'SUBMITTED') {
    throw conflict('QUOTE_LOCKED', 'Documents can no longer be added to this quotation');
  }
  const count = await prisma.fileAttachment.count({ where: { quoteId } });
  if (count >= QUOTE_ATTACHMENT_LIMIT) {
    throw conflict('ATTACHMENT_LIMIT', `A quotation can have at most ${QUOTE_ATTACHMENT_LIMIT} documents`);
  }
  const inspected = inspectUpload(file);
  const saved = await persistFile(file, inspected, { quoteId, uploadedById: actor.id });
  return serializeFile(saved);
}

/**
 * Download authorization. A file the actor may not see returns 404, the same as a missing file,
 * so attachments cannot be enumerated.
 * - RFQ spec files: owning buyer, admin, and any vendor once the RFQ is no longer a draft.
 * - Quotation documents: owning vendor, admin, and the RFQ's buyer once the RFQ is closed or awarded.
 */
export async function authorizeDownload(actor: AuthUser, fileId: string): Promise<FileAttachment> {
  await closeExpiredRfqs();
  const file = await prisma.fileAttachment.findUnique({
    where: { id: fileId },
    include: {
      rfq: { select: { buyerId: true, status: true } },
      quote: { select: { vendorId: true, rfq: { select: { buyerId: true, status: true } } } },
    },
  });
  if (!file) throw notFound('File not found');

  let allowed = false;
  if (actor.role === 'ADMIN') {
    allowed = true;
  } else if (file.rfq) {
    allowed =
      (actor.role === 'BUYER' && file.rfq.buyerId === actor.id) ||
      (actor.role === 'VENDOR' && file.rfq.status !== 'DRAFT');
  } else if (file.quote) {
    const q = file.quote;
    allowed =
      (actor.role === 'VENDOR' && q.vendorId === actor.id) ||
      (actor.role === 'BUYER' &&
        q.rfq.buyerId === actor.id &&
        (q.rfq.status === 'CLOSED' || q.rfq.status === 'AWARDED'));
  }
  if (!allowed) throw notFound('File not found');
  return file;
}

/** Streams a previously authorized file with headers that stop it being rendered or sniffed as HTML. */
export async function streamFile(res: Response, file: FileAttachment): Promise<void> {
  const fullPath = path.join(UPLOAD_ROOT, path.basename(file.storageKey));
  try {
    await fs.access(fullPath);
  } catch {
    // The row exists but the bytes are gone. This is a server-side fault, not a client error.
    console.error(`Stored file missing on disk for attachment ${file.id}`);
    throw notFound('File content is unavailable');
  }
  const asciiName = file.originalName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', String(file.sizeBytes));
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  const stream = createReadStream(fullPath);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}
