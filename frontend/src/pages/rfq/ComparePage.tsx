import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiRequest } from '../../api/client';
import type { ComparisonResponse, Quote, Rfq } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Alert, BackLink, EmptyState, Money, PageHeader, QuoteStatusBadge, RfqStatusBadge, Spinner } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { errorMessages } from '../../lib/errors';
import { formatDate, formatINR } from '../../lib/format';
import { toPaise } from '../../lib/money';
import { FileList } from '../../components/FileList';

type SortBy = 'total' | 'deliveryTime';
type Order = 'asc' | 'desc';

interface AwardResult {
  vendor: string;
  total: string | null;
  rejectedCount: number;
}

/** Lowest total and fastest delivery, used only for highlighting. Values are compared as integer paise. */
function leaders(items: Quote[]) {
  let lowest: bigint | null = null;
  let fastest: number | null = null;
  for (const q of items) {
    const p = q.currentRevision ? toPaise(q.currentRevision.totalAmount) : null;
    if (p !== null && (lowest === null || p < lowest)) lowest = p;
    const d = q.currentRevision?.deliveryDays;
    if (d !== undefined && (fastest === null || d < fastest)) fastest = d;
  }
  return { lowest, fastest };
}

export default function ComparePage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [sortBy, setSortBy] = useState<SortBy>('total');
  const [order, setOrder] = useState<Order>('asc');
  const rfq = useApi<{ rfq: Rfq }>(`/rfqs/${id}`);
  const comparison = useApi<ComparisonResponse>(`/rfqs/${id}/comparison?sortBy=${sortBy}&order=${order}`);

  const [pending, setPending] = useState<Quote | null>(null);
  const [awarding, setAwarding] = useState(false);
  const [actionErrors, setActionErrors] = useState<string[]>([]);
  const [result, setResult] = useState<AwardResult | null>(null);
  const [shortlistingId, setShortlistingId] = useState<string | null>(null);

  if (rfq.loading && !rfq.data) return <Spinner label="Loading RFQ" />;
  if (rfq.error) return <><BackLink to="/" label="Dashboard" /><Alert>{rfq.error}</Alert></>;
  if (!rfq.data || !user) return null;

  const r = rfq.data.rfq;
  const canAct = user.role === 'BUYER' && r.buyerId === user.id;
  const items = comparison.data?.items ?? [];
  const { lowest, fastest } = leaders(items);
  const isAwarded = r.status === 'AWARDED';

  const confirmAward = async () => {
    if (!pending) return;
    setAwarding(true);
    setActionErrors([]);
    try {
      const res = await apiRequest<{ rejectedQuoteIds: string[] }>(`/rfqs/${id}/award`, {
        body: { quoteId: pending.id },
      });
      setResult({
        vendor: pending.vendor.name,
        total: pending.currentRevision?.totalAmount ?? null,
        rejectedCount: res.rejectedQuoteIds.length,
      });
      setPending(null);
      rfq.reload();
      comparison.reload();
    } catch (err) {
      setActionErrors(errorMessages(err));
      setPending(null);
    } finally {
      setAwarding(false);
    }
  };

  const shortlist = async (quoteId: string) => {
    setShortlistingId(quoteId);
    setActionErrors([]);
    try {
      await apiRequest(`/quotes/${quoteId}/shortlist`, { method: 'POST' });
      comparison.reload();
    } catch (err) {
      setActionErrors(errorMessages(err));
    } finally {
      setShortlistingId(null);
    }
  };

  return (
    <>
      <BackLink to={user.role === 'BUYER' ? '/buyer/rfqs' : '/admin/rfqs'} label="Back to RFQs" />
      <PageHeader
        title={`Compare quotations: ${r.title}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-3">
            <RfqStatusBadge status={r.status} />
            <span>Budget: {r.budget ? <Money value={r.budget} /> : 'not disclosed'}</span>
            <Link to={`/rfqs/${r.id}`} className="font-medium text-brand-700 hover:underline">View RFQ</Link>
          </span>
        }
      />

      {result && (
        <div className="mb-6">
          <Alert kind="success">
            <p className="font-semibold">RFQ awarded to {result.vendor}{result.total ? ` for ${formatINR(result.total)}` : ''}.</p>
            <p className="mt-1">
              {result.vendor} is marked Accepted. {result.rejectedCount} other quotation{result.rejectedCount === 1 ? ' was' : 's were'} marked Rejected. The award is recorded in the status history.
            </p>
          </Alert>
        </div>
      )}
      {actionErrors.length > 0 && (
        <div className="mb-6">
          <Alert>
            <ul className="list-disc space-y-1 pl-5">{actionErrors.map((m) => <li key={m}>{m}</li>)}</ul>
          </Alert>
        </div>
      )}

      {pending && (
        <div role="alertdialog" aria-labelledby="award-title" className="mb-6 rounded-xl border-2 border-amber-300 bg-amber-50 p-5">
          <h2 id="award-title" className="text-base font-semibold text-amber-900">Confirm award</h2>
          <p className="mt-2 text-sm text-amber-900">
            Award this RFQ to <strong>{pending.vendor.name}</strong> for{' '}
            <strong>{formatINR(pending.currentRevision?.totalAmount)}</strong> with delivery in{' '}
            <strong>{pending.currentRevision?.deliveryDays} days</strong>? The other {Math.max(0, items.length - 1)} quotation(s)
            will be marked Rejected. This cannot be undone.
          </p>
          <div className="mt-4 flex gap-3">
            <button type="button" className="btn-danger" onClick={confirmAward} disabled={awarding}>
              {awarding ? 'Awarding…' : 'Confirm award'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setPending(null)} disabled={awarding}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="label" htmlFor="sortBy">Sort by</label>
          <select id="sortBy" className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
            <option value="total">Total price</option>
            <option value="deliveryTime">Delivery time</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="order">Order</label>
          <select id="order" className="input" value={order} onChange={(e) => setOrder(e.target.value as Order)}>
            <option value="asc">Ascending (low to high)</option>
            <option value="desc">Descending (high to low)</option>
          </select>
        </div>
        <p className="pb-2 text-xs text-slate-500">Ties keep a stable order by submission time.</p>
      </div>

      {comparison.error && <Alert>{comparison.error}</Alert>}
      {comparison.loading && !comparison.data && <Spinner label="Loading quotations" />}

      {comparison.data && items.length === 0 && (
        <EmptyState title="No quotations were submitted for this RFQ" />
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="table-base">
            <caption className="sr-only">Quotations for {r.title}</caption>
            <thead>
              <tr>
                <th scope="col" className="th">Vendor</th>
                <th scope="col" className="th">Status</th>
                <th scope="col" className="th text-right">Total</th>
                <th scope="col" className="th text-right">Delivery</th>
                <th scope="col" className="th">Line prices</th>
                <th scope="col" className="th">Notes and documents</th>
                <th scope="col" className="th"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((q) => {
                const rev = q.currentRevision;
                const isLowest = rev && lowest !== null && toPaise(rev.totalAmount) === lowest;
                const isFastest = rev && fastest !== null && rev.deliveryDays === fastest;
                const canAward = canAct && r.status === 'CLOSED' && (q.status === 'SUBMITTED' || q.status === 'SHORTLISTED');
                return (
                  <tr key={q.id} className="align-top">
                    <td className="td">
                      <Link to={`/quotes/${q.id}`} className="font-medium text-brand-700 hover:underline">{q.vendor.name}</Link>
                      <span className="block text-xs text-slate-500">Submitted {formatDate(q.submittedAt)}</span>
                      {rev && <span className="block text-xs text-slate-500">Revision {rev.revisionNumber} · updated {formatDate(q.updatedAt)}</span>}
                    </td>
                    <td className="td"><QuoteStatusBadge status={q.status} /></td>
                    <td className="td text-right">
                      <Money value={rev?.totalAmount} className="font-semibold text-slate-900" />
                      {isLowest && <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">Lowest</span>}
                    </td>
                    <td className="td text-right tabular-nums">
                      {rev ? `${rev.deliveryDays} days` : '—'}
                      {isFastest && <span className="block text-xs font-medium text-emerald-700">Fastest</span>}
                    </td>
                    <td className="td">
                      <ul className="space-y-1 text-xs">
                        {rev?.lineItems.map((l) => (
                          <li key={l.rfqLineItemId}>
                            <span className="font-medium text-slate-700">{l.itemName}</span>{' '}
                            {formatINR(l.unitPrice)} × {l.quantity.toLocaleString('en-IN')} = <Money value={l.lineTotal} />
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="td max-w-xs">
                      {rev?.notes ? <p className="whitespace-pre-wrap text-xs text-slate-600">{rev.notes}</p> : <p className="text-xs text-slate-400">No notes</p>}
                      <div className="mt-2"><FileList files={q.attachments} /></div>
                    </td>
                    <td className="td">
                      <div className="flex flex-col items-stretch gap-2">
                        {canAct && r.status === 'CLOSED' && q.status === 'SUBMITTED' && (
                          <button
                            type="button"
                            className="btn-secondary"
                            disabled={shortlistingId === q.id}
                            onClick={() => shortlist(q.id)}
                          >
                            {shortlistingId === q.id ? 'Saving…' : 'Shortlist'}
                          </button>
                        )}
                        {canAward && (
                          <button type="button" className="btn-primary" onClick={() => setPending(q)}>
                            Award to this vendor
                          </button>
                        )}
                        {isAwarded && q.status === 'ACCEPTED' && <span className="text-sm font-medium text-emerald-700">Awarded</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {r.status === 'PUBLISHED' && user.role === 'BUYER' && (
        <p className="mt-4 text-sm text-slate-500">Quotations are visible for comparison after the deadline passes.</p>
      )}
    </>
  );
}
