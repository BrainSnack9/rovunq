import {EditPlan, EditPlanSchema} from '../../schemas/edit-plan';

export const validateAndRepairPlan = (plan: unknown, durationSec: number): EditPlan => {
  const parsed = EditPlanSchema.parse(plan);
  const safeCuts = parsed.cuts
    .map((cut) => ({
      ...cut,
      sourceStartSec: clamp(cut.sourceStartSec, 0, durationSec),
      sourceEndSec: clamp(cut.sourceEndSec, 0.1, durationSec),
    }))
    .filter((cut) => cut.sourceEndSec - cut.sourceStartSec >= 0.25);

  if (safeCuts.length === 0) {
    throw new Error('Edit plan has no valid cuts after validation.');
  }

  let cursor = 0;
  const cutsWithOutput = safeCuts.map((cut) => {
    const duration = (cut.sourceEndSec - cut.sourceStartSec) / cut.speed;
    const next = {...cut, outputStartSec: cursor, outputEndSec: cursor + duration};
    cursor += duration;
    return next;
  });

  return EditPlanSchema.parse({
    ...parsed,
    source: {...parsed.source, originalDurationSec: durationSec},
    cuts: cutsWithOutput,
    cta: {
      ...parsed.cta,
      startSec: Math.min(parsed.cta.startSec, Math.max(0, cursor - 5)),
      endSec: Math.min(parsed.cta.endSec, cursor),
      timebase: 'output',
    },
  });
};

export const applyDefaultEffectPolicy = (plan: EditPlan, instruction: string): EditPlan => {
  if (/줌|zoom|확대|zoom-in|zoom out|zoom-out/i.test(instruction)) return plan;
  return EditPlanSchema.parse({
    ...plan,
    zoomEffects: [],
  });
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
