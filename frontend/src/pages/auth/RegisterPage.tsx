import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { apiRequest } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Alert, FieldError } from '../../components/ui';
import { errorMessages } from '../../lib/errors';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter your company or full name').max(120),
    email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
    role: z.enum(['BUYER', 'VENDOR'], { errorMap: () => ({ message: 'Choose Buyer or Vendor' }) }),
    password: z.string().min(8, 'Use at least 8 characters').max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
type RegisterValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(schema), defaultValues: { role: 'BUYER' } });

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (values: RegisterValues) => {
    setServerError(null);
    try {
      await apiRequest('/auth/register', {
        body: { name: values.name, email: values.email, password: values.password, role: values.role },
      });
      navigate('/login', { replace: true, state: { registered: true } });
    } catch (err) {
      setServerError(errorMessages(err)[0]);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <h1 className="mb-6 text-center text-2xl font-semibold text-slate-900">Create your account</h1>
      <div className="card">
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div>
            <label className="label" htmlFor="name">Company or full name</label>
            <input id="name" className="input" aria-invalid={errors.name ? 'true' : 'false'} {...register('name')} />
            <FieldError message={errors.name?.message} />
          </div>
          <div>
            <label className="label" htmlFor="email">Work email</label>
            <input id="email" type="email" autoComplete="email" className="input" aria-invalid={errors.email ? 'true' : 'false'} {...register('email')} />
            <FieldError message={errors.email?.message} />
          </div>
          <fieldset>
            <legend className="label">I want to</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-300 p-3 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                <input type="radio" value="BUYER" className="mt-1" {...register('role')} />
                <span>
                  <span className="font-medium">Publish RFQs</span>
                  <span className="block text-xs text-slate-500">Buyer</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-300 p-3 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                <input type="radio" value="VENDOR" className="mt-1" {...register('role')} />
                <span>
                  <span className="font-medium">Quote on RFQs</span>
                  <span className="block text-xs text-slate-500">Vendor</span>
                </span>
              </label>
            </div>
            <FieldError message={errors.role?.message} />
          </fieldset>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="new-password" className="input" aria-invalid={errors.password ? 'true' : 'false'} {...register('password')} />
            <FieldError message={errors.password?.message} />
          </div>
          <div>
            <label className="label" htmlFor="confirmPassword">Confirm password</label>
            <input id="confirmPassword" type="password" autoComplete="new-password" className="input" aria-invalid={errors.confirmPassword ? 'true' : 'false'} {...register('confirmPassword')} />
            <FieldError message={errors.confirmPassword?.message} />
          </div>
          {serverError && <Alert>{serverError}</Alert>}
          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-600">
          Already registered?{' '}
          <Link to="/login" className="font-medium text-brand-700 hover:underline">Sign in</Link>
        </p>
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">
        Administrator accounts are created by an administrator with an invitation code.
      </p>
    </div>
  );
}
