import type { Metadata } from "next";
import { Space_Mono, Noto_Serif_JP } from "next/font/google";
import "./globals.css";
import TalkShell from "@/components/talk/TalkShell";

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const notoSerifJP = Noto_Serif_JP({
  variable: "--font-noto-serif-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Kokoro OS",
  description: "AI による対話・相談・思考整理",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${spaceMono.variable} ${notoSerifJP.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TalkShell>{children}</TalkShell>
      </body>
    </html>
  );
}
