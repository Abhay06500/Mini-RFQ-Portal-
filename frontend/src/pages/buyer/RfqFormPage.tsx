import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { apiRequest } from '../../api/client';
import type { Rfq } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Alert, BackLink, FieldError, PageHeader, Spinner } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { errorMessages } from '../../lib/errors';
import { fromIstInputValue, toIstInputValue } from '../../lib/format';
import { MONEY_PATTERN } from '../../lib/money';

const lineSchema = z.object({
  name: z.string().trim().min(1, 'Enter an item name').max(200),
  quantity: z
    .number({ invalid_type_error: 'Enter a number' })
    .int('Use a whole number')
    .min(1, 'Minimum is 1')
    .max(100000, 'Maximum is 100,000'),
  unit: z.string().trim().min(1, 'Enter a unit, for example pcs').max(30),
});

const schema = z.object({
  title: z.string().trim().min(3, 'At least 3 characters').max(200),
  description: z.string().trim().min(10, 'At least 10 characters').max(5000),
  category: z.string().trim().min(2, 'Enter a category').max(100),
  deliveryLocation: z.string().trim().min(2, 'Enter a delivery location').max(200),
  budget: z
    .string()
    .trim()
    .refine((v) => v === '' || (MONEY_PATTERN.test(v) && Number(v) > 0), 'Enter an amount such as 400000 or 400000.50'),
  deadline: z.string().min(1, 'Choose a submission deadline (IST)'),
  lineItems: z.array(lineSchema).min(1, 'Add at least one line item').max(50, 'At most 50 line items'),
});
type RfqFormValues = z.infer<typeof schema>;

export default function RfqFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { user } = useAuth();
  const navigate = useNavigate();
  const existing = useApi<{ rfq: Rfq }>(isEdit ? `/rfqs/${id}` : null);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const rfq = existing.data?.rfq;
  const locked = rfq?.status === 'PUBLISHED';

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<RfqFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      description: '',
      category: '',
      deliveryLocation: '',
      budget: '',
      deadline: '',
      lineItems: [{ name: '', quantity: 1, unit: 'pcs' }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lineItems' });

  useEffect(() => {
    if (!rfq) return;
    reset({
      title: rfq.title,
      description: rfq.description,
      category: rfq.category,
      deliveryLocation: rfq.deliveryLocation,
      budget: rfq.budget ?? '',
      deadline: toIstInputValue(rfq.deadline),
      lineItems: rfq.lineItems.map((l) => ({ name: l.name, quantity: l.quantity, unit: l.unit })),
    });
  }, [rfq, reset]);

  if (user?.role !== 'BUYER') return <Navigate to="/unauthorized" replace />;
  if (isEdit && existing.loading && !rfq) return <Spinner label="Loading RFQ" />;
  if (isEdit && existing.error) return <Alert>{existing.error}</Alert>;
  if (rfq && rfq.status !== 'DRAFT' && rfq.status !== 'PUBLISHED') {
    return <Navigate to={`/rfqs/${rfq.id}`} replace state={{ message: 'This RFQ can no longer be edited.' }} />;
  }

  const save = async (values: RfqFormValues, publishAfter: boolean) => {
    setServerErrors([]);
    setSaving(true);
    try {
      const budget = values.budget.trim() === '' ? null : values.budget.trim();
      const deadline = fromIstInputValue(values.deadline);
      let savedId = id;

      if (isEdit && locked) {
        // Published RFQs accept only these three fields. The server enforces this too.
        await apiRequest(`/rfqs/${id}`, {
          method: 'PATCH',
          body: { description: values.description, budget, deadline },
        });
      } else if (isEdit) {
        await apiRequest(`/rfqs/${id}`, {
          method: 'PATCH',
          body: { ...values, budget, deadline },
        });
      } else {
        const created = await apiRequest<{ rfq: Rfq }>('/rfqs', {
          body: { ...values, budget, deadline },
        });
        savedId = created.rfq.id;
      }

      if (publishAfter && savedId) {
        await apiRequest(`/rfqs/${savedId}/publish`, { method: 'POST' });
        navigate(`/rfqs/${savedId}`, { replace: true, state: { message: 'RFQ published. Vendors can now find and quote on it.' } });
      } else {
        navigate(`/rfqs/${savedId}`, { replace: true, state: { message: isEdit ? 'Changes saved.' : 'Draft saved.' } });
      }
    } catch (err) {
      setServerErrors(errorMessages(err));
    } finally {
      setSaving(false);
    }
  };

  const fieldsLocked = Boolean(locked);
  const minDeadline = toIstInputValue(new Date(Date.now() + 60 * 60 * 1000).toISOString());

  return (
    <>
      <BackLink to={isEdit ? `/rfqs/${id}` : '/buyer/rfqs'} label={isEdit ? 'Back to RFQ' : 'My RFQs'} />
      <PageHeader
        title={isEdit ? 'Edit RFQ' : 'New RFQ'}
        subtitle={
          fieldsLocked
            ? 'This RFQ is published. Vendors have seen the title, category, location and line items, so those are locked. You can still update the description, budget, and extend the deadline.'
            : 'Deadlines are entered in IST (Indian Standard Time).'
        }
      />

      <form className="space-y-6" onSubmit={handleSubmit((v) => save(v, false))} noValidate>
        <section className="card space-y-4">
          <h2 className="text-base font-semibold text-slate-900">Details</h2>
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" className="input" disabled={fieldsLocked} aria-invalid={errors.title ? 'true' : 'false'} {...register('title')} />
            <FieldError message={errors.title?.message} />
          </div>
          <div>
            <label className="label" htmlFor="description">Description</label>
            <textarea id="description" rows={4} className="input" aria-invalid={errors.description ? 'true' : 'false'} {...register('description')} />
            <FieldError message={errors.description?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="category">Category</label>
              <input id="category" className="input" disabled={fieldsLocked} aria-invalid={errors.category ? 'true' : 'false'} placeholder="Office Supplies" {...register('category')} />
              <FieldError message={errors.category?.message} />
            </div>
            <div>
              <label className="label" htmlFor="deliveryLocation">Delivery location</label>
              <input id="deliveryLocation" className="input" disabled={fieldsLocked} aria-invalid={errors.deliveryLocation ? 'true' : 'false'} placeholder="Hyderabad" {...register('deliveryLocation')} />
              <FieldError message={errors.deliveryLocation?.message} />
            </div>
            <div>
              <label className="label" htmlFor="budget">Budget in INR (optional)</label>
              <input id="budget" inputMode="decimal" className="input" placeholder="400000" aria-invalid={errors.budget ? 'true' : 'false'} {...register('budget')} />
              <FieldError message={errors.budget?.message} />
            </div>
            <div>
              <label className="label" htmlFor="deadline">Submission deadline (IST)</label>
              <input
                id="deadline"
                type="datetime-local"
                className="input"
                min={isEdit ? undefined : minDeadline}
                aria-invalid={errors.deadline ? 'true' : 'false'}
                {...register('deadline')}
              />
              <FieldError message={errors.deadline?.message} />
            </div>
          </div>
        </section>

        <section className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Line items</h2>
            <button
              type="button"
              className="btn-secondary"
              disabled={fieldsLocked}
              onClick={() => append({ name: '', quantity: 1, unit: 'pcs' })}
            >
              Add line item
            </button>
          </div>
          {errors.lineItems?.root?.message && <FieldError message={errors.lineItems.root.message} />}
          {typeof errors.lineItems?.message === 'string' && <FieldError message={errors.lineItems.message} />}
          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-start">
                <div>
                  <label className="label" htmlFor={`lineItems.${index}.name`}>Item name</label>
                  <input id={`lineItems.${index}.name`} className="input" disabled={fieldsLocked} aria-invalid={errors.lineItems?.[index]?.name ? 'true' : 'false'} {...register(`lineItems.${index}.name`)} />
                  <FieldError message={errors.lineItems?.[index]?.name?.message} />
                </div>
                <div>
                  <label className="label" htmlFor={`lineItems.${index}.quantity`}>Quantity</label>
                  <input id={`lineItems.${index}.quantity`} type="number" min={1} step={1} className="input" disabled={fieldsLocked} aria-invalid={errors.lineItems?.[index]?.quantity ? 'true' : 'false'} {...register(`lineItems.${index}.quantity`, { valueAsNumber: true })} />
                  <FieldError message={errors.lineItems?.[index]?.quantity?.message} />
                </div>
                <div>
                  <label className="label" htmlFor={`lineItems.${index}.unit`}>Unit</label>
                  <input id={`lineItems.${index}.unit`} className="input" disabled={fieldsLocked} aria-invalid={errors.lineItems?.[index]?.unit ? 'true' : 'false'} {...register(`lineItems.${index}.unit`)} />
                  <FieldError message={errors.lineItems?.[index]?.unit?.message} />
                </div>
                <div className="sm:pt-6">
                  <button type="button" className="btn-secondary w-full" disabled={fieldsLocked || fields.length === 1} onClick={() => remove(index)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {serverErrors.length > 0 && (
          <Alert>
            <ul className="list-disc space-y-1 pl-5">
              {serverErrors.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </Alert>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="submit" className="btn-secondary" disabled={saving}>
            {isEdit ? 'Save changes' : 'Save as draft'}
          </button>
          {(!isEdit || rfq?.status === 'DRAFT') && (
            <button type="button" className="btn-primary" disabled={saving} onClick={handleSubmit((v) => save(v, true))}>
              Save and publish
            </button>
          )}
        </div>
      </form>
    </>
  );
}
