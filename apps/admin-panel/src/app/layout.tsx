import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Unified Retail Admin', description: 'Retail operations console' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
