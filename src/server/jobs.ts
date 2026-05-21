import path from 'node:path';
import fs from 'fs-extra';
import {runLocalRender} from '../pipeline/local-render';
import {applyManualEditAndRender} from '../pipeline/reedit';
import {getJobPaths, makeJobId} from '../utils/paths';
import type {JobLogEntry} from '../utils/log';

export type WebJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type WebJob = {
  id: string;
  status: WebJobStatus;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
};

const jobs = new Map<string, WebJob>();

export const createWebJob = async ({
  youtubeUrl,
  inputPath,
  bgmPath,
  instructionText,
  sourceStartSec,
  sourceDurationSec,
  skipOpenai,
}: {
  youtubeUrl?: string;
  inputPath?: string;
  bgmPath?: string;
  instructionText: string;
  sourceStartSec?: number;
  sourceDurationSec?: number;
  skipOpenai?: boolean;
}) => {
  const cwd = process.cwd();
  const id = makeJobId(`web-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const now = new Date().toISOString();
  const job: WebJob = {id, status: 'queued', createdAt: now, updatedAt: now};
  jobs.set(id, job);

  const run = async () => {
    updateJob(id, {status: 'running'});
    try {
      await runLocalRender({
        cwd,
        jobId: id,
        youtubeUrl,
        inputPath,
        bgmPath,
        instructionText,
        sourceStartSec,
        sourceDurationSec,
        skipOpenai,
      });
      updateJob(id, {status: 'completed'});
    } catch (error) {
      updateJob(id, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown render error',
      });
    }
  };

  void run();
  return job;
};

export const getWebJob = async (id: string) => {
  const cwd = process.cwd();
  const paths = await getJobPaths(cwd, id);
  const job = jobs.get(id) ?? inferJobFromDisk(id);
  const logs = await readLogs(paths.jobLog);
  const finalExists = await fs.pathExists(paths.finalOutput);
  const latestError = [...logs].reverse().find((entry) => entry.status === 'error');
  const status: WebJobStatus =
    job?.status === 'running' || job?.status === 'queued'
      ? job.status
      : finalExists
        ? 'completed'
        : job?.status ?? (latestError ? 'failed' : logs.length > 0 ? 'running' : 'queued');

  return {
    id,
    status,
    createdAt: job?.createdAt,
    updatedAt: job?.updatedAt,
    errorMessage: job?.errorMessage ?? latestError?.message,
    progress: calculateProgress(logs, status),
    logs,
    artifacts: {
      transcript: `/api/jobs/${id}/artifact/transcript`,
      editPlan: `/api/jobs/${id}/artifact/edit-plan`,
      renderPlan: `/api/jobs/${id}/artifact/render-plan`,
      timeline: `/api/jobs/${id}/artifact/timeline`,
      intermediateCut: `/api/jobs/${id}/artifact/intermediate-cut`,
      finalOutput: finalExists ? `/api/jobs/${id}/artifact/final-output` : null,
    },
  };
};

const calculateProgress = (logs: JobLogEntry[], status: WebJobStatus) => {
  const weights: Record<string, number> = {
    tools: 3,
    download: 16,
    input: 10,
    probe: 2,
    audio: 8,
    transcribe: 28,
    plan: 14,
    cut: 10,
    vertical: 5,
    'render-plan': 1,
    timeline: 1,
    remotion: 12,
    bgm: 2,
  };
  if (status === 'completed') return {stage: 'completed', overallProgress: 100, stageProgress: 100};
  if (status === 'failed') return {stage: 'failed', overallProgress: Math.max(1, progressFromLogs(logs, weights)), stageProgress: 0};

  const latestStart = [...logs].reverse().find((entry) => entry.status === 'start');
  const activeStage = latestStart?.step ?? 'queued';
  const completed = new Set(logs.filter((entry) => entry.status === 'ok').map((entry) => entry.step));
  const started = new Set(logs.filter((entry) => entry.status === 'start').map((entry) => entry.step));

  const completedProgress = Object.entries(weights).reduce((sum, [step, weight]) => sum + (completed.has(step) ? weight : 0), 0);
  const activeWeight = activeStage in weights && started.has(activeStage) && !completed.has(activeStage) ? weights[activeStage] * 0.25 : 0;
  return {
    stage: activeStage,
    overallProgress: Math.min(99, Math.max(1, Math.round(completedProgress + activeWeight))),
    stageProgress: activeStage in weights && completed.has(activeStage) ? 100 : activeStage in weights && started.has(activeStage) ? 25 : 0,
  };
};

const progressFromLogs = (logs: JobLogEntry[], weights: Record<string, number>) => {
  const completed = new Set(logs.filter((entry) => entry.status === 'ok').map((entry) => entry.step));
  return Math.round(Object.entries(weights).reduce((sum, [step, weight]) => sum + (completed.has(step) ? weight : 0), 0));
};

export const createManualEditJob = async ({id, operation}: {id: string; operation: unknown}) => {
  const cwd = process.cwd();
  const existing = jobs.get(id) ?? inferJobFromDisk(id);
  const now = new Date().toISOString();
  jobs.set(id, {...existing, status: 'queued', updatedAt: now});

  const run = async () => {
    updateJob(id, {status: 'running', errorMessage: undefined});
    try {
      await applyManualEditAndRender({cwd, jobId: id, operation});
      updateJob(id, {status: 'completed', errorMessage: undefined});
    } catch (error) {
      updateJob(id, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown manual edit error',
      });
    }
  };

  void run();
  return jobs.get(id);
};

export const getArtifactPath = async (id: string, artifact: string) => {
  const paths = await getJobPaths(process.cwd(), id);
  const allowed: Record<string, string> = {
    'source-video': paths.sourceVideo,
    transcript: paths.transcript,
    'edit-plan': paths.editPlan,
    'render-plan': paths.renderPlan,
    timeline: paths.timeline,
    'intermediate-cut': paths.intermediateCut,
    'final-output': paths.finalOutput,
  };
  const filePath = allowed[artifact];
  if (!filePath) return null;
  return filePath;
};

export const saveUploadedVideo = async (file: File) => {
  const ext = extensionForUpload(file.name);
  const inputPath = path.resolve(process.cwd(), 'storage', 'temp', `${makeJobId('upload')}-${Date.now()}${ext}`);
  await fs.ensureDir(path.dirname(inputPath));
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(inputPath, bytes);
  return inputPath;
};

export const saveUploadedAudio = async (file: File) => {
  const ext = extensionForAudioUpload(file.name);
  const inputPath = path.resolve(process.cwd(), 'storage', 'temp', `${makeJobId('audio')}-${Date.now()}${ext}`);
  await fs.ensureDir(path.dirname(inputPath));
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(inputPath, bytes);
  return inputPath;
};

const updateJob = (id: string, patch: Partial<WebJob>) => {
  const existing = jobs.get(id);
  if (!existing) return;
  jobs.set(id, {...existing, ...patch, updatedAt: new Date().toISOString()});
};

const readLogs = async (filePath: string): Promise<JobLogEntry[]> => {
  if (!(await fs.pathExists(filePath))) return [];
  return fs.readJson(filePath);
};

const inferJobFromDisk = (id: string): WebJob => ({
  id,
  status: 'running',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const extensionForUpload = (name: string) => {
  const ext = path.extname(name).toLowerCase();
  if (!['.mp4', '.mov', '.m4v', '.webm'].includes(ext)) {
    throw new Error('Unsupported upload type. Use mp4, mov, m4v, or webm.');
  }
  return ext;
};

const extensionForAudioUpload = (name: string) => {
  const ext = path.extname(name).toLowerCase();
  if (!['.mp3', '.wav', '.m4a', '.aac', '.mp4'].includes(ext)) {
    throw new Error('Unsupported audio upload type. Use mp3, wav, m4a, or aac.');
  }
  return ext;
};
