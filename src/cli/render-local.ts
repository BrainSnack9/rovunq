import path from 'node:path';
import {Command} from 'commander';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import {makeJobId} from '../utils/paths';
import {runLocalRender} from '../pipeline/local-render';

dotenv.config({path: '.env.local'});
dotenv.config();

type CliOptions = {
  input?: string;
  youtubeUrl?: string;
  instruction: string;
  jobId?: string;
  sourceStart?: string;
  sourceDuration?: string;
  maxDuration?: string;
  skipOpenai?: boolean;
};

const program = new Command();

program
  .name('rovunq-render-local')
  .description('ROVUNQ MVP1 local render pipeline')
  .option('--input <path>', 'Local mp4/mov/m4v/webm input file')
  .option('--youtube-url <url>', 'Development-only YouTube URL input')
  .requiredOption('--instruction <path>', 'Instruction text file')
  .option('--job-id <id>', 'Stable job folder id')
  .option('--source-start <seconds>', 'Start processing from this source timestamp in seconds')
  .option('--source-duration <seconds>', 'Only process this many seconds from the source')
  .option('--max-duration <seconds>', 'Optional safety limit in seconds; omit for full video')
  .option('--skip-openai', 'Force fallback transcript/edit plan even when OPENAI_API_KEY exists', false)
  .parse(process.argv);

const options = program.opts<CliOptions>();

const main = async () => {
  const cwd = process.cwd();
  const jobId = makeJobId(options.jobId);
  const instructionText = await readInstruction(options.instruction);
  const paths = await runLocalRender({
    cwd,
    jobId,
    inputPath: options.input,
    youtubeUrl: options.youtubeUrl,
    instructionText,
    sourceStartSec: options.sourceStart ? Number.parseFloat(options.sourceStart) : undefined,
    sourceDurationSec: options.sourceDuration ? Number.parseFloat(options.sourceDuration) : undefined,
    maxDurationSec: options.maxDuration ? Number.parseFloat(options.maxDuration) : undefined,
    skipOpenai: options.skipOpenai,
  });

  console.log('\nROVUNQ MVP1 output');
  console.log(`Job folder: ${paths.root}`);
  console.log(`Transcript: ${paths.transcript}`);
  console.log(`Edit plan: ${paths.editPlan}`);
  console.log(`Timeline: ${paths.timeline}`);
  console.log(`Intermediate cut: ${paths.intermediateCut}`);
  console.log(`Final output: ${paths.finalOutput}`);
};

const readInstruction = async (source: string) => {
  const sourcePath = path.resolve(process.cwd(), source);
  if (!(await fs.pathExists(sourcePath))) {
    throw new Error(`Instruction file not found: ${sourcePath}`);
  }
  return fs.readFile(sourcePath, 'utf8');
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
