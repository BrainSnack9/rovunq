import type {JobStatus, TimelineClip, TimelineProject} from '../types';
import {formatTime} from '../utils';
import {ActionButton, Control, ErrorBox, JobLog, TextInput} from './Primitives';

export function InspectorPanel(props: {
  job: JobStatus | null;
  error: string | null;
  progress: number;
  isBusy: boolean;
  timeline: TimelineProject | null;
  selectedClip: TimelineClip | null;
  selectedVideoClip: TimelineClip | null;
  selectedCaption?: TimelineClip;
  subtitleDraft: string;
  setSubtitleDraft: (value: string) => void;
  insertStart: string;
  setInsertStart: (value: string) => void;
  insertEnd: string;
  setInsertEnd: (value: string) => void;
  insertSubtitle: string;
  setInsertSubtitle: (value: string) => void;
  insertManualCut: () => void;
  applyManualEdit: (operation: Record<string, unknown>) => void;
}) {
  const clip = props.selectedVideoClip;
  return (
    <aside className="min-h-0 overflow-auto border-t border-line bg-panel lg:border-l lg:border-t-0">
      <div className="border-b border-line px-4 py-3">
        <div className="text-sm font-black">Inspector</div>
        <div className="mt-1 text-xs text-zinc-500">{props.timeline ? props.selectedClip?.id ?? 'Select a clip' : 'AI draft controls'}</div>
      </div>
      <div className="space-y-4 p-4">
        {props.job?.status === 'running' || props.job?.status === 'queued' || props.isBusy ? (
          <JobLog job={props.job} progress={props.progress} />
        ) : props.timeline && clip ? (
          <ClipInspector {...props} clip={clip} />
        ) : (
          <EmptyInspector />
        )}
        {props.error || props.job?.errorMessage ? <ErrorBox message={props.error ?? props.job?.errorMessage ?? ''} /> : null}
      </div>
    </aside>
  );
}

const EmptyInspector = () => (
  <div className="rounded-lg border border-mint/30 bg-mint/10 p-3">
    <div className="text-sm font-black text-mint">Create an AI draft</div>
    <p className="mt-2 text-xs leading-5 text-zinc-400">Add a source, write an edit request, then generate an editable timeline.</p>
  </div>
);

const ClipInspector = (props: Parameters<typeof InspectorPanel>[0] & {clip: TimelineClip}) => (
  <>
    <div className="rounded-lg border border-line bg-ink p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-black">{props.clip.id}</div>
        <span className="rounded-md bg-mint/10 px-2 py-1 text-xs font-bold text-mint">{String(props.clip.metadata.reason ?? 'clip')}</span>
      </div>
      <div className="mt-2 text-xs leading-5 text-zinc-400">
        Source {formatTime(props.clip.sourceStartSec)} - {formatTime(props.clip.sourceEndSec)}
        <br />
        Timeline {formatTime(props.clip.timelineStartSec)} - {formatTime(props.clip.timelineEndSec)}
      </div>
    </div>
    <Control title="Scene">
      <ActionButton disabled={props.isBusy} onClick={() => props.applyManualEdit({type: 'moveCut', cutId: props.clip.id, direction: 'up'})}>Move left</ActionButton>
      <ActionButton disabled={props.isBusy} onClick={() => props.applyManualEdit({type: 'moveCut', cutId: props.clip.id, direction: 'down'})}>Move right</ActionButton>
      <ActionButton disabled={props.isBusy} onClick={() => props.applyManualEdit({type: 'extendCut', cutId: props.clip.id, beforeSec: 1, afterSec: 0})}>+1s head</ActionButton>
      <ActionButton disabled={props.isBusy} onClick={() => props.applyManualEdit({type: 'extendCut', cutId: props.clip.id, beforeSec: 0, afterSec: 1})}>+1s tail</ActionButton>
      <ActionButton disabled={props.isBusy} onClick={() => props.applyManualEdit({type: 'removeCut', cutId: props.clip.id})}>Remove</ActionButton>
      <ActionButton disabled={props.isBusy} onClick={props.insertManualCut}>Insert</ActionButton>
    </Control>
    <Control title="Caption style">
      {(['top', 'center', 'bottom'] as const).map((position) => (
        <ActionButton key={position} active={props.selectedCaption?.style.position === position} disabled={props.isBusy} onClick={() => props.applyManualEdit({type: 'updateSubtitleStyle', cutId: props.clip.id, position})}>{position}</ActionButton>
      ))}
      {(['basic', 'entertainment', 'education', 'cinematic'] as const).map((style) => (
        <ActionButton key={style} active={props.selectedCaption?.style.preset === style} disabled={props.isBusy} onClick={() => props.applyManualEdit({type: 'updateSubtitleStyle', cutId: props.clip.id, style})}>{style}</ActionButton>
      ))}
    </Control>
    <Control title="Caption text">
      <textarea value={props.subtitleDraft} onChange={(event) => props.setSubtitleDraft(event.target.value)} className="col-span-2 min-h-[92px] resize-none rounded-md border border-line bg-panel p-2 text-sm outline-none focus:border-mint" />
      <button type="button" disabled={props.isBusy || !props.subtitleDraft.trim()} onClick={() => props.applyManualEdit({type: 'updateSubtitle', cutId: props.clip.id, text: props.subtitleDraft})} className="col-span-2 h-9 rounded-md bg-mint text-xs font-black text-ink disabled:cursor-not-allowed disabled:opacity-50">Apply text</button>
    </Control>
    <Control title="Manual insert">
      <TextInput label="Source start" value={props.insertStart} setValue={props.setInsertStart} placeholder="75 or 1:15" />
      <TextInput label="Source end" value={props.insertEnd} setValue={props.setInsertEnd} placeholder="83 or 1:23" />
      <div className="col-span-2"><TextInput label="Subtitle" value={props.insertSubtitle} setValue={props.setInsertSubtitle} placeholder="Manual insert" /></div>
    </Control>
  </>
);
