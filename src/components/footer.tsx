import Link from "next/link";
import { supportContact } from "@/lib/support-contact";
import { LandingSectionLink } from "@/components/landing-section-link";

export function Footer() {
    return (
        <footer className="border-t border-slate-200 bg-white py-12 dark:border-white/10 dark:bg-[#05070b]">
            <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-7 px-6 text-center sm:flex-row sm:text-left">
                <div>
                    <p className="text-lg font-black tracking-[-0.04em] text-slate-950 dark:text-white">AllyX</p>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Real-time context and answer suggestions for interview preparation.</p>
                </div>
                <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm font-medium text-slate-600 dark:text-slate-400">
                    <LandingSectionLink sectionId="features" className="hover:text-sky-600 dark:hover:text-cyan-300">Features</LandingSectionLink>
                    <LandingSectionLink sectionId="how-it-works" className="hover:text-sky-600 dark:hover:text-cyan-300">How it works</LandingSectionLink>
                    <LandingSectionLink sectionId="pricing" className="hover:text-sky-600 dark:hover:text-cyan-300">Pricing</LandingSectionLink>
                    <Link href="/about" className="hover:text-sky-600 dark:hover:text-cyan-300">About</Link>
                    <Link href="/download" className="hover:text-sky-600 dark:hover:text-cyan-300">Download</Link>
                    <Link href="/privacy" className="hover:text-sky-600 dark:hover:text-cyan-300">Privacy</Link>
                    <Link href="/terms" className="hover:text-sky-600 dark:hover:text-cyan-300">Terms</Link>
                    <Link href="/support/report-bug" className="hover:text-sky-600 dark:hover:text-cyan-300">Report a bug</Link>
                    <a href={supportContact.whatsappUrl} target="_blank" rel="noreferrer" className="hover:text-sky-600 dark:hover:text-cyan-300">WhatsApp support</a>
                    <a href={supportContact.emailComposeUrl} target="_blank" rel="noreferrer" aria-label={`Email AllyX support at ${supportContact.email}`} title={supportContact.email} className="hover:text-sky-600 dark:hover:text-cyan-300">Email support</a>
                </nav>
            </div>
            <div className="mx-auto mt-8 max-w-6xl border-t border-slate-200 px-6 pt-6 text-center text-xs text-slate-400 dark:border-white/10 sm:text-left">© {new Date().getFullYear()} AllyX. All rights reserved.</div>
        </footer>
    );
}
