# ROVUNQ

ROVUNQ is a local-first MVP for natural-language AI cut editing. It takes a local video file or a development-only YouTube URL, creates a transcript, asks OpenAI for a validated edit plan, cuts the video with FFmpeg, converts it to 9:16, and renders subtitles/graphics with Remotion.

## MVP1 Scope

Input:

- `sample.mp4` or `--youtube-url`
- `instruction.txt`

Output:

- `transcript.json`
- `edit-plan.json`
- `timeline.json`
- `render-plan.json`
- `intermediate-cut.mp4`
- `final-output.mp4`

Files are written under:

```txt
storage/jobs/<job-id>/
  input/
    source.mp4
    instruction.txt
  artifacts/
    audio.mp3
    transcript.json
    edit-plan.json
    timeline.json
    render-plan.json
    intermediate-cut.mp4
    vertical.mp4
    final-output.mp4
  logs/
    job-log.json
    ffmpeg-log.txt
```

## Requirements

- Node.js LTS
- pnpm
- OpenAI API key for real transcription/edit planning

FFmpeg and FFprobe are provided through npm packages for MVP1. For YouTube downloads, ROVUNQ tries system `yt-dlp` first, then optional bundled `yt-dlp-exec`, then a JS downloader fallback. The bundled `yt-dlp-exec` package is patched to skip its outdated `python` binary preinstall check, so macOS `python3` and Windows `py` setups do not break `pnpm install`.

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Set your key in `.env.local`:

```txt
OPENAI_API_KEY=sk-...
```

Without `OPENAI_API_KEY`, the pipeline still runs with fallback transcript/edit-plan artifacts so you can test FFmpeg and Remotion locally.

## Run With YouTube URL

This mode is for local development and quality checks only. Use videos you own, have permission to process, or are otherwise allowed to download and transform. Remove or restrict this mode before a public MVP.

```bash
pnpm render:local --youtube-url "https://www.youtube.com/watch?v=VIDEO_ID" --instruction ./instruction.example.txt --job-id local-demo
```

You can change the URL every run:

```bash
pnpm render:local --youtube-url "https://www.youtube.com/watch?v=ANOTHER_VIDEO_ID" --instruction ./instruction.example.txt --job-id test-002
```

For long videos, process only a selected source range. This downloads only the requested YouTube section when yt-dlp is available:

```bash
pnpm render:local --youtube-url "https://www.youtube.com/watch?v=VIDEO_ID" --instruction ./instruction.example.txt --source-start 720 --source-duration 600 --job-id range-demo
```

## Run With Local Video

```bash
pnpm render:local --input ./sample.mp4 --instruction ./instruction.example.txt --job-id local-demo
```

## Useful Options

```bash
pnpm render:local --help
```

- `--input <path>`: local video input
- `--youtube-url <url>`: development-only YouTube input
- `--instruction <path>`: natural-language edit instruction
- `--job-id <id>`: stable output folder name
- `--source-start <seconds>`: start processing from this timestamp
- `--source-duration <seconds>`: only process this many seconds from the source
- `--max-duration <seconds>`: optional safety limit for long inputs; omit it to process the full source
- `--skip-openai`: force fallback transcript/edit plan

## Clean Local Jobs

```bash
pnpm clean:storage
```

## Safety Notes

Natural-language instructions are never executed as shell commands. The flow is:

1. Instruction text is sent to OpenAI.
2. OpenAI returns JSON only.
3. Zod validates and clamps the edit plan.
4. Internal TypeScript code builds FFmpeg and Remotion calls from allowed fields.

Supported local input extensions are `mp4`, `mov`, `m4v`, and `webm`.
