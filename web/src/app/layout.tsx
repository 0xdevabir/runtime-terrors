import type { Metadata, Viewport } from "next";
import { Shell } from "@/components/Shell";
import { Geist, Geist_Mono } from "next/font/google";
import { PrefsProvider } from "@/components/prefs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Emberfall — Flame in Freefall",
  applicationName: "Emberfall",
  description: "AI-powered fire safety insights from microgravity combustion data: ask cited questions, map evidence, find gaps and brief missions.",
  appleWebApp: { capable: true, title: "Emberfall", statusBarStyle: "default" },
  // icon.svg + apple-icon.png + favicon.ico in this folder are auto-picked by Next.js
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3efe6" },
    { media: "(prefers-color-scheme: dark)", color: "#161616" },
  ],
};

// Applies a stored appearance choice before paint to avoid a light/dark flash.
const themeScript = `try{var t=localStorage.getItem("sbke.theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <PrefsProvider>
          <Shell>{children}</Shell>
        </PrefsProvider>
      </body>
    </html>
  );
}


