import {z} from 'zod';
import type {EditPlan} from './edit-plan';

export const TimelineTrackTypeSchema = z.enum(['video', 'caption', 'audio', 'graphic', 'effect']);
export const TimelineClipTypeSchema = z.enum(['video', 'caption', 'audio', 'graphic', 'cta', 'effect']);

const TimelineTransformSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  scale: z.number().positive().default(1),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
});

export const TimelineAssetSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['video', 'audio', 'image']),
  name: z.string().min(1),
  src: z.string().min(1),
  origin: z.enum(['youtube', 'upload', 'generated', 'job']).default('job'),
  durationSec: z.number().min(0).optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const TimelineClipSchema = z
  .object({
    id: z.string().min(1),
    type: TimelineClipTypeSchema,
    trackId: z.string().min(1),
    mediaAssetId: z.string().min(1).optional(),
    sourceStartSec: z.number().min(0).optional(),
    sourceEndSec: z.number().positive().optional(),
    timelineStartSec: z.number().min(0),
    timelineEndSec: z.number().positive(),
    playbackRate: z.number().min(0.25).max(4).default(1),
    muted: z.boolean().default(false),
    locked: z.boolean().default(false),
    text: z.string().optional(),
    style: z.record(z.unknown()).default({}),
    transform: TimelineTransformSchema.default({}),
    metadata: z.record(z.unknown()).default({}),
  })
  .refine((clip) => clip.timelineEndSec > clip.timelineStartSec, {
    message: 'timelineEndSec must be greater than timelineStartSec',
  })
  .refine((clip) => clip.sourceStartSec === undefined || clip.sourceEndSec === undefined || clip.sourceEndSec > clip.sourceStartSec, {
    message: 'sourceEndSec must be greater than sourceStartSec',
  });

export const TimelineTrackSchema = z.object({
  id: z.string().min(1),
  type: TimelineTrackTypeSchema,
  name: z.string().min(1),
  order: z.number().int().min(0),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),
  clips: z.array(TimelineClipSchema).default([]),
});

export const TimelineProjectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  source: z.object({
    language: z.string().default('ko'),
    originalDurationSec: z.number().min(0),
  }),
  output: z.object({
    aspectRatio: z.literal('9:16').default('9:16'),
    width: z.literal(1080).default(1080),
    height: z.literal(1920).default(1920),
    fps: z.number().int().min(24).max(60).default(30),
    durationSec: z.number().min(0),
  }),
  assets: z.array(TimelineAssetSchema).default([]),
  tracks: z.array(TimelineTrackSchema).default([]),
  metadata: z.record(z.unknown()).default({}),
});

export type TimelineProject = z.infer<typeof TimelineProjectSchema>;

export const createTimelineProjectFromEditPlan = ({
  jobId,
  editPlan,
  title = 'ROVUNQ Timeline',
  createdAt,
  updatedAt = new Date().toISOString(),
}: {
  jobId: string;
  editPlan: EditPlan;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
}): TimelineProject => {
  const finalDurationSec = Math.max(
    ...editPlan.cuts.map((cut) => cut.outputEndSec ?? (cut.sourceEndSec - cut.sourceStartSec) / (cut.speed || 1)),
    editPlan.cta.endSec,
    0,
  );
  const sourceAssetId = 'asset_source_video';
  const sourceTrackId = 'track_video_main';
  const captionTrackId = 'track_captions_main';
  const graphicTrackId = 'track_graphics_main';
  const ctaTrackId = 'track_cta_main';
  const now = updatedAt;

  return TimelineProjectSchema.parse({
    schemaVersion: 1,
    id: jobId,
    title,
    createdAt: createdAt ?? now,
    updatedAt: now,
    source: {
      language: editPlan.source.language,
      originalDurationSec: editPlan.source.originalDurationSec,
    },
    output: {
      aspectRatio: editPlan.output.aspectRatio,
      width: editPlan.output.width,
      height: editPlan.output.height,
      fps: editPlan.output.fps,
      durationSec: finalDurationSec,
    },
    assets: [
      {
        id: sourceAssetId,
        type: 'video',
        name: 'source.mp4',
        src: 'input/source.mp4',
        origin: 'job',
        durationSec: editPlan.source.originalDurationSec,
      },
    ],
    tracks: [
      {
        id: sourceTrackId,
        type: 'video',
        name: 'Video',
        order: 0,
        clips: editPlan.cuts.map((cut, index) => ({
          id: cut.id,
          type: 'video',
          trackId: sourceTrackId,
          mediaAssetId: sourceAssetId,
          sourceStartSec: cut.sourceStartSec,
          sourceEndSec: cut.sourceEndSec,
          timelineStartSec: cut.outputStartSec ?? 0,
          timelineEndSec: cut.outputEndSec ?? 0,
          playbackRate: cut.speed,
          muted: !cut.keepAudio,
          metadata: {
            reason: cut.reason,
            originalIndex: index,
          },
        })),
      },
      {
        id: captionTrackId,
        type: 'caption',
        name: 'Captions',
        order: 1,
        clips: editPlan.subtitles.map((subtitle) => ({
          id: subtitle.id,
          type: 'caption',
          trackId: captionTrackId,
          timelineStartSec: subtitle.startSec,
          timelineEndSec: subtitle.endSec,
          text: subtitle.text,
          style: {
            position: subtitle.position,
            preset: subtitle.style,
            animation: subtitle.animation,
            emphasisWords: subtitle.emphasisWords,
          },
          metadata: {
            timebase: subtitle.timebase,
          },
        })),
      },
      {
        id: graphicTrackId,
        type: 'graphic',
        name: 'Graphics',
        order: 2,
        clips: editPlan.graphics.map((graphic) => ({
          id: graphic.id,
          type: 'graphic',
          trackId: graphicTrackId,
          timelineStartSec: graphic.startSec,
          timelineEndSec: graphic.endSec,
          text: graphic.text,
          style: {
            type: graphic.type,
            preset: graphic.style,
          },
          metadata: {
            timebase: graphic.timebase,
          },
        })),
      },
      {
        id: ctaTrackId,
        type: 'graphic',
        name: 'CTA',
        order: 3,
        clips: editPlan.cta.enabled
          ? [
              {
                id: 'cta_001',
                type: 'cta',
                trackId: ctaTrackId,
                timelineStartSec: editPlan.cta.startSec,
                timelineEndSec: editPlan.cta.endSec,
                text: editPlan.cta.text,
                style: {
                  preset: editPlan.cta.style,
                },
                metadata: {
                  timebase: editPlan.cta.timebase,
                },
              },
            ]
          : [],
      },
    ],
    metadata: {
      sourceSchema: 'edit-plan',
      editingModel: 'non-destructive',
    },
  });
};
