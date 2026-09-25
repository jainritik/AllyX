"use client";

import { useAuth, signOutAndClear } from "@/lib/auth";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [isDesktop, setIsDesktop] = useState(false);
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    useEffect(() => {
        // Check if running in Electron desktop mode
        if (typeof window !== "undefined" && (window as unknown as { electronAPI?: { isElectron: boolean } }).electronAPI?.isElectron) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsDesktop(true);
        }

        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Hide full navbar in desktop mode - DesktopNavBar handles navigation
    if (isDesktop) return null;

    return (
        <nav
            className={cn(
                "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
                scrolled
                    ? "py-3 bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800 shadow-sm sm:bg-white/80 sm:dark:bg-black/80 sm:backdrop-blur-md"
                    : "py-4 bg-transparent"
            )}
        >
            <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
                {/* Logo */}
                <Link href="/" className="flex items-center group">
                    <Image
                        src="/allyx-logo.png"
                        alt="AllyX Logo"
                        width={56}
                        height={56}
                        className="object-contain w-11 h-11 transition-transform group-hover:scale-105"
                        style={{ height: 'auto' }}
                        priority
                    />
                    <span className="-ml-1 text-base font-black tracking-[-0.04em] text-slate-950 dark:text-white">AllyX</span>
                </Link>

                {/* Desktop Navigation */}
                <div className="hidden md:flex items-center gap-2">
                    <Link
                        href="/#how-it-works"
                        className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:text-sky-600 dark:hover:text-cyan-300 transition-colors"
                        onClick={(e) => {
                            if (window.location.pathname === '/') {
                                e.preventDefault();
                                document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                            }
                        }}
                    >
                        <span className="px-4 py-2 rounded-full hover:bg-white/70 dark:hover:bg-white/10 transition-all">
                            How it Works
                        </span>
                    </Link>
                    <Link
                        href="/#pricing"
                        className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:text-sky-600 dark:hover:text-cyan-300 transition-colors"
                    >
                        <span className="px-4 py-2 rounded-full hover:bg-white/70 dark:hover:bg-white/10 transition-all">
                            Pricing
                        </span>
                    </Link>
                    <Link
                        href="/download"
                        className="text-sm font-semibold transition-colors"
                    >
                        <span className="px-4 py-2 rounded-full hover:bg-white/70 dark:hover:bg-white/10 transition-all text-gray-700 dark:text-gray-200">
                            Download
                        </span>
                    </Link>

                    <div className="ml-2 pl-4 border-l border-gray-200 dark:border-gray-700">
                        <AuthButtons />
                    </div>
                </div>

                {/* Mobile Menu (Sheet) */}
                <div className="md:hidden flex items-center gap-4">
                    <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-gray-600 dark:text-gray-300">
                                <Menu size={24} />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="w-[300px] sm:w-[350px] border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-black/95 backdrop-blur-xl p-0">
                            <div className="flex flex-col h-full bg-white dark:bg-black">
                                <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <Image src="/favicon.png" alt="Logo" width={24} height={24} />
                                        Menu
                                    </h2>
                                </div>
                                <div className="flex flex-col gap-1 p-4 overflow-y-auto">
                                    <Link href="/dashboard" onClick={() => setIsSheetOpen(false)}>
                                        <Button variant="ghost" className="w-full justify-start text-base font-medium h-12 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800">
                                            Dashboard
                                        </Button>
                                    </Link>
                                    <Link href="/dashboard/new" onClick={() => setIsSheetOpen(false)}>
                                        <Button variant="ghost" className="w-full justify-start text-base font-medium h-12 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800">
                                            New Simulation
                                        </Button>
                                    </Link>
                                    <Link href="/dashboard/resumes" onClick={() => setIsSheetOpen(false)}>
                                        <Button variant="ghost" className="w-full justify-start text-base font-medium h-12 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800">
                                            My Context Files
                                        </Button>
                                    </Link>
                                    <Link href="/dashboard/history" onClick={() => setIsSheetOpen(false)}>
                                        <Button variant="ghost" className="w-full justify-start text-base font-medium h-12 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800">
                                            Training History
                                        </Button>
                                    </Link>

                                    <div className="h-px bg-gray-100 dark:bg-gray-800 my-4 mx-2" />

                                    <Link href="/#features" onClick={() => setIsSheetOpen(false)}>
                                        <Button variant="ghost" className="w-full justify-start text-base font-medium h-12 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800">
                                            How it Works
                                        </Button>
                                    </Link>
                                    <Link href="/#pricing" onClick={() => setIsSheetOpen(false)}>
                                        <Button variant="ghost" className="w-full justify-start text-base font-medium h-12 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800">
                                            Pricing
                                        </Button>
                                    </Link>
                                    <Link href="/download" onClick={() => setIsSheetOpen(false)}>
                                        <Button variant="ghost" className="w-full justify-start text-base font-medium h-12 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800">
                                            Desktop App
                                        </Button>
                                    </Link>
                                    <Link href="/about" onClick={() => setIsSheetOpen(false)}>
                                        <Button variant="ghost" className="w-full justify-start text-base font-medium h-12 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800">
                                            About AllyX
                                        </Button>
                                    </Link>

                                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                                        <AuthButtons onSheetClose={() => setIsSheetOpen(false)} />
                                    </div>
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>
        </nav>
    );
}

function AuthButtons({ onSheetClose }: { onSheetClose?: () => void }) {
    const { user, checkSession } = useAuth();
    const isLoggedIn = Boolean(user);
    const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || null;
    const userEmail = user?.email || null;
    const userAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    useEffect(() => { void checkSession(); }, [checkSession]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest('.user-dropdown')) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const handleLogout = async () => {
        try {
            await signOutAndClear();
            window.location.href = "/login";
        } catch {
            window.alert("Could not sign out. Please check your connection and try again.");
        }
    };
    const handleSwitchAccount = handleLogout;

    if (isLoggedIn) {
        return (
            <div className="relative user-dropdown">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="flex items-center gap-2 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                    >
                        <div className="w-10.5 h-10.5 rounded-full overflow-hidden border-2 border-green-500 shadow-md">
                            {userAvatar ? (
                                <Image
                                    src={userAvatar}
                                    alt="User Avatar"
                                    width={42}
                                    height={42}
                                    className="w-full h-full object-cover"
                                    style={{ height: 'auto' }}
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-lg">
                                    {userName?.charAt(0).toUpperCase() || userEmail?.charAt(0).toUpperCase() || 'U'}
                                </div>
                            )}
                        </div>
                    </button>

                    {/* Dropdown Menu */}
                    {isDropdownOpen && (
                        <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl shadow-black/20 border border-gray-200 dark:border-zinc-700 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                            {/* User Info Header */}
                            <div className="p-4 bg-gray-50 dark:bg-zinc-800 border-b border-gray-100 dark:border-zinc-700">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-green-500">
                                        {userAvatar ? (
                                            <Image
                                                src={userAvatar}
                                                alt="User Avatar"
                                                width={48}
                                                height={48}
                                                className="w-full h-full object-cover"
                                                style={{ height: 'auto' }}
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-xl">
                                                {userName?.charAt(0).toUpperCase() || userEmail?.charAt(0).toUpperCase() || 'U'}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-900 dark:text-white truncate">
                                            {userName || 'User'}
                                        </p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                            {userEmail}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Menu Items */}
                            <div className="p-2">
                                <button
                                    onClick={() => {
                                        handleSwitchAccount();
                                        onSheetClose?.();
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                                >
                                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                    </svg>
                                    Switch Account
                                </button>

                                <div className="my-2 border-t border-gray-100 dark:border-zinc-700"></div>

                                <button
                                    onClick={() => {
                                        handleLogout();
                                        onSheetClose?.();
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
            <Link href="/login" onClick={onSheetClose}>
                <Button variant="ghost" className="w-full sm:w-auto text-gray-600 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400">
                    Sign in
                </Button>
            </Link>
            <Link href="/login" onClick={onSheetClose}>
                <Button variant="gradient" className="w-full sm:w-auto shadow-lg shadow-green-900/20">
                    Try For Free
                </Button>
            </Link>
        </div>
    );
}
