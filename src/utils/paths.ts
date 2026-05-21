import path from 'node:path';
import fs from 'fs-extra';
import sanitize from 'sanitize-filename';

export type JobPaths = {
  root: string;
  inputDir: string;
  artifactsDir: string;
  logsDir: string;
  sourceVideo: string;
  instruction: string;
  bgmAudio: string;
  audio: string;
  transcript: string;
  editPlan: string;
  renderPlan: string;
  timeline: string;
  intermediateCut: string;
  verticalVideo: string;
  remotionOutput: string;
  finalOutput: string;
  jobLog: string;
  ffmpegLog: string;
};

export const makeJobId = (requested?: string) => {
  if (requested) return sanitize(requested).replace(/\s+/g, '-') || 'local-demo';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `local-${stamp}`;
};

export const getJobPaths = async (cwd: string, jobId: string): Promise<JobPaths> => {
  const root = path.resolve(cwd, 'storage', 'jobs', jobId);
  const inputDir = path.join(root, 'input');
  const artifactsDir = path.join(root, 'artifacts');
  const logsDir = path.join(root, 'logs');
  await fs.ensureDir(inputDir);
  await fs.ensureDir(artifactsDir);
  await fs.ensureDir(logsDir);

  return {
    root,
    inputDir,
    artifactsDir,
    logsDir,
    sourceVideo: path.join(inputDir, 'source.mp4'),
    instruction: path.join(inputDir, 'instruction.txt'),
    bgmAudio: path.join(inputDir, 'bgm-audio'),
    audio: path.join(artifactsDir, 'audio.mp3'),
    transcript: path.join(artifactsDir, 'transcript.json'),
    editPlan: path.join(artifactsDir, 'edit-plan.json'),
    renderPlan: path.join(artifactsDir, 'render-plan.json'),
    timeline: path.join(artifactsDir, 'timeline.json'),
    intermediateCut: path.join(artifactsDir, 'intermediate-cut.mp4'),
    verticalVideo: path.join(artifactsDir, 'vertical.mp4'),
    remotionOutput: path.join(artifactsDir, 'remotion-output.mp4'),
    finalOutput: path.join(artifactsDir, 'final-output.mp4'),
    jobLog: path.join(logsDir, 'job-log.json'),
    ffmpegLog: path.join(logsDir, 'ffmpeg-log.txt'),
  };
};
