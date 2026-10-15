import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Pagination, RfqStatus, RfqSummary } from '../../api/types';
import { EmptyState, PageHeader, Pagination as PaginationControl, RfqStatusBadge, Alert, DeadlineText, Spinner } from '../../components/ui';
import { useApi } from '../../hooks/useApi';

const FILTERS: { value: '' | RfqStatus; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'AWARDED', label: 'Awarded' },
];

export default function BuyerRfqListPage() {
  const [status, setStatus] = useState<'' | RfqStatus>('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: '10' });
  if (status) params.set('status', status);
  const list = useApi<{ items: RfqSummary[]; pagination: Pagination }>(`/rfqs/mine?${params.toString()}`);

  return (
    <>
      <PageHeader
        title="My RFQs"
        subtitle="Requests you have created. Quotations become visible for comparison once an RFQ closes."
        actions={<Link to="/buyer/rfqs/new" className="btn-primary">New RFQ</Link>}
      />

      <div className="mb-4 flex items-center gap-3">
        <label htmlFor="status-filter" className="text-sm font-medium text-slate-700">Status</label>
        <select
          id="status-filter"
          className="input max-w-xs"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as '' | RfqStatus);
            setPage(1);
          }}
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data && <Spinner label="Loading your RFQs" />}

      {list.data && list.data.items.length === 0 && (
        <EmptyState title="No RFQs yet">
          Create your first request and publish it when you are ready for vendors to quote.
        </EmptyState>
      )}

      {list.data && list.data.items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="table-base">
            <thead>
              <tr>
                <th className="th">Title</th>
                <th className="th">Status</th>
                <th className="th">Deadline</th>
                <th className="th">Quotations</th>
                <th className="th"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.items.map((rfq) => (
                <tr key={rfq.id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link to={`/rfqs/${rfq.id}`} className="font-medium text-brand-700 hover:underline">{rfq.title}</Link>
                    <p className="text-xs text-slate-500">{rfq.category} · {rfq.deliveryLocation}</p>
                  </td>
                  <td className="td"><RfqStatusBadge status={rfq.status} /></td>
                  <td className="td"><DeadlineText iso={rfq.deadline} /></td>
                  <td className="td tabular-nums">{rfq.quoteCount ?? 0}</td>
                  <td className="td text-right">
                    <div className="flex justify-end gap-3 text-sm">
                      {(rfq.status === 'DRAFT' || rfq.status === 'PUBLISHED') && (
                        <Link to={`/rfqs/${rfq.id}/edit`} className="font-medium text-slate-700 hover:underline">Edit</Link>
                      )}
                      {(rfq.status === 'CLOSED' || rfq.status === 'AWARDED') && (
                        <Link to={`/rfqs/${rfq.id}/compare`} className="font-medium text-brand-700 hover:underline">Compare</Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list.data && (
        <PaginationControl page={list.data.pagination.page} totalPages={list.data.pagination.totalPages} onPageChange={setPage} />
      )}
    </>
  );
}
