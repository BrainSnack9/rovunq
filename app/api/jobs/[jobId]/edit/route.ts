import {NextResponse} from 'next/server';
import {createManualEditJob} from '@/src/server/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: {params: Promise<{jobId: string}>}) {
  try {
    const {jobId} = await context.params;
    const operation = await request.json();
    await createManualEditJob({id: jobId, operation});
    return NextResponse.json({jobId, status: 'queued'});
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : 'Unable to apply manual edit.'},
      {status: 500},
    );
  }
}
