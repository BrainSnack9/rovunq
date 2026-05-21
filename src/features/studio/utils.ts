export const defaultInstruction =
  'Find the strongest short-form moments from the full source. Remove slow parts, keep emotional reactions, use large entertainment subtitles, and add a final CTA.';

export const progressSteps = ['download', 'input', 'audio', 'transcribe', 'plan', 'timeline', 'remotion'] as const;

export const formatTime = (seconds = 0) => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = Math.floor(safe % 60);
  const tenths = Math.round((safe % 1) * 10);
  return `${minutes}:${String(rest).padStart(2, '0')}.${tenths}`;
};

export const parseSeconds = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map((part) => Number.parseFloat(part));
    if (parts.some((part) => !Number.isFinite(part))) return undefined;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};
