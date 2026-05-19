import type {Config} from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#050608',
        panel: '#101216',
        line: '#262a31',
        mint: '#2ef2c5',
        amber: '#f2c14e',
      },
      fontFamily: {
        sans: ['Inter', 'Pretendard', 'Noto Sans KR', 'Malgun Gothic', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
