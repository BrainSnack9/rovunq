import {EditPlan, EditPlanSchema, Transcript} from '../../schemas/edit-plan';

export type SelectedSegment = {start: number; end: number; text: string};

export const makeFallbackTranscript = (durationSec: number): Transcript => {
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

export const makeFallbackEditPlan = (
  instruction: string,
  transcript: Transcript,
  durationSec: number,
): EditPlan => {
  const target = Math.min(60, Math.max(3, durationSec));
  const selectedSegments = selectFallbackSegments(transcript, target, durationSec);
  return buildPlanFromSegments({instruction, transcript, durationSec, selectedSegments});
};

export const buildPlanFromSegments = ({
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
  selectedSegments: SelectedSegment[];
  title?: string;
  ctaText?: string;
}): EditPlan => {
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

export const scoreSegment = (text: string, duration: number) => {
  const normalized = text.replace(/\s+/g, '');
  const keywordBonus = /(중요|핵심|문제|방법|이유|결과|실패|성공|돈|시간|진짜|절대|바로|그래서|왜|근데|좋|싫|비율|상승|하락|충격|대박)/.test(text)
    ? 10
    : 0;
  const lengthScore = Math.min(18, normalized.length / 2);
  const durationScore = duration >= 2 && duration <= 8 ? 8 : 2;
  return keywordBonus + lengthScore + durationScore;
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

  const selected: SelectedSegment[] = [];
  let total = 0;

  for (const segment of usable) {
    if (selected.length >= 18) break;
    const duration = Math.min(8, segment.end - segment.start);
    if (total + duration > target + 0.5) break;
    selected.push({start: segment.start, end: segment.start + duration, text: segment.text});
    total += duration;
    if (total >= target - 0.5) break;
  }

  if (selected.length > 0 && total >= Math.min(target * 0.85, durationSec * 0.85)) return selected;
  const allSpeech = usable.slice(0, 24);
  if (allSpeech.length > selected.length) return fillToTarget(allSpeech, target);
  if (selected.length > 0) return selected;

  const fallbackEnd = Math.max(3, Math.min(target, durationSec));
  return [{start: 0, end: fallbackEnd, text: transcript.fullText || 'ROVUNQ 테스트 쇼츠'}];
};

const fillToTarget = (segments: SelectedSegment[], target: number) => {
  const selected: SelectedSegment[] = [];
  let total = 0;

  for (const segment of segments) {
    const duration = Math.max(0.8, Math.min(8, segment.end - segment.start));
    if (total + duration > target + 0.5) break;
    selected.push({start: segment.start, end: segment.start + duration, text: segment.text});
    total += duration;
  }

  return selected.length > 0 ? selected : segments.slice(0, 1);
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
