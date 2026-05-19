import fs from 'fs-extra';

export type JobLogEntry = {
  at: string;
  step: string;
  status: 'start' | 'ok' | 'warn' | 'error';
  message: string;
  data?: unknown;
};

export class JobLogger {
  private entries: JobLogEntry[] = [];

  constructor(private readonly filePath: string) {}

  async push(step: string, status: JobLogEntry['status'], message: string, data?: unknown) {
    const entry = {at: new Date().toISOString(), step, status, message, data};
    this.entries.push(entry);
    const prefix = status === 'error' ? '[error]' : status === 'warn' ? '[warn]' : '[info]';
    console.log(`${prefix} ${step}: ${message}`);
    await fs.writeJson(this.filePath, this.entries, {spaces: 2});
  }
}
