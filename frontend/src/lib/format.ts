/**
 * Display formatting only. Money arrives from the API as decimal strings and is shown with Indian
 * grouping (₹3,60,000.00). The frontend never uses these values to compute totals.
 * Deadlines are shown and entered in IST (UTC+05:30), the business's timezone.
 */
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

export function formatINR(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? inr.format(n) : '—';
}

const istDateTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const istDate = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function formatDeadline(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${istDateTime.format(new Date(iso))} IST`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return istDate.format(new Date(iso));
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** ISO instant -> "YYYY-MM-DDTHH:mm" wall-clock value in IST, for <input type="datetime-local">. */
export function toIstInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:mm" entered in IST -> ISO string with +05:30 (India has no DST). */
export function fromIstInputValue(local: string): string {
  return `${local}:00+05:30`;
}

export function humanize(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
