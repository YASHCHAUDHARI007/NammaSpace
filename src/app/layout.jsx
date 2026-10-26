import '../styles/global.css';
import '../styles/viewer.css';

export const metadata = {
  title: 'NAMMA SPACE — Your space, reimagined.',
  description: 'Namma Space — Your space, reimagined. Interactive 3D Indoor Digital Twin & Spatial Reconstruction Platform for IIT Bombay Techfest 2026–27.'
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#14281D'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..600&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
