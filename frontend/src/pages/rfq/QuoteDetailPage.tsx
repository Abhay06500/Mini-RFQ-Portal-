import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { HistoryEntry, Quote, Rfq } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { FileList, FileUploader } from '../../components/FileList';
import { Alert, BackLink, Card, DeadlineText, EmptyState, Money, PageHeader, QuoteStatusBadge, RfqStatusBadge, Spinner } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { formatDate, formatDeadline, humanize } from '../../lib/format';

export default function QuoteDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const quote = useApi<{ quote: Quote }>(`/quotes/${id}`);
  const history = useApi<{ history: HistoryEntry[] }>(`/quotes/${id}/history`);
  const rfq = useApi<{ rfq: Rfq }>(quote.data ? `/rfqs/${quote.data.quote.rfqId}` : null);
  const [notice] = useState<string | null>((location.state as { message?: string } | null)?.message ?? null);

  if (quote.loading && !quote.data) return <Spinner label="Loading quotation" />;
  if (quote.error) return <><BackLink to="/" label="Dashboard" /><Alert>{quote.error}</Alert></>;
  if (!quote.data || !user) return null;

  const q = quote.data.quote;
  const r = rfq.data?.rfq;
  const isVendorOwner = user.role === 'VENDOR' && q.vendor.id === user.id;
  const isOpen = Boolean(r && r.status === 'PUBLISHED' && new Date(r.deadline).getTime() > Date.now());
  const canRevise = isVendorOwner && isOpen && q.status === 'SUBMITTED';
  const canUpload = isVendorOwner && isOpen && q.status === 'SUBMITTED';
  const revisions = [...(q.revisions ?? [])].sort((a, b) => b.revisionNumber - a.revisionNumber);
  const backTo = user.role === 'VENDOR' ? '/vendor/quotes' : `/rfqs/${q.rfqId}/compare`;

  return (
    <>
      <BackLink to={backTo} label={user.role === 'VENDOR' ? 'My quotations' : 'Back to comparison'} />
      <PageHeader
        title={user.role === 'VENDOR' ? r?.title ?? 'Quotation' : `Quotation from ${q.vendor.name}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-3">
            <QuoteStatusBadge status={q.status} />
            {r && <RfqStatusBadge status={r.status} />}
            {r && <span>Deadline: <DeadlineText iso={r.deadline} /></span>}
            <Link to={`/rfqs/${q.rfqId}`} className="font-medium text-brand-700 hover:underline">View RFQ</Link>
          </span>
        }
        actions={canRevise ? <Link to={`/quotes/${q.id}/revise`} className="btn-primary">Revise quotation</Link> : undefined}
      />

      {notice && <div className="mb-4"><Alert kind="success">{notice}</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {revisions.length === 0 && <EmptyState title="No revisions found" />}
          {revisions.map((rev, index) => (
            <Card key={rev.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  Revision {rev.revisionNumber}
                  {index === 0 && <span className="ml-2 rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">Current</span>}
                </h2>
                <span className="text-xs text-slate-500">Saved {formatDeadline(rev.createdAt)}</span>
              </div>
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th className="th">Item</th>
                      <th className="th text-right">Qty</th>
                      <th className="th text-right">Unit price</th>
                      <th className="th text-right">Line total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rev.lineItems.map((l) => (
                      <tr key={l.rfqLineItemId}>
                        <td className="td">{l.itemName}</td>
                        <td className="td text-right tabular-nums">{l.quantity.toLocaleString('en-IN')} {l.unit}</td>
                        <td className="td text-right"><Money value={l.unitPrice} /></td>
                        <td className="td text-right"><Money value={l.lineTotal} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50">
                    <tr>
                      <td className="td font-semibold" colSpan={3}>Quotation total</td>
                      <td className="td text-right"><Money value={rev.totalAmount} className="font-semibold" /></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="inline text-slate-500">Delivery: </dt><dd className="inline font-medium">{rev.deliveryDays} days</dd></div>
                {rev.notes && <div className="sm:col-span-2"><dt className="text-slate-500">Notes</dt><dd className="whitespace-pre-wrap">{rev.notes}</dd></div>}
              </dl>
            </Card>
          ))}
        </div>

        <aside className="space-y-6">
          <Card>
            <h2 className="text-base font-semibold text-slate-900">Documents</h2>
            <div className="mt-3">
              <FileList files={q.attachments} />
            </div>
            {canUpload && <FileUploader uploadPath={`/quotes/${q.id}/attachments`} onUploaded={quote.reload} label="Attach a pricing document (PDF or XLSX)" />}
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-slate-900">History</h2>
            {history.loading && !history.data && <Spinner label="Loading history" />}
            {history.error && <Alert>{history.error}</Alert>}
            {history.data && (
              <ol className="mt-3 space-y-3 text-sm">
                {history.data.history.map((h) => (
                  <li key={h.id}>
                    <p className="font-medium text-slate-800">
                      {h.fromStatus ? `${humanize(h.fromStatus)} → ` : ''}{humanize(h.toStatus)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(h.createdAt)} · {h.actor?.name ?? 'System'}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
