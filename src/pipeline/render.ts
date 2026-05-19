import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {bundle} from '@remotion/bundler';
import {getCompositions, renderMedia} from '@remotion/renderer';
import fs from 'fs-extra';
import {EditPlan, RenderPlan, RenderPlanSchema} from '../schemas/edit-plan';

export const createRenderPlan = (editPlan: EditPlan): RenderPlan => {
  const finalDurationSec = Math.max(
    ...editPlan.cuts.map((cut) => cut.outputEndSec ?? cut.sourceEndSec - cut.sourceStartSec),
    editPlan.cta.endSec,
    1,
  );

  return RenderPlanSchema.parse({
    ...editPlan,
    finalDurationSec,
  });
};

export const renderWithRemotion = async ({
  cwd,
  videoPath,
  plan,
  outputPath,
}: {
  cwd: string;
  videoPath: string;
  plan: RenderPlan;
  outputPath: string;
}) => {
  await fs.ensureDir(path.dirname(outputPath));
  const entryPoint = path.resolve(cwd, 'src', 'remotion', 'index.tsx');
  const bundled = await bundle({
    entryPoint,
    publicDir: path.dirname(videoPath),
    webpackOverride: (config) => config,
  });

  const inputProps = {
    videoPath: path.basename(videoPath),
    plan,
  };

  const compositions = await getCompositions(bundled, {inputProps});
  const composition = compositions.find((candidate) => candidate.id === 'RovunqShorts');
  if (!composition) throw new Error('Remotion composition RovunqShorts was not found.');

  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    chromiumOptions: {
      gl: 'angle',
    },
  });

  return pathToFileURL(outputPath).href;
};
