import type { SupabaseClient } from '@supabase/supabase-js';
import { safeReturnPath } from './auth-navigation';
import { authErrorMessage } from './auth-errors';

export async function completeAuthCallback(url: URL, client: SupabaseClient): Promise<string> {
    const params = url.searchParams;
    const hash = new URLSearchParams(url.hash.slice(1));
    const authError = params.get('error_description') || hash.get('error_description') || params.get('error') || hash.get('error');
    if (authError) throw new Error(authError);
    const tokenHash = hash.get('token_hash') || params.get('token_hash');
    const type = hash.get('type') || params.get('type');
    if (params.get('recovery') === '1' && !params.get('code') && !hash.get('access_token') && !tokenHash) {
        throw new Error('No valid session was found. Return to sign in and request a new one-time code or link.');
    }
    if (tokenHash) {
        if (type !== 'email' && type !== 'recovery') throw new Error('Invalid email link. Request a new email.');
        const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) throw new Error(authErrorMessage(error));
    } else if (params.get('code')) {
        const { error } = await client.auth.exchangeCodeForSession(params.get('code')!);
        if (error) throw new Error("This link could not finish sign-in here. Return to AllyX and request a new one-time code or sign in with Google.");
    } else if (hash.get('access_token')) {
        const { error } = await client.auth.setSession({
            access_token: hash.get('access_token')!,
            refresh_token: hash.get('refresh_token') || '',
        });
        if (error) throw error;
    }
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new Error("No valid session found. Please sign in or request a new email.");
    return params.get('recovery') === '1' || type === 'recovery'
        ? '/auth/reset-password' : safeReturnPath(params.get('from'));
}
