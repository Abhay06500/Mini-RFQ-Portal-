import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { apiRequest } from '../../api/client';
import type { HistoryEntry, Rfq } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Alert, BackLink, Card, DeadlineText, EmptyState, Money, PageHeader, QuoteStatusBadge, RfqStatusBadge, Spinner } from '../../components/ui';
import { FileList, FileUploader } from '../../components/FileList';
import { useApi } from '../../hooks/useApi';
import { errorMessages } from '../../lib/errors';
import { formatDate, formatDeadline, humanize } from '../../lib/format';

export default function RfqDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const { user, hasRole } = useAuth();
  const detail = useApi<{ rfq: Rfq }>(`/rfqs/${id}`);
  const [notice, setNotice] = useState<string | null>((location.state as { message?: string } | null)?.message ?? null);
  const [errors, setErrors] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);

  const rfq = detail.data?.rfq;
  const isOwner = Boolean(rfq && user?.role === 'BUYER' && rfq.buyerId === user.id);
  const canSeeHistory = Boolean(rfq && (hasRole('ADMIN') || isOwner));
  const history = useApi<{ history: HistoryEntry[] }>(canSeeHistory ? `/rfqs/${id}/history` : null);

  if (detail.loading && !rfq) return <Spinner label="Loading RFQ" />;
  if (detail.error) return <><BackLink to="/" label="Dashboard" /><Alert>{detail.error}</Alert></>;
  if (!rfq || !user) return null;

  const isOpen = rfq.status === 'PUBLISHED' && new Date(rfq.deadline).getTime() > Date.now();
  const canEdit = isOwner && (rfq.status === 'DRAFT' || rfq.status === 'PUBLISHED');
  const canUpload = isOwner && (rfq.status === 'DRAFT' || rfq.status === 'PUBLISHED');
  const canCompare = (isOwner || hasRole('ADMIN')) && (rfq.status === 'CLOSED' || rfq.status === 'AWARDED' || hasRole('ADMIN'));

  const publish = async () => {
    setPublishing(true);
    setErrors([]);
    setNotice(null);
    try {
      await apiRequest(`/rfqs/${id}/publish`, { method: 'POST' });
      setNotice('RFQ published. Vendors can now find and quote on it.');
      detail.reload();
      history.reload();
    } catch (err) {
      setErrors(errorMessages(err));
    } finally {
      setPublishing(false);
    }
  };

  const backTo = user.role === 'BUYER' ? '/buyer/rfqs' : user.role === 'VENDOR' ? '/vendor/rfqs' : '/admin/rfqs';

  return (
    <>
      <BackLink to={backTo} label="Back to list" />
      <PageHeader
        title={rfq.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-3">
            <RfqStatusBadge status={rfq.status} />
            <span>{rfq.category}</span>
            <span>Delivery: {rfq.deliveryLocation}</span>
            <span>Deadline: <DeadlineText iso={rfq.deadline} /></span>
          </span>
        }
        actions={
          <>
            {canEdit && <Link to={`/rfqs/${rfq.id}/edit`} className="btn-secondary">Edit</Link>}
            {isOwner && rfq.status === 'DRAFT' && (
              <button type="button" className="btn-primary" onClick={publish} disabled={publishing}>
                {publishing ? 'Publishing…' : 'Publish RFQ'}
              </button>
            )}
            {canCompare && (
              <Link to={`/rfqs/${rfq.id}/compare`} className="btn-primary">
                Compare quotations
              </Link>
            )}
            {user.role === 'VENDOR' && isOpen && !rfq.myQuote && (
              <Link to={`/rfqs/${rfq.id}/quote`} className="btn-primary">Submit quotation</Link>
            )}
            {user.role === 'VENDOR' && isOpen && rfq.myQuote?.status === 'SUBMITTED' && (
              <Link to={`/quotes/${rfq.myQuote.id}/revise`} className="btn-primary">Revise quotation</Link>
            )}
          </>
        }
      />

      {notice && <div className="mb-4"><Alert kind="success">{notice}</Alert></div>}
      {errors.length > 0 && (
        <div className="mb-4">
          <Alert>
            <p className="mb-1 font-medium">This RFQ cannot be published yet:</p>
            <ul className="list-disc space-y-1 pl-5">
              {errors.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h2 className="text-base font-semibold text-slate-900">Description</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{rfq.description}</p>
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-slate-900">Line items</h2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="th">#</th>
                    <th className="th">Item</th>
                    <th className="th">Quantity</th>
                    <th className="th">Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rfq.lineItems.map((li, i) => (
                    <tr key={li.id}>
                      <td className="td tabular-nums">{i + 1}</td>
                      <td className="td font-medium">{li.name}</td>
                      <td className="td tabular-nums">{li.quantity.toLocaleString('en-IN')}</td>
                      <td className="td">{li.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-slate-900">Specification documents</h2>
            <div className="mt-3">
              <FileList files={rfq.attachments} />
            </div>
            {canUpload && (
              <FileUploader uploadPath={`/rfqs/${rfq.id}/attachments`} onUploaded={detail.reload} label="Attach a specification (PDF or XLSX)" />
            )}
          </Card>

          {canSeeHistory && (
            <Card>
              <h2 className="text-base font-semibold text-slate-900">Status history</h2>
              {history.loading && !history.data && <Spinner label="Loading history" />}
              {history.error && <Alert>{history.error}</Alert>}
              {history.data && history.data.history.length === 0 && <EmptyState title="No history recorded yet" />}
              {history.data && history.data.history.length > 0 && (
                <ol className="mt-3 space-y-3 text-sm">
                  {history.data.history.map((h) => (
                    <li key={h.id} className="flex gap-3">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-hidden="true" />
                      <div>
                        <p className="font-medium text-slate-800">
                          {h.fromStatus ? `${humanize(h.fromStatus)} → ` : ''}{humanize(h.toStatus)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDeadline(h.createdAt)} · {h.actor ? `${h.actor.name} (${humanize(h.actor.role)})` : 'System'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )}
        </div>

        <aside className="space-y-6">
          <Card>
            <h2 className="text-base font-semibold text-slate-900">Summary</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Budget</dt>
                <dd>{rfq.budget ? <Money value={rfq.budget} /> : 'Not disclosed'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Published</dt>
                <dd>{formatDate(rfq.publishedAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Last updated</dt>
                <dd>{formatDate(rfq.updatedAt)}</dd>
              </div>
              {rfq.quoteCount !== undefined && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Quotations received</dt>
                  <dd className="tabular-nums">{rfq.quoteCount}</dd>
                </div>
              )}
            </dl>
          </Card>

          {user.role === 'VENDOR' && (
            <Card>
              <h2 className="text-base font-semibold text-slate-900">Your quotation</h2>
              {rfq.myQuote ? (
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <QuoteStatusBadge status={rfq.myQuote.status} />
                    {rfq.myQuote.revisionNumber && <span className="text-slate-500">Revision {rfq.myQuote.revisionNumber}</span>}
                  </div>
                  <p>Total: <Money value={rfq.myQuote.totalAmount} className="font-semibold" /></p>
                  <Link to={`/quotes/${rfq.myQuote.id}`} className="font-medium text-brand-700 hover:underline">View quotation</Link>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600">
                  {isOpen ? 'You have not quoted yet.' : 'The deadline has passed. You can no longer quote on this RFQ.'}
                </p>
              )}
            </Card>
          )}

          {rfq.status === 'AWARDED' && (
            <Card>
              <h2 className="text-base font-semibold text-slate-900">Award</h2>
              <p className="mt-2 text-sm text-slate-700">
                Awarded {rfq.awardedAt ? `on ${formatDate(rfq.awardedAt)}` : ''}. One quotation was accepted and the others were rejected.
              </p>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
