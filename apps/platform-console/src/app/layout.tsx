import type { Metadata } from 'next';
import '@urp/ui/styles.css';
import './globals.css';

export const metadata: Metadata = { title: 'Platform Console', description: 'Unified Retail platform operations' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
