import { create } from 'zustand';
import { supabase } from './supabase';
import { authCallbackUrl } from './auth-navigation';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
    user: User | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ session: Session }>;
    signUp: (email: string, password: string, fullName?: string) => Promise<{ session: Session | null }>;
    verifyOtp: (email: string, token: string) => Promise<unknown>;
    sendEmailOtp: (email: string) => Promise<void>;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
    checkSession: () => Promise<void>;
}

export async function signOutAndClear() {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    document.cookie = 'auth_token=; path=/; max-age=0';
    clearPrivateContext();
    useAuth.setState({ user: null, loading: false });
}

function clearPrivateContext() {
    if (typeof localStorage === 'undefined') return;
    try {
        for (const key of ['interview_context_jd', 'interview_context_resume', 'interview_context_type', 'interview_context_lang', 'allyx_interview_context', 'selected_ai_model', 'interview_draft']) {
            localStorage.removeItem(key);
        }
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('allyx_resume_handoff');
    } catch {
        // Authentication must still complete when browser storage is unavailable.
    }
}

export const useAuth = create<AuthState>((set) => ({
    user: null,
    loading: true,
    checkSession: async () => {
        try {
            const { data, error } = await supabase.auth.getUser();
            set({ user: error ? null : data.user, loading: false });
        } catch { set({ user: null, loading: false }); }
    },
    signIn: async (email, password) => {
        if (!email.trim() || !password) throw new Error('Email and password are required.');
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) throw new Error('No session received. Please sign in again.');
        return { session: data.session };
    },
    signUp: async (email, password, fullName) => {
        if (!email.trim()) throw new Error('Email is required.');
        if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
        if (!fullName?.trim()) throw new Error('Full name is required.');
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password,
            options: { emailRedirectTo: authCallbackUrl(), data: { full_name: fullName?.trim() } },
        });
        if (error) throw error;
        return data;
    },
    verifyOtp: async (email, token) => {
        const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
        if (error) throw error;
        if (!data.session) throw new Error('Verification did not create a session. Please sign in.');
        return data;
    },
    sendEmailOtp: async (email) => {
        const normalized = email.trim().toLowerCase();
        if (!normalized) throw new Error('Email is required.');
        const { error } = await supabase.auth.signInWithOtp({
            email: normalized,
            options: { shouldCreateUser: true, emailRedirectTo: authCallbackUrl() },
        });
        if (error) throw error;
    },
    signInWithGoogle: async () => {
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: authCallbackUrl() } });
        if (error) throw error;
    },
    signOut: signOutAndClear,
}));

if (typeof window !== 'undefined') {
    supabase.auth.onAuthStateChange((_event, session) => {
        const accountId = session?.user?.id || '';
        try {
            const previousId = localStorage.getItem('allyx_context_owner') || '';
            if (previousId && previousId !== accountId) clearPrivateContext();
            if (accountId) localStorage.setItem('allyx_context_owner', accountId);
            else localStorage.removeItem('allyx_context_owner');
        } catch { /* The in-memory session remains authoritative. */ }
        useAuth.setState({ user: session?.user ?? null, loading: false });
        document.cookie = 'auth_token=; path=/; max-age=0';
    });
}
