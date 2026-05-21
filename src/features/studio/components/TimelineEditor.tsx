import {Captions, Layers, Scissors} from 'lucide-react';
import type {TimelineClip, TimelineProject, TimelineTrack} from '../types';
import {formatTime} from '../utils';
import {TrackHint, TrackSkeleton} from './Primitives';

export function TimelineEditor({
  timeline,
  duration,
  selectedClipId,
  onSelectClip,
  audioFileName,
}: {
  timeline: TimelineProject | null;
  duration: number;
  selectedClipId: string | null;
  onSelectClip: (id: string) => void;
  audioFileName?: string;
}) {
  const tracks = timeline?.tracks.slice().sort((a, b) => a.order - b.order) ?? [];
  return (
    <div className="border-t border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-mint" />
          <div>
            <div className="text-sm font-black">Timeline</div>
            <div className="text-xs text-zinc-500">Non-destructive scene tracks</div>
          </div>
        </div>
        <div className="text-xs text-zinc-500">Total {formatTime(duration)}</div>
      </div>
      <div className="space-y-2 overflow-x-auto pb-1">
        {tracks.length ? tracks.map((track) => <TrackRow key={track.id} track={track} duration={duration} selectedClipId={selectedClipId} onSelectClip={onSelectClip} />) : <EmptyTracks audioFileName={audioFileName} />}
      </div>
    </div>
  );
}

const EmptyTracks = ({audioFileName}: {audioFileName?: string}) => (
  <>
    <TrackSkeleton label="Video" />
    <TrackSkeleton label="Captions" />
    <TrackSkeleton label="Audio" hint={audioFileName ?? 'Upload BGM'} />
  </>
);

const TrackRow = ({track, duration, selectedClipId, onSelectClip}: {track: TimelineTrack; duration: number; selectedClipId: string | null; onSelectClip: (id: string) => void}) => (
  <div className="grid min-w-[680px] grid-cols-[92px_1fr] gap-3">
    <div className="flex h-12 items-center gap-2 text-xs font-bold text-zinc-400">
      {track.type === 'video' ? <Scissors size={13} /> : track.type === 'caption' ? <Captions size={13} /> : null}
      {track.name}
    </div>
    <div className="relative h-12 overflow-hidden rounded-lg border border-line bg-ink">
      {track.clips.length ? track.clips.map((clip, index) => <ClipButton key={clip.id} clip={clip} index={index} duration={duration} selected={selectedClipId === clip.id} onSelectClip={onSelectClip} />) : <TrackHint text={`${track.name} track`} />}
    </div>
  </div>
);

const ClipButton = ({clip, index, duration, selected, onSelectClip}: {clip: TimelineClip; index: number; duration: number; selected: boolean; onSelectClip: (id: string) => void}) => {
  const left = (clip.timelineStartSec / Math.max(duration, 0.1)) * 100;
  const width = Math.max(3, ((clip.timelineEndSec - clip.timelineStartSec) / Math.max(duration, 0.1)) * 100);
  const tone =
    clip.type === 'video'
      ? index % 2
        ? 'border-sky-400/30 bg-sky-400/20 text-sky-100'
        : 'border-amber/30 bg-amber/20 text-amber'
      : clip.type === 'caption'
        ? 'border-violet-300/30 bg-violet-300/20 text-violet-100'
        : 'border-mint/40 bg-mint/15 text-mint';
  return (
    <button
      type="button"
      onClick={() => onSelectClip(clip.id)}
      className={`absolute inset-y-1 overflow-hidden rounded-md border px-2 text-left text-[11px] font-black transition ${selected ? 'border-mint bg-mint text-ink' : tone}`}
      style={{left: `${left}%`, width: `${width}%`}}
      title={clip.text ?? clip.id}
    >
      {clip.text ?? clip.id.replace('cut_', '#')}
    </button>
  );
};
