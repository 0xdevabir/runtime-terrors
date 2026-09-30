import type { Metadata, Viewport } from "next";
import { Shell } from "@/components/Shell";
import { PrefsProvider } from "@/components/prefs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Space Biology Knowledge Engine",
  description: "Explore 600+ NASA space biology publications: ask questions with citations, map evidence, find gaps and brief missions.",
  appleWebApp: { capable: true, title: "SpaceBio", statusBarStyle: "default" },
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
