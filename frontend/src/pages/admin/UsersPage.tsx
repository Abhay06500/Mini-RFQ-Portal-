import { useState } from 'react';
import type { Pagination, Role, User } from '../../api/types';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Alert, EmptyState, PageHeader, Pagination as PaginationControl, Spinner } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { errorMessages } from '../../lib/errors';
import { formatDate, humanize } from '../../lib/format';

const ROLES: Role[] = ['BUYER', 'VENDOR', 'ADMIN'];

export default function UsersPage() {
  const { user: me } = useAuth();
  const [role, setRole] = useState<'' | Role>('');
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (role) params.set('role', role);
  if (applied) params.set('q', applied);
  const list = useApi<{ items: User[]; pagination: Pagination }>(`/admin/users?${params.toString()}`);

  const update = async (target: User, changes: { role?: Role; isActive?: boolean }) => {
    if (changes.role && !window.confirm(`Change ${target.name} from ${humanize(target.role)} to ${humanize(changes.role)}?`)) return;
    setErrors([]);
    setNotice(null);
    try {
      await apiRequest(`/admin/users/${target.id}`, { method: 'PATCH', body: changes });
      setNotice(`Updated ${target.name}.`);
      list.reload();
    } catch (err) {
      setErrors(errorMessages(err));
    }
  };

  return (
    <>
      <PageHeader title="Users" subtitle="Manage roles and account access. Changes take effect on the next request." />

      <form
        className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(q.trim());
          setPage(1);
        }}
      >
        <div className="flex-1">
          <label className="label" htmlFor="user-q">Search name or email</label>
          <input id="user-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="user-role">Role</label>
          <select id="user-role" className="input" value={role} onChange={(e) => { setRole(e.target.value as '' | Role); setPage(1); }}>
            <option value="">All roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      {notice && <div className="mb-4"><Alert kind="success">{notice}</Alert></div>}
      {errors.length > 0 && <div className="mb-4"><Alert>{errors.map((m) => <p key={m}>{m}</p>)}</Alert></div>}
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data && <Spinner label="Loading users" />}
      {list.data && list.data.items.length === 0 && <EmptyState title="No users match this search" />}

      {list.data && list.data.items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="table-base">
            <thead>
              <tr>
                <th className="th">Name</th>
                <th className="th">Email</th>
                <th className="th">Role</th>
                <th className="th">Account</th>
                <th className="th">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.items.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id}>
                    <td className="td font-medium text-slate-800">{u.name} {self && <span className="text-xs text-slate-500">(you)</span>}</td>
                    <td className="td">{u.email}</td>
                    <td className="td">
                      <label className="sr-only" htmlFor={`role-${u.id}`}>Role for {u.name}</label>
                      <select
                        id={`role-${u.id}`}
                        className="input max-w-[9rem] py-1"
                        value={u.role}
                        disabled={self}
                        onChange={(e) => update(u, { role: e.target.value as Role })}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
                      </select>
                    </td>
                    <td className="td">
                      <button
                        type="button"
                        className={u.isActive ? 'btn-secondary' : 'btn-danger'}
                        disabled={self}
                        onClick={() => update(u, { isActive: !u.isActive })}
                      >
                        {u.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <span className="ml-2 text-xs text-slate-500">{u.isActive ? 'Active' : 'Disabled'}</span>
                    </td>
                    <td className="td">{formatDate(u.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {list.data && <PaginationControl page={list.data.pagination.page} totalPages={list.data.pagination.totalPages} onPageChange={setPage} />}
    </>
  );
}
