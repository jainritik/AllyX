import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Apple, AudioLines, BadgeCheck, Check, Code2, Download, FileText, MessageSquareText, MonitorDown, ScanText, ShieldCheck, Sparkles, WandSparkles, Monitor, Zap } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "Real-Time AI Interview Assistant for Mac and Windows",
  description: "Prepare for technical and behavioral interviews with live transcription, contextual answer suggestions, screen text capture, and a focused desktop overlay for macOS and Windows.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "ZEDX — Real-Time AI Interview Assistant",
    description: "A desktop interview copilot with live transcription, contextual suggestions, screen text capture, and support for macOS and Windows.",
    url: "/",
    images: [{ url: "/zedx-cyberpunk-banner.png", width: 1200, height: 630, alt: "ZEDX desktop interview assistant" }],
  },
};

const features = [
  { icon: AudioLines, title: "Understands the conversation", copy: "Transcribes microphone and supported desktop audio so the current question stays in context." },
  { icon: MessageSquareText, title: "Answers with your context", copy: "Uses your resume, target role, preferred tone, and recent questions to generate relevant suggestions." },
  { icon: ScanText, title: "Reads text and code", copy: "Capture a selected area or paste a technical question when audio alone is not enough." },
  { icon: ShieldCheck, title: "Focused desktop overlay", copy: "Keep suggestions in a compact, movable window with adjustable opacity and click-through controls." },
];

const plans = [
  { name: "Free trial", interviews: "1 trial", price: "₹0", detail: "Up to 10 minutes", featured: false },
  { name: "Starter", interviews: "2 interviews", price: "₹1,000", detail: "Use when you need it", featured: false },
  { name: "Growth", interviews: "5 interviews", price: "₹2,000", detail: "Best for an active search", featured: true },
  { name: "Pro", interviews: "10 interviews", price: "₹3,500", detail: "Lowest cost per interview", featured: false },
];

const faqs = [
  ["Does ZEDX join my meeting?", "No. The desktop app runs locally as a separate assistant and does not appear as a meeting participant or bot."],
  ["Which computers are supported?", "The desktop product is designed for Apple Silicon and Intel Macs, plus 64-bit Windows 10 and Windows 11 computers. Each published build will identify its supported systems."],
  ["Can I try it before purchasing?", "Each account includes one trial of up to 10 minutes. Interview packs provide additional full interview sessions."],
  ["Does it work with technical interviews?", "Yes. You can paste questions and code, capture text from the screen, and provide resume and role context for more relevant answers."],
  ["Will the pricing change?", "Interview packs do not expire after a single session starts; one completed interview uses one interview credit."],
];

function ProductPreview() {
  return (
    <div className="relative mx-auto mt-16 w-full max-w-6xl px-3 sm:px-6">
      <div className="absolute inset-x-16 -top-20 h-64 rounded-full bg-cyan-300/25 blur-[100px]" />
      <div className="absolute -bottom-12 right-12 h-64 w-64 rounded-full bg-violet-300/25 blur-[90px]" />
      <div className="relative overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/80 p-2 shadow-[0_35px_110px_-35px_rgba(16,66,94,.45)] backdrop-blur-xl sm:rounded-[2rem] sm:p-3">
        <div className="overflow-hidden rounded-[1.15rem] border border-slate-200 bg-[#101826] sm:rounded-[1.45rem]">
          <div className="flex h-10 items-center gap-2 border-b border-white/10 px-4">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b6b]" /><span className="h-2.5 w-2.5 rounded-full bg-[#ffd166]" /><span className="h-2.5 w-2.5 rounded-full bg-[#69db7c]" />
            <span className="ml-auto rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold text-emerald-300">SESSION LIVE</span>
          </div>
          <div className="grid min-h-[430px] lg:grid-cols-[1.1fr_.9fr]">
            <div className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_20%_10%,rgba(56,189,248,.16),transparent_35%),linear-gradient(145deg,#101827,#18273d)] p-5 sm:p-8 lg:border-b-0 lg:border-r">
              <div className="mb-8 flex items-center gap-3 text-xs text-slate-400"><Code2 className="h-4 w-4 text-cyan-300" /><span>candidate-service / handler.go</span></div>
              <pre className="overflow-hidden text-[10px] leading-6 text-slate-400 sm:text-xs sm:leading-7"><code><span className="text-violet-300">func</span> <span className="text-cyan-200">ProcessJobs</span>(ctx context.Context) error {'{'}{"\n"}  jobs, err := queue.Fetch(ctx){"\n"}  <span className="text-violet-300">if</span> err != nil {'{'}{"\n"}    <span className="text-violet-300">return</span> err{"\n"}  {'}'}{"\n\n"}  <span className="text-slate-500">{"// How would you control concurrency here?"}</span>{"\n"}  <span className="text-violet-300">for</span> _, job := <span className="text-violet-300">range</span> jobs {'{'}{"\n"}    go process(job){"\n"}  {'}'}{"\n"}  <span className="text-violet-300">return</span> nil{"\n"}{'}'}</code></pre>
              <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-[11px] text-slate-300 backdrop-blur sm:left-8 sm:right-8"><span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />Listening to meeting audio</span><span className="hidden text-slate-500 sm:block">00:07:42</span></div>
            </div>
            <div className="relative bg-[#0b111d] p-5 sm:p-8">
              <div className="mb-5 flex items-center justify-between"><div><p className="text-[10px] font-bold tracking-[.18em] text-cyan-300">SUGGESTED ANSWER</p><p className="mt-1 text-xs text-slate-500">Grounded in your role and resume</p></div><Sparkles className="h-5 w-5 text-violet-300" /></div>
              <div className="space-y-4 text-xs leading-6 text-slate-300 sm:text-sm sm:leading-7">
                <p>I&apos;d use a bounded worker pool instead of starting one goroutine per job. That gives us explicit backpressure and prevents a large queue from exhausting memory.</p>
                <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[.06] p-4"><p className="font-semibold text-cyan-200">Approach</p><ul className="mt-2 space-y-1.5 text-slate-400"><li>• Set the worker count from workload and CPU limits.</li><li>• Stop workers through the parent context.</li><li>• Collect errors with an errgroup.</li><li>• Add metrics for queue depth and processing time.</li></ul></div>
                <p className="text-slate-400">For strict ordering, I&apos;d separate concurrent processing from ordered result publication.</p>
              </div>
              <div className="mt-6 flex gap-2"><span className="rounded-full bg-white/5 px-3 py-1.5 text-[10px] text-slate-400">Concise</span><span className="rounded-full bg-white/5 px-3 py-1.5 text-[10px] text-slate-400">Go</span><span className="rounded-full bg-white/5 px-3 py-1.5 text-[10px] text-slate-400">Technical</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const macDownloadUrl = process.env.NEXT_PUBLIC_ZEDX_MAC_ARM64_URL;
  const windowsDownloadUrl = process.env.NEXT_PUBLIC_ZEDX_WINDOWS_X64_URL;
  const macUrl = macDownloadUrl || "/download#mac";
  const windowsUrl = windowsDownloadUrl || "/download#windows";
  const softwareSchema = { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "ZEDX Copilot", applicationCategory: "BusinessApplication", operatingSystem: "macOS, Windows", description: metadata.description, url: "https://zedx-private-demo.vercel.app/", offers: { "@type": "Offer", price: "0", priceCurrency: "INR", description: "One 10-minute account trial" } };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8fbff] text-slate-950 dark:bg-[#05070b] dark:text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <Navbar />
      <main>
        <section className="relative isolate overflow-hidden px-4 pb-24 pt-36 sm:px-6 sm:pt-44">
          <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_50%_-10%,#8bdcff_0,rgba(192,230,255,.76)_24%,rgba(248,251,255,.96)_58%,#f8fbff_78%)] dark:bg-[radial-gradient(circle_at_50%_-10%,#164e63_0,#0b1320_34%,#05070b_72%)]" />
          <div className="absolute inset-0 -z-10 opacity-[.17] [background-image:linear-gradient(rgba(15,23,42,.13)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,.13)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:linear-gradient(to_bottom,black,transparent_72%)]" />
          <div className="mx-auto max-w-5xl text-center">
            <div className="mx-auto mb-7 inline-flex items-center gap-2 rounded-full border border-sky-300/60 bg-white/65 px-4 py-2 text-xs font-semibold text-sky-900 shadow-sm backdrop-blur dark:border-cyan-300/20 dark:bg-white/5 dark:text-cyan-200"><Zap className="h-3.5 w-3.5 fill-current" />Desktop app for macOS and Windows</div>
            <h1 className="text-balance text-5xl font-semibold leading-[.98] tracking-[-.055em] sm:text-7xl lg:text-[6.2rem]">Think clearly.<br /><span className="bg-gradient-to-r from-sky-600 via-cyan-500 to-violet-600 bg-clip-text text-transparent">Answer confidently.</span></h1>
            <p className="mx-auto mt-7 max-w-2xl text-pretty text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-xl sm:leading-8">A real-time AI interview assistant that listens, understands your context, and provides focused answer suggestions when you need them.</p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href={macUrl} className="inline-flex min-w-52 items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-950"><Apple className="h-4 w-4" />{macDownloadUrl ? "Download for Mac" : "Mac installer available at launch"}</a>
              <a href={windowsUrl} className="inline-flex min-w-52 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white/70 px-6 py-3.5 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"><Monitor className="h-4 w-4" />{windowsDownloadUrl ? "Download for Windows" : "Windows installer available at launch"}</a>
            </div>
            <p className="mt-4 text-xs text-slate-500">One 10-minute trial per account · No payment required for the trial</p>
          </div>
          <ProductPreview />
        </section>

        <section className="border-y border-slate-200/80 bg-white/75 px-4 py-8 dark:border-white/10 dark:bg-white/[.025]"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-5 text-sm font-medium text-slate-500 dark:text-slate-400 sm:justify-between"><span className="text-xs font-bold uppercase tracking-[.2em] text-slate-400">Designed to work alongside</span><span>Google Meet</span><span>Microsoft Teams</span><span>Zoom</span><span>HackerRank</span><span>LeetCode</span></div></section>

        <section id="features" className="px-4 py-24 sm:px-6 sm:py-32"><div className="mx-auto max-w-6xl"><div className="max-w-3xl"><p className="text-sm font-bold uppercase tracking-[.18em] text-sky-600 dark:text-cyan-300">One focused workspace</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.04em] sm:text-6xl">Useful context, exactly when the conversation moves.</h2><p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-400">ZEDX combines live transcription, your background, and flexible text capture in a desktop interface built for fast-moving sessions.</p></div>
          <div className="mt-14 grid gap-5 md:grid-cols-2">{features.map(({ icon: Icon, title, copy }, index) => <article key={title} className="group relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_18px_50px_-38px_rgba(15,23,42,.35)] transition hover:-translate-y-1 hover:shadow-[0_24px_70px_-35px_rgba(14,116,144,.35)] dark:border-white/10 dark:bg-white/[.04] sm:p-9"><span className="absolute right-6 top-5 text-6xl font-semibold tracking-tighter text-slate-100 dark:text-white/[.035]">0{index + 1}</span><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-cyan-300/10 dark:text-cyan-300"><Icon className="h-6 w-6" /></div><h3 className="mt-8 text-2xl font-semibold tracking-tight">{title}</h3><p className="mt-3 max-w-lg leading-7 text-slate-600 dark:text-slate-400">{copy}</p></article>)}</div></div></section>

        <section id="how-it-works" className="bg-slate-950 px-4 py-24 text-white sm:px-6 sm:py-32"><div className="mx-auto max-w-6xl"><div className="grid gap-14 lg:grid-cols-[.8fr_1.2fr] lg:items-start"><div className="lg:sticky lg:top-28"><p className="text-sm font-bold uppercase tracking-[.18em] text-cyan-300">How it works</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.04em] sm:text-6xl">Ready in three simple steps.</h2><p className="mt-5 text-lg leading-8 text-slate-400">Set the context once, start a session, and choose automatic or manual control.</p></div><div className="space-y-5">
          {[
            { icon: FileText, title: "Add your context", copy: "Upload your resume and describe the role, preferred answer style, language, and areas you want the AI to emphasize." },
            { icon: MonitorDown, title: "Start the desktop session", copy: "Open the app on macOS or Windows, choose your audio source, and position the overlay where it is comfortable to read." },
            { icon: WandSparkles, title: "Ask, listen, or capture", copy: "Let Auto Answer respond after a pause, paste a question manually, or select text and code from your screen." },
          ].map(({ icon: StepIcon, title, copy }, index) => <article key={title} className="rounded-[1.75rem] border border-white/10 bg-white/[.045] p-7 sm:p-9"><div className="flex items-start gap-5"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-sky-500 text-slate-950"><StepIcon className="h-6 w-6" /></div><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Step {index + 1}</p><h3 className="mt-2 text-2xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-400">{copy}</p></div></div></article>)}</div></div></div></section>

        <section id="pricing" className="px-4 py-24 sm:px-6 sm:py-32"><div className="mx-auto max-w-6xl"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-bold uppercase tracking-[.18em] text-sky-600 dark:text-cyan-300">Simple interview packs</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.04em] sm:text-6xl">Pay for the interviews you need.</h2><p className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-400">Start with a 10-minute account trial, then choose an interview pack that fits your preparation schedule.</p></div>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{plans.map(plan => <article key={plan.name} className={`relative flex min-h-72 flex-col rounded-[1.6rem] border p-6 ${plan.featured ? "border-sky-500 bg-slate-950 text-white shadow-2xl shadow-sky-900/15" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/[.04]"}`}>{plan.featured && <span className="absolute right-5 top-5 rounded-full bg-cyan-300 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-950">Popular</span>}<p className={`text-sm font-semibold ${plan.featured ? "text-cyan-300" : "text-sky-700 dark:text-cyan-300"}`}>{plan.name}</p><p className="mt-7 text-4xl font-semibold tracking-tight">{plan.price}</p><p className={`mt-2 text-sm ${plan.featured ? "text-slate-400" : "text-slate-500"}`}>{plan.interviews}</p><div className={`my-6 h-px ${plan.featured ? "bg-white/10" : "bg-slate-200 dark:bg-white/10"}`} /><p className={`flex items-start gap-2 text-sm ${plan.featured ? "text-slate-300" : "text-slate-600 dark:text-slate-400"}`}><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />{plan.detail}</p><Link href="/login" className={`mt-auto inline-flex items-center justify-center rounded-full px-4 py-3 text-sm font-semibold ${plan.featured ? "bg-white text-slate-950" : "bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white"}`}>{plan.name === "Free trial" ? "Start free" : "Create account"}</Link></article>)}</div></div></section>

        <section className="px-4 pb-24 sm:px-6 sm:pb-32"><div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-sky-500 via-cyan-500 to-violet-600 p-[1px] shadow-2xl shadow-sky-900/15"><div className="rounded-[calc(2rem-1px)] bg-slate-950 px-6 py-14 text-center text-white sm:px-12 sm:py-20"><BadgeCheck className="mx-auto h-10 w-10 text-cyan-300" /><h2 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-[-.04em] sm:text-6xl">Built for the computer you already use.</h2><p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-400">Choose the correct installer for your Mac or Windows computer. Published builds will include clear processor and operating-system requirements.</p><div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row"><a href={macUrl} className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-slate-950"><Apple className="h-4 w-4" />{macDownloadUrl ? "Get ZEDX for Mac" : "Mac installer available at launch"}</a><a href={windowsUrl} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-6 py-3.5 text-sm font-semibold text-white"><Monitor className="h-4 w-4" />{windowsDownloadUrl ? "Get ZEDX for Windows" : "Windows installer available at launch"}</a></div></div></div></section>

        <section id="faq" className="border-t border-slate-200 px-4 py-24 dark:border-white/10 sm:px-6 sm:py-32"><div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[.7fr_1.3fr]"><div><p className="text-sm font-bold uppercase tracking-[.18em] text-sky-600 dark:text-cyan-300">FAQ</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">Questions before your first session.</h2></div><div className="divide-y divide-slate-200 border-y border-slate-200 dark:divide-white/10 dark:border-white/10">{faqs.map(([question, answer]) => <details key={question} className="group py-6"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">{question}<span className="text-2xl font-light text-slate-400 transition group-open:rotate-45">+</span></summary><p className="max-w-2xl pt-4 leading-7 text-slate-600 dark:text-slate-400">{answer}</p></details>)}</div></div></section>

        <section className="px-4 pb-24 text-center sm:px-6 sm:pb-32"><div className="mx-auto max-w-3xl"><Download className="mx-auto h-8 w-8 text-sky-600 dark:text-cyan-300" /><h2 className="mt-5 text-4xl font-semibold tracking-[-.04em] sm:text-6xl">Try your first session free.</h2><p className="mt-5 text-lg text-slate-600 dark:text-slate-400">Create your account and prepare your context before your first session.</p><Link href="/login" className="mt-8 inline-flex items-center gap-2 rounded-full bg-slate-950 px-7 py-4 text-sm font-semibold text-white dark:bg-white dark:text-slate-950">Create free account <ArrowRight className="h-4 w-4" /></Link></div></section>
      </main>
      <Footer />
    </div>
  );
}
