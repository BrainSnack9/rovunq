import fs from 'fs-extra';
import {z} from 'zod';
import {EditPlan, EditPlanSchema, SubtitlePositionSchema, SubtitleStyleSchema} from '../schemas/edit-plan';
import {JobLogger} from '../utils/log';
import {getJobPaths} from '../utils/paths';
import {buildCuts, convertToVertical, getVideoDurationSec, mixBackgroundAudio} from './media';
import {createRenderPlan, renderWithRemotion} from './render';

const ManualEditOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('insertCut'),
    sourceStartSec: z.number().min(0),
    sourceEndSec: z.number().positive(),
    insertAfterCutId: z.string().optional(),
    subtitleText: z.string().trim().max(120).optional(),
  }),
  z.object({
    type: z.literal('removeCut'),
    cutId: z.string(),
  }),
  z.object({
    type: z.literal('extendCut'),
    cutId: z.string(),
    beforeSec: z.number().min(0).max(10).default(0),
    afterSec: z.number().min(0).max(10).default(0),
  }),
  z.object({
    type: z.literal('moveSubtitle'),
    cutId: z.string(),
    position: SubtitlePositionSchema,
  }),
  z.object({
    type: z.literal('updateSubtitle'),
    cutId: z.string(),
    text: z.string().trim().min(1).max(120),
  }),
  z.object({
    type: z.literal('updateSubtitleStyle'),
    cutId: z.string(),
    position: SubtitlePositionSchema.optional(),
    style: SubtitleStyleSchema.optional(),
    animation: z.enum(['none', 'pop', 'fade']).optional(),
  }),
  z.object({
    type: z.literal('moveCut'),
    cutId: z.string(),
    direction: z.enum(['up', 'down']),
  }),
]);

export type ManualEditOperation = z.infer<typeof ManualEditOperationSchema>;

type CutDraft = EditPlan['cuts'][number] & {
  subtitleText?: string;
  subtitlePosition?: EditPlan['subtitles'][number]['position'];
  subtitleStyle?: EditPlan['subtitles'][number]['style'];
  subtitleAnimation?: EditPlan['subtitles'][number]['animation'];
  emphasisWords?: string[];
};

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

  await Promise.all([
    fs.remove(paths.finalOutput),
    fs.remove(paths.remotionOutput),
    fs.remove(paths.verticalVideo),
    fs.remove(paths.intermediateCut),
  ]);

  const durationSec = await getVideoDurationSec(paths.sourceVideo);
  const currentPlan = EditPlanSchema.parse(await fs.readJson(paths.editPlan));
  const nextPlan = applyOperation(currentPlan, parsedOperation, durationSec);

  await fs.writeJson(paths.editPlan, nextPlan, {spaces: 2});
  await logger.push('manual-edit', 'ok', 'Edit plan updated', {path: paths.editPlan});

  await logger.push('cut', 'start', 'Rebuilding intermediate-cut.mp4 from manual edit');
  await buildCuts(paths.sourceVideo, nextPlan.cuts, paths.intermediateCut, paths.ffmpegLog);
  await logger.push('cut', 'ok', 'Intermediate cut video rebuilt', {path: paths.intermediateCut});

  await logger.push('vertical', 'start', 'Rebuilding vertical.mp4');
  await convertToVertical(paths.intermediateCut, paths.verticalVideo, paths.ffmpegLog);
  await logger.push('vertical', 'ok', 'Vertical video rebuilt', {path: paths.verticalVideo});

  const renderPlan = createRenderPlan(nextPlan);
  await fs.writeJson(paths.renderPlan, renderPlan, {spaces: 2});
  await logger.push('render-plan', 'ok', 'Render plan updated', {path: paths.renderPlan});

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

  return paths;
};

const applyOperation = (plan: EditPlan, operation: ManualEditOperation, durationSec: number): EditPlan => {
  const drafts = createCutDrafts(plan);

  if (operation.type === 'insertCut') {
    if (operation.sourceEndSec <= operation.sourceStartSec) {
      throw new Error('sourceEndSec must be greater than sourceStartSec.');
    }
    const manualCut: CutDraft = {
      id: nextManualCutId(drafts),
      sourceStartSec: clamp(operation.sourceStartSec, 0, durationSec),
      sourceEndSec: clamp(operation.sourceEndSec, 0.1, durationSec),
      reason: 'context',
      keepAudio: true,
      speed: 1,
      subtitleText: operation.subtitleText || '수동 삽입 구간',
      subtitlePosition: 'bottom',
      subtitleStyle: 'entertainment',
      subtitleAnimation: 'pop',
      emphasisWords: [],
    };
    if (manualCut.sourceEndSec <= manualCut.sourceStartSec) {
      throw new Error('Inserted cut is outside the source duration.');
    }
    const index = operation.insertAfterCutId
      ? drafts.findIndex((cut) => cut.id === operation.insertAfterCutId) + 1
      : drafts.length;
    drafts.splice(index > 0 ? index : drafts.length, 0, manualCut);
  }

  if (operation.type === 'removeCut') {
    const next = drafts.filter((cut) => cut.id !== operation.cutId);
    if (next.length === drafts.length) throw new Error(`Cut not found: ${operation.cutId}`);
    if (next.length === 0) throw new Error('At least one cut must remain.');
    drafts.splice(0, drafts.length, ...next);
  }

  if (operation.type === 'extendCut') {
    const cut = drafts.find((candidate) => candidate.id === operation.cutId);
    if (!cut) throw new Error(`Cut not found: ${operation.cutId}`);
    cut.sourceStartSec = clamp(cut.sourceStartSec - operation.beforeSec, 0, durationSec);
    cut.sourceEndSec = clamp(cut.sourceEndSec + operation.afterSec, 0.1, durationSec);
  }

  if (operation.type === 'moveSubtitle') {
    const cut = drafts.find((candidate) => candidate.id === operation.cutId);
    if (!cut) throw new Error(`Cut not found: ${operation.cutId}`);
    cut.subtitlePosition = operation.position;
  }

  if (operation.type === 'updateSubtitle') {
    const cut = drafts.find((candidate) => candidate.id === operation.cutId);
    if (!cut) throw new Error(`Cut not found: ${operation.cutId}`);
    cut.subtitleText = operation.text;
  }

  if (operation.type === 'updateSubtitleStyle') {
    const cut = drafts.find((candidate) => candidate.id === operation.cutId);
    if (!cut) throw new Error(`Cut not found: ${operation.cutId}`);
    if (operation.position) cut.subtitlePosition = operation.position;
    if (operation.style) cut.subtitleStyle = operation.style;
    if (operation.animation) cut.subtitleAnimation = operation.animation;
  }

  if (operation.type === 'moveCut') {
    const index = drafts.findIndex((candidate) => candidate.id === operation.cutId);
    if (index < 0) throw new Error(`Cut not found: ${operation.cutId}`);
    const target = operation.direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= drafts.length) return normalizePlan(plan, drafts, durationSec);
    const [cut] = drafts.splice(index, 1);
    drafts.splice(target, 0, cut);
  }

  return normalizePlan(plan, drafts, durationSec);
};

const createCutDrafts = (plan: EditPlan): CutDraft[] =>
  plan.cuts.map((cut, index) => {
    const subtitle =
      plan.subtitles.find((candidate) => overlaps(candidate.startSec, candidate.endSec, cut.outputStartSec ?? 0, cut.outputEndSec ?? 0)) ??
      plan.subtitles[index];
    return {
      ...cut,
      subtitleText: subtitle?.text,
      subtitlePosition: subtitle?.position,
      subtitleStyle: subtitle?.style,
      subtitleAnimation: subtitle?.animation,
      emphasisWords: subtitle?.emphasisWords ?? [],
    };
  });

const normalizePlan = (plan: EditPlan, drafts: CutDraft[], durationSec: number): EditPlan => {
  let cursor = 0;
  const cuts = drafts.slice(0, 30).map((draft, index) => {
    const duration = Math.max(0.25, draft.sourceEndSec - draft.sourceStartSec) / (draft.speed || 1);
    const cut = {
      id: draft.id || `cut_${String(index + 1).padStart(3, '0')}`,
      sourceStartSec: clamp(draft.sourceStartSec, 0, durationSec),
      sourceEndSec: clamp(draft.sourceEndSec, 0.1, durationSec),
      outputStartSec: cursor,
      outputEndSec: cursor + duration,
      reason: draft.reason,
      keepAudio: draft.keepAudio,
      speed: draft.speed || 1,
    };
    cursor += duration;
    return cut;
  });

  const subtitles = cuts.map((cut, index) => {
    const draft = drafts[index];
    return {
      id: `sub_${String(index + 1).padStart(3, '0')}`,
      startSec: cut.outputStartSec,
      endSec: cut.outputEndSec,
      text: (draft.subtitleText || `수동 컷 ${index + 1}`).slice(0, 120),
      position: draft.subtitlePosition ?? 'bottom',
      style: draft.subtitleStyle ?? 'entertainment',
      emphasisWords: draft.emphasisWords ?? [],
      animation: draft.subtitleAnimation ?? 'pop',
      timebase: 'output' as const,
    };
  });

  const finalDuration = Math.max(1, cursor);

  return EditPlanSchema.parse({
    ...plan,
    output: {
      ...plan.output,
      targetDurationSec: Math.min(180, Math.max(3, finalDuration)),
    },
    source: {
      ...plan.source,
      originalDurationSec: durationSec,
    },
    cuts,
    transitions: cuts.slice(1).map((cut, index) => ({
      betweenCutIds: [cuts[index].id, cut.id],
      type: 'hard_cut',
      durationMs: 0,
    })),
    zoomEffects: [],
    subtitles,
    graphics: plan.graphics.map((graphic) => ({
      ...graphic,
      endSec: Math.min(graphic.endSec, finalDuration),
    })),
    cta: {
      ...plan.cta,
      startSec: Math.max(0, finalDuration - 4),
      endSec: finalDuration,
      timebase: 'output',
    },
  });
};

const nextManualCutId = (cuts: {id: string}[]) => {
  const existing = new Set(cuts.map((cut) => cut.id));
  for (let index = 1; index <= 99; index += 1) {
    const id = `manual_${String(index).padStart(3, '0')}`;
    if (!existing.has(id)) return id;
  }
  return `manual_${Date.now()}`;
};

const overlaps = (startA: number, endA: number, startB: number, endB: number) =>
  Math.max(startA, startB) < Math.min(endA, endB);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
