import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { QuoteStatus, RfqStatus } from '../api/types';
import { formatDeadline, formatINR, humanize } from '../lib/format';

const rfqTone: Record<RfqStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 ring-slate-300',
  PUBLISHED: 'bg-blue-50 text-blue-700 ring-blue-300',
  CLOSED: 'bg-amber-50 text-amber-800 ring-amber-300',
  AWARDED: 'bg-emerald-50 text-emerald-700 ring-emerald-300',
};

const quoteTone: Record<QuoteStatus, string> = {
  SUBMITTED: 'bg-sky-50 text-sky-700 ring-sky-300',
  SHORTLISTED: 'bg-violet-50 text-violet-700 ring-violet-300',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 ring-emerald-300',
  REJECTED: 'bg-rose-50 text-rose-700 ring-rose-300',
};

function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}>
      {children}
    </span>
  );
}

export function RfqStatusBadge({ status }: { status: RfqStatus }) {
  return <Pill className={rfqTone[status]}>{humanize(status)}</Pill>;
}

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return <Pill className={quoteTone[status]}>{humanize(status)}</Pill>;
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const tone = {
    error: 'border-rose-200 bg-rose-50 text-rose-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
  }[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${tone}`}>
      {children}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-8 text-sm text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" aria-hidden="true" />
      {label}…
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="font-medium text-slate-800">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {totalPages}
      </span>
      <button type="button" className="btn-secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}

export function Money({ value, className = '' }: { value: string | null | undefined; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatINR(value)}</span>;
}

export function DeadlineText({ iso }: { iso: string }) {
  const open = new Date(iso).getTime() > Date.now();
  return (
    <span className={open ? 'text-slate-700' : 'text-slate-400'}>
      {formatDeadline(iso)}
      {!open && <span className="ml-2 text-xs uppercase tracking-wide">(passed)</span>}
    </span>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-sm text-rose-600" role="alert">
      {message}
    </p>
  );
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="text-sm font-medium text-brand-700 hover:underline">
      ← {label}
    </Link>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}
