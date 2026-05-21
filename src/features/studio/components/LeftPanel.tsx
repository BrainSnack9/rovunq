import {FileVideo, Link, Upload} from 'lucide-react';
import type {LeftPanelProps} from '../types';
import {formatTime} from '../utils';
import {SmallButton, TextInput} from './Primitives';

export function LeftPanel(props: LeftPanelProps) {
  return (
    <aside className="min-h-0 overflow-auto border-b border-line bg-panel lg:border-b-0 lg:border-r">
      <div className="border-b border-line px-4 py-3">
        <div className="text-sm font-black">{props.activeTab === 'media' ? 'Media' : props.activeTab === 'ai' ? 'AI Draft' : props.activeTab === 'captions' ? 'Captions' : 'Audio'}</div>
        <div className="mt-1 text-xs text-zinc-500">Source to timeline workflow</div>
      </div>
      <div className="space-y-4 p-4">
        {props.activeTab === 'media' ? <MediaTab {...props} /> : null}
        {props.activeTab === 'ai' ? <AiTab {...props} /> : null}
        {props.activeTab === 'captions' ? <CaptionsTab timeline={props.timeline} /> : null}
        {props.activeTab === 'audio' ? <AudioTab {...props} /> : null}
      </div>
    </aside>
  );
}

const MediaTab = (props: LeftPanelProps) => (
  <>
    <label className="block">
      <span className="label">YouTube URL</span>
      <span className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-ink px-3 py-2">
        <Link size={18} className="shrink-0 text-zinc-500" />
        <input
          value={props.youtubeUrl}
          onChange={(event) => {
            props.setYoutubeUrl(event.target.value);
            if (event.target.value.trim()) props.setFile(null);
          }}
          placeholder="https://www.youtube.com/watch?v=..."
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-600"
        />
      </span>
    </label>
    <button type="button" onClick={() => props.fileInputRef.current?.click()} className="flex min-h-[118px] w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-600 bg-ink px-4 text-center transition hover:border-mint">
      <FileVideo size={30} className="text-mint" />
      <span className="text-sm font-bold">{props.file ? props.file.name : 'Upload source video'}</span>
      <span className="text-xs text-zinc-500">mp4, mov, m4v, webm</span>
    </button>
    <input
      ref={props.fileInputRef}
      type="file"
      accept="video/mp4,video/quicktime,video/webm,.m4v"
      hidden
      onChange={(event) => {
        const selected = event.target.files?.[0] ?? null;
        props.setFile(selected);
        if (selected) props.setYoutubeUrl('');
      }}
    />
    {props.sourceUrl ? <SourceMonitor {...props} /> : null}
    <div className="rounded-lg border border-line bg-ink p-3">
      <div className="text-sm font-bold text-zinc-200">Long Source Range</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <TextInput label="Start min" value={props.sourceStartMin} setValue={props.setSourceStartMin} placeholder="12" />
        <TextInput label="Duration min" value={props.sourceDurationMin} setValue={props.setSourceDurationMin} placeholder="10" />
      </div>
    </div>
  </>
);

const SourceMonitor = (props: LeftPanelProps) => (
  <div className="rounded-lg border border-line bg-ink p-3">
    <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Source monitor</div>
    <video ref={props.sourceVideoRef} src={props.sourceUrl ?? undefined} controls className="aspect-video w-full rounded-md bg-black object-contain" />
    <div className="mt-2 grid grid-cols-2 gap-2">
      <SmallButton onClick={() => props.setInsertTimeFromSource('start')}>Mark in</SmallButton>
      <SmallButton onClick={() => props.setInsertTimeFromSource('end')}>Mark out</SmallButton>
    </div>
  </div>
);

const AiTab = (props: LeftPanelProps) => (
  <>
    <textarea value={props.instruction} onChange={(event) => props.setInstruction(event.target.value)} className="min-h-[220px] w-full resize-none rounded-lg border border-line bg-ink p-3 text-sm leading-6 outline-none focus:border-mint" />
    <div className="grid grid-cols-2 gap-2">
      {['Remove slow parts', 'Keep reactions', 'Bigger subtitles', '45s shorts', 'Hook first', 'CTA last'].map((chip) => (
        <SmallButton key={chip} onClick={() => props.setInstruction(`${props.instruction.trim()}\n${chip}`.trim())}>{chip}</SmallButton>
      ))}
    </div>
    <label className="flex items-center justify-between rounded-lg border border-line bg-ink px-3 py-3 text-sm text-zinc-300">
      <span>Fast test without OpenAI</span>
      <input type="checkbox" checked={props.skipOpenai} onChange={(event) => props.setSkipOpenai(event.target.checked)} className="h-4 w-4 accent-mint" />
    </label>
    <button type="submit" disabled={props.isBusy} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-mint px-4 text-sm font-black text-ink disabled:cursor-not-allowed disabled:opacity-50">
      Start AI Draft
    </button>
  </>
);

const CaptionsTab = ({timeline}: Pick<LeftPanelProps, 'timeline'>) => (
  <LibraryList
    empty="Captions appear after AI draft."
    items={(timeline?.tracks.find((track) => track.type === 'caption')?.clips ?? []).map((clip) => ({
      id: clip.id,
      title: clip.text ?? clip.id,
      meta: `${formatTime(clip.timelineStartSec)} - ${formatTime(clip.timelineEndSec)}`,
    }))}
  />
);

const AudioTab = (props: LeftPanelProps) => (
  <>
    <button type="button" onClick={() => props.audioInputRef.current?.click()} className="flex w-full items-center justify-between rounded-lg border border-line bg-ink px-3 py-3 text-left transition hover:border-mint">
      <span>
        <span className="block text-sm font-bold">{props.audioFile ? props.audioFile.name : 'BGM / SFX track'}</span>
        <span className="mt-1 block text-xs text-zinc-500">Mixed into final MP4</span>
      </span>
      <Upload size={18} className="text-zinc-500" />
    </button>
    <input ref={props.audioInputRef} type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/aac,.mp3,.wav,.m4a,.aac" hidden onChange={(event) => props.setAudioFile(event.target.files?.[0] ?? null)} />
  </>
);

const LibraryList = ({items, empty}: {items: {id: string; title: string; meta: string}[]; empty: string}) =>
  items.length ? (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-line bg-ink p-3">
          <div className="line-clamp-2 text-sm font-bold text-zinc-100">{item.title}</div>
          <div className="mt-1 text-xs text-zinc-500">{item.meta}</div>
        </div>
      ))}
    </div>
  ) : (
    <div className="rounded-lg border border-line bg-ink p-3 text-sm text-zinc-500">{empty}</div>
  );
