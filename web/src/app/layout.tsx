import type { Metadata, Viewport } from "next";
import { Shell } from "@/components/Shell";
import { PrefsProvider } from "@/components/prefs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Emberfall — Flame in Freefall",
  description: "AI-powered fire safety insights from microgravity combustion data: ask cited questions, map evidence, find gaps and brief missions.",
  appleWebApp: { capable: true, title: "Emberfall", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// Applies a stored appearance choice before paint to avoid a light/dark flash.
const themeScript = `try{var t=localStorage.getItem("sbke.theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
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

