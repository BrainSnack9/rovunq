import fs from 'node:fs';
import OpenAI from 'openai';
import {Transcript, TranscriptSchema} from '../../schemas/edit-plan';
import {makeFallbackTranscript} from './fallback-plan';

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
