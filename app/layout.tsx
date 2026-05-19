import './globals.css';
import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'ROVUNQ',
  description: 'Natural-language AI cut editing MVP',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
