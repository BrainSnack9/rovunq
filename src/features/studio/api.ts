import type {JobStatus, RenderPlan, TimelineProject} from './types';

export const fetchJob = async (jobId: string): Promise<JobStatus> => {
  const response = await fetch(`/api/jobs/${jobId}`, {cache: 'no-store'});
  if (!response.ok) throw new Error('Unable to fetch job.');
  return response.json();
};

export const createJob = async (formData: FormData): Promise<{jobId: string; status: JobStatus['status']}> => {
  const response = await fetch('/api/jobs', {method: 'POST', body: formData});
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'Unable to start job.');
  return payload;
};

export const applyJobEdit = async (jobId: string, operation: Record<string, unknown>) => {
  const response = await fetch(`/api/jobs/${jobId}/edit`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(operation),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'Unable to apply manual edit.');
  return payload as {jobId: string; status: JobStatus['status']};
};

export const fetchJobPlans = async (job: JobStatus): Promise<{renderPlan: RenderPlan | null; timeline: TimelineProject | null}> => {
  const [renderResponse, timelineResponse] = await Promise.all([
    fetch(`${job.artifacts.renderPlan}?t=${job.logs.length}`, {cache: 'no-store'}),
    fetch(`${job.artifacts.timeline}?t=${job.logs.length}`, {cache: 'no-store'}),
  ]);
  return {
    renderPlan: renderResponse.ok ? await renderResponse.json() : null,
    timeline: timelineResponse.ok ? await timelineResponse.json() : null,
  };
};
