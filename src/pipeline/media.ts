import {createWriteStream} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {execa} from 'execa';
import fs from 'fs-extra';

const require = createRequire(import.meta.url);
const ffmpegStatic = require('ffmpeg-static') as string | null;
const ffprobeStatic = require('ffprobe-static') as {path: string};
const ffprobePath = ffprobeStatic.path;

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
  const args = [
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
  ];
  const result = await execa(getFfmpegPath(), args);
  await appendFfmpegLog(ffmpegLogPath, result.stderr);
};

export const downloadYoutubeVideo = async (
  youtubeUrl: string,
  destination: string,
  options: {downloadStartSec?: number; maxDownloadSec?: number} = {},
) => {
  await fs.ensureDir(path.dirname(destination));
  await cleanupDownloadParts(destination);
  const sectionArgs = buildYtDlpSectionArgs(options.downloadStartSec, options.maxDownloadSec);

  const systemYtDlp = await commandExists('yt-dlp');
  if (systemYtDlp) {
    await execa(
      'yt-dlp',
      [
        '-f',
        youtubeFormatSelector(),
        '--merge-output-format',
        'mp4',
        '--ffmpeg-location',
        getFfmpegPath(),
        '--no-playlist',
        ...sectionArgs.system,
        '-o',
        ytDlpOutputTemplate(destination),
        youtubeUrl,
      ],
      {stdio: 'inherit'},
    );
    await normalizeYoutubeDownload(destination);
    return;
  }

  const bundledYtDlp = require('yt-dlp-exec') as {
    exec: (url: string, flags: Record<string, unknown>, options?: {stdio?: 'inherit'}) => Promise<unknown>;
  };
  try {
    await bundledYtDlp.exec(
      youtubeUrl,
      {
        format: youtubeFormatSelector(),
        mergeOutputFormat: 'mp4',
        ffmpegLocation: getFfmpegPath(),
        noPlaylist: true,
        ...sectionArgs.bundled,
        output: ytDlpOutputTemplate(destination),
      },
      {stdio: 'inherit'},
    );
    await normalizeYoutubeDownload(destination);
    return;
  } catch (error) {
    console.warn('Bundled yt-dlp failed; falling back to JS downloader.');
    console.warn(error instanceof Error ? error.message : error);
  }

  if (sectionArgs.usesSections) {
    throw new Error('Partial YouTube downloads require yt-dlp. Install yt-dlp or clear the source range.');
  }

  await downloadWithYtdlCore(youtubeUrl, destination);
  await normalizeYoutubeDownload(destination);
};

const commandExists = async (command: string) => {
  try {
    await execa(command, ['--version']);
    return true;
  } catch {
    return false;
  }
};

const downloadWithYtdlCore = async (youtubeUrl: string, destination: string) => {
  const ytdl = await import('@distube/ytdl-core');
  if (!ytdl.default.validateURL(youtubeUrl)) {
    throw new Error('Invalid YouTube URL.');
  }
  const info = await ytdl.default.getInfo(youtubeUrl);
  const format = ytdl.default.chooseFormat(info.formats, {
    quality: 'highest',
    filter: (candidate) => Boolean(candidate.hasAudio && candidate.hasVideo && candidate.container === 'mp4'),
  });
  if (!format) {
    throw new Error('No combined mp4 YouTube format was found. Install yt-dlp for broader format support.');
  }
  const stream = ytdl.default.downloadFromInfo(info, {format});
  await pipeline(Readable.from(stream), createWriteStream(destination));
};

const ytDlpOutputTemplate = (destination: string) => {
  const parsed = path.parse(destination);
  return path.join(parsed.dir, `${parsed.name}.%(ext)s`);
};

const buildYtDlpSectionArgs = (downloadStartSec = 0, maxDownloadSec?: number) => {
  const start = Math.max(0, downloadStartSec);
  if (!maxDownloadSec || maxDownloadSec <= 0) {
    return {system: [] as string[], bundled: {} as Record<string, unknown>, usesSections: false};
  }

  const end = start + maxDownloadSec;
  const section = `*${Math.floor(start)}-${Math.floor(end)}`;
  return {
    system: ['--download-sections', section, '--force-keyframes-at-cuts'],
    bundled: {
      downloadSections: section,
      forceKeyframesAtCuts: true,
    },
    usesSections: true,
  };
};

const youtubeFormatSelector = () =>
  [
    'bv*[height<=720][vcodec^=avc1][ext=mp4]+ba[ext=m4a]',
    'bv*[height<=720][ext=mp4]+ba[ext=m4a]',
    'b[height<=720][ext=mp4]',
    'bv*[height<=1080][vcodec^=avc1][ext=mp4]+ba[ext=m4a]',
    'bv*[height<=1080][ext=mp4]+ba[ext=m4a]',
    'b[ext=mp4]',
    'b',
  ].join('/');

const cleanupDownloadParts = async (destination: string) => {
  const dir = path.dirname(destination);
  const stem = path.parse(destination).name;
  const files = await fs.readdir(dir).catch(() => []);
  await Promise.all(
    files
      .filter((file) => file === path.basename(destination) || file.startsWith(`${stem}.`))
      .map((file) => fs.remove(path.join(dir, file))),
  );
};

const normalizeYoutubeDownload = async (destination: string) => {
  if (await fs.pathExists(destination)) return;

  const dir = path.dirname(destination);
  const stem = path.parse(destination).name;
  const files = await fs.readdir(dir);
  const candidates = files.filter((file) => file.startsWith(`${stem}.`));
  const mergedMp4 = candidates.find((file) => file === `${stem}.mp4`);
  if (mergedMp4) {
    await fs.move(path.join(dir, mergedMp4), destination, {overwrite: true});
    return;
  }

  const videoPart = candidates.find((file) => /\.(mp4|webm|mkv)$/i.test(file));
  const audioPart = candidates.find((file) => /\.(m4a|aac|opus|webm)$/i.test(file) && file !== videoPart);
  if (videoPart && audioPart) {
    await execa(getFfmpegPath(), [
      '-y',
      '-i',
      path.join(dir, videoPart),
      '-i',
      path.join(dir, audioPart),
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      destination,
    ]);
    return;
  }

  if (videoPart) {
    await fs.move(path.join(dir, videoPart), destination, {overwrite: true});
    return;
  }

  throw new Error(`YouTube download finished, but no usable video file was found in ${dir}.`);
};

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

  const partPaths: string[] = [];
  for (const [index, cut] of cuts.entries()) {
    const partPath = path.join(tempDir, `part-${String(index).padStart(3, '0')}.mp4`);
    const duration = Math.max(0.1, cut.sourceEndSec - cut.sourceStartSec);
    const result = await execa(getFfmpegPath(), [
      '-y',
      '-ss',
      cut.sourceStartSec.toFixed(3),
      '-i',
      sourcePath,
      '-t',
      duration.toFixed(3),
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
  const concat = await execa(getFfmpegPath(), [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listFile,
    '-c',
    'copy',
    outputPath,
  ]);
  await appendFfmpegLog(ffmpegLogPath, concat.stderr);
};

export const convertToVertical = async (inputPath: string, outputPath: string, ffmpegLogPath: string) => {
  const vf =
    'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1';
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

const appendFfmpegLog = async (ffmpegLogPath: string, stderr: string) => {
  await fs.ensureFile(ffmpegLogPath);
  await fs.appendFile(ffmpegLogPath, `\n\n[${new Date().toISOString()}]\n${stderr}`, 'utf8');
};
