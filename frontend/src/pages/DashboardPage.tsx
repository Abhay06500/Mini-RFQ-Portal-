import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Card, PageHeader } from '../components/ui';
import type { Role } from '../api/types';

const ACTIONS: Record<Role, { title: string; description: string; to: string }[]> = {
  BUYER: [
    { title: 'Create an RFQ', description: 'Describe what you need, add line items, and save a draft or publish it.', to: '/buyer/rfqs/new' },
    { title: 'My RFQs', description: 'Track drafts, open requests, and awards. Compare quotations after each deadline.', to: '/buyer/rfqs' },
  ],
  VENDOR: [
    { title: 'Find open RFQs', description: 'Search published requests by keyword, category, location, and deadline.', to: '/vendor/rfqs' },
    { title: 'My quotations', description: 'Review what you submitted, revise before the deadline, and see outcomes.', to: '/vendor/quotes' },
  ],
  ADMIN: [
    { title: 'Manage users', description: 'Change roles, and enable or disable accounts.', to: '/admin/users' },
    { title: 'All RFQs', description: 'View every RFQ on the platform, with its status and quotation count.', to: '/admin/rfqs' },
  ],
};

export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <>
      <PageHeader title={`Welcome, ${user.name}`} subtitle="Choose where to start." />
      <div className="grid gap-4 md:grid-cols-2">
        {ACTIONS[user.role].map((action) => (
          <Card key={action.to}>
            <h2 className="text-lg font-semibold text-slate-900">{action.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{action.description}</p>
            <Link to={action.to} className="btn-primary mt-4">
              Open
            </Link>
          </Card>
        ))}
      </div>
    </>
  );
}
