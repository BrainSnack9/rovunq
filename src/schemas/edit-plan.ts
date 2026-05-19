import {z} from 'zod';

export const CutReasonSchema = z.enum(['hook', 'highlight', 'context', 'proof', 'cta', 'fallback']);
export const TransitionTypeSchema = z.enum(['hard_cut', 'fade_in', 'fade_out']);
export const ZoomTypeSchema = z.enum(['zoom_in', 'zoom_out']);
export const SubtitleStyleSchema = z.enum(['basic', 'entertainment', 'education', 'news', 'cinematic', 'cta']);
export const SubtitlePositionSchema = z.enum(['bottom', 'center', 'top']);

export const CutSchema = z
  .object({
    id: z.string().min(1),
    sourceStartSec: z.number().min(0),
    sourceEndSec: z.number().positive(),
    outputStartSec: z.number().min(0).optional(),
    outputEndSec: z.number().positive().optional(),
    reason: CutReasonSchema,
    keepAudio: z.boolean().default(true),
    speed: z.number().min(0.5).max(2).default(1),
  })
  .refine((cut) => cut.sourceEndSec > cut.sourceStartSec, {
    message: 'sourceEndSec must be greater than sourceStartSec',
  });

export const SubtitleSchema = z
  .object({
    id: z.string().min(1),
    startSec: z.number().min(0),
    endSec: z.number().positive(),
    text: z.string().min(1).max(120),
    position: SubtitlePositionSchema.default('bottom'),
    style: SubtitleStyleSchema.default('entertainment'),
    emphasisWords: z.array(z.string()).default([]),
    animation: z.enum(['none', 'pop', 'fade']).default('pop'),
    timebase: z.enum(['source', 'output']).default('output'),
  })
  .refine((subtitle) => subtitle.endSec > subtitle.startSec, {
    message: 'subtitle endSec must be greater than startSec',
  });

export const EditPlanSchema = z.object({
  output: z.object({
    format: z.literal('mp4').default('mp4'),
    aspectRatio: z.literal('9:16').default('9:16'),
    width: z.literal(1080).default(1080),
    height: z.literal(1920).default(1920),
    fps: z.number().int().min(24).max(60).default(30),
    targetDurationSec: z.number().min(3).max(180).default(60),
  }),
  source: z.object({
    originalDurationSec: z.number().min(0),
    language: z.string().default('ko'),
  }),
  cuts: z.array(CutSchema).min(1).max(30),
  silenceRemoval: z.object({
    enabled: z.boolean().default(true),
    thresholdDb: z.number().min(-80).max(-10).default(-35),
    minSilenceMs: z.number().int().min(100).max(3000).default(500),
  }),
  transitions: z
    .array(
      z.object({
        betweenCutIds: z.tuple([z.string(), z.string()]),
        type: TransitionTypeSchema.default('hard_cut'),
        durationMs: z.number().int().min(0).max(1000).default(0),
      }),
    )
    .default([]),
  zoomEffects: z
    .array(
      z.object({
        cutId: z.string(),
        startSec: z.number().min(0),
        endSec: z.number().positive(),
        type: ZoomTypeSchema.default('zoom_in'),
        intensity: z.enum(['subtle', 'medium', 'strong']).default('medium'),
        reason: z.string().max(120).default('keyword_emphasis'),
        timebase: z.enum(['source', 'output']).default('output'),
      }),
    )
    .default([]),
  subtitles: z.array(SubtitleSchema).default([]),
  graphics: z
    .array(
      z.object({
        id: z.string().min(1),
        startSec: z.number().min(0),
        endSec: z.number().positive(),
        type: z.enum(['title_card']),
        text: z.string().min(1).max(80),
        style: z.enum(['bold', 'clean']).default('bold'),
        timebase: z.enum(['source', 'output']).default('output'),
      }),
    )
    .default([]),
  cta: z.object({
    enabled: z.boolean().default(true),
    startSec: z.number().min(0),
    endSec: z.number().positive(),
    text: z.string().min(1).max(80),
    style: z.enum(['clean_bold', 'entertainment']).default('clean_bold'),
    timebase: z.enum(['source', 'output']).default('output'),
  }),
});

export type EditPlan = z.infer<typeof EditPlanSchema>;

export const TranscriptSchema = z.object({
  fullText: z.string(),
  language: z.string().default('ko'),
  duration: z.number().min(0),
  segments: z.array(
    z.object({
      id: z.number().optional(),
      start: z.number().min(0),
      end: z.number().min(0),
      text: z.string(),
    }),
  ),
  words: z
    .array(
      z.object({
        word: z.string(),
        start: z.number().min(0),
        end: z.number().min(0),
      }),
    )
    .default([]),
});

export type Transcript = z.infer<typeof TranscriptSchema>;

export const RenderPlanSchema = EditPlanSchema.extend({
  finalDurationSec: z.number().min(0),
});

export type RenderPlan = z.infer<typeof RenderPlanSchema>;
