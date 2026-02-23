import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Momentum Scanner — AI Trading Dashboard",
  description: "Real-time stock momentum scanner with AI strategy engine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-black text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
