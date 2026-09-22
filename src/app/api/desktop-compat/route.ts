import { NextResponse } from "next/server";

// Bump minimumDesktopVersion when a renderer release requires a new native bridge.
export function GET() {
    return NextResponse.json({ rendererVersion: "1.3.3", minimumDesktopVersion: "1.3.3" }, {
        headers: { "Cache-Control": "no-store" },
    });
}
