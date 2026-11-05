import { NextRequest, NextResponse } from 'next/server';
import { authorizeApi, commitApiQuota, refundApiQuota } from '@/lib/api-access';

export async function POST(request: NextRequest) {
    const headers = { 'Cache-Control': 'no-store' };
    const key = process.env.DEEPGRAM_API_KEY;
    const allowedUsers = (process.env.DEEPGRAM_TRIAL_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
    // Explicit opt-in and allowlist keep the trial off for ordinary customers.
    if (process.env.DEEPGRAM_LIVE_ENABLED !== 'true' || !key || !allowedUsers.length) {
        return new NextResponse(null, { status: 204, headers });
    }
    const identity = await authorizeApi(request);
    if (identity.error) return identity.error;
    if (!identity.user || (!allowedUsers.includes('*') && !allowedUsers.includes(identity.user.id))) return new NextResponse(null, { status: 204, headers });
    const quota = await authorizeApi(request, 'transcribe');
    if (quota.error) return quota.error;
    const reservationId = quota.reservationId;
    if (!reservationId) return NextResponse.json({ error: 'Usage reservation failed' }, { status: 503, headers });
    try {
        const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
            method: 'POST',
            headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ttl_seconds: 30 }),
            signal: AbortSignal.timeout(8000),
            cache: 'no-store',
        });
        if (!response.ok) throw new Error('Token grant failed');
        const data = await response.json();
        if (typeof data.access_token !== 'string' || !data.access_token) throw new Error('Invalid token');
        await commitApiQuota(request, reservationId);
        return NextResponse.json({ token: data.access_token }, { headers });
    } catch {
        await refundApiQuota(request, reservationId);
        return NextResponse.json({ error: 'Live captions are unavailable' }, { status: 503, headers });
    }
}
