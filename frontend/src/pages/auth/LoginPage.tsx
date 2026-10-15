import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../../auth/AuthContext';
import { Alert, FieldError } from '../../components/ui';
import { errorMessages } from '../../lib/errors';

const schema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
type LoginValues = z.infer<typeof schema>;

const DEMO_ACCOUNTS = [
  { role: 'Buyer', email: 'buyer@acme.example', password: 'Buyer@12345' },
  { role: 'Vendor', email: 'vendor@officeworld.example', password: 'Vendor@12345' },
  { role: 'Admin', email: 'admin@rfq.example', password: 'Admin@12345' },
];

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: string; registered?: boolean } | null;
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  if (user) return <Navigate to={state?.from ?? '/'} replace />;

  const onSubmit = async (values: LoginValues) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      navigate(state?.from ?? '/', { replace: true });
    } catch (err) {
      setServerError(errorMessages(err)[0]);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">R</span>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">Sign in to RFQ Portal</h1>
        <p className="mt-1 text-sm text-slate-500">Publish requests, submit quotations, and award with confidence.</p>
      </div>

      <div className="card">
        {state?.registered && <Alert kind="success">Account created. You can sign in now.</Alert>}
        <form className="mt-1 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="input"
              aria-invalid={errors.email ? 'true' : 'false'}
              {...register('email')}
            />
            <FieldError message={errors.email?.message} />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="input"
              aria-invalid={errors.password ? 'true' : 'false'}
              {...register('password')}
            />
            <FieldError message={errors.password?.message} />
          </div>
          {serverError && <Alert>{serverError}</Alert>}
          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-600">
          New to the portal?{' '}
          <Link to="/register" className="font-medium text-brand-700 hover:underline">
            Create an account
          </Link>
        </p>
      </div>

      {import.meta.env.DEV && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <p className="mb-2 font-semibold">Demo accounts (local development only)</p>
          <ul className="space-y-1">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <span className="font-medium">{a.role}:</span> {a.email} / {a.password}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
