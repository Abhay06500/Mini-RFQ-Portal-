import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">We could not find that page</h1>
      <p className="mt-2 text-sm text-slate-600">The link may be out of date, or the item may not be visible to your account.</p>
      <Link to="/" className="btn-primary mt-6">Go to dashboard</Link>
    </div>
  );
}

export function UnauthorizedPage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-rose-700">403</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Your role cannot open this page</h1>
      <p className="mt-2 text-sm text-slate-600">If you think this is a mistake, contact your administrator.</p>
      <Link to="/" className="btn-primary mt-6">Go to dashboard</Link>
    </div>
  );
}
