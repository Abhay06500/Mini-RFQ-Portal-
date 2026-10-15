import { useState, type ChangeEvent, type FormEvent } from 'react';
import { apiRequest, describeError, fileDownloadUrl } from '../api/client';
import type { FileAttachment } from '../api/types';
import { formatBytes, formatDate } from '../lib/format';
import { Alert } from './ui';

const ACCEPTED = '.pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_MB = 10;

export function FileList({ files }: { files: FileAttachment[] }) {
  if (files.length === 0) return <p className="text-sm text-slate-500">No documents attached.</p>;
  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {files.map((f) => (
        <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-800">{f.originalName}</p>
            <p className="text-xs text-slate-500">
              {f.kind} · {formatBytes(f.sizeBytes)} · uploaded {formatDate(f.createdAt)}
            </p>
          </div>
          <a className="btn-secondary shrink-0" href={fileDownloadUrl(f.id)} download>
            Download
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Uploads one PDF or XLSX. Client checks are a convenience; the server re-validates everything. */
export function FileUploader({ uploadPath, onUploaded, label = 'Upload a PDF or XLSX file' }: {
  uploadPath: string;
  onUploaded: () => void;
  label?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const picked = e.target.files?.[0] ?? null;
    if (picked) {
      const lower = picked.name.toLowerCase();
      if (!lower.endsWith('.pdf') && !lower.endsWith('.xlsx')) {
        setError('Only PDF and XLSX files can be uploaded.');
        setFile(null);
        return;
      }
      if (picked.size > MAX_MB * 1024 * 1024) {
        setError(`The file must be ${MAX_MB} MB or smaller.`);
        setFile(null);
        return;
      }
    }
    setFile(picked);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return setError('Choose a file first.');
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      await apiRequest(uploadPath, { form });
      setFile(null);
      setInputKey((k) => k + 1);
      onUploaded();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-2" aria-label="Upload document">
      <label className="label" htmlFor={`upload-${uploadPath}`}>
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          key={inputKey}
          id={`upload-${uploadPath}`}
          type="file"
          accept={ACCEPTED}
          onChange={onChange}
          className="block text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
        />
        <button type="submit" className="btn-primary" disabled={!file || busy}>
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {error && <Alert>{error}</Alert>}
    </form>
  );
}
