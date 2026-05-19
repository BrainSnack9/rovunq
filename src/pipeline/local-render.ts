import path from 'node:path';
import fs from 'fs-extra';
import {
  assertMediaTools,
  buildCuts,
  convertToVertical,
  copyInputVideo,
  downloadYoutubeVideo,
  extractAudio,
  getVideoDurationSec,
  mixBackgroundAudio,
  trimInputVideo,
} from './media';
import {createEditPlan, transcribeAudio, validateAndRepairPlan} from './ai';
import {createRenderPlan, renderWithRemotion} from './render';
import {JobLogger} from '../utils/log';
import {getJobPaths} from '../utils/paths';

export type RunLocalRenderOptions = {
  cwd: string;
  jobId: string;
  inputPath?: string;
  bgmPath?: string;
  youtubeUrl?: string;
  instructionText: string;
  sourceStartSec?: number;
  sourceDurationSec?: number;
  maxDurationSec?: number;
  skipOpenai?: boolean;
};

export const runLocalRender = async (options: RunLocalRenderOptions) => {
  const paths = await getJobPaths(options.cwd, options.jobId);
  const logger = new JobLogger(paths.jobLog);
  const maxDurationSec =
    typeof options.maxDurationSec === 'number' && Number.isFinite(options.maxDurationSec) && options.maxDurationSec > 0
      ? options.maxDurationSec
      : undefined;
  const sourceStartSec =
    typeof options.sourceStartSec === 'number' && Number.isFinite(options.sourceStartSec) && options.sourceStartSec > 0
      ? options.sourceStartSec
      : 0;
  const sourceDurationSec =
    typeof options.sourceDurationSec === 'number' &&
    Number.isFinite(options.sourceDurationSec) &&
    options.sourceDurationSec > 0
      ? options.sourceDurationSec
      : undefined;

  await logger.push('init', 'start', `Starting ROVUNQ MVP1 job ${options.jobId}`);

  if (Boolean(options.inputPath) === Boolean(options.youtubeUrl)) {
    throw new Error('Provide exactly one input source: inputPath or youtubeUrl.');
  }

  await logger.push('tools', 'start', 'Checking bundled FFmpeg and FFprobe');
  await assertMediaTools();
  await logger.push('tools', 'ok', 'Media tools are ready');

  await fs.writeFile(paths.instruction, options.instructionText, 'utf8');
  if (options.bgmPath) {
    await fs.copy(path.resolve(options.cwd, options.bgmPath), paths.bgmAudio, {overwrite: true});
    await logger.push('bgm', 'ok', 'Background audio saved for this job', {path: paths.bgmAudio});
  }

  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  if (options.skipOpenai) {
    delete process.env.OPENAI_API_KEY;
    await logger.push('openai', 'warn', 'Skipping OpenAI calls by request; fallback artifacts will be generated');
  } else if (!process.env.OPENAI_API_KEY) {
    await logger.push('openai', 'warn', 'OPENAI_API_KEY is missing; fallback artifacts will be generated');
  }

  try {
    if (options.youtubeUrl) {
      await logger.push('download', 'start', 'Downloading YouTube URL into local source.mp4', {
        youtubeUrl: options.youtubeUrl,
        sourceStartSec,
        sourceDurationSec: sourceDurationSec ?? 'full',
        maxDownloadSec: sourceDurationSec ?? 'full',
      });
      await downloadYoutubeVideo(options.youtubeUrl, paths.sourceVideo, {
        downloadStartSec: sourceStartSec,
        maxDownloadSec: sourceDurationSec,
      });
      await logger.push('download', 'ok', 'YouTube video downloaded', {path: paths.sourceVideo});
    } else if (options.inputPath) {
      const inputPath = path.resolve(options.cwd, options.inputPath);
      if (sourceStartSec > 0 || sourceDurationSec) {
        await logger.push('input', 'start', 'Trimming local input video into source.mp4', {
          inputPath,
          sourceStartSec,
          sourceDurationSec: sourceDurationSec ?? 'to-end',
        });
        await trimInputVideo({
          inputPath,
          destination: paths.sourceVideo,
          startSec: sourceStartSec,
          durationSec: sourceDurationSec,
          ffmpegLogPath: paths.ffmpegLog,
        });
        await logger.push('input', 'ok', 'Local input video trimmed', {path: paths.sourceVideo});
      } else {
        await logger.push('input', 'start', 'Copying local input video', {inputPath});
        await copyInputVideo(inputPath, paths.sourceVideo);
        await logger.push('input', 'ok', 'Local input video copied', {path: paths.sourceVideo});
      }
    }

    const durationSec = await getVideoDurationSec(paths.sourceVideo);
    if (maxDurationSec && durationSec > maxDurationSec + 0.75) {
      throw new Error(`Input video is ${durationSec.toFixed(1)}s, which exceeds max ${maxDurationSec}s.`);
    }
    await logger.push('probe', 'ok', 'Source video probed', {durationSec});

    await logger.push('audio', 'start', 'Extracting compressed audio.mp3 for transcription');
    await extractAudio(paths.sourceVideo, paths.audio, paths.ffmpegLog);
    await logger.push('audio', 'ok', 'Audio extracted', {path: paths.audio});

    await logger.push('transcribe', 'start', 'Creating transcript.json');
    const transcript = await transcribeAudio(paths.audio, durationSec);
    await fs.writeJson(paths.transcript, transcript, {spaces: 2});
    await logger.push('transcribe', 'ok', 'Transcript saved', {path: paths.transcript});

    await logger.push('plan', 'start', 'Creating and validating edit-plan.json');
    const rawPlan = await createEditPlan(options.instructionText, transcript, durationSec);
    const editPlan = validateAndRepairPlan(rawPlan, durationSec);
    await fs.writeJson(paths.editPlan, editPlan, {spaces: 2});
    await logger.push('plan', 'ok', 'Edit plan saved', {path: paths.editPlan});

    await logger.push('cut', 'start', 'Building intermediate-cut.mp4');
    await buildCuts(paths.sourceVideo, editPlan.cuts, paths.intermediateCut, paths.ffmpegLog);
    await logger.push('cut', 'ok', 'Intermediate cut video saved', {path: paths.intermediateCut});

    await logger.push('vertical', 'start', 'Converting cut video to 9:16');
    await convertToVertical(paths.intermediateCut, paths.verticalVideo, paths.ffmpegLog);
    await logger.push('vertical', 'ok', 'Vertical video saved', {path: paths.verticalVideo});

    await logger.push('render-plan', 'start', 'Creating render-plan.json');
    const renderPlan = createRenderPlan(editPlan);
    await fs.writeJson(paths.renderPlan, renderPlan, {spaces: 2});
    await logger.push('render-plan', 'ok', 'Render plan saved', {path: paths.renderPlan});

    await logger.push('remotion', 'start', 'Rendering final-output.mp4');
    const remotionTarget = options.bgmPath ? paths.remotionOutput : paths.finalOutput;
    await renderWithRemotion({
      cwd: options.cwd,
      videoPath: paths.verticalVideo,
      plan: renderPlan,
      outputPath: remotionTarget,
    });
    if (options.bgmPath) {
      await logger.push('bgm', 'start', 'Mixing background audio into final-output.mp4');
      await mixBackgroundAudio({
        videoPath: remotionTarget,
        bgmPath: paths.bgmAudio,
        outputPath: paths.finalOutput,
        ffmpegLogPath: paths.ffmpegLog,
      });
      await logger.push('bgm', 'ok', 'Background audio mixed', {path: paths.finalOutput});
    }
    await logger.push('remotion', 'ok', 'Final MP4 saved', {path: paths.finalOutput});

    return paths;
  } catch (error) {
    await logger.push(
      'job',
      'error',
      error instanceof Error ? error.message : 'Unknown render error',
      error instanceof Error ? {stack: error.stack} : error,
    );
    throw error;
  } finally {
    if (options.skipOpenai && originalOpenAiKey) {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }
  }
};
