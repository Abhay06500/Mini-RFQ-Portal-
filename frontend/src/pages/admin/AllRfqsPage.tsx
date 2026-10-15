import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Pagination, RfqStatus, RfqSummary } from '../../api/types';
import { Alert, DeadlineText, EmptyState, PageHeader, Pagination as PaginationControl, RfqStatusBadge, Spinner } from '../../components/ui';
import { useApi } from '../../hooks/useApi';

export default function AllRfqsPage() {
  const [status, setStatus] = useState<'' | RfqStatus>('');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (status) params.set('status', status);
  const list = useApi<{ items: RfqSummary[]; pagination: Pagination }>(`/admin/rfqs?${params.toString()}`);

  return (
    <>
      <PageHeader title="All RFQs" subtitle="Every request on the platform. Admins can view RFQs, quotations and histories." />
      <div className="mb-4">
        <label className="label" htmlFor="admin-status">Status</label>
        <select id="admin-status" className="input max-w-xs" value={status} onChange={(e) => { setStatus(e.target.value as '' | RfqStatus); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="CLOSED">Closed</option>
          <option value="AWARDED">Awarded</option>
        </select>
      </div>
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data && <Spinner label="Loading RFQs" />}
      {list.data && list.data.items.length === 0 && <EmptyState title="No RFQs for this filter" />}
      {list.data && list.data.items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="table-base">
            <thead>
              <tr>
                <th className="th">Title</th>
                <th className="th">Status</th>
                <th className="th">Deadline</th>
                <th className="th text-right">Quotations</th>
                <th className="th"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.items.map((r) => (
                <tr key={r.id}>
                  <td className="td"><Link to={`/rfqs/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.title}</Link></td>
                  <td className="td"><RfqStatusBadge status={r.status} /></td>
                  <td className="td"><DeadlineText iso={r.deadline} /></td>
                  <td className="td text-right tabular-nums">{r.quoteCount ?? 0}</td>
                  <td className="td text-right">
                    <Link to={`/rfqs/${r.id}/compare`} className="font-medium text-slate-700 hover:underline">Comparison</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.data && <PaginationControl page={list.data.pagination.page} totalPages={list.data.pagination.totalPages} onPageChange={setPage} />}
    </>
  );
}
