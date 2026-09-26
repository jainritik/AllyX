"use client";

import { signOutAndClear } from "@/lib/auth";

import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Video, FileText, LogOut, Clock, Loader2, CreditCard, Bug, Gift } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { SettingsDialog } from "@/components/settings-dialog";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { PageTransition } from "@/components/page-transition";



function NavItems({ setMobileMenuOpen }: { setMobileMenuOpen: (open: boolean) => void }) {
    return (
        <>
            <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" className="w-full justify-start gap-3 text-gray-600 dark:text-gray-300 hover:text-green-700 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20">
                    <LayoutDashboard size={20} />
                    Dashboard
                </Button>
            </Link>
            <Link href="/dashboard/new" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" className="w-full justify-start gap-3 text-gray-600 dark:text-gray-300 hover:text-green-700 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20">
                    <Video size={20} />
                    New Interview
                </Button>
            </Link>
            <Link href="/dashboard/resumes" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" className="w-full justify-start gap-3 text-gray-600 dark:text-gray-300 hover:text-green-700 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20">
                    <FileText size={20} />
                    My Resumes
                </Button>
            </Link>
            <Link href="/dashboard/history" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" className="w-full justify-start gap-3 text-gray-600 dark:text-gray-300 hover:text-green-700 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20">
                    <Clock size={20} />
                    Interview History
                </Button>
            </Link>
            <Link href="/dashboard/billing" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" className="w-full justify-start gap-3 text-gray-600 dark:text-gray-300 hover:text-green-700 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20">
                    <CreditCard size={20} />
                    Billing & Credits
                </Button>
            </Link>
            <Link href="/support/report-bug" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" className="w-full justify-start gap-3 text-gray-600 dark:text-gray-300 hover:text-green-700 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20">
                    <Bug size={20} />
                    Report a Bug
                </Button>
            </Link>

            <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-800">
                <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                    onClick={async () => {
                        try {
                            await signOutAndClear();
                            window.location.href = "/login";
                        } catch { window.alert("Could not sign out. Please try again."); }
                    }}
                >
                    <LogOut size={20} />
                    Sign Out
                </Button>
            </div>
        </>
    );
}

type PlanSummary = {
    creditsRemaining: number;
    trialStatus: "available" | "active" | "used";
};

function PlanCard() {
    const [plan, setPlan] = useState<PlanSummary | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/billing/account", { cache: "no-store", signal: controller.signal })
            .then(response => response.ok ? response.json() : null)
            .then(payload => { if (payload) setPlan(payload as PlanSummary); })
            .catch(() => undefined);
        return () => controller.abort();
    }, []);

    const hasCredits = (plan?.creditsRemaining || 0) > 0;
    const title = hasCredits ? "Interview credits" : "Free Plan";
    const detail = hasCredits
        ? `${plan?.creditsRemaining} interview credit${plan?.creditsRemaining === 1 ? "" : "s"} available.`
        : plan?.trialStatus === "used"
            ? "Your free session has been used. Buy credits to continue."
            : plan?.trialStatus === "active"
                ? "Your 10-minute free session is active."
                : "Start a 10-minute free session or buy credits for full interviews.";

    return <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
        <div className="flex items-center gap-2 font-semibold text-gray-950 dark:text-white"><Gift className="h-5 w-5 text-emerald-600" />{title}</div>
        <p className="mt-3 text-sm leading-5 text-gray-500 dark:text-gray-400">{detail}</p>
        <Link href="/dashboard/billing" className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
            {hasCredits ? "Manage credits" : "Upgrade"}
        </Link>
    </div>;
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const [showSettings, setShowSettings] = useState(false);
    const [, setMobileMenuOpen] = useState(false);
    const [isAuthChecking, setIsAuthChecking] = useState(true);
    const [authError, setAuthError] = useState(false);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const { data, error } = await supabase.auth.getUser();
                if (error) {
                    if (error.name === 'AuthSessionMissingError' || error.status === 401 || error.status === 403) {
                        router.replace("/login");
                    } else { setAuthError(true); }
                    return;
                }
                if (!data.user) { router.replace("/login"); return; }
                setIsAuthChecking(false);
            } catch { setAuthError(true); }
        };
        checkAuth();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') router.replace("/login");
        });

        const handleOpenSettings = () => setShowSettings(true);
        window.addEventListener('openSettings', handleOpenSettings);
        return () => {
            subscription.unsubscribe();
            window.removeEventListener('openSettings', handleOpenSettings);
        };
    }, [router]);

    if (authError) {
        return <div className="min-h-screen flex flex-col items-center justify-center gap-4">
            <p>Could not verify your session. Check your connection and retry.</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
            <Link href="/login">Return to sign in</Link>
        </div>;
    }

    if (isAuthChecking) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-green-600" />
            </div>
        );
    }



    return (
        <div className="min-h-screen bg-white dark:bg-black flex flex-col transition-colors duration-300">
            <Navbar />
            <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />



            <div className="flex flex-1 pt-20 w-full max-w-full md:max-w-[75vw] mx-auto px-6 sm:px-6 gap-6 sm:gap-8">
                {/* Desktop Sidebar */}
                <aside className="w-64 hidden md:block py-8">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-4 sticky top-24 mt-20 transition-colors duration-300">
                        <nav className="space-y-2">
                            <NavItems setMobileMenuOpen={setMobileMenuOpen} />
                        </nav>
                        <PlanCard />
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 py-8">
                    <PageTransition>
                        {children}
                    </PageTransition>
                </main>
            </div>
        </div>
    );
}
