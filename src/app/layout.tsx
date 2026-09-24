import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import ErrorBoundary from "@/components/error-boundary";
import { ConfirmDialogProvider } from "@/components/confirm-dialog";
import { DesktopNavBar } from "@/components/desktop-nav";

export const metadata: Metadata = {
  metadataBase: new URL("https://zedx-private-demo.vercel.app"),
  applicationName: "ZEDX Copilot",
  appleWebApp: {
    title: "ZEDX Copilot",
    statusBarStyle: "default",
    capable: true,
  },
  title: {
    default: "ZEDX Copilot - Real-Time AI Interview Assistant",
    template: "%s | ZEDX Copilot"
  },
  description: "ZEDX is a desktop AI interview assistant for macOS and Windows with live transcription, contextual answer suggestions, text and code capture, and saved session history.",
  keywords: [
    "ZEDX", "ZEDX AI", "ZEDX Copilot", "Mock Interview Assistant", "Live Transcription",
    "Interview Simulation", "Mock Interview Copilot", "AI Interview Notes", "Real-time AI Assistant",
    "Training Assistant", "Interview Practice", "Job Seeker Assistant", "AI Coach",
    "محاكاة مقابلات", "تفريغ صوتي مباشر", "تدريب انترفيو", "ذكاء اصطناعي", "مساعد شخصي"
  ],
  authors: [{ name: "ZEDX AI Team", url: "https://zedx-private-demo.vercel.app" }],
  creator: "ZEDX AI",
  publisher: "ZEDX AI",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://zedx-private-demo.vercel.app",
    siteName: "ZEDX Copilot",
    title: "ZEDX Copilot - Real-Time AI Interview Assistant",
    description: "Live transcription and contextual answer suggestions in a focused desktop app for Mac and Windows.",
    images: [
      {
        url: "/zedx-cyberpunk-banner.png",
        width: 1200,
        height: 630,
        alt: "ZEDX Copilot - Interview Simulation Assistant",
      },
      {
        url: "/zedx-logo.png",
        width: 512,
        height: 512,
        alt: "ZEDX Copilot Logo",
      }
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ZEDX Copilot - Real-Time AI Interview Assistant",
    description: "A desktop interview assistant for live transcription, contextual suggestions, and technical questions.",
    images: ["/zedx-cyberpunk-banner.png"],
  },
  alternates: {
    canonical: "https://zedx-private-demo.vercel.app",
  },
  verification: {
    google: "googleac3039da11f6677e",
  },
  category: "Technology",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" }, // Favicon for Google Search
      { url: "/zedx-logo.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
};

export const viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const xUrl = headersList.get("x-url") || "";

  // Robust detection: check for headers or URL patterns (fallback for dev mode issues)
  const isScanner = headersList.get("x-is-scanner") === "true" || xUrl.toLowerCase().includes("scanner-frame");
  const isOverlay = xUrl.toLowerCase().includes("isoverlay=true") || xUrl.toLowerCase().includes("overlay");
  const isHideNav = isScanner || isOverlay;

  return (
    <html lang="en" suppressHydrationWarning className={isScanner ? "bg-transparent" : ""}>
      <head>
        <meta name="name" content="ZEDX Copilot" />
        <meta property="og:site_name" content="ZEDX Copilot" />
        <meta name="apple-mobile-web-app-title" content="ZEDX Copilot" />
        <meta name="msvalidate.01" content="410978477B68DFFC4D1109011EAF121F" />
        <script
          key="theme-script"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem("theme");
                  if (theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
                    document.documentElement.classList.add("dark");
                  } else {
                    document.documentElement.classList.remove("dark");
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        {/* JSON-LD Structured Data for SEO - Site Identity */}
        <script
          key="schema-site-identity"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "name": "ZEDX Copilot",
              "alternateName": ["ZEDX", "ZEDX Copilot", "ZedX AI Assistant"],
              "url": "https://zedx-private-demo.vercel.app",
              "logo": "https://zedx-private-demo.vercel.app/zedx-logo.png",
              "image": "https://zedx-private-demo.vercel.app/zedx-logo.png",
            })
          }}
        />
        {/* Organization Schema for Logo recognition */}
        <script
          key="schema-org-logo"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "ZEDX Copilot",
              "url": "https://zedx-private-demo.vercel.app",
              "logo": "https://zedx-private-demo.vercel.app/zedx-logo.png"
            })
          }}
        />


      </head>
      <body
        className={`antialiased ${isScanner ? 'bg-transparent overflow-hidden' : ''}`}
        suppressHydrationWarning
      >
        {!isHideNav && <DesktopNavBar />}
        <ErrorBoundary>
          <ConfirmDialogProvider>
            {children}
          </ConfirmDialogProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
