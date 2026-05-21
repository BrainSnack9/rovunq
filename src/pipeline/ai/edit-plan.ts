import OpenAI from 'openai';
import {EditPlan, Transcript} from '../../schemas/edit-plan';
import {makeFallbackEditPlan} from './fallback-plan';
import {createHighlightBasedPlan} from './highlight-plan';
import {applyDefaultEffectPolicy, validateAndRepairPlan} from './plan-validation';

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
              cuts: [{id: 'cut_001', sourceStartSec: 0, sourceEndSec: 8, reason: 'hook', keepAudio: true, speed: 1}],
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
