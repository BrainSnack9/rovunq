import OpenAI from 'openai';
import {EditPlan, Transcript} from '../../schemas/edit-plan';
import {buildPlanFromSegments, scoreSegment} from './fallback-plan';

type CandidateSegment = {id: number; start: number; end: number; duration: number; text: string};

export const createHighlightBasedPlan = async (
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
        content: 'You are a short-form video editor. Select the best transcript segments for a 60 second shorts edit. Return JSON only. Do not write shell commands.',
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

const expandAiSelection = (candidates: CandidateSegment[], selectedIds: Set<number>, targetSec: number) => {
  const selected = candidates.filter((candidate) => selectedIds.has(candidate.id));
  let total = sumDuration(selected);

  if (total < targetSec * 0.85) {
    const supplements = candidates
      .filter((candidate) => !selectedIds.has(candidate.id))
      .map((candidate) => ({...candidate, score: scoreSegment(candidate.text, candidate.duration)}))
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
