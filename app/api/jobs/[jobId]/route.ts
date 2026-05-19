import {NextResponse} from 'next/server';
import {getWebJob} from '@/src/server/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: {params: Promise<{jobId: string}>}) {
  const {jobId} = await context.params;
  const job = await getWebJob(jobId);
  return NextResponse.json(job);
}
