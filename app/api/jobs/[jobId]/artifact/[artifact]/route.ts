import fs from 'fs-extra';
import {NextResponse} from 'next/server';
import {getArtifactPath} from '@/src/server/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: {params: Promise<{jobId: string; artifact: string}>},
) {
  const {jobId, artifact} = await context.params;
  const filePath = await getArtifactPath(jobId, artifact);
  if (!filePath || !(await fs.pathExists(filePath))) {
    return NextResponse.json({error: 'Artifact not found.'}, {status: 404});
  }

  const buffer = await fs.readFile(filePath);
  const isVideo = artifact === 'final-output' || artifact === 'intermediate-cut' || artifact === 'source-video';
  const headers = new Headers();
  headers.set('content-type', isVideo ? 'video/mp4' : 'application/json; charset=utf-8');
  headers.set('content-length', String(buffer.length));
  headers.set('cache-control', 'no-store');
  if (isVideo) {
    headers.set('content-disposition', `inline; filename="${artifact}.mp4"`);
  }

  return new Response(buffer, {headers});
}
