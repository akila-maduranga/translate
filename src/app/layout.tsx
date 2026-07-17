import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SubSinhala — Context-aware EN → සිංහල Subtitle Translator",
  description:
    "Research-driven English to Sinhala subtitle translation powered by TMDB metadata and DeepSeek. Better than Google Translate because it locks character names, tone, and cultural context for the whole movie.",
  keywords: [
    "Sinhala subtitles",
    "English to Sinhala translation",
    "subtitle translator",
    "DeepSeek",
    "TMDB",
    "srt translation",
    "vtt translation",
    "context-aware translation",
  ],
  authors: [{ name: "SubSinhala" }],
  openGraph: {
    title: "SubSinhala — Context-aware Sinhala Subtitle Translator",
    description:
      "Research-driven English → Sinhala subtitle translation. TMDB for metadata, DeepSeek for context-aware wording.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SubSinhala",
    description:
      "Context-aware English → Sinhala subtitle translator powered by TMDB + DeepSeek.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
