import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import ErrorBoundary from "@/components/error-boundary";
import { ConfirmDialogProvider } from "@/components/confirm-dialog";
import { DesktopNavBar } from "@/components/desktop-nav";
import { ProductionErrorMonitor } from "@/components/production-error-monitor";

export const metadata: Metadata = {
  metadataBase: new URL("https://allyx.vercel.app"),
  applicationName: "AllyX",
  appleWebApp: {
    title: "AllyX",
    statusBarStyle: "default",
    capable: true,
  },
  title: {
    default: "AllyX - Real-Time AI Interview Assistant",
    template: "%s | AllyX"
  },
  description: "AllyX is a desktop AI interview assistant for macOS and Windows with live transcription, contextual answer suggestions, text and code capture, and saved session history.",
  authors: [{ name: "AllyX Team", url: "https://allyx.vercel.app" }],
  creator: "AllyX",
  publisher: "AllyX",
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
    url: "https://allyx.vercel.app",
    siteName: "AllyX",
    title: "AllyX - Real-Time AI Interview Assistant",
    description: "Live transcription and contextual answer suggestions in a focused desktop app for Mac and Windows.",
    images: [
      {
        url: "/allyx-social-banner.png",
        width: 1200,
        height: 630,
        alt: "AllyX - Interview Simulation Assistant",
      },
      {
        url: "/allyx-logo.png",
        width: 512,
        height: 512,
        alt: "AllyX Logo",
      }
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AllyX - Real-Time AI Interview Assistant",
    description: "A desktop interview assistant for live transcription, contextual suggestions, and technical questions.",
    images: ["/allyx-social-banner.png"],
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
      { url: "/allyx-logo.png", sizes: "192x192", type: "image/png" },
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
        <meta name="name" content="AllyX" />
        <meta property="og:site_name" content="AllyX" />
        <meta name="apple-mobile-web-app-title" content="AllyX" />
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
              "name": "AllyX",
              "alternateName": ["AllyX AI", "AllyX Interview Assistant"],
              "url": "https://allyx.vercel.app",
              "logo": "https://allyx.vercel.app/allyx-logo.png",
              "image": "https://allyx.vercel.app/allyx-logo.png",
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
              "name": "AllyX",
              "url": "https://allyx.vercel.app",
              "logo": "https://allyx.vercel.app/allyx-logo.png",
              "email": "kitirjain@gmail.com",
              "contactPoint": {
                "@type": "ContactPoint",
                "contactType": "customer support",
                "email": "kitirjain@gmail.com",
                "telephone": "+91-8377038800"
              }
            })
          }}
        />


      </head>
      <body
        className={`antialiased ${isScanner ? 'bg-transparent overflow-hidden' : ''}`}
        suppressHydrationWarning
      >
        <ProductionErrorMonitor />
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
