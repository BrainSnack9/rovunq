'use client';

import {FormEvent, useEffect, useMemo, useRef, useState} from 'react';
import {applyJobEdit, createJob, fetchJob, fetchJobPlans} from '../api';
import type {JobStatus, RenderPlan, StudioTab, TimelineClip, TimelineProject} from '../types';
import {defaultInstruction, parseSeconds, progressSteps} from '../utils';

export const useStudioState = () => {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [instruction, setInstruction] = useState(defaultInstruction);
  const [file, setFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [sourceStartMin, setSourceStartMin] = useState('');
  const [sourceDurationMin, setSourceDurationMin] = useState('');
  const [job, setJob] = useState<JobStatus | null>(null);
  const [renderPlan, setRenderPlan] = useState<RenderPlan | null>(null);
  const [timeline, setTimeline] = useState<TimelineProject | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [subtitleDraft, setSubtitleDraft] = useState('');
  const [insertStart, setInsertStart] = useState('');
  const [insertEnd, setInsertEnd] = useState('');
  const [insertSubtitle, setInsertSubtitle] = useState('Manual insert');
  const [error, setError] = useState<string | null>(null);
  const [skipOpenai, setSkipOpenai] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isManualEditing, setIsManualEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<StudioTab>('media');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const sourceVideoRef = useRef<HTMLVideoElement>(null);

  const activeJobId = job?.id;
  const isBusy = isSubmitting || isManualEditing || job?.status === 'queued' || job?.status === 'running';
  const finalUrl = job?.artifacts.finalOutput ? `${job.artifacts.finalOutput}?t=${job.logs.length}` : null;
  const sourceUrl = job ? `/api/jobs/${job.id}/artifact/source-video?t=${job.logs.length}` : null;
  const duration = timeline?.output.durationSec ?? renderPlan?.finalDurationSec ?? 60;
  const clips = useMemo(() => timeline?.tracks.flatMap((track) => track.clips) ?? [], [timeline]);
  const videoClips = useMemo(() => clips.filter((clip) => clip.type === 'video'), [clips]);
  const selectedClip = clips.find((clip) => clip.id === selectedClipId) ?? videoClips[0] ?? clips[0] ?? null;
  const selectedVideoClip = selectedClip?.type === 'video' ? selectedClip : videoClips[0] ?? null;
  const selectedCaption = findCaptionForClip(clips, selectedVideoClip);

  useEffect(() => {
    if (!activeJobId || job?.status === 'completed' || job?.status === 'failed') return;
    const timer = window.setInterval(async () => setJob(await fetchJob(activeJobId)), 1400);
    return () => window.clearInterval(timer);
  }, [activeJobId, job?.status]);

  useEffect(() => {
    if (!job || job.status !== 'completed') return;
    let ignore = false;
    const load = async () => {
      const plans = await fetchJobPlans(job);
      if (ignore) return;
      setRenderPlan(plans.renderPlan);
      if (plans.timeline) {
        const timelinePayload = plans.timeline;
        setTimeline(timelinePayload);
        setSelectedClipId((current) => selectExistingOrFirstClip(current, timelinePayload));
      }
    };
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load timeline.'));
    return () => {
      ignore = true;
    };
  }, [job]);

  useEffect(() => setSubtitleDraft(String(selectedCaption?.text ?? '')), [selectedCaption?.id, selectedCaption?.text]);

  const progress = useMemo(() => {
    if (job?.progress) return job.progress.overallProgress;
    if (!job) return 0;
    const done = new Set(job.logs.filter((entry) => entry.status === 'ok').map((entry) => entry.step));
    return Math.round((progressSteps.filter((step) => done.has(step)).length / progressSteps.length) * 100);
  }, [job]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setRenderPlan(null);
    setTimeline(null);
    setSelectedClipId(null);
    setActiveTab('ai');
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
      const payload = await createJob(formData);
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
      await applyJobEdit(job.id, operation);
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
    await applyManualEdit({
      type: 'insertCut',
      sourceStartSec,
      sourceEndSec,
      insertAfterCutId: selectedVideoClip?.id,
      subtitleText: insertSubtitle,
    });
  };

  const setInsertTimeFromSource = (target: 'start' | 'end') => {
    const current = sourceVideoRef.current?.currentTime;
    if (typeof current !== 'number' || !Number.isFinite(current)) return;
    if (target === 'start') setInsertStart(current.toFixed(1));
    else setInsertEnd(current.toFixed(1));
  };

  const refreshJob = () => job && fetchJob(job.id).then(setJob).catch(() => undefined);

  return {
    activeTab,
    applyManualEdit,
    audioFile,
    audioInputRef,
    duration,
    error,
    file,
    fileInputRef,
    finalUrl,
    insertEnd,
    insertManualCut,
    insertStart,
    insertSubtitle,
    instruction,
    isBusy,
    job,
    progress,
    refreshJob,
    selectedCaption,
    selectedClip,
    selectedClipId,
    selectedVideoClip,
    setActiveTab,
    setAudioFile,
    setFile,
    setInsertEnd,
    setInsertStart,
    setInsertSubtitle,
    setInstruction,
    setSelectedClipId,
    setSkipOpenai,
    setSourceDurationMin,
    setSourceStartMin,
    setSubtitleDraft,
    setYoutubeUrl,
    skipOpenai,
    sourceDurationMin,
    sourceStartMin,
    sourceUrl,
    sourceVideoRef,
    submit,
    subtitleDraft,
    timeline,
    youtubeUrl,
    setInsertTimeFromSource,
  };
};

const findCaptionForClip = (clips: TimelineClip[], selectedVideoClip: TimelineClip | null) =>
  clips.find(
    (clip) =>
      clip.type === 'caption' &&
      selectedVideoClip &&
      clip.timelineStartSec >= selectedVideoClip.timelineStartSec &&
      clip.timelineStartSec < selectedVideoClip.timelineEndSec,
  );

const selectExistingOrFirstClip = (current: string | null, timeline: TimelineProject) => {
  const clips = timeline.tracks.flatMap((track) => track.clips);
  if (current && clips.some((clip) => clip.id === current)) return current;
  return clips.find((clip) => clip.type === 'video')?.id ?? null;
};
