import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { apiRequest } from '../../api/client';
import type { Quote, Rfq } from '../../api/types';
import { Alert, BackLink, FieldError, Money, PageHeader, Spinner } from '../../components/ui';
import { useApi } from '../../hooks/useApi';
import { errorMessages } from '../../lib/errors';
import { formatDeadline, formatINR } from '../../lib/format';
import { MONEY_PATTERN, previewTotal } from '../../lib/money';

const schema = z.object({
  deliveryDays: z
    .number({ invalid_type_error: 'Enter a number of days' })
    .int('Use a whole number of days')
    .min(1, 'At least 1 day')
    .max(365, 'At most 365 days'),
  notes: z.string().trim().max(2000, 'At most 2,000 characters'),
  prices: z.array(
    z.object({
      rfqLineItemId: z.string(),
      unitPrice: z
        .string()
        .trim()
        .refine((v) => MONEY_PATTERN.test(v) && Number(v) > 0, 'Enter a price such as 2000 or 2000.50'),
    }),
  ),
});
type QuoteFormValues = z.infer<typeof schema>;

interface QuoteFormProps {
  rfq: Rfq;
  /** Present when revising. Its values pre-fill the form. */
  existing?: Quote;
}

/** Quotation form for both first submission and revision. Totals shown here are a preview only. */
function QuoteForm({ rfq, existing }: QuoteFormProps) {
  const navigate = useNavigate();
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const current = existing?.currentRevision ?? null;
  const priceByLine = new Map((current?.lineItems ?? []).map((l) => [l.rfqLineItemId, l.unitPrice]));

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<QuoteFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      deliveryDays: current?.deliveryDays ?? 7,
      notes: current?.notes ?? '',
      prices: rfq.lineItems.map((li) => ({ rfqLineItemId: li.id, unitPrice: priceByLine.get(li.id) ?? '' })),
    },
  });

  const watchedPrices = watch('prices');
  const preview = previewTotal(
    rfq.lineItems.map((li, i) => ({ unitPrice: watchedPrices?.[i]?.unitPrice ?? '', quantity: li.quantity })),
  );

  const onSubmit = async (values: QuoteFormValues) => {
    setServerErrors([]);
    const body = {
      deliveryDays: values.deliveryDays,
      notes: values.notes.trim() === '' ? null : values.notes.trim(),
      lineItems: values.prices.map((p) => ({ rfqLineItemId: p.rfqLineItemId, unitPrice: p.unitPrice.trim() })),
    };
    try {
      const res = existing
        ? await apiRequest<{ quote: Quote }>(`/quotes/${existing.id}`, { method: 'PUT', body })
        : await apiRequest<{ quote: Quote }>(`/rfqs/${rfq.id}/quotes`, { body });
      navigate(`/quotes/${res.quote.id}`, {
        replace: true,
        state: {
          message: existing
            ? `Revision ${res.quote.currentRevision?.revisionNumber ?? ''} saved. Earlier revisions are kept in your history.`
            : 'Quotation submitted. You can revise it until the deadline.',
        },
      });
    } catch (err) {
      setServerErrors(errorMessages(err));
    }
  };

  return (
    <>
      <div className="card mb-6">
        <p className="text-sm text-slate-600">
          Deadline: <span className="font-medium text-slate-900">{formatDeadline(rfq.deadline)}</span>. The server accepts quotations only before this moment.
        </p>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
        <section className="card space-y-4">
          <h2 className="text-base font-semibold text-slate-900">Price per line item</h2>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="th">Item</th>
                  <th className="th text-right">Qty</th>
                  <th className="th">Unit price (INR)</th>
                  <th className="th text-right">Line total (preview)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rfq.lineItems.map((li, i) => {
                  const unit = watchedPrices?.[i]?.unitPrice ?? '';
                  const lineTotal = previewTotal([{ unitPrice: unit, quantity: li.quantity }]);
                  return (
                    <tr key={li.id}>
                      <td className="td">
                        <span className="font-medium text-slate-800">{li.name}</span>
                        <span className="block text-xs text-slate-500">per {li.unit}</span>
                        <input type="hidden" {...register(`prices.${i}.rfqLineItemId`)} />
                      </td>
                      <td className="td text-right tabular-nums">{li.quantity.toLocaleString('en-IN')}</td>
                      <td className="td">
                        <label className="sr-only" htmlFor={`price-${i}`}>Unit price for {li.name}</label>
                        <input
                          id={`price-${i}`}
                          inputMode="decimal"
                          className="input max-w-[10rem]"
                          placeholder="0.00"
                          aria-invalid={errors.prices?.[i]?.unitPrice ? 'true' : 'false'}
                          {...register(`prices.${i}.unitPrice`)}
                        />
                        <FieldError message={errors.prices?.[i]?.unitPrice?.message} />
                      </td>
                      <td className="td text-right tabular-nums">{lineTotal ? formatINR(lineTotal) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <p className="text-sm text-slate-500">Quotation total (preview). The server recalculates this on submit.</p>
            <p className="text-xl font-semibold text-slate-900"><Money value={preview} /></p>
          </div>
        </section>

        <section className="card grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="deliveryDays">Delivery time (days)</label>
            <input
              id="deliveryDays"
              type="number"
              min={1}
              max={365}
              step={1}
              className="input"
              aria-invalid={errors.deliveryDays ? 'true' : 'false'}
              {...register('deliveryDays', { valueAsNumber: true })}
            />
            <FieldError message={errors.deliveryDays?.message} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="notes">Notes for the buyer (optional)</label>
            <textarea id="notes" rows={3} className="input" aria-invalid={errors.notes ? 'true' : 'false'} {...register('notes')} />
            <FieldError message={errors.notes?.message} />
          </div>
        </section>

        {serverErrors.length > 0 && (
          <Alert>
            <ul className="list-disc space-y-1 pl-5">
              {serverErrors.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </Alert>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : existing ? 'Save revision' : 'Submit quotation'}
          </button>
        </div>
      </form>
    </>
  );
}

function ClosedNotice({ rfq }: { rfq: Rfq }) {
  return (
    <Alert kind="info">
      {rfq.status !== 'PUBLISHED'
        ? 'This RFQ is no longer accepting quotations.'
        : `The deadline (${formatDeadline(rfq.deadline)}) has passed, so quotations can no longer be submitted or changed.`}
    </Alert>
  );
}

/** First submission. If the vendor has already quoted, send them to revise instead. */
export function SubmitQuotePage() {
  const { id = '' } = useParams();
  const rfq = useApi<{ rfq: Rfq }>(`/rfqs/${id}`);
  if (rfq.loading && !rfq.data) return <Spinner label="Loading RFQ" />;
  if (rfq.error) return <Alert>{rfq.error}</Alert>;
  if (!rfq.data) return null;
  const r = rfq.data.rfq;
  if (r.myQuote) return <Navigate to={`/quotes/${r.myQuote.id}/revise`} replace />;
  const open = r.status === 'PUBLISHED' && new Date(r.deadline).getTime() > Date.now();
  return (
    <>
      <BackLink to={`/rfqs/${id}`} label="Back to RFQ" />
      <PageHeader title={`Quote: ${r.title}`} subtitle="Enter a unit price for every line item. You can revise your quotation until the deadline." />
      {open ? <QuoteForm rfq={r} /> : <ClosedNotice rfq={r} />}
    </>
  );
}

/** Revision of an existing quotation. Pre-filled from the latest revision. */
export function ReviseQuotePage() {
  const { id = '' } = useParams();
  const quote = useApi<{ quote: Quote }>(`/quotes/${id}`);
  const rfqId = quote.data?.quote.rfqId ?? null;
  const rfq = useApi<{ rfq: Rfq }>(rfqId ? `/rfqs/${rfqId}` : null);

  if ((quote.loading && !quote.data) || (rfqId && rfq.loading && !rfq.data)) return <Spinner label="Loading quotation" />;
  if (quote.error) return <Alert>{quote.error}</Alert>;
  if (rfq.error) return <Alert>{rfq.error}</Alert>;
  if (!quote.data || !rfq.data) return null;

  const q = quote.data.quote;
  const r = rfq.data.rfq;
  if (q.status !== 'SUBMITTED') return <Navigate to={`/quotes/${q.id}`} replace />;
  const open = r.status === 'PUBLISHED' && new Date(r.deadline).getTime() > Date.now();

  return (
    <>
      <BackLink to={`/quotes/${q.id}`} label="Back to quotation" />
      <PageHeader
        title={`Revise: ${r.title}`}
        subtitle={`This will save revision ${(q.currentRevision?.revisionNumber ?? 0) + 1}. Earlier revisions stay in your history.`}
      />
      {open ? <QuoteForm rfq={r} existing={q} /> : <ClosedNotice rfq={r} />}
    </>
  );
}
