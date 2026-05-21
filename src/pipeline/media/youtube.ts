import {createWriteStream} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {execa} from 'execa';
import fs from 'fs-extra';
import {getFfmpegPath} from './tools';

const require = createRequire(import.meta.url);

type BundledYtDlp = {
  exec: (url: string, flags: Record<string, unknown>, options?: {stdio?: 'inherit'}) => Promise<unknown>;
};

export const downloadYoutubeVideo = async (
  youtubeUrl: string,
  destination: string,
  options: {downloadStartSec?: number; maxDownloadSec?: number} = {},
) => {
  await fs.ensureDir(path.dirname(destination));
  await cleanupDownloadParts(destination);
  const sectionArgs = buildYtDlpSectionArgs(options.downloadStartSec, options.maxDownloadSec);

  if (await commandExists('yt-dlp')) {
    await execa('yt-dlp', [
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
    ], {stdio: 'inherit'});
    await normalizeYoutubeDownload(destination);
    return;
  }

  const bundledYtDlp = loadBundledYtDlp();
  if (bundledYtDlp) {
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
  } else {
    console.warn('Bundled yt-dlp is unavailable; falling back to JS downloader.');
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

const loadBundledYtDlp = (): BundledYtDlp | null => {
  try {
    return require('yt-dlp-exec') as BundledYtDlp;
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (code !== 'MODULE_NOT_FOUND') console.warn(error instanceof Error ? error.message : error);
    return null;
  }
};

const downloadWithYtdlCore = async (youtubeUrl: string, destination: string) => {
  const ytdl = await import('@distube/ytdl-core');
  if (!ytdl.default.validateURL(youtubeUrl)) throw new Error('Invalid YouTube URL.');
  const info = await ytdl.default.getInfo(youtubeUrl);
  const format = ytdl.default.chooseFormat(info.formats, {
    quality: 'highest',
    filter: (candidate) => Boolean(candidate.hasAudio && candidate.hasVideo && candidate.container === 'mp4'),
  });
  if (!format) throw new Error('No combined mp4 YouTube format was found. Install yt-dlp for broader format support.');
  await pipeline(Readable.from(ytdl.default.downloadFromInfo(info, {format})), createWriteStream(destination));
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
  const section = `*${Math.floor(start)}-${Math.floor(start + maxDownloadSec)}`;
  return {
    system: ['--download-sections', section, '--force-keyframes-at-cuts'],
    bundled: {downloadSections: section, forceKeyframesAtCuts: true},
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
  await Promise.all(files.filter((file) => file === path.basename(destination) || file.startsWith(`${stem}.`)).map((file) => fs.remove(path.join(dir, file))));
};

const normalizeYoutubeDownload = async (destination: string) => {
  if (await fs.pathExists(destination)) return;
  const dir = path.dirname(destination);
  const stem = path.parse(destination).name;
  const files = await fs.readdir(dir);
  const candidates = files.filter((file) => file.startsWith(`${stem}.`));
  const mergedMp4 = candidates.find((file) => file === `${stem}.mp4`);
  if (mergedMp4) return fs.move(path.join(dir, mergedMp4), destination, {overwrite: true});

  const videoPart = candidates.find((file) => /\.(mp4|webm|mkv)$/i.test(file));
  const audioPart = candidates.find((file) => /\.(m4a|aac|opus|webm)$/i.test(file) && file !== videoPart);
  if (videoPart && audioPart) {
    await execa(getFfmpegPath(), ['-y', '-i', path.join(dir, videoPart), '-i', path.join(dir, audioPart), '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart', destination]);
    return;
  }
  if (videoPart) return fs.move(path.join(dir, videoPart), destination, {overwrite: true});
  throw new Error(`YouTube download finished, but no usable video file was found in ${dir}.`);
};
