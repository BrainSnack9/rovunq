import path from 'node:path';
import {execa} from 'execa';
import fs from 'fs-extra';
import {appendFfmpegLog, getFfmpegPath, videoHasAudioStream} from './tools';

export const extractAudio = async (videoPath: string, audioPath: string, ffmpegLogPath: string) => {
  await fs.ensureDir(path.dirname(audioPath));
  const result = await execa(getFfmpegPath(), [
    '-y',
    '-i',
    videoPath,
    '-vn',
    '-codec:a',
    'libmp3lame',
    '-ar',
    '16000',
    '-ac',
    '1',
    '-b:a',
    '32k',
    audioPath,
  ]);
  await appendFfmpegLog(ffmpegLogPath, result.stderr);
};

export const buildCuts = async (
  sourcePath: string,
  cuts: {sourceStartSec: number; sourceEndSec: number; speed?: number}[],
  outputPath: string,
  ffmpegLogPath: string,
) => {
  await fs.ensureDir(path.dirname(outputPath));
  const tempDir = path.join(path.dirname(outputPath), 'cut-parts');
  await fs.emptyDir(tempDir);
  const listFile = path.join(tempDir, 'concat.txt');
  const hasAudio = await videoHasAudioStream(sourcePath);

  const partPaths: string[] = [];
  for (const [index, cut] of cuts.entries()) {
    const partPath = path.join(tempDir, `part-${String(index).padStart(3, '0')}.mp4`);
    const duration = Math.max(0.1, cut.sourceEndSec - cut.sourceStartSec);
    const speed = typeof cut.speed === 'number' && Number.isFinite(cut.speed) ? Math.min(2, Math.max(0.5, cut.speed)) : 1;
    const speedFilter = Math.abs(speed - 1) > 0.001;
    const streamArgs = speedFilter
      ? hasAudio
        ? [
            '-filter_complex',
            `[0:v]setpts=${(1 / speed).toFixed(6)}*PTS[v];[0:a]atempo=${speed.toFixed(6)}[a]`,
            '-map',
            '[v]',
            '-map',
            '[a]',
          ]
        : ['-filter:v', `setpts=${(1 / speed).toFixed(6)}*PTS`, '-map', '0:v:0']
      : ['-map', '0:v:0', '-map', '0:a?'];

    const result = await execa(getFfmpegPath(), [
      '-y',
      '-ss',
      cut.sourceStartSec.toFixed(3),
      '-i',
      sourcePath,
      '-t',
      duration.toFixed(3),
      ...streamArgs,
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
      partPath,
    ]);
    await appendFfmpegLog(ffmpegLogPath, result.stderr);
    partPaths.push(partPath);
  }

  await fs.writeFile(
    listFile,
    partPaths.map((partPath) => `file '${partPath.replace(/\\/g, '/')}'`).join('\n'),
    'utf8',
  );
  const concat = await execa(getFfmpegPath(), ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outputPath]);
  await appendFfmpegLog(ffmpegLogPath, concat.stderr);
};

export const convertToVertical = async (inputPath: string, outputPath: string, ffmpegLogPath: string) => {
  const vf = 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1';
  const result = await execa(getFfmpegPath(), [
    '-y',
    '-i',
    inputPath,
    '-vf',
    vf,
    '-r',
    '30',
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
    outputPath,
  ]);
  await appendFfmpegLog(ffmpegLogPath, result.stderr);
};

export const mixBackgroundAudio = async ({
  videoPath,
  bgmPath,
  outputPath,
  ffmpegLogPath,
  volume = 0.18,
}: {
  videoPath: string;
  bgmPath: string;
  outputPath: string;
  ffmpegLogPath: string;
  volume?: number;
}) => {
  await fs.ensureDir(path.dirname(outputPath));
  const result = await execa(getFfmpegPath(), [
    '-y',
    '-i',
    videoPath,
    '-stream_loop',
    '-1',
    '-i',
    bgmPath,
    '-filter_complex',
    `[1:a]volume=${volume.toFixed(3)}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[a]`,
    '-map',
    '0:v:0',
    '-map',
    '[a]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-shortest',
    '-movflags',
    '+faststart',
    outputPath,
  ]);
  await appendFfmpegLog(ffmpegLogPath, result.stderr);
};
