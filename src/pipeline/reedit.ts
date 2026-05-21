import fs from 'fs-extra';
import {EditPlan, EditPlanSchema} from '../schemas/edit-plan';
import {createTimelineProjectFromEditPlan} from '../schemas/timeline';
import {JobLogger} from '../utils/log';
import {getJobPaths} from '../utils/paths';
import {buildCuts, convertToVertical, getVideoDurationSec, mixBackgroundAudio} from './media';
import {createRenderPlan, renderWithRemotion} from './render';
import {applyOperation, ManualEditOperationSchema} from './reedit/operations';

export type {ManualEditOperation} from './reedit/operations';

export const applyManualEditAndRender = async ({
  cwd,
  jobId,
  operation,
}: {
  cwd: string;
  jobId: string;
  operation: unknown;
}) => {
  const parsedOperation = ManualEditOperationSchema.parse(operation);
  const paths = await getJobPaths(cwd, jobId);
  const logger = new JobLogger(paths.jobLog);

  if (!(await fs.pathExists(paths.sourceVideo))) {
    throw new Error('Source video was not found for this job.');
  }
  if (!(await fs.pathExists(paths.editPlan))) {
    throw new Error('Edit plan was not found for this job.');
  }

  await logger.push('manual-edit', 'start', `Applying manual edit: ${parsedOperation.type}`, parsedOperation);
  await removeStaleRenderOutputs(paths);

  const durationSec = await getVideoDurationSec(paths.sourceVideo);
  const currentPlan = EditPlanSchema.parse(await fs.readJson(paths.editPlan));
  const nextPlan = applyOperation(currentPlan, parsedOperation, durationSec);

  await fs.writeJson(paths.editPlan, nextPlan, {spaces: 2});
  await logger.push('manual-edit', 'ok', 'Edit plan updated', {path: paths.editPlan});

  await rebuildMediaArtifacts(paths, nextPlan, logger);
  const renderPlan = createRenderPlan(nextPlan);

  await fs.writeJson(paths.renderPlan, renderPlan, {spaces: 2});
  await logger.push('render-plan', 'ok', 'Render plan updated', {path: paths.renderPlan});

  const timeline = createTimelineProjectFromEditPlan({
    jobId,
    editPlan: nextPlan,
    title: 'ROVUNQ Edited Timeline',
  });
  await fs.writeJson(paths.timeline, timeline, {spaces: 2});
  await logger.push('timeline', 'ok', 'Editable timeline updated', {path: paths.timeline});

  await renderFinalVideo({
    cwd,
    paths,
    renderPlan,
    logger,
  });

  return paths;
};

const removeStaleRenderOutputs = async (paths: Awaited<ReturnType<typeof getJobPaths>>) => {
  await Promise.all([
    fs.remove(paths.finalOutput),
    fs.remove(paths.remotionOutput),
    fs.remove(paths.verticalVideo),
    fs.remove(paths.intermediateCut),
  ]);
};

const rebuildMediaArtifacts = async (
  paths: Awaited<ReturnType<typeof getJobPaths>>,
  nextPlan: EditPlan,
  logger: JobLogger,
) => {
  await logger.push('cut', 'start', 'Rebuilding intermediate-cut.mp4 from manual edit');
  await buildCuts(paths.sourceVideo, nextPlan.cuts, paths.intermediateCut, paths.ffmpegLog);
  await logger.push('cut', 'ok', 'Intermediate cut video rebuilt', {path: paths.intermediateCut});

  await logger.push('vertical', 'start', 'Rebuilding vertical.mp4');
  await convertToVertical(paths.intermediateCut, paths.verticalVideo, paths.ffmpegLog);
  await logger.push('vertical', 'ok', 'Vertical video rebuilt', {path: paths.verticalVideo});
};

const renderFinalVideo = async ({
  cwd,
  paths,
  renderPlan,
  logger,
}: {
  cwd: string;
  paths: Awaited<ReturnType<typeof getJobPaths>>;
  renderPlan: ReturnType<typeof createRenderPlan>;
  logger: JobLogger;
}) => {
  await logger.push('remotion', 'start', 'Rendering final-output.mp4 after manual edit');
  const hasBgm = await fs.pathExists(paths.bgmAudio);
  const remotionTarget = hasBgm ? paths.remotionOutput : paths.finalOutput;

  await renderWithRemotion({
    cwd,
    videoPath: paths.verticalVideo,
    plan: renderPlan,
    outputPath: remotionTarget,
  });

  if (hasBgm) {
    await logger.push('bgm', 'start', 'Mixing background audio after manual edit');
    await mixBackgroundAudio({
      videoPath: remotionTarget,
      bgmPath: paths.bgmAudio,
      outputPath: paths.finalOutput,
      ffmpegLogPath: paths.ffmpegLog,
    });
    await logger.push('bgm', 'ok', 'Background audio mixed after manual edit', {path: paths.finalOutput});
  }

  await logger.push('remotion', 'ok', 'Final MP4 rerendered', {path: paths.finalOutput});
};
