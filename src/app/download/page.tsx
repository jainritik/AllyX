import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

const builds = [
    { name: 'macOS Apple Silicon', detail: 'M1, M2, M3 and later Apple Silicon Macs', url: process.env.NEXT_PUBLIC_ZEDX_MAC_ARM64_URL },
    { name: 'macOS Intel', detail: 'Intel Macs', url: process.env.NEXT_PUBLIC_ZEDX_MAC_X64_URL },
    { name: 'Windows x64', detail: 'Windows 10/11, 64-bit', url: process.env.NEXT_PUBLIC_ZEDX_WINDOWS_X64_URL },
];

export default function DownloadPage() {
    return <div className="min-h-screen flex flex-col bg-white dark:bg-black text-gray-900 dark:text-gray-100">
        <Navbar />
        <main className="flex-grow max-w-4xl mx-auto w-full px-6 pt-32 pb-20">
            <h1 className="text-4xl font-bold mb-4">ZEDX desktop beta</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">Choose a build for your computer. Beta builds are released here after signing and device testing.</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-10">Capture privacy depends on your OS and the sharing app. Verify the receiver view before relying on it.</p>
            <div className="grid gap-4 sm:grid-cols-3">
                {builds.map(build => <div key={build.name} className="rounded-2xl border border-gray-200 dark:border-zinc-800 p-6">
                    <h2 className="font-semibold text-lg">{build.name}</h2>
                    <p className="text-sm text-gray-500 mt-2 min-h-12">{build.detail}</p>
                    {build.url
                        ? <a href={build.url} className="inline-block mt-5 rounded-lg bg-emerald-600 text-white px-5 py-3 font-medium">Download beta</a>
                        : <p className="mt-5 text-sm font-medium text-amber-600">Coming after beta validation</p>}
                </div>)}
            </div>
            <p className="mt-10 text-sm text-gray-500">The web app is available through your account. Desktop-specific capture controls require the installed app.</p>
        </main>
        <Footer />
    </div>;
}
