import {NextResponse} from 'next/server';
import {createWebJob, saveUploadedAudio, saveUploadedVideo} from '@/src/server/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const youtubeUrl = String(formData.get('youtubeUrl') ?? '').trim();
    const instructionText = String(formData.get('instruction') ?? '').trim();
    const skipOpenai = String(formData.get('skipOpenai') ?? '') === 'true';
    const sourceStartSec = optionalPositiveNumber(formData.get('sourceStartSec'));
    const sourceDurationSec = optionalPositiveNumber(formData.get('sourceDurationSec'));
    const file = formData.get('video');
    const audioFile = formData.get('audio');

    if (!instructionText) {
      return NextResponse.json({error: 'Instruction is required.'}, {status: 400});
    }

    let inputPath: string | undefined;
    if (file instanceof File && file.size > 0) {
      inputPath = await saveUploadedVideo(file);
    }

    let bgmPath: string | undefined;
    if (audioFile instanceof File && audioFile.size > 0) {
      bgmPath = await saveUploadedAudio(audioFile);
    }

    if (Boolean(inputPath) === Boolean(youtubeUrl)) {
      return NextResponse.json({error: 'Provide either a YouTube URL or a video file.'}, {status: 400});
    }

    const job = await createWebJob({
      youtubeUrl: youtubeUrl || undefined,
      inputPath,
      bgmPath,
      instructionText,
      sourceStartSec,
      sourceDurationSec,
      skipOpenai,
    });

    return NextResponse.json({jobId: job.id, status: job.status});
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'Unable to create job.'},
      {status: 500},
    );
  }
}

const optionalPositiveNumber = (value: FormDataEntryValue | null) => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};
