import type {ReactNode} from 'react';
import {AlertCircle, CheckCircle2, Clapperboard, Loader2} from 'lucide-react';
import type {JobLogEntry, JobStatus} from '../types';

export const SmallButton = ({children, onClick}: {children: ReactNode; onClick: () => void}) => (
  <button type="button" onClick={onClick} className="h-9 rounded-md border border-line bg-panel px-2 text-xs font-bold text-zinc-300 transition hover:border-mint hover:text-white">
    {children}
  </button>
);

export const ActionButton = ({children, disabled, active, onClick}: {children: ReactNode; disabled?: boolean; active?: boolean; onClick: () => void}) => (
  <button type="button" disabled={disabled} onClick={onClick} className={`rounded-md border px-2 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${active ? 'border-mint bg-mint text-ink' : 'border-line bg-panel text-zinc-300 hover:border-mint hover:text-white'}`}>
    {children}
  </button>
);

export const TextInput = ({label, value, setValue, placeholder}: {label: string; value: string; setValue: (value: string) => void; placeholder: string}) => (
  <label className="block">
    <span className="text-xs font-semibold text-zinc-500">{label}</span>
    <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} className="mt-1 h-9 w-full rounded-md border border-line bg-panel px-2 text-xs outline-none focus:border-mint" />
  </label>
);

export const Control = ({title, children}: {title: string; children: ReactNode}) => (
  <div className="rounded-lg border border-line bg-ink p-3">
    <div className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">{title}</div>
    <div className="mt-2 grid grid-cols-2 gap-2">{children}</div>
  </div>
);

export const ErrorBox = ({message}: {message: string}) => (
  <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
    <AlertCircle size={18} className="shrink-0" />
    {message}
  </div>
);

export const StatusPill = ({status}: {status: JobStatus['status']}) => (
  <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-xs font-bold ${status === 'completed' ? 'border-mint/40 bg-mint/10 text-mint' : status === 'failed' ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-amber/40 bg-amber/10 text-amber'}`}>
    {status === 'completed' ? <CheckCircle2 size={14} /> : status === 'failed' ? <AlertCircle size={14} /> : <Loader2 size={14} className="animate-spin" />}
    {status}
  </span>
);

export const EmptyPreview = ({job}: {job: JobStatus | null}) => (
  <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-panel text-mint">
      {job?.status === 'running' || job?.status === 'queued' ? <Loader2 className="animate-spin" size={34} /> : <Clapperboard size={34} />}
    </div>
    <div>
      <div className="text-lg font-black">{job ? 'Rendering preview' : 'Your timeline preview will appear here'}</div>
      <p className="mt-2 text-sm leading-6 text-zinc-500">
        {job ? 'The draft is being generated. Watch progress in the inspector.' : 'Start with a source, then create an AI timeline draft.'}
      </p>
    </div>
  </div>
);

export const JobLog = ({job, progress}: {job: JobStatus | null; progress: number}) => (
  <div className="min-h-0 rounded-lg border border-line bg-ink">
    <div className="flex items-center justify-between border-b border-line px-3 py-2">
      <span className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Job Log</span>
      <span className="text-xs text-zinc-500">{progress}%</span>
    </div>
    <div className="h-1 bg-zinc-800"><div className="h-full bg-mint transition-all" style={{width: `${progress}%`}} /></div>
    <div className="max-h-[360px] overflow-auto p-3">
      {job?.logs.length ? <div className="space-y-2">{job.logs.map((entry, index) => <LogLine key={`${entry.at}-${index}`} entry={entry} />)}</div> : <p className="text-sm leading-6 text-zinc-500">Logs appear after the job starts.</p>}
    </div>
  </div>
);

export const TrackHint = ({text}: {text: string}) => <div className="flex h-full items-center px-3 text-xs text-zinc-600">{text}</div>;

export const TrackSkeleton = ({label, hint}: {label: string; hint?: string}) => (
  <div className="grid min-w-[680px] grid-cols-[92px_1fr] gap-3">
    <div className="flex h-12 items-center text-xs font-bold text-zinc-500">{label}</div>
    <div className="relative h-12 overflow-hidden rounded-lg border border-line bg-ink">
      <TrackHint text={hint ?? `${label} track`} />
    </div>
  </div>
);

const LogLine = ({entry}: {entry: JobLogEntry}) => (
  <div className="grid grid-cols-[78px_1fr] gap-2 text-xs leading-5">
    <span className="text-zinc-600">{entry.step}</span>
    <span className={entry.status === 'ok' ? 'text-mint' : entry.status === 'error' ? 'text-red-300' : entry.status === 'warn' ? 'text-amber' : 'text-zinc-300'}>{entry.message}</span>
  </div>
);
