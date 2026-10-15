import { Link } from 'react-router-dom';
import type { MyQuoteSummary } from '../../api/types';
import { Alert, DeadlineText, EmptyState, Money, PageHeader, QuoteStatusBadge, RfqStatusBadge, Spinner } from '../../components/ui';
import { useApi } from '../../hooks/useApi';

export default function MyQuotesPage() {
  const list = useApi<{ items: MyQuoteSummary[] }>('/quotes/mine');
  return (
    <>
      <PageHeader title="My quotations" subtitle="Your submissions. You can revise any quotation until its RFQ deadline." />
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data && <Spinner label="Loading your quotations" />}
      {list.data && list.data.items.length === 0 && (
        <EmptyState title="You have not submitted any quotations yet">
          <Link to="/vendor/rfqs" className="font-medium text-brand-700 hover:underline">Find open RFQs</Link>
        </EmptyState>
      )}
      {list.data && list.data.items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="table-base">
            <thead>
              <tr>
                <th className="th">RFQ</th>
                <th className="th">RFQ status</th>
                <th className="th">Your quotation</th>
                <th className="th">Revision</th>
                <th className="th">Total</th>
                <th className="th">Deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.items.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link to={`/quotes/${q.id}`} className="font-medium text-brand-700 hover:underline">{q.rfq.title}</Link>
                  </td>
                  <td className="td"><RfqStatusBadge status={q.rfq.status} /></td>
                  <td className="td"><QuoteStatusBadge status={q.status} /></td>
                  <td className="td tabular-nums">{q.currentRevisionNumber ?? '—'}</td>
                  <td className="td"><Money value={q.totalAmount} /></td>
                  <td className="td"><DeadlineText iso={q.rfq.deadline} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
