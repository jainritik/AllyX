"use client";

import { signOutAndClear } from "@/lib/auth";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

export function DesktopNavBar() {
    const router = useRouter();
    const [isDesktop, setIsDesktop] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [user, setUser] = useState<{ email?: string; user_metadata?: { avatar_url?: string; full_name?: string } } | null>(null);
    const [userAvatar, setUserAvatar] = useState<string | null>(null);
    const [userName, setUserName] = useState<string | null>(null);

    useEffect(() => {
        const loadUser = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    setUser(user);
                    setUserAvatar(user.user_metadata?.avatar_url || null);
                    setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || null);
                }
            } catch (error) {
                console.error('Failed to load user:', error);
            }
        };

        if (typeof window !== "undefined" && window.electronAPI?.isElectron) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsDesktop(true);
            loadUser();

        }
    }, []);



    const handleSignOut = async () => {
        try {
            await signOutAndClear();
            router.replace('/');
        } catch (error) {
            console.error("Sign out error:", error);
            window.alert("Could not sign out. Please try again.");
        }
    };

    if (!isDesktop) return null;

    const handleBack = () => {
        if (window.history.length > 1) {
            window.history.back();
        }
    };

    const handleRefresh = () => {
        window.location.reload();
    };

    const handleClose = () => {
        window.electronAPI?.hideApp();
    };

    const handleQuit = () => {
        window.electronAPI?.quitApp();
    };

    const handlePresentationSafeMode = () => {
        window.electronAPI?.setPresentationSafeMode(true);
    };

    return (
        <>
            <div
                className="h-11 bg-gradient-to-r from-emerald-900 to-emerald-800 flex items-center px-3 gap-2 shrink-0"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            >
                {/* Back Button */}
                <button
                    onClick={handleBack}
                    className="w-7 h-7 rounded-md bg-white/15 text-white flex items-center justify-center hover:bg-white/25 transition-colors"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    title="Back"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </button>

                {/* Spacer */}
                <div className="flex-1" />

                <button
                    onClick={handlePresentationSafeMode}
                    className="h-8 px-3 rounded-md bg-white/15 text-white flex items-center gap-2 hover:bg-white/25 transition-colors text-xs font-semibold"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    title="Hide AllyX and stop all capture (Ctrl/Cmd+Shift+H)"
                >
                    <ShieldCheck size={15} />
                    Safe Mode
                </button>

                {/* Account Actions */}
                {user ? (
                    <div className="relative" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                        <button
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="w-9 h-9 rounded-full overflow-hidden border-2 border-white/40 hover:border-white/70 transition-colors shadow-md"
                        >
                            {userAvatar ? (
                                <Image src={userAvatar} alt="User" width={36} height={36} className="w-full h-full object-cover" style={{ height: 'auto' }} />
                            ) : (
                                <div className="w-full h-full bg-emerald-500 flex items-center justify-center text-white text-sm font-bold">
                                    {userName?.charAt(0).toUpperCase() || 'U'}
                                </div>
                            )}
                        </button>

                        {/* Dropdown */}
                        {isDropdownOpen && (
                            <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-900 rounded-lg shadow-xl border border-zinc-700 py-1 z-50">
                                <div className="px-3 py-2 border-b border-zinc-700">
                                    <p className="text-white text-sm font-medium truncate">{userName}</p>
                                    <p className="text-zinc-400 text-xs truncate">{user.email}</p>
                                </div>
                                    <button
                                        onClick={() => { router.push('/dashboard/new'); setIsDropdownOpen(false); }}
                                        className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                                    >
                                        Simulation Setup
                                    </button>
                                <button
                                    onClick={() => { router.push('/dashboard'); setIsDropdownOpen(false); }}
                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                                >
                                    Dashboard
                                </button>
                                <button
                                    onClick={handleRefresh}
                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                                >
                                    Refresh
                                </button>
                                <div className="border-t border-zinc-700 mt-1 pt-1">
                                    <button
                                        onClick={handleClose}
                                        className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
                                    >
                                        Hide App
                                    </button>
                                    <button
                                        onClick={handleQuit}
                                        className="w-full px-3 py-2 text-left text-sm font-semibold text-red-400 hover:bg-zinc-800 transition-colors"
                                    >
                                        Quit AllyX
                                    </button>
                                    <button
                                        onClick={handleSignOut}
                                        className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-zinc-800 transition-colors"
                                    >
                                        Sign Out
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={() => router.push('/login')}
                        className="px-3 py-1.5 rounded-md bg-white/15 text-white text-sm font-medium hover:bg-white/25 transition-colors"
                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    >
                        Sign In
                    </button>
                )}
                <button
                    onClick={handleQuit}
                    className="ml-1 flex h-8 w-8 items-center justify-center rounded-md bg-red-500/80 text-lg font-bold leading-none text-white transition-colors hover:bg-red-500"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    title="Quit AllyX"
                    aria-label="Quit AllyX"
                >
                    ×
                </button>
            </div>

            {/* Click outside to close dropdown */}
            {isDropdownOpen && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsDropdownOpen(false)}
                />
            )}
        </>
    );
}
