'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import {Pause, Play} from 'lucide-react';
import type {JobStatus, TimelineClip, TimelineProject} from '../types';
import {formatTime} from '../utils';
import {EmptyPreview, StatusPill} from './Primitives';

export function PreviewHeader({job, timeline, progress}: {job: JobStatus | null; timeline: TimelineProject | null; progress: number}) {
  return (
    <div className="flex min-h-12 items-center justify-between border-b border-line px-4">
      <div>
        <div className="text-sm font-black">Program Monitor</div>
        <div className="text-xs text-zinc-500">{timeline ? `${timeline.tracks.length} tracks · ${formatTime(timeline.output.durationSec)}` : 'Timeline preview will appear here'}</div>
      </div>
      <div className="flex items-center gap-2">
        {job?.status === 'running' || job?.status === 'queued' ? <span className="text-xs text-amber">{progress}%</span> : null}
        {job ? <StatusPill status={job.status} /> : null}
      </div>
    </div>
  );
}

export function TimelinePreview({
  sourceUrl,
  finalUrl,
  timeline,
  selectedClipId,
  onSelectClip,
  job,
}: {
  sourceUrl: string | null;
  finalUrl: string | null;
  timeline: TimelineProject | null;
  selectedClipId: string | null;
  onSelectClip: (id: string) => void;
  job: JobStatus | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const duration = timeline?.output.durationSec ?? 0;
  const allClips = useMemo(() => timeline?.tracks.flatMap((track) => track.clips) ?? [], [timeline]);
  const videoClips = useMemo(() => allClips.filter((clip) => clip.type === 'video').sort((a, b) => a.timelineStartSec - b.timelineStartSec), [allClips]);
  const activeVideo = videoClips.find((clip) => time >= clip.timelineStartSec && time < clip.timelineEndSec) ?? videoClips[0] ?? null;
  const overlays = allClips.filter((clip) => clip.type !== 'video' && time >= clip.timelineStartSec && time <= clip.timelineEndSec);

  useEffect(() => {
    if (!playing || !timeline || !sourceUrl || videoClips.length === 0) return;
    const tick = (now: number) => {
      const last = lastTickRef.current ?? now;
      const delta = (now - last) / 1000;
      lastTickRef.current = now;
      setTime((current) => {
        const next = current + delta;
        return next >= duration ? 0 : next;
      });
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTickRef.current = null;
    };
  }, [duration, playing, sourceUrl, timeline, videoClips.length]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideo) return;
    const desired = (activeVideo.sourceStartSec ?? 0) + (time - activeVideo.timelineStartSec) * (activeVideo.playbackRate || 1);
    if (Number.isFinite(desired) && Math.abs(video.currentTime - desired) > 0.18) video.currentTime = Math.max(0, desired);
    video.playbackRate = activeVideo.playbackRate || 1;
    video.muted = activeVideo.muted;
    if (playing) void video.play().catch(() => undefined);
    else video.pause();
    if (activeVideo.id !== selectedClipId) onSelectClip(activeVideo.id);
  }, [activeVideo, onSelectClip, playing, selectedClipId, time]);

  if (!timeline || !sourceUrl) {
    return (
      <div className="relative aspect-[9/16] h-full max-h-[calc(100vh-230px)] min-h-[520px] overflow-hidden rounded-lg border border-line bg-black shadow-2xl">
        {finalUrl ? <video key={finalUrl} src={finalUrl} controls className="h-full w-full object-contain" /> : <EmptyPreview job={job} />}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[980px] flex-col items-center gap-3">
      <div className="relative aspect-[9/16] h-full max-h-[calc(100vh-260px)] min-h-[520px] overflow-hidden rounded-lg border border-line bg-black shadow-2xl">
        <video ref={videoRef} src={sourceUrl} playsInline className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.35),transparent_28%,rgba(0,0,0,0.55))]" />
        {overlays.map((clip) => <OverlayClip key={clip.id} clip={clip} />)}
      </div>
      <div className="flex w-full items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2">
        <button type="button" onClick={() => setPlaying((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-md bg-mint text-ink">
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <span className="w-16 text-xs font-bold text-zinc-400">{formatTime(time)}</span>
        <input type="range" min={0} max={Math.max(0.1, duration)} step={0.05} value={Math.min(time, duration)} onChange={(event) => setTime(Number.parseFloat(event.target.value))} className="min-w-0 flex-1 accent-mint" />
        <span className="w-16 text-right text-xs text-zinc-500">{formatTime(duration)}</span>
      </div>
    </div>
  );
}

const OverlayClip = ({clip}: {clip: TimelineClip}) => {
  const position = typeof clip.style.position === 'string' ? clip.style.position : 'bottom';
  const topClass = position === 'top' ? 'top-24' : position === 'center' ? 'top-1/2 -translate-y-1/2' : 'bottom-28';
  if (clip.type === 'caption') {
    return (
      <div className={`absolute left-10 right-10 ${topClass} text-center`}>
        <span className="inline rounded-md px-2 py-1 text-[clamp(24px,4.6vh,54px)] font-black leading-tight text-white [paint-order:stroke_fill] [-webkit-text-stroke:5px_#050608]">
          {clip.text}
        </span>
      </div>
    );
  }
  return (
    <div className={`absolute left-12 right-12 ${clip.type === 'cta' ? 'bottom-10' : 'top-16'} text-center`}>
      <div className={`${clip.type === 'cta' ? 'bg-white text-ink' : 'text-white'} inline-block rounded-lg px-5 py-3 text-2xl font-black shadow-2xl`}>
        {clip.text}
      </div>
    </div>
  );
};
