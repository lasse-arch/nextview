import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Arpo is an internal tool - a neutral title, no description, and search
// engines told to leave every page out (the same goes out as an
// X-Robots-Tag header on all responses, see next.config.ts).
export const metadata: Metadata = {
  title: "Arpo",
  // The same icon as nextview360.dk (as metadata, not app/icon.png, which would win over everything): a tour page sets its own customer's favicon.
  icons: { icon: "/icon.png", apple: "/icon.png" },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="da"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
