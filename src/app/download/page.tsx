import type { Metadata } from 'next';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { desktopDownloads } from '@/lib/download-links';
import { DesktopAppNotice } from '@/components/desktop-app-notice';

export const metadata: Metadata = {
    title: 'Download AllyX for Mac and Windows',
    description: 'Download the AllyX desktop AI interview assistant for Apple Silicon Mac, Intel Mac, or 64-bit Windows 10 and Windows 11.',
    alternates: { canonical: '/download' },
    openGraph: {
        title: 'Download AllyX for Mac and Windows',
        description: 'Choose the AllyX desktop installer for your Mac or Windows computer.',
        url: '/download',
        images: [{ url: '/allyx-social-banner.png', width: 1200, height: 630, alt: 'AllyX desktop interview assistant' }],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Download AllyX for Mac and Windows',
        description: 'Choose the AllyX desktop installer for your Mac or Windows computer.',
        images: ['/allyx-social-banner.png'],
    },
};

const builds = [
    { id: 'mac', name: 'macOS Apple Silicon', detail: 'M1, M2, M3 and later Apple Silicon Macs', url: desktopDownloads.macArm64 },
    { id: 'mac-intel', name: 'macOS Intel', detail: 'Intel Macs', url: desktopDownloads.macX64 },
    { id: 'windows', name: 'Windows x64', detail: 'Windows 10/11, 64-bit', url: desktopDownloads.windowsX64 },
];

export default function DownloadPage() {
    return <div className="min-h-screen flex flex-col bg-white dark:bg-black text-gray-900 dark:text-gray-100">
        <Navbar />
        <main className="flex-grow max-w-4xl mx-auto w-full px-6 pt-32 pb-20">
            <h1 className="text-4xl font-bold mb-4">Download AllyX desktop</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">Choose the installer that matches your computer.</p>
            <div className="mb-8"><DesktopAppNotice showDownload={false} /></div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-10">Before a real session, use a second participant view to confirm the overlay behaves as expected with your computer and meeting app.</p>
            <div className="grid gap-4 sm:grid-cols-3">
                {builds.map(build => <div id={build.id} key={build.name} className="scroll-mt-28 rounded-2xl border border-gray-200 dark:border-zinc-800 p-6">
                    <h2 className="font-semibold text-lg">{build.name}</h2>
                    <p className="text-sm text-gray-500 mt-2 min-h-12">{build.detail}</p>
                    {build.url
                        ? <a href={build.url} className="inline-block mt-5 rounded-lg bg-emerald-600 text-white px-5 py-3 font-medium">Download</a>
                        : <p className="mt-5 text-sm font-medium text-sky-700 dark:text-cyan-300">Installer available at launch</p>}
                </div>)}
            </div>
            <div className="mt-8 rounded-2xl border border-sky-200 bg-sky-50 p-6 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
                <h2 className="text-lg font-semibold">Open AllyX on your Mac</h2>
                <p className="mt-2 text-sm leading-6">AllyX is currently distributed outside the Mac App Store. Complete these steps once after downloading it:</p>
                <ol className="mt-5 grid gap-4 text-sm leading-6 sm:grid-cols-2">
                    <li className="rounded-xl bg-white/80 p-4 dark:bg-black/20">
                        <p className="font-semibold">1. Install AllyX</p>
                        <p className="mt-1">Open the downloaded DMG and drag AllyX into the Applications folder.</p>
                    </li>
                    <li className="rounded-xl bg-white/80 p-4 dark:bg-black/20">
                        <p className="font-semibold">2. Try to open it</p>
                        <p className="mt-1">Open AllyX from Applications. If macOS blocks it, select Done and continue below.</p>
                    </li>
                    <li className="rounded-xl bg-white/80 p-4 dark:bg-black/20">
                        <p className="font-semibold">3. Allow AllyX</p>
                        <p className="mt-1">Open System Settings → Privacy &amp; Security, scroll to Security, then select Open Anyway beside AllyX.</p>
                    </li>
                    <li className="rounded-xl bg-white/80 p-4 dark:bg-black/20">
                        <p className="font-semibold">4. Confirm once</p>
                        <p className="mt-1">Enter your Mac password if asked, then select Open. Future launches will open normally.</p>
                    </li>
                </ol>
                <p className="mt-5 text-sm leading-6">Only allow the app you downloaded from this official AllyX page. See <a className="font-semibold underline underline-offset-2" href="https://support.apple.com/102445" target="_blank" rel="noreferrer">Apple&apos;s instructions for opening a blocked app</a>.</p>
            </div>
            <p className="mt-10 text-sm text-gray-500">Phones and tablets can access account pages, billing, and history. Starting a live interview session requires the installed Mac or Windows app.</p>
        </main>
        <Footer />
    </div>;
}
