import type { Metadata } from 'next';
import './globals.css';
import NavSidebar from '@/components/NavSidebar';

export const metadata: Metadata = {
  title: 'NX-1',
  description: 'Pre-market chart viewer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden bg-black">
        <NavSidebar />
        <div className="flex-1 min-w-0 h-full overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
