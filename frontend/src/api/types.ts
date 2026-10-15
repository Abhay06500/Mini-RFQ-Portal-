export type Role = 'BUYER' | 'VENDOR' | 'ADMIN';
export type RfqStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'AWARDED';
export type QuoteStatus = 'SUBMITTED' | 'SHORTLISTED' | 'ACCEPTED' | 'REJECTED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface LineItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  sortOrder: number;
}

export interface FileAttachment {
  id: string;
  kind: 'PDF' | 'XLSX';
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  downloadUrl: string;
}

export interface Rfq {
  id: string;
  buyerId: string;
  title: string;
  description: string;
  category: string;
  deliveryLocation: string;
  budget: string | null;
  currency: string;
  deadline: string;
  status: RfqStatus;
  publishedAt: string | null;
  awardedAt: string | null;
  awardedQuoteId: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems: LineItem[];
  attachments: FileAttachment[];
  quoteCount?: number;
  myQuote?: { id: string; status: QuoteStatus; revisionNumber: number | null; totalAmount: string | null } | null;
}

export interface RfqSummary {
  id: string;
  title: string;
  category: string;
  deliveryLocation: string;
  budget: string | null;
  deadline: string;
  status: RfqStatus;
  updatedAt: string;
  quoteCount?: number;
  lineItemCount?: number;
  myQuote?: { id: string; status: QuoteStatus } | null;
}

export interface QuoteRevisionLine {
  rfqLineItemId: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: string;
  lineTotal: string;
}

export interface QuoteRevision {
  id: string;
  revisionNumber: number;
  deliveryDays: number;
  notes: string | null;
  totalAmount: string;
  createdAt: string;
  lineItems: QuoteRevisionLine[];
}

export interface Quote {
  id: string;
  rfqId: string;
  status: QuoteStatus;
  vendor: { id: string; name: string };
  submittedAt: string;
  updatedAt: string;
  currentRevision: QuoteRevision | null;
  revisions?: QuoteRevision[];
  attachments: FileAttachment[];
}

export interface ComparisonResponse {
  rfq: { id: string; title: string; status: RfqStatus; deadline: string; budget: string | null };
  sortBy: 'total' | 'deliveryTime';
  order: 'asc' | 'desc';
  items: Quote[];
}

export interface HistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actor: { id: string; name: string; role: Role } | null;
  createdAt: string;
}

export interface MyQuoteSummary {
  id: string;
  rfqId: string;
  status: QuoteStatus;
  rfq: { id: string; title: string; status: RfqStatus; deadline: string };
  currentRevisionNumber: number | null;
  totalAmount: string | null;
  updatedAt: string;
}

export interface AdminQuoteRow {
  id: string;
  status: QuoteStatus;
  vendor: { id: string; name: string };
  rfq: { id: string; title: string; status: RfqStatus };
  currentRevisionNumber: number | null;
  totalAmount: string | null;
  updatedAt: string;
}
