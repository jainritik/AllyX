"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Clock, CheckCircle, Calendar, ArrowRight, Trash2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { interviewService, Interview } from "@/lib/interview-service";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { interviewAccess } from "@/lib/interview-access";
import { DesktopAppNotice } from "@/components/desktop-app-notice";

export default function DashboardPage() {
    const router = useRouter();
    const { confirm, showToast } = useConfirmDialog();
    const [stats, setStats] = useState({ totalInterviews: 0, totalMinutes: 0 });
    const [recentSessions, setRecentSessions] = useState<Interview[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);

    const loadData = useCallback(async () => {
            try {
                setIsLoading(true);
                setError(null);
                await interviewAccess.recoverPendingFinish().catch(() => false);
                const interviews = await interviewService.getUserInterviews();
                const access = await interviewAccess.status().catch(() => null);
                setCreditsRemaining(access?.creditsRemaining ?? null);
                setRecentSessions(interviews.slice(0, 3)); // Get top 3

                // Only count measured duration; never invent time for short sessions.
                const totalMins = interviews.reduce((sum, iv) => {
                    const duration = iv.analysis?.duration_minutes;
                    return sum + (typeof duration === "number" && duration > 0 ? duration : 0);
                }, 0);

                setStats({
                    totalInterviews: interviews.length,
                    totalMinutes: totalMins
                });
            } catch (e: unknown) {
                const err = e as Error;
                if (err.message?.includes("User not authenticated")) {
                    router.push("/login");
                    return;
                }
                console.error(err);
                setError("Could not load your dashboard. Check your connection and retry.");
            } finally {
                setIsLoading(false);
            }
    }, [router]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const confirmed = await confirm({
            title: "Delete Interview",
            message: "Are you sure you want to delete this interview?",
            confirmText: "Delete",
            variant: "danger"
        });
        if (!confirmed) return;

        try {
            await interviewService.deleteInterview(id);
            await loadData();
            showToast("Interview deleted", "success");
        } catch (e: unknown) {
            const err = e as Error;
            console.error(err);
            // FIX: Show user-facing error message when delete fails
            showToast(err.message || "Failed to delete interview. Try again.", "error");
        }
    };

    return (
        <div className="space-y-8" aria-busy={isLoading}>
            <DesktopAppNotice compact />
            {error && (
                <div role="alert" className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                    <AlertCircle size={20} />
                    <span className="flex-1">{error}</span>
                    <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>Retry</Button>
                </div>
            )}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
                    <p className="text-gray-600 dark:text-gray-300">Welcome back! Ready for your next interview?</p>
                </div>
                <Button asChild variant="gradient" className="w-full sm:w-auto shadow-lg shadow-green-900/20">
                    <Link href="/dashboard/new">
                        <Plus className="mr-2 h-4 w-4" />
                        Start New Interview
                    </Link>
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 transition-colors">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-2 sm:p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl">
                            <Clock size={20} className="sm:size-[24px]" />
                        </div>
                        <div>
                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium">Total Time</p>
                            {isLoading ? <Skeleton className="mt-1 h-8 w-16" /> : <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{stats.totalMinutes}m</h3>}
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 transition-colors">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-2 sm:p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-xl">
                            <CheckCircle size={20} className="sm:size-[24px]" />
                        </div>
                        <div>
                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium">Interviews Completed</p>
                            {isLoading ? <Skeleton className="mt-1 h-8 w-12" /> : <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{stats.totalInterviews}</h3>}
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 transition-colors">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-2 sm:p-3 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 rounded-xl">
                            <Calendar size={20} className="sm:size-[24px]" />
                        </div>
                        <div>
                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium">Interview Credits</p>
                            {isLoading ? <Skeleton className="mt-1 h-8 w-12" /> : <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{creditsRemaining ?? "—"}</h3>}
                        </div>
                    </div>
                    {isLoading ? <Skeleton className="h-4 w-28" /> : creditsRemaining && creditsRemaining > 0 ? (
                        <Link href="/dashboard/billing" className="text-xs font-semibold text-violet-600 dark:text-violet-400">Manage credits</Link>
                    ) : (
                        <Link href="/dashboard/billing" className="text-xs font-semibold text-violet-600 dark:text-violet-400">Buy interview pack</Link>
                    )}
                </div>

            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 sm:p-8 transition-colors">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Recent History</h3>
                    {recentSessions.length > 0 && (
                        <Button asChild variant="ghost" size="sm" className="text-gray-500 dark:text-gray-400">
                            <Link href="/dashboard/history">
                                View All
                            </Link>
                        </Button>
                    )}
                </div>

                {isLoading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                                <div className="flex items-center gap-4 w-full">
                                    <Skeleton className="w-10 h-10 rounded-lg" />
                                    <div className="space-y-2 w-full max-w-[200px]">
                                        <Skeleton className="h-4 w-full" />
                                        <Skeleton className="h-3 w-2/3" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : recentSessions.length === 0 ? (
                    <div className="text-center py-8">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No interviews yet</h3>
                        <p className="text-gray-500 dark:text-gray-400">Start your first session to see its transcript and answers here.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {recentSessions.map((session) => (
                            <Link href={`/dashboard/history?session=${encodeURIComponent(session.id)}`} key={session.id}>
                                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                                            <Calendar size={20} />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-gray-900 dark:text-white">{session.title}</h4>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                {new Date(session.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-red-400 hover:text-red-500 hover:bg-red-50 h-8 w-8"
                                            onClick={(e) => handleDelete(session.id, e)}
                                        >
                                            <Trash2 size={14} />
                                        </Button>
                                        <ArrowRight size={16} className="text-gray-400 dark:text-gray-500" />
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div >
    );
}
