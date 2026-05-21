import path from 'node:path';
import {execa} from 'execa';
import fs from 'fs-extra';
import {appendFfmpegLog, getFfmpegPath} from './tools';

export const copyInputVideo = async (inputPath: string, destination: string) => {
  const ext = path.extname(inputPath).toLowerCase();
  if (!['.mp4', '.mov', '.m4v', '.webm'].includes(ext)) {
    throw new Error(`Unsupported input video extension: ${ext}`);
  }
  await fs.copy(inputPath, destination, {overwrite: true});
};

export const trimInputVideo = async ({
  inputPath,
  destination,
  startSec,
  durationSec,
  ffmpegLogPath,
}: {
  inputPath: string;
  destination: string;
  startSec: number;
  durationSec?: number;
  ffmpegLogPath: string;
}) => {
  const ext = path.extname(inputPath).toLowerCase();
  if (!['.mp4', '.mov', '.m4v', '.webm'].includes(ext)) {
    throw new Error(`Unsupported input video extension: ${ext}`);
  }

  await fs.ensureDir(path.dirname(destination));
  const result = await execa(getFfmpegPath(), [
    '-y',
    '-ss',
    startSec.toFixed(3),
    '-i',
    inputPath,
    ...(durationSec ? ['-t', durationSec.toFixed(3)] : []),
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    destination,
  ]);
  await appendFfmpegLog(ffmpegLogPath, result.stderr);
};
