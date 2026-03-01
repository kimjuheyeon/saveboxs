import '@/styles/globals.css';
import DevContextToggle from '@/components/DevContextToggle';

export const metadata = {
  title: 'SaveBox Prototype',
  description: 'SNS 콘텐츠 통합 북마크 서비스 프로토타입',
  manifest: '/manifest.json',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className="dark">
      <body className="antialiased min-h-screen bg-[#0f172a] text-[#e2e8f0]">
        <DevContextToggle />
        {children}
      </body>
    </html>
  );
}
