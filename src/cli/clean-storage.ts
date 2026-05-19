import path from 'node:path';
import fs from 'fs-extra';

const jobsDir = path.resolve(process.cwd(), 'storage', 'jobs');
await fs.emptyDir(jobsDir);
console.log(`Cleaned ${jobsDir}`);
