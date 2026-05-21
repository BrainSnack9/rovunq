import {createReadStream} from 'node:fs';
import fs from 'fs-extra';
import {NextResponse} from 'next/server';
import {getArtifactPath} from '@/src/server/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: {params: Promise<{jobId: string; artifact: string}>},
) {
  const {jobId, artifact} = await context.params;
  const filePath = await getArtifactPath(jobId, artifact);
  if (!filePath || !(await fs.pathExists(filePath))) {
    return NextResponse.json({error: 'Artifact not found.'}, {status: 404});
  }

  const isVideo = artifact === 'final-output' || artifact === 'intermediate-cut' || artifact === 'source-video';
  const stat = await fs.stat(filePath);
  const headers = new Headers();
  headers.set('content-type', isVideo ? 'video/mp4' : 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');

  if (isVideo) {
    headers.set('accept-ranges', 'bytes');
    headers.set('content-disposition', `inline; filename="${artifact}.mp4"`);
    const range = request.headers.get('range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        const start = match[1] ? Number.parseInt(match[1], 10) : 0;
        const end = match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;
        if (Number.isFinite(start) && Number.isFinite(end) && start <= end && end < stat.size) {
          headers.set('content-range', `bytes ${start}-${end}/${stat.size}`);
          headers.set('content-length', String(end - start + 1));
          return new Response(createReadStream(filePath, {start, end}) as unknown as BodyInit, {
            status: 206,
            headers,
          });
        }
      }
      return new Response(null, {
        status: 416,
        headers: {'content-range': `bytes */${stat.size}`},
      });
    }
    headers.set('content-length', String(stat.size));
    return new Response(createReadStream(filePath) as unknown as BodyInit, {headers});
  }

  const buffer = await fs.readFile(filePath);
  headers.set('content-length', String(buffer.length));

  return new Response(buffer, {headers});
}
