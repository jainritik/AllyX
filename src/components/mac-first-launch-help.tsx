import { CheckCircle2, Settings } from 'lucide-react';

export function MacFirstLaunchHelp() {
    return <section className="mt-8 rounded-2xl border border-sky-200 bg-sky-50 p-6 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100">
        <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden="true" />
            <div>
                <h2 className="text-xl font-semibold">Open AllyX on your Mac</h2>
                <p className="mt-2 text-sm leading-6">
                    AllyX is distributed outside the Mac App Store. macOS may ask you to approve it the first time you open it. This is a one-time step for this copy of AllyX.
                </p>
            </div>
        </div>

        <ol className="mt-5 grid gap-4 text-sm leading-6 sm:grid-cols-3">
            <li className="rounded-xl bg-white/80 p-4 dark:bg-black/20">
                <p className="font-semibold">1. Keep AllyX installed</p>
                <p className="mt-1">On the Apple warning, select <strong>Done</strong>. Do not select Move to Bin.</p>
            </li>
            <li className="rounded-xl bg-white/80 p-4 dark:bg-black/20">
                <p className="font-semibold">2. Open Privacy &amp; Security</p>
                <p className="mt-1">Open <strong>System Settings</strong>, then select <strong>Privacy &amp; Security</strong>.</p>
            </li>
            <li className="rounded-xl bg-white/80 p-4 dark:bg-black/20">
                <p className="font-semibold">3. Approve AllyX</p>
                <p className="mt-1">Scroll to Security, choose <strong>Open Anyway</strong> beside AllyX, then choose <strong>Open</strong>.</p>
            </li>
        </ol>

        <div className="mt-5 flex items-start gap-3 rounded-xl border border-sky-200 bg-white p-4 text-sm leading-6 dark:border-sky-900 dark:bg-black/30">
            <Settings className="mt-0.5 h-5 w-5 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden="true" />
            <p>
                macOS requires this approval because the installer is not notarized. AllyX cannot open System Settings or approve the warning on your behalf. See <a className="font-semibold underline underline-offset-2" href="https://support.apple.com/102445" target="_blank" rel="noreferrer">Apple&apos;s instructions</a> if you need help finding the setting.
            </p>
        </div>
    </section>;
}
