import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Spinner } from './ui';

const NAV: Record<Role, { to: string; label: string }[]> = {
  BUYER: [
    { to: '/buyer/rfqs', label: 'My RFQs' },
    { to: '/buyer/rfqs/new', label: 'New RFQ' },
  ],
  VENDOR: [
    { to: '/vendor/rfqs', label: 'Open RFQs' },
    { to: '/vendor/quotes', label: 'My quotations' },
  ],
  ADMIN: [
    { to: '/admin/rfqs', label: 'All RFQs' },
    { to: '/admin/users', label: 'Users' },
  ],
};

const ROLE_LABEL: Record<Role, string> = { BUYER: 'Buyer', VENDOR: 'Vendor', ADMIN: 'Administrator' };

/**
 * Route guard. With no roles it requires a signed-in user. With roles it also checks the user's
 * role. This only shapes the UI. The API enforces the same rules on every request.
 */
export function RequireRole({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Checking your session" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return <Outlet />;
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm text-white">R</span>
            RFQ Portal
          </Link>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
            {NAV[user.role].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <div className="text-right">
              <p className="font-medium text-slate-800">{user.name}</p>
              <p className="text-xs text-slate-500">{ROLE_LABEL[user.role]}</p>
            </div>
            <button type="button" className="btn-secondary" onClick={onLogout}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
