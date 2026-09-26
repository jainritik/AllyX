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
            <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="font-semibold">First launch on macOS</p>
                <p className="mt-1">The current Mac build is integrity-signed but is not yet Apple-notarized. If macOS says AllyX is damaged, move AllyX to Applications, open Terminal, and run:</p>
                <code className="mt-3 block overflow-x-auto rounded-lg bg-black/90 px-4 py-3 font-mono text-xs text-white">xattr -dr com.apple.quarantine /Applications/AllyX.app</code>
                <p className="mt-2">Then right-click AllyX in Applications and choose <strong>Open</strong>. Only use installers downloaded from this official page.</p>
            </div>
            <p className="mt-10 text-sm text-gray-500">Phones and tablets can access account pages, billing, and history. Starting a live interview session requires the installed Mac or Windows app.</p>
        </main>
        <Footer />
    </div>;
}
