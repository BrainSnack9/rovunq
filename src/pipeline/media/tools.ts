import {createRequire} from 'node:module';
import fs from 'fs-extra';
import {execa} from 'execa';

const require = createRequire(import.meta.url);
const ffmpegStatic = require('ffmpeg-static') as string | null;
const ffprobeStatic = require('ffprobe-static') as {path: string};
export const ffprobePath = ffprobeStatic.path;

export const getFfmpegPath = () => {
  if (!ffmpegStatic) {
    throw new Error('ffmpeg-static did not provide an executable path.');
  }
  return ffmpegStatic;
};

export const assertMediaTools = async () => {
  await execa(getFfmpegPath(), ['-version']);
  await execa(ffprobePath, ['-version']);
};

export const getVideoDurationSec = async (videoPath: string): Promise<number> => {
  const {stdout} = await execa(ffprobePath, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    videoPath,
  ]);
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration)) throw new Error(`Unable to probe duration for ${videoPath}`);
  return duration;
};

export const videoHasAudioStream = async (videoPath: string) => {
  try {
    const {stdout} = await execa(ffprobePath, [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=index',
      '-of',
      'csv=p=0',
      videoPath,
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
};

export const appendFfmpegLog = async (ffmpegLogPath: string, stderr: string) => {
  await fs.ensureFile(ffmpegLogPath);
  await fs.appendFile(ffmpegLogPath, `\n\n[${new Date().toISOString()}]\n${stderr}`, 'utf8');
};
