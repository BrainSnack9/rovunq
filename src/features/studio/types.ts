import type {RefObject} from 'react';

export type JobLogEntry = {at: string; step: string; status: 'start' | 'ok' | 'warn' | 'error'; message: string};

export type JobStatus = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  errorMessage?: string;
  progress?: {stage: string; overallProgress: number; stageProgress: number};
  logs: JobLogEntry[];
  artifacts: {
    finalOutput: string | null;
    transcript: string;
    editPlan: string;
    renderPlan: string;
    timeline: string;
    intermediateCut: string;
  };
};

export type TimelineClip = {
  id: string;
  type: 'video' | 'caption' | 'audio' | 'graphic' | 'cta' | 'effect';
  trackId: string;
  mediaAssetId?: string;
  sourceStartSec?: number;
  sourceEndSec?: number;
  timelineStartSec: number;
  timelineEndSec: number;
  playbackRate: number;
  muted: boolean;
  locked: boolean;
  text?: string;
  style: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type TimelineTrack = {
  id: string;
  type: 'video' | 'caption' | 'audio' | 'graphic' | 'effect';
  name: string;
  order: number;
  muted: boolean;
  locked: boolean;
  clips: TimelineClip[];
};

export type TimelineProject = {
  schemaVersion: 1;
  id: string;
  title: string;
  output: {durationSec: number; fps: number; width: 1080; height: 1920; aspectRatio: '9:16'};
  source: {language: string; originalDurationSec: number};
  tracks: TimelineTrack[];
};

export type RenderPlan = {
  finalDurationSec?: number;
  cuts: {id: string; sourceStartSec: number; sourceEndSec: number; outputStartSec?: number; outputEndSec?: number; reason: string}[];
  subtitles: {id: string; startSec: number; endSec: number; text: string; position: 'top' | 'center' | 'bottom'; style: string}[];
  cta?: {enabled: boolean; startSec: number; endSec: number; text: string};
};

export type StudioTab = 'media' | 'ai' | 'captions' | 'audio';

export type LeftPanelProps = {
  activeTab: StudioTab;
  youtubeUrl: string;
  setYoutubeUrl: (value: string) => void;
  file: File | null;
  setFile: (file: File | null) => void;
  audioFile: File | null;
  setAudioFile: (file: File | null) => void;
  instruction: string;
  setInstruction: (value: string) => void;
  skipOpenai: boolean;
  setSkipOpenai: (value: boolean) => void;
  sourceStartMin: string;
  setSourceStartMin: (value: string) => void;
  sourceDurationMin: string;
  setSourceDurationMin: (value: string) => void;
  sourceUrl: string | null;
  sourceVideoRef: RefObject<HTMLVideoElement>;
  setInsertTimeFromSource: (target: 'start' | 'end') => void;
  fileInputRef: RefObject<HTMLInputElement>;
  audioInputRef: RefObject<HTMLInputElement>;
  timeline: TimelineProject | null;
  isBusy: boolean;
};
