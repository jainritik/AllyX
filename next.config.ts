import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://api.razorpay.com https://checkout.razorpay.com",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.razorpay.com",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.razorpay.com https://*.razorpay.com",
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async redirects() {
    return [{
      source: "/:path*",
      has: [{ type: "host", value: "zedx-private-demo.vercel.app" }],
      destination: "https://allyx.vercel.app/:path*",
      permanent: true,
    }];
  },
  async headers() {
    const securityHeaders = [
        { key: "Content-Security-Policy", value: contentSecurityPolicy },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(self)" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    ];
    const privateRouteHeaders = [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }];
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/login", headers: privateRouteHeaders },
      { source: "/auth/:path*", headers: privateRouteHeaders },
      { source: "/dashboard/:path*", headers: privateRouteHeaders },
      { source: "/desktop", headers: privateRouteHeaders },
      { source: "/interview/:path*", headers: privateRouteHeaders },
      { source: "/scanner-frame", headers: privateRouteHeaders },
    ];
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };

    // Enable WASM
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    return config;
  },
};

export default nextConfig;
