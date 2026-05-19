/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
