import path from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: projectRoot,
  },
  serverExternalPackages: [
    '@remotion/bundler',
    '@remotion/renderer',
    'remotion',
    'ffmpeg-static',
    'ffprobe-static',
    'yt-dlp-exec',
  ],
};

export default nextConfig;
