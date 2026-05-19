'use client';

import {FormEvent, ReactNode, useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  Download,
  FileVideo,
  HelpCircle,
  Link,
  Loader2,
  Play,
  Plus,
  RefreshCcw,
  Scissors,
  Sparkles,
  Upload,
} from 'lucide-react';

type JobLogEntry = {at: string; step: string; status: 'start' | 'ok' | 'warn' | 'error'; message: string};
type JobStatus = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  errorMessage?: string;
  progress?: {stage: string; overallProgress: number; stageProgress: number};
  logs: JobLogEntry[];
  artifacts: {finalOutput: string | null; transcript: string; editPlan: string; renderPlan: string; intermediateCut: string};
};
type RenderCut = {id: string; sourceStartSec: number; sourceEndSec: number; outputStartSec?: number; outputEndSec?: number; reason: string};
type RenderSubtitle = {id: string; startSec: number; endSec: number; text: string; position: 'top' | 'center' | 'bottom'; style: string};
type RenderPlan = {
  finalDurationSec?: number;
  cuts: RenderCut[];
  subtitles: RenderSubtitle[];
  cta?: {enabled: boolean; startSec: number; endSec: number; text: string};
};

const defaultInstruction =
  'Find the strongest short-form moments from the full source. Remove slow parts, keep emotional reactions, use large entertainment subtitles, and add a final CTA.';
const steps = ['download', 'input', 'audio', 'transcribe', 'plan', 'cut', 'vertical', 'remotion'] as const;
const tourSteps = [
  {
    target: 'source',
    title: '1. Add your source',
    body: 'Paste a YouTube URL or upload a local video. For long videos, set a smaller source range first.',
    side: 'left',
  },
  {
    target: 'ai',
    title: '2. Describe the draft',
    body: 'Tell the AI what kind of short you want. The chips are quick presets you can add to the prompt.',
    side: 'right',
  },
  {
    target: 'render',
    title: '3. Create the AI draft',
    body: 'Click Render or Start AI Draft. While it runs, this side panel changes into progress and logs.',
    side: 'top',
  },
  {
    target: 'preview',
    title: '4. Review the short',
    body: 'The vertical preview appears here. Use it to judge pacing, framing, captions, and audio.',
    side: 'center',
  },
  {
    target: 'timeline',
    title: '5. Pick a cut',
    body: 'After render, select a cut on the timeline. The selected cut opens editing controls on the right.',
    side: 'bottom',
  },
  {
    target: 'edit',
    title: '6. Refine manually',
    body: 'Move, extend, remove, insert scenes, and adjust subtitle text, style, and position.',
    side: 'right',
  },
  {
    target: 'export',
    title: '7. Export',
    body: 'When the result feels right, download the final MP4 from the toolbar or preview controls.',
    side: 'top',
  },
] as const;

const formatTime = (seconds = 0) => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = Math.floor(safe % 60);
  const tenths = Math.round((safe % 1) * 10);
  return `${minutes}:${String(rest).padStart(2, '0')}.${tenths}`;
};

const parseSeconds = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map((part) => Number.parseFloat(part));
    if (parts.some((part) => !Number.isFinite(part))) return undefined;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export default function Home() {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [instruction, setInstruction] = useState(defaultInstruction);
  const [file, setFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [sourceStartMin, setSourceStartMin] = useState('');
  const [sourceDurationMin, setSourceDurationMin] = useState('');
  const [job, setJob] = useState<JobStatus | null>(null);
  const [renderPlan, setRenderPlan] = useState<RenderPlan | null>(null);
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);
  const [subtitleDraft, setSubtitleDraft] = useState('');
  const [insertStart, setInsertStart] = useState('');
  const [insertEnd, setInsertEnd] = useState('');
  const [insertSubtitle, setInsertSubtitle] = useState('Manual insert');
  const [error, setError] = useState<string | null>(null);
  const [skipOpenai, setSkipOpenai] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isManualEditing, setIsManualEditing] = useState(false);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const sourceVideoRef = useRef<HTMLVideoElement | null>(null);

  const activeJobId = job?.id;
  const duration = renderPlan?.finalDurationSec ?? 60;
  const selectedCut = renderPlan?.cuts.find((cut) => cut.id === selectedCutId) ?? renderPlan?.cuts[0] ?? null;
  const selectedSubtitle = selectedCut
    ? renderPlan?.subtitles.find((subtitle) => subtitle.startSec >= (selectedCut.outputStartSec ?? 0) && subtitle.startSec < (selectedCut.outputEndSec ?? duration))
    : null;
  const isBusy = isSubmitting || isManualEditing || job?.status === 'queued' || job?.status === 'running';
  const finalUrl = job?.artifacts.finalOutput ? `${job.artifacts.finalOutput}?t=${job.logs.length}` : null;
  const sourceUrl = job ? `/api/jobs/${job.id}/artifact/source-video?t=${job.logs.length}` : null;
  const hasSource = Boolean(file || youtubeUrl.trim() || sourceUrl);
  const activeStage = isBusy ? 2 : renderPlan ? 3 : hasSource ? 2 : 1;
  const activeTourTarget = tourStep === null ? null : tourSteps[tourStep]?.target;
  const tourClass = (target: string) =>
    activeTourTarget === target ? 'relative z-30 ring-2 ring-mint ring-offset-4 ring-offset-ink shadow-[0_0_40px_rgba(46,242,197,0.18)]' : '';

  useEffect(() => {
    if (!activeJobId || job?.status === 'completed' || job?.status === 'failed') return;
    const timer = window.setInterval(async () => setJob(await fetchJob(activeJobId)), 1600);
    return () => window.clearInterval(timer);
  }, [activeJobId, job?.status]);

  useEffect(() => {
    if (!job || job.status !== 'completed') return;
    let ignore = false;
    const load = async () => {
      const response = await fetch(`${job.artifacts.renderPlan}?t=${job.logs.length}`, {cache: 'no-store'});
      if (!response.ok) return;
      const payload = (await response.json()) as RenderPlan;
      if (ignore) return;
      setRenderPlan(payload);
      setSelectedCutId((current) => (current && payload.cuts.some((cut) => cut.id === current) ? current : payload.cuts[0]?.id ?? null));
    };
    void load().catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [job]);

  useEffect(() => setSubtitleDraft(selectedSubtitle?.text ?? ''), [selectedSubtitle?.id, selectedSubtitle?.text]);

  const progress = useMemo(() => {
    if (job?.progress) return job.progress.overallProgress;
    if (!job) return 0;
    const done = new Set(job.logs.filter((entry) => entry.status === 'ok').map((entry) => entry.step));
    return Math.round((steps.filter((step) => done.has(step)).length / steps.length) * 100);
  }, [job]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setRenderPlan(null);
    setSelectedCutId(null);
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.set('instruction', instruction);
      formData.set('skipOpenai', String(skipOpenai));
      if (sourceStartMin.trim()) formData.set('sourceStartSec', String(Number.parseFloat(sourceStartMin) * 60));
      if (sourceDurationMin.trim()) formData.set('sourceDurationSec', String(Number.parseFloat(sourceDurationMin) * 60));
      if (file) formData.set('video', file);
      else formData.set('youtubeUrl', youtubeUrl);
      if (audioFile) formData.set('audio', audioFile);
      const response = await fetch('/api/jobs', {method: 'POST', body: formData});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Unable to start job.');
      setJob(await fetchJob(payload.jobId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unknown error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const applyManualEdit = async (operation: Record<string, unknown>) => {
    if (!job) {
      setError('Create an AI draft first.');
      return;
    }
    setError(null);
    setIsManualEditing(true);
    try {
      const response = await fetch(`/api/jobs/${job.id}/edit`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(operation)});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Unable to apply manual edit.');
      setJob(await fetchJob(job.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Manual edit failed.');
    } finally {
      setIsManualEditing(false);
    }
  };

  const insertManualCut = async () => {
    const sourceStartSec = parseSeconds(insertStart);
    const sourceEndSec = parseSeconds(insertEnd);
    if (sourceStartSec === undefined || sourceEndSec === undefined || sourceEndSec <= sourceStartSec) {
      setError('Enter a valid source range, such as 75 or 1:15.');
      return;
    }
    await applyManualEdit({type: 'insertCut', sourceStartSec, sourceEndSec, insertAfterCutId: selectedCut?.id, subtitleText: insertSubtitle});
  };

  const setInsertTimeFromSource = (target: 'start' | 'end') => {
    const current = sourceVideoRef.current?.currentTime;
    if (typeof current !== 'number' || !Number.isFinite(current)) return;
    if (target === 'start') setInsertStart(current.toFixed(1));
    else setInsertEnd(current.toFixed(1));
  };

  return (
    <main className="min-h-screen bg-ink text-zinc-50">
      <div className="flex min-h-screen w-full flex-col px-4 py-5 2xl:px-6">
        <header className="grid gap-3 border-b border-line pb-4 xl:grid-cols-[330px_minmax(520px,1fr)_410px]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-mint text-ink">
              <Clapperboard size={24} strokeWidth={2.4} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-normal">ROVUNQ</h1>
              <p className="text-sm text-zinc-400">AI draft editing workbench</p>
            </div>
          </div>
          <WorkflowSteps activeStage={activeStage} hasSource={hasSource} hasDraft={Boolean(renderPlan)} hasOutput={Boolean(finalUrl)} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => setTourStep(0)} className="toolbar-button">
              <HelpCircle size={16} /> Help
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="toolbar-button">
              <Upload size={16} /> Source
            </button>
            <button type="submit" form="rovunq-editor-form" disabled={isBusy} className={`inline-flex h-10 items-center gap-2 rounded-lg bg-mint px-3 text-sm font-black text-ink disabled:cursor-not-allowed disabled:opacity-50 ${tourClass('render')}`}>
              {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Render
            </button>
            <button type="button" disabled={!job || isBusy} onClick={() => job && fetchJob(job.id).then(setJob).catch(() => undefined)} className="toolbar-button disabled:cursor-not-allowed disabled:opacity-50">
              <RefreshCcw size={16} /> Refresh
            </button>
            {finalUrl ? (
              <a href={finalUrl} download="final-output.mp4" className={`inline-flex h-10 items-center gap-2 rounded-lg border border-mint/50 bg-mint/10 px-3 text-sm font-black text-mint ${tourClass('export')}`}>
                <Download size={16} /> MP4
              </a>
            ) : null}
          </div>
        </header>

        <form id="rovunq-editor-form" onSubmit={submit} className="grid flex-1 grid-cols-1 gap-4 py-4 xl:grid-cols-[330px_minmax(560px,1fr)_410px]">
          <section className={`panel ${tourClass('source')}`}>
            <PanelTitle icon={<Upload size={18} />} title="Source Tracks" />
            <div className="flex flex-1 flex-col gap-4 p-4">
              <div className="rounded-lg border border-mint/30 bg-mint/10 p-3">
                <div className="text-sm font-black text-mint">Step 1: choose a source</div>
                <p className="mt-2 text-xs leading-5 text-zinc-400">Use a YouTube URL or upload a local video. For long videos, limit the source range before rendering.</p>
              </div>
              {sourceUrl ? (
                <div className="rounded-lg border border-line bg-ink p-3">
                  <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Source Preview</div>
                  <video ref={sourceVideoRef} src={sourceUrl} controls className="aspect-video w-full rounded-md bg-black object-contain" />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <SmallButton onClick={() => setInsertTimeFromSource('start')}>Set start</SmallButton>
                    <SmallButton onClick={() => setInsertTimeFromSource('end')}>Set end</SmallButton>
                  </div>
                </div>
              ) : null}

              <label className="block">
                <span className="label">YouTube URL</span>
                <span className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-ink px-3 py-2">
                  <Link size={18} className="shrink-0 text-zinc-500" />
                  <input value={youtubeUrl} onChange={(event) => { setYoutubeUrl(event.target.value); if (event.target.value.trim()) setFile(null); }} placeholder="https://www.youtube.com/watch?v=..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-600" />
                </span>
              </label>

              <button type="button" onClick={() => fileInputRef.current?.click()} className="flex min-h-[108px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-600 bg-ink px-4 text-center transition hover:border-mint">
                <FileVideo size={30} className="text-mint" />
                <span className="text-sm font-bold">{file ? file.name : 'Upload source video'}</span>
                <span className="text-xs text-zinc-500">mp4, mov, m4v, webm</span>
              </button>
              <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,video/webm,.m4v" hidden onChange={(event) => { const selected = event.target.files?.[0] ?? null; setFile(selected); if (selected) setYoutubeUrl(''); }} />

              <button type="button" onClick={() => audioInputRef.current?.click()} className="flex items-center justify-between rounded-lg border border-line bg-ink px-3 py-3 text-left transition hover:border-mint">
                <span>
                  <span className="block text-sm font-bold">{audioFile ? audioFile.name : 'BGM / SFX track'}</span>
                  <span className="mt-1 block text-xs text-zinc-500">Mixed into final MP4</span>
                </span>
                <Upload size={18} className="text-zinc-500" />
              </button>
              <input ref={audioInputRef} type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/aac,.mp3,.wav,.m4a,.aac" hidden onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)} />

              <div className="rounded-lg border border-line bg-ink p-3">
                <div className="text-sm font-bold text-zinc-200">Long Source Range</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <TextInput label="Start min" value={sourceStartMin} setValue={setSourceStartMin} placeholder="12" />
                  <TextInput label="Duration min" value={sourceDurationMin} setValue={setSourceDurationMin} placeholder="10" />
                </div>
              </div>
            </div>
          </section>

          <section className={`flex min-h-[690px] flex-col overflow-hidden rounded-lg border border-line bg-[#07080a] ${tourClass('preview')}`}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-bold text-zinc-200"><Play size={18} /> Preview</div>
              {job ? <StatusPill status={job.status} /> : <span className="text-xs text-zinc-500">Ready</span>}
            </div>
            <div className="flex flex-1 flex-col gap-4 p-4">
              <div className="flex min-h-[500px] items-center justify-center">
                <div className="relative aspect-[9/16] h-full max-h-[calc(100vh-250px)] min-h-[500px] overflow-hidden rounded-lg border border-line bg-black shadow-2xl">
                  {finalUrl ? <video key={finalUrl} src={finalUrl} controls className="h-full w-full object-contain" /> : <EmptyPreview job={job} />}
                </div>
              </div>
              <div className="mx-auto flex w-full max-w-[760px] items-center justify-between rounded-lg border border-line bg-panel px-3 py-2">
                <div className="text-xs text-zinc-500">
                  {renderPlan ? `${renderPlan.cuts.length} cuts · ${formatTime(duration)} · selected ${selectedCut?.id ?? '-'}` : 'Add a source, then create an AI draft.'}
                </div>
                {finalUrl ? (
                  <a href={finalUrl} download="final-output.mp4" className="inline-flex h-9 items-center gap-2 rounded-md bg-mint px-3 text-xs font-black text-ink">
                    <Download size={14} /> Download
                  </a>
                ) : null}
              </div>
            </div>
            <div className={tourClass('timeline')}>
              <Timeline duration={duration} cuts={renderPlan?.cuts ?? []} subtitles={renderPlan?.subtitles ?? []} cta={renderPlan?.cta} selectedCutId={selectedCut?.id ?? null} onSelectCut={setSelectedCutId} audioFileName={audioFile?.name} />
            </div>
          </section>

          <RightWorkflowPanel
            tourClass={tourClass}
            job={job}
            progress={progress}
            error={error}
            isBusy={isBusy}
            renderPlan={renderPlan}
            selectedCut={selectedCut}
            selectedSubtitle={selectedSubtitle ?? undefined}
            instruction={instruction}
            setInstruction={setInstruction}
            skipOpenai={skipOpenai}
            setSkipOpenai={setSkipOpenai}
            subtitleDraft={subtitleDraft}
            setSubtitleDraft={setSubtitleDraft}
            insertStart={insertStart}
            setInsertStart={setInsertStart}
            insertEnd={insertEnd}
            setInsertEnd={setInsertEnd}
            insertSubtitle={insertSubtitle}
            setInsertSubtitle={setInsertSubtitle}
            insertManualCut={insertManualCut}
            applyManualEdit={applyManualEdit}
          />
        </form>
      </div>
      <GuidedTour step={tourStep} setStep={setTourStep} />
    </main>
  );
}

const fetchJob = async (jobId: string): Promise<JobStatus> => {
  const response = await fetch(`/api/jobs/${jobId}`, {cache: 'no-store'});
  if (!response.ok) throw new Error('Unable to fetch job.');
  return response.json();
};

function ManualPanel(props: {
  selectedCut: RenderCut | null;
  selectedSubtitle?: RenderSubtitle;
  subtitleDraft: string;
  setSubtitleDraft: (value: string) => void;
  insertStart: string;
  setInsertStart: (value: string) => void;
  insertEnd: string;
  setInsertEnd: (value: string) => void;
  insertSubtitle: string;
  setInsertSubtitle: (value: string) => void;
  isBusy: boolean;
  insertManualCut: () => void;
  applyManualEdit: (operation: Record<string, unknown>) => void;
}) {
  const cut = props.selectedCut;
  if (!cut) return <aside className="rounded-lg border border-line bg-panel p-3 text-sm text-zinc-500">Render a draft, then select a cut to edit.</aside>;
  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-auto rounded-lg border border-line bg-panel p-3">
      <div className="rounded-lg border border-line bg-ink p-3">
        <div className="flex items-center justify-between"><span className="text-sm font-black">{cut.id}</span><span className="rounded-md bg-mint/10 px-2 py-1 text-xs font-bold text-mint">{cut.reason}</span></div>
        <div className="mt-2 text-xs leading-5 text-zinc-400">Source {formatTime(cut.sourceStartSec)} - {formatTime(cut.sourceEndSec)}<br />Output {formatTime(cut.outputStartSec)} - {formatTime(cut.outputEndSec)}</div>
      </div>
      <Control title="Cut">
        <ActionButton disabled={props.isBusy} onClick={() => props.applyManualEdit({type: 'moveCut', cutId: cut.id, direction: 'up'})}>Move left</ActionButton>
        <ActionButton disabled={props.isBusy} onClick={() => props.applyManualEdit({type: 'moveCut', cutId: cut.id, direction: 'down'})}>Move right</ActionButton>
        <ActionButton disabled={props.isBusy} onClick={() => props.applyManualEdit({type: 'extendCut', cutId: cut.id, beforeSec: 1, afterSec: 0})}>+1s head</ActionButton>
        <ActionButton disabled={props.isBusy} onClick={() => props.applyManualEdit({type: 'extendCut', cutId: cut.id, beforeSec: 0, afterSec: 1})}>+1s tail</ActionButton>
        <ActionButton disabled={props.isBusy} onClick={() => props.applyManualEdit({type: 'removeCut', cutId: cut.id})}>Remove</ActionButton>
        <ActionButton disabled={props.isBusy} onClick={props.insertManualCut}>Insert</ActionButton>
      </Control>
      <Control title="Subtitle style">
        {(['top', 'center', 'bottom'] as const).map((position) => <ActionButton key={position} active={props.selectedSubtitle?.position === position} disabled={props.isBusy} onClick={() => props.applyManualEdit({type: 'updateSubtitleStyle', cutId: cut.id, position})}>{position}</ActionButton>)}
        {(['basic', 'entertainment', 'education', 'cinematic'] as const).map((style) => <ActionButton key={style} active={props.selectedSubtitle?.style === style} disabled={props.isBusy} onClick={() => props.applyManualEdit({type: 'updateSubtitleStyle', cutId: cut.id, style})}>{style}</ActionButton>)}
        {(['none', 'pop', 'fade'] as const).map((animation) => <ActionButton key={animation} disabled={props.isBusy} onClick={() => props.applyManualEdit({type: 'updateSubtitleStyle', cutId: cut.id, animation})}>{animation}</ActionButton>)}
      </Control>
      <Control title="Subtitle text">
        <textarea value={props.subtitleDraft} onChange={(event) => props.setSubtitleDraft(event.target.value)} className="col-span-2 min-h-[88px] resize-none rounded-md border border-line bg-panel p-2 text-sm outline-none focus:border-mint" />
        <button type="button" disabled={props.isBusy || !props.subtitleDraft.trim()} onClick={() => props.applyManualEdit({type: 'updateSubtitle', cutId: cut.id, text: props.subtitleDraft})} className="col-span-2 h-9 rounded-md bg-mint text-xs font-black text-ink disabled:cursor-not-allowed disabled:opacity-50">Apply text</button>
      </Control>
      <Control title="Manual insert">
        <TextInput label="Source start" value={props.insertStart} setValue={props.setInsertStart} placeholder="75 or 1:15" />
        <TextInput label="Source end" value={props.insertEnd} setValue={props.setInsertEnd} placeholder="83 or 1:23" />
        <div className="col-span-2"><TextInput label="Subtitle" value={props.insertSubtitle} setValue={props.setInsertSubtitle} placeholder="Manual insert" /></div>
      </Control>
    </aside>
  );
}

function RightWorkflowPanel(props: {
  tourClass: (target: string) => string;
  job: JobStatus | null;
  progress: number;
  error: string | null;
  isBusy: boolean;
  renderPlan: RenderPlan | null;
  selectedCut: RenderCut | null;
  selectedSubtitle?: RenderSubtitle;
  instruction: string;
  setInstruction: (value: string) => void;
  skipOpenai: boolean;
  setSkipOpenai: (value: boolean) => void;
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
  if (props.isBusy || props.job?.status === 'running' || props.job?.status === 'queued') {
    return (
      <section className={`panel ${props.tourClass('ai')}`}>
        <PanelTitle icon={<Loader2 size={18} className="animate-spin text-amber" />} title="Processing" />
        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="rounded-lg border border-amber/30 bg-amber/10 p-3">
            <div className="text-sm font-black text-amber">AI draft is being prepared</div>
            <p className="mt-2 text-xs leading-5 text-zinc-400">
              Current stage: {props.job?.progress?.stage ?? 'starting'} · overall {props.job?.progress?.overallProgress ?? props.progress}%
            </p>
          </div>
          <JobLog job={props.job} progress={props.progress} />
        </div>
      </section>
    );
  }

  if (props.renderPlan) {
    return (
      <section className={`panel ${props.tourClass('edit')}`}>
        <PanelTitle icon={<Scissors size={18} />} title="Selected Cut Editor" />
        <div className="flex flex-1 flex-col gap-4 p-4">
          <ManualPanel
            selectedCut={props.selectedCut}
            selectedSubtitle={props.selectedSubtitle}
            subtitleDraft={props.subtitleDraft}
            setSubtitleDraft={props.setSubtitleDraft}
            insertStart={props.insertStart}
            setInsertStart={props.setInsertStart}
            insertEnd={props.insertEnd}
            setInsertEnd={props.setInsertEnd}
            insertSubtitle={props.insertSubtitle}
            setInsertSubtitle={props.setInsertSubtitle}
            isBusy={props.isBusy}
            insertManualCut={props.insertManualCut}
            applyManualEdit={props.applyManualEdit}
          />
          {props.error || props.job?.errorMessage ? <ErrorBox message={props.error ?? props.job?.errorMessage ?? ''} /> : null}
        </div>
      </section>
    );
  }

  return (
    <section className={`panel ${props.tourClass('ai')}`}>
      <PanelTitle icon={<Sparkles size={18} />} title="AI Draft Setup" />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="rounded-lg border border-mint/30 bg-mint/10 p-3">
          <div className="text-sm font-black text-mint">Step 2: describe the draft</div>
          <p className="mt-2 text-xs leading-5 text-zinc-400">Paste a source on the left, then tell ROVUNQ what kind of short to create.</p>
        </div>
        <textarea value={props.instruction} onChange={(event) => props.setInstruction(event.target.value)} className="min-h-[188px] resize-none rounded-lg border border-line bg-ink p-3 text-sm leading-6 outline-none focus:border-mint" />
        <div className="grid grid-cols-2 gap-2">
          {['Remove NG cuts', 'Keep reactions', 'Bigger subtitles', 'CTA last 5 sec'].map((chip) => (
            <SmallButton key={chip} onClick={() => props.setInstruction(`${props.instruction.trim()}\n${chip}`.trim())}>{chip}</SmallButton>
          ))}
        </div>
        <label className="flex items-center justify-between rounded-lg border border-line bg-ink px-3 py-3 text-sm text-zinc-300">
          <span>Fast test without OpenAI</span>
          <input type="checkbox" checked={props.skipOpenai} onChange={(event) => props.setSkipOpenai(event.target.checked)} className="h-4 w-4 accent-mint" />
        </label>
        <button type="submit" disabled={props.isBusy} className="flex h-12 items-center justify-center gap-2 rounded-lg bg-mint px-4 text-sm font-black text-ink disabled:cursor-not-allowed disabled:opacity-50">
          <Play size={18} /> Start AI Draft
        </button>
        {props.error || props.job?.errorMessage ? <ErrorBox message={props.error ?? props.job?.errorMessage ?? ''} /> : null}
      </div>
    </section>
  );
}

const ErrorBox = ({message}: {message: string}) => (
  <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
    <AlertCircle size={18} className="shrink-0" />
    {message}
  </div>
);

const GuidedTour = ({step, setStep}: {step: number | null; setStep: (step: number | null) => void}) => {
  if (step === null) return null;
  const current = tourSteps[step];
  const isLast = step === tourSteps.length - 1;
  const position =
    current.side === 'left'
      ? 'left-8 top-28'
      : current.side === 'right'
        ? 'right-8 top-28'
        : current.side === 'bottom'
          ? 'bottom-8 left-1/2 -translate-x-1/2'
          : current.side === 'center'
            ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
            : 'left-1/2 top-24 -translate-x-1/2';

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      <div className="absolute inset-0 bg-black/55" />
      <div className={`pointer-events-auto absolute w-[360px] max-w-[calc(100vw-32px)] rounded-lg border border-mint/40 bg-panel p-4 shadow-2xl ${position}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-mint">Guide {step + 1} / {tourSteps.length}</div>
          <button type="button" onClick={() => setStep(null)} className="text-xs font-bold text-zinc-500 hover:text-white">Close</button>
        </div>
        <div className="mt-3 text-lg font-black text-white">{current.title}</div>
        <p className="mt-2 text-sm leading-6 text-zinc-300">{current.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep(Math.max(0, step - 1))}
            className="h-9 rounded-md border border-line px-3 text-xs font-bold text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => (isLast ? setStep(null) : setStep(step + 1))}
            className="h-9 rounded-md bg-mint px-4 text-xs font-black text-ink"
          >
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

const PanelTitle = ({icon, title}: {icon: ReactNode; title: string}) => <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-bold text-zinc-200">{icon}{title}</div>;
const WorkflowSteps = ({
  activeStage,
  hasSource,
  hasDraft,
  hasOutput,
}: {
  activeStage: number;
  hasSource: boolean;
  hasDraft: boolean;
  hasOutput: boolean;
}) => {
  const items = [
    {index: 1, label: 'Source', done: hasSource},
    {index: 2, label: 'AI Draft', done: hasDraft},
    {index: 3, label: 'Refine', done: hasDraft && activeStage > 3},
    {index: 4, label: 'Export', done: hasOutput},
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((item) => {
        const active = item.index === activeStage || (item.index === 3 && hasDraft);
        return (
          <div
            key={item.index}
            className={`rounded-lg border px-3 py-2 ${
              item.done ? 'border-mint/40 bg-mint/10' : active ? 'border-amber/40 bg-amber/10' : 'border-line bg-panel'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Step {item.index}</div>
            <div className={`mt-1 truncate text-sm font-black ${item.done ? 'text-mint' : active ? 'text-amber' : 'text-zinc-300'}`}>
              {item.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};
const ToolbarMetric = ({label, value, tone = 'normal'}: {label: string; value: string; tone?: 'normal' | 'mint' | 'danger'}) => <div className="rounded-lg border border-line bg-panel px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">{label}</div><div className={`mt-1 truncate text-sm font-black ${tone === 'mint' ? 'text-mint' : tone === 'danger' ? 'text-red-300' : 'text-zinc-100'}`}>{value}</div></div>;
const SmallButton = ({children, onClick}: {children: ReactNode; onClick: () => void}) => <button type="button" onClick={onClick} className="h-9 rounded-md border border-line bg-panel px-2 text-xs font-bold text-zinc-300 transition hover:border-mint hover:text-white">{children}</button>;
const ActionButton = ({children, disabled, active, onClick}: {children: ReactNode; disabled?: boolean; active?: boolean; onClick: () => void}) => <button type="button" disabled={disabled} onClick={onClick} className={`rounded-md border px-2 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${active ? 'border-mint bg-mint text-ink' : 'border-line bg-panel text-zinc-300 hover:border-mint hover:text-white'}`}>{children}</button>;
const TextInput = ({label, value, setValue, placeholder}: {label: string; value: string; setValue: (value: string) => void; placeholder: string}) => <label className="block"><span className="text-xs font-semibold text-zinc-500">{label}</span><input value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} className="mt-1 h-9 w-full rounded-md border border-line bg-panel px-2 text-xs outline-none focus:border-mint" /></label>;
const Control = ({title, children}: {title: string; children: ReactNode}) => <div className="rounded-lg border border-line bg-ink p-3"><div className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">{title}</div><div className="mt-2 grid grid-cols-2 gap-2">{children}</div></div>;
const EmptyPreview = ({job}: {job: JobStatus | null}) => (
  <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-panel text-mint">
      {job?.status === 'running' || job?.status === 'queued' ? <Loader2 className="animate-spin" size={34} /> : <Clapperboard size={34} />}
    </div>
    <div>
      <div className="text-lg font-black">{job ? 'Rendering preview' : 'Your short preview will appear here'}</div>
      <p className="mt-2 text-sm leading-6 text-zinc-500">
        {job ? 'The draft is being generated. Watch progress on the right.' : 'Start with a source on the left, then create an AI draft.'}
      </p>
    </div>
  </div>
);

function Timeline({duration, cuts, subtitles, cta, selectedCutId, onSelectCut, audioFileName}: {duration: number; cuts: RenderCut[]; subtitles: RenderSubtitle[]; cta?: RenderPlan['cta']; selectedCutId: string | null; onSelectCut: (id: string) => void; audioFileName?: string}) {
  return <div className="border-t border-line bg-panel p-4"><div className="mb-3 flex items-center justify-between"><div><div className="text-sm font-black">Timeline</div><div className="mt-1 text-xs text-zinc-500">Source, AI cuts, subtitles, BGM and CTA tracks</div></div><div className="text-xs text-zinc-500">Total {formatTime(duration)}</div></div><div className="space-y-2"><Track label="Source"><div className="absolute inset-y-2 left-0 right-0 rounded-md border border-zinc-700 bg-zinc-800/70 px-3 py-2 text-xs font-semibold text-zinc-300">Processed source range</div></Track><Track label="Cuts">{cuts.length ? cuts.map((cut, index) => { const start = ((cut.outputStartSec ?? 0) / duration) * 100; const width = Math.max(2.6, (((cut.outputEndSec ?? 0) - (cut.outputStartSec ?? 0)) / duration) * 100); const selected = selectedCutId === cut.id; return <button key={cut.id} type="button" onClick={() => onSelectCut(cut.id)} className={`absolute inset-y-1 rounded-md border px-2 text-left text-[11px] font-black transition ${selected ? 'border-mint bg-mint text-ink' : index % 2 ? 'border-sky-400/30 bg-sky-400/20 text-sky-100' : 'border-amber/30 bg-amber/20 text-amber'}`} style={{left: `${start}%`, width: `${width}%`}} title={cut.id}>{cut.id.startsWith('manual') ? <Plus size={12} /> : cut.id.replace('cut_', '#')}</button>; }) : <TrackHint text="Cuts appear after render" />}</Track><Track label="Subs">{subtitles.length ? subtitles.map((sub, index) => <div key={sub.id} className="absolute inset-y-2 overflow-hidden rounded-md border border-violet-300/30 bg-violet-300/20 px-2 py-1 text-[11px] font-semibold text-violet-100" style={{left: `${(sub.startSec / duration) * 100}%`, width: `${Math.max(4, ((sub.endSec - sub.startSec) / duration) * 100)}%`}} title={sub.text}>{index + 1}. {sub.position}</div>) : <TrackHint text="Subtitle track" />}</Track><Track label="BGM"><div className="absolute inset-y-2 left-0 right-0 rounded-md border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-100">{audioFileName ?? 'Upload audio to mix BGM'}</div></Track><Track label="CTA">{cta?.enabled ? <div className="absolute inset-y-2 rounded-md border border-mint/40 bg-mint/15 px-3 py-2 text-xs font-black text-mint" style={{left: `${(cta.startSec / duration) * 100}%`, width: `${Math.max(8, ((cta.endSec - cta.startSec) / duration) * 100)}%`}}>CTA</div> : <TrackHint text="CTA track" />}</Track></div></div>;
}
const Track = ({label, children}: {label: string; children: ReactNode}) => <div className="grid grid-cols-[86px_1fr] gap-3"><div className="flex h-12 items-center gap-2 text-xs font-bold text-zinc-400">{label === 'Cuts' ? <Scissors size={13} /> : null}{label}</div><div className="relative h-12 overflow-hidden rounded-lg border border-line bg-ink">{children}</div></div>;
const TrackHint = ({text}: {text: string}) => <div className="flex h-full items-center px-3 text-xs text-zinc-600">{text}</div>;
const StatusPill = ({status}: {status: JobStatus['status']}) => <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-xs font-bold ${status === 'completed' ? 'border-mint/40 bg-mint/10 text-mint' : status === 'failed' ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-amber/40 bg-amber/10 text-amber'}`}>{status === 'completed' ? <CheckCircle2 size={14} /> : status === 'failed' ? <AlertCircle size={14} /> : <Loader2 size={14} className="animate-spin" />}{status}</span>;
const JobLog = ({job, progress}: {job: JobStatus | null; progress: number}) => <div className="min-h-0 flex-1 rounded-lg border border-line bg-ink"><div className="flex items-center justify-between border-b border-line px-3 py-2"><span className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Job Log</span><span className="text-xs text-zinc-500">{progress}%</span></div><div className="h-1 bg-zinc-800"><div className="h-full bg-mint transition-all" style={{width: `${progress}%`}} /></div><div className="max-h-[360px] overflow-auto p-3">{job?.logs.length ? <div className="space-y-2">{job.logs.map((entry, index) => <LogLine key={`${entry.at}-${index}`} entry={entry} />)}</div> : <p className="text-sm leading-6 text-zinc-500">Logs appear after the job starts.</p>}</div></div>;
const LogLine = ({entry}: {entry: JobLogEntry}) => <div className="grid grid-cols-[78px_1fr] gap-2 text-xs leading-5"><span className="text-zinc-600">{entry.step}</span><span className={entry.status === 'ok' ? 'text-mint' : entry.status === 'error' ? 'text-red-300' : entry.status === 'warn' ? 'text-amber' : 'text-zinc-300'}>{entry.message}</span></div>;
