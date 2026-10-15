import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Pagination, RfqSummary } from '../../api/types';
import { Alert, DeadlineText, EmptyState, Money, PageHeader, Pagination as PaginationControl, QuoteStatusBadge, Spinner } from '../../components/ui';
import { useApi } from '../../hooks/useApi';

interface Filters {
  q: string;
  category: string;
  location: string;
  deadlineFrom: string;
  deadlineTo: string;
}

const EMPTY: Filters = { q: '', category: '', location: '', deadlineFrom: '', deadlineTo: '' };

/** Date filters are whole days in IST: from the start of the first day to the end of the last. */
function buildQuery(f: Filters, page: number): string {
  const params = new URLSearchParams({ page: String(page), pageSize: '10' });
  if (f.q.trim()) params.set('q', f.q.trim());
  if (f.category.trim()) params.set('category', f.category.trim());
  if (f.location.trim()) params.set('location', f.location.trim());
  if (f.deadlineFrom) params.set('deadlineFrom', `${f.deadlineFrom}T00:00:00+05:30`);
  if (f.deadlineTo) params.set('deadlineTo', `${f.deadlineTo}T23:59:59+05:30`);
  return params.toString();
}

export default function DiscoverPage() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const list = useApi<{ items: RfqSummary[]; pagination: Pagination }>(`/rfqs?${buildQuery(applied, page)}`);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setApplied(draft);
    setPage(1);
  };

  const onReset = () => {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Open RFQs" subtitle="Published requests with a deadline still ahead. Quotations are private to each vendor." />

      <form onSubmit={onSearch} className="card mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5" aria-label="Search RFQs">
        <div className="md:col-span-2 xl:col-span-2">
          <label className="label" htmlFor="q">Keyword</label>
          <input id="q" className="input" placeholder="chairs, desks, steel…" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="category">Category</label>
          <input id="category" className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="location">Delivery location</label>
          <input id="location" className="input" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="deadlineFrom">Deadline from (IST)</label>
          <input id="deadlineFrom" type="date" className="input" value={draft.deadlineFrom} onChange={(e) => setDraft({ ...draft, deadlineFrom: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="deadlineTo">Deadline to (IST)</label>
          <input id="deadlineTo" type="date" className="input" value={draft.deadlineTo} onChange={(e) => setDraft({ ...draft, deadlineTo: e.target.value })} />
        </div>
        <div className="flex gap-2 md:col-span-2 xl:col-span-5">
          <button type="submit" className="btn-primary">Search</button>
          <button type="button" className="btn-secondary" onClick={onReset}>Clear filters</button>
        </div>
      </form>

      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data && <Spinner label="Searching RFQs" />}
      {list.data && list.data.items.length === 0 && (
        <EmptyState title="No open RFQs match these filters">Try a broader keyword or clear the filters.</EmptyState>
      )}

      <ul className="grid gap-4 md:grid-cols-2">
        {list.data?.items.map((rfq) => (
          <li key={rfq.id} className="card flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <Link to={`/rfqs/${rfq.id}`} className="text-base font-semibold text-slate-900 hover:text-brand-700 hover:underline">
                {rfq.title}
              </Link>
              {rfq.myQuote && <QuoteStatusBadge status={rfq.myQuote.status} />}
            </div>
            <p className="text-sm text-slate-600">
              {rfq.category} · {rfq.deliveryLocation} · {rfq.lineItemCount ?? 0} line item{rfq.lineItemCount === 1 ? '' : 's'}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>Deadline: <DeadlineText iso={rfq.deadline} /></span>
              {rfq.budget && <span className="text-slate-500">Budget <Money value={rfq.budget} /></span>}
            </div>
          </li>
        ))}
      </ul>

      {list.data && <PaginationControl page={list.data.pagination.page} totalPages={list.data.pagination.totalPages} onPageChange={setPage} />}
    </>
  );
}
