import { NextResponse } from "next/server";

// Bump minimumDesktopVersion when a renderer release requires a new native bridge.
export function GET() {
    return NextResponse.json({ rendererVersion: "1.3.5", minimumDesktopVersion: "1.3.5" }, {
        headers: { "Cache-Control": "no-store" },
    });
}
