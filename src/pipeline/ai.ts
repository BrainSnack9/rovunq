import fs from 'node:fs';
import OpenAI from 'openai';
import {EditPlan, EditPlanSchema, Transcript, TranscriptSchema} from '../schemas/edit-plan';

export const transcribeAudio = async (audioPath: string, durationSec: number): Promise<Transcript> => {
  if (!process.env.OPENAI_API_KEY) {
    return makeFallbackTranscript(durationSec);
  }

  const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
  const response = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment', 'word'],
  });

  const raw = response as unknown as {
    text?: string;
    language?: string;
    duration?: number;
    segments?: {id?: number; start: number; end: number; text: string}[];
    words?: {word: string; start: number; end: number}[];
  };

  return TranscriptSchema.parse({
    fullText: raw.text ?? '',
    language: raw.language ?? 'ko',
    duration: raw.duration ?? durationSec,
    segments: raw.segments ?? [],
    words: raw.words ?? [],
  });
};

export const createEditPlan = async (
  instruction: string,
  transcript: Transcript,
  durationSec: number,
): Promise<EditPlan> => {
  if (!process.env.OPENAI_API_KEY || transcript.fullText.trim().length === 0) {
    return makeFallbackEditPlan(instruction, transcript, durationSec);
  }

  const highlightPlan = await createHighlightBasedPlan(instruction, transcript, durationSec);
  if (highlightPlan) return highlightPlan;

  const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_PLAN_MODEL ?? 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are ROVUNQ, an AI short-form video editor. Return only a valid JSON object edit plan. Never include markdown or shell commands. Prefer Korean subtitles when the transcript is Korean. Use the exact field names requested by the user.',
      },
      {
        role: 'user',
        content: JSON.stringify(
          {
            instruction,
            transcript,
            requiredShape: {
              output: {
                format: 'mp4',
                aspectRatio: '9:16',
                width: 1080,
                height: 1920,
                fps: 30,
                targetDurationSec: 60,
              },
              source: {originalDurationSec: durationSec, language: transcript.language},
              cuts: [
                {
                  id: 'cut_001',
                  sourceStartSec: 0,
                  sourceEndSec: 8,
                  reason: 'hook',
                  keepAudio: true,
                  speed: 1,
                },
              ],
              silenceRemoval: {enabled: true, thresholdDb: -35, minSilenceMs: 500},
              transitions: [],
              zoomEffects: [],
              subtitles: [
                {
                  id: 'sub_001',
                  startSec: 0,
                  endSec: 2.5,
                  text: 'subtitle text',
                  position: 'bottom',
                  style: 'entertainment',
                  emphasisWords: [],
                  animation: 'pop',
                  timebase: 'output',
                },
              ],
              graphics: [],
              cta: {
                enabled: true,
                startSec: 55,
                endSec: 60,
                text: '다음 편도 확인하세요',
                style: 'clean_bold',
                timebase: 'output',
              },
            },
            constraints: {
              maxCuts: 18,
              cutDurationSec: '4 to 12 seconds',
              maxOutputSec: 60,
              allowedCutReasons: ['hook', 'highlight', 'context', 'proof', 'cta', 'fallback'],
              allowedTransitionTypes: ['hard_cut', 'fade_in', 'fade_out'],
              allowedSubtitleStyles: ['basic', 'entertainment', 'education', 'news', 'cinematic', 'cta'],
            },
          },
          null,
          2,
        ),
      },
    ],
    response_format: {type: 'json_object'},
  });

  const content = response.choices[0]?.message.content;
  if (!content) throw new Error('OpenAI did not return an edit plan.');

  try {
    return applyDefaultEffectPolicy(validateAndRepairPlan(JSON.parse(content), durationSec), instruction);
  } catch (error) {
    console.warn('OpenAI edit plan failed validation; using transcript-based fallback plan.');
    console.warn(error instanceof Error ? error.message : error);
    return makeFallbackEditPlan(instruction, transcript, durationSec);
  }
};

const createHighlightBasedPlan = async (
  instruction: string,
  transcript: Transcript,
  durationSec: number,
): Promise<EditPlan | null> => {
  const candidates = transcript.segments
    .map((segment, index) => ({
      id: index,
      start: Number(segment.start.toFixed(2)),
      end: Number(segment.end.toFixed(2)),
      duration: Number((segment.end - segment.start).toFixed(2)),
      text: segment.text.trim(),
    }))
    .filter((segment) => segment.text.length >= 3 && segment.duration >= 0.8)
    .slice(0, 240);

  if (candidates.length === 0) return null;

  const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_PLAN_MODEL ?? 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You are a short-form video editor. Select the best transcript segments for a 60 second shorts edit. Return JSON only. Do not write shell commands.',
      },
      {
        role: 'user',
        content: JSON.stringify(
          {
            instruction,
            goal:
              'Pick the strongest hook and highlights. Total selected duration should be close to 55-60 seconds. Prefer coherent, information-dense, emotionally engaging moments. Keep original order unless a later segment is clearly a stronger hook.',
            responseShape: {
              title: 'actual short title in Korean, not a placeholder',
              ctaText: 'short Korean CTA',
              selectedSegmentIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
              reasons: [{id: 0, reason: 'hook'}],
            },
            candidates,
          },
          null,
          2,
        ),
      },
    ],
    response_format: {type: 'json_object'},
  });

  const content = response.choices[0]?.message.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as {
      title?: string;
      ctaText?: string;
      selectedSegmentIds?: number[];
      reasons?: {id: number; reason: string}[];
    };
    const idSet = new Set((parsed.selectedSegmentIds ?? []).filter((id) => Number.isInteger(id)));
    const selected = expandAiSelection(candidates, idSet, 58);
    if (selected.length === 0) return null;

    return buildPlanFromSegments({
      instruction,
      transcript,
      durationSec,
      title: sanitizeTitle(parsed.title),
      ctaText: parsed.ctaText,
      selectedSegments: selected.map((candidate) => ({
        start: candidate.start,
        end: candidate.end,
        text: candidate.text,
      })),
    });
  } catch (error) {
    console.warn('OpenAI highlight selection failed; falling back to transcript plan.');
    console.warn(error instanceof Error ? error.message : error);
    return null;
  }
};

const expandAiSelection = (
  candidates: {id: number; start: number; end: number; duration: number; text: string}[],
  selectedIds: Set<number>,
  targetSec: number,
) => {
  const selected = candidates.filter((candidate) => selectedIds.has(candidate.id));
  let total = sumDuration(selected);

  if (total < targetSec * 0.85) {
    const supplements = candidates
      .filter((candidate) => !selectedIds.has(candidate.id))
      .map((candidate) => ({
        ...candidate,
        score: scoreSegment(candidate.text, candidate.duration),
      }))
      .sort((a, b) => b.score - a.score);

    for (const candidate of supplements) {
      if (total >= targetSec) break;
      if (total + candidate.duration > targetSec + 3) continue;
      selected.push(candidate);
      total += candidate.duration;
    }
  }

  return selected.sort((a, b) => a.start - b.start);
};

const sumDuration = (segments: {start: number; end: number}[]) =>
  segments.reduce((sum, segment) => sum + Math.max(0, segment.end - segment.start), 0);

const sanitizeTitle = (title?: string) => {
  const clean = title?.trim();
  if (!clean || /^(쇼츠\s*제목|title|short title)$/i.test(clean)) return undefined;
  return clean.slice(0, 32);
};

const applyDefaultEffectPolicy = (plan: EditPlan, instruction: string): EditPlan => {
  if (wantsZoomEffects(instruction)) return plan;
  return EditPlanSchema.parse({
    ...plan,
    zoomEffects: [],
  });
};

const wantsZoomEffects = (instruction: string) => /줌|zoom|확대|zoom-in|zoom out|zoom-out/i.test(instruction);

export const validateAndRepairPlan = (plan: unknown, durationSec: number): EditPlan => {
  const parsed = EditPlanSchema.parse(plan);
  const safeCuts = parsed.cuts
    .map((cut) => ({
      ...cut,
      sourceStartSec: clamp(cut.sourceStartSec, 0, durationSec),
      sourceEndSec: clamp(cut.sourceEndSec, 0.1, durationSec),
    }))
    .filter((cut) => cut.sourceEndSec - cut.sourceStartSec >= 0.25);

  if (safeCuts.length === 0) {
    throw new Error('Edit plan has no valid cuts after validation.');
  }

  let cursor = 0;
  const cutsWithOutput = safeCuts.map((cut) => {
    const duration = (cut.sourceEndSec - cut.sourceStartSec) / cut.speed;
    const next = {...cut, outputStartSec: cursor, outputEndSec: cursor + duration};
    cursor += duration;
    return next;
  });

  return EditPlanSchema.parse({
    ...parsed,
    source: {...parsed.source, originalDurationSec: durationSec},
    cuts: cutsWithOutput,
    cta: {
      ...parsed.cta,
      startSec: Math.min(parsed.cta.startSec, Math.max(0, cursor - 5)),
      endSec: Math.min(parsed.cta.endSec, cursor),
      timebase: 'output',
    },
  });
};

const makeFallbackTranscript = (durationSec: number): Transcript => {
  const end = Math.max(1, Math.min(durationSec, 60));
  return {
    fullText: 'OPENAI_API_KEY가 없어 실제 전사를 건너뛰었습니다. 로컬 파이프라인 검증용 더미 전사입니다.',
    language: 'ko',
    duration: durationSec,
    segments: [
      {
        id: 0,
        start: 0,
        end,
        text: '로컬 테스트용 더미 전사입니다. API 키를 설정하면 실제 음성 전사가 생성됩니다.',
      },
    ],
    words: [],
  };
};

const makeFallbackEditPlan = (
  instruction: string,
  transcript: Transcript,
  durationSec: number,
): EditPlan => {
  const target = Math.min(60, Math.max(3, durationSec));
  const selectedSegments = selectFallbackSegments(transcript, target, durationSec);
  return buildPlanFromSegments({instruction, transcript, durationSec, selectedSegments});
};

const buildPlanFromSegments = ({
  instruction,
  transcript,
  durationSec,
  selectedSegments,
  title,
  ctaText,
}: {
  instruction: string;
  transcript: Transcript;
  durationSec: number;
  selectedSegments: {start: number; end: number; text: string}[];
  title?: string;
  ctaText?: string;
}): EditPlan => {
  const target = Math.min(60, Math.max(3, durationSec));
  let outputCursor = 0;

  const cuts = selectedSegments.map((segment, index) => {
    const cutDuration = segment.end - segment.start;
    const cut = {
      id: `cut_${String(index + 1).padStart(3, '0')}`,
      sourceStartSec: segment.start,
      sourceEndSec: segment.end,
      outputStartSec: outputCursor,
      outputEndSec: outputCursor + cutDuration,
      reason: index === 0 ? 'hook' : 'highlight',
      keepAudio: true,
      speed: 1,
    };
    outputCursor += cutDuration;
    return cut;
  });

  const finalDuration = Math.max(1, outputCursor);
  const subtitles = selectedSegments.map((segment, index) => ({
    id: `sub_${String(index + 1).padStart(3, '0')}`,
    startSec: cuts[index].outputStartSec,
    endSec: cuts[index].outputEndSec,
    text: compactSubtitle(segment.text, instruction),
    position: 'bottom',
    style: 'entertainment',
    emphasisWords: pickEmphasisWords(segment.text),
    animation: 'pop',
    timebase: 'output',
  }));

  return EditPlanSchema.parse({
    output: {
      format: 'mp4',
      aspectRatio: '9:16',
      width: 1080,
      height: 1920,
      fps: 30,
      targetDurationSec: finalDuration,
    },
    source: {
      originalDurationSec: durationSec,
      language: transcript.language,
    },
    cuts,
    silenceRemoval: {
      enabled: true,
      thresholdDb: -35,
      minSilenceMs: 500,
    },
    transitions: cuts.slice(1).map((cut, index) => ({
      betweenCutIds: [cuts[index].id, cut.id],
      type: 'hard_cut',
      durationMs: 0,
    })),
    zoomEffects: [],
    subtitles,
    graphics: [
      {
        id: 'graphic_001',
        startSec: 0,
        endSec: Math.min(2.5, finalDuration),
        type: 'title_card',
        text: title?.trim().slice(0, 32) || 'ROVUNQ SHORTS',
        style: 'bold',
        timebase: 'output',
      },
    ],
    cta: {
      enabled: true,
      startSec: Math.max(0, finalDuration - 4),
      endSec: finalDuration,
      text: ctaText?.trim().slice(0, 48) || '다음 편도 확인하세요',
      style: 'clean_bold',
      timebase: 'output',
    },
  });
};

const selectFallbackSegments = (transcript: Transcript, target: number, durationSec: number) => {
  const usable = transcript.segments
    .map((segment) => ({
      start: clamp(segment.start, 0, durationSec),
      end: clamp(segment.end, 0, durationSec),
      text: segment.text.trim(),
    }))
    .filter((segment) => segment.text.length >= 3 && segment.end - segment.start >= 0.8)
    .sort((a, b) => a.start - b.start);

  const selected: {start: number; end: number; text: string}[] = [];
  let total = 0;

  for (const segment of usable) {
    if (selected.length >= 18) break;
    const duration = Math.min(8, segment.end - segment.start);
    if (total + duration > target + 0.5) break;
    selected.push({start: segment.start, end: segment.start + duration, text: segment.text});
    total += duration;
    if (total >= target - 0.5) break;
  }

  if (selected.length > 0 && total >= Math.min(target * 0.85, durationSec * 0.85)) {
    return selected;
  }

  const allSpeech = usable.slice(0, 24);
  if (allSpeech.length > selected.length) {
    return fillToTarget(allSpeech, target);
  }

  if (selected.length > 0) return selected;

  const fallbackEnd = Math.max(3, Math.min(target, durationSec));
  return [{start: 0, end: fallbackEnd, text: transcript.fullText || 'ROVUNQ 테스트 쇼츠'}];
};

const fillToTarget = (
  segments: {start: number; end: number; text: string}[],
  target: number,
) => {
  const selected: {start: number; end: number; text: string}[] = [];
  let total = 0;

  for (const segment of segments) {
    const duration = Math.max(0.8, Math.min(8, segment.end - segment.start));
    if (total + duration > target + 0.5) break;
    selected.push({start: segment.start, end: segment.start + duration, text: segment.text});
    total += duration;
  }

  return selected.length > 0 ? selected : segments.slice(0, 1);
};

const scoreSegment = (text: string, duration: number) => {
  const normalized = text.replace(/\s+/g, '');
  const keywordBonus = /(중요|핵심|문제|방법|이유|결과|실패|성공|돈|시간|진짜|절대|바로|그래서|왜|근데|좋|싫|비율|상승|하락|충격|대박)/.test(text)
    ? 10
    : 0;
  const lengthScore = Math.min(18, normalized.length / 2);
  const durationScore = duration >= 2 && duration <= 8 ? 8 : 2;
  return keywordBonus + lengthScore + durationScore;
};

const compactSubtitle = (text: string, instruction: string) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean) return clean.slice(0, 84);
  return instruction.trim().slice(0, 60) || 'ROVUNQ 테스트 쇼츠';
};

const pickEmphasisWords = (text: string) =>
  text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, 2);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
