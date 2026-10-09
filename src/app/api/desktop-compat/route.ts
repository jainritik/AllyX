import { NextResponse } from "next/server";

// Keep the minimum at the oldest bridge still supported by the hosted renderer.
// Optional native capabilities are feature-detected in the web app, so a valid
// installed shell is never blocked just because the site has a newer release.
export function GET() {
    return NextResponse.json({ rendererVersion: "1.3.17", minimumDesktopVersion: "1.3.0" }, {
        headers: { "Cache-Control": "no-store" },
    });
}
