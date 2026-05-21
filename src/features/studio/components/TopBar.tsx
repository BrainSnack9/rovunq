import {Clapperboard, Download, Loader2, RefreshCcw, Sparkles, Upload} from 'lucide-react';
import type {JobStatus} from '../types';
import {StatusPill} from './Primitives';

export function TopBar({
  isBusy,
  job,
  finalUrl,
  hasTimeline,
  onUpload,
  onRefresh,
}: {
  isBusy: boolean;
  job: JobStatus | null;
  finalUrl: string | null;
  hasTimeline: boolean;
  onUpload: () => void;
  onRefresh: () => void;
}) {
  return (
    <header className="flex h-16 items-center justify-between gap-3 px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-mint text-ink">
          <Clapperboard size={22} strokeWidth={2.4} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-black">ROVUNQ Studio</div>
          <div className="truncate text-xs text-zinc-500">{job?.id ?? 'New timeline'} · {hasTimeline ? 'editable timeline ready' : 'source first'}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {job ? <StatusPill status={job.status} /> : null}
        <button type="button" onClick={onUpload} className="toolbar-button">
          <Upload size={16} /> Source
        </button>
        <button type="submit" form="rovunq-editor-form" disabled={isBusy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-mint px-4 text-sm font-black text-ink disabled:cursor-not-allowed disabled:opacity-50">
          {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Generate
        </button>
        <button type="button" disabled={!job || isBusy} onClick={onRefresh} className="toolbar-button disabled:cursor-not-allowed disabled:opacity-50">
          <RefreshCcw size={16} />
        </button>
        {finalUrl ? (
          <a href={finalUrl} download="final-output.mp4" className="inline-flex h-10 items-center gap-2 rounded-lg border border-mint/50 bg-mint/10 px-4 text-sm font-black text-mint">
            <Download size={16} /> Export
          </a>
        ) : null}
      </div>
    </header>
  );
}
