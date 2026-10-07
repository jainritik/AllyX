"use client";

import { ChevronLeft, ChevronRight, Pause, Play, Star } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { Testimonial } from "@/lib/testimonials";

type TestimonialCarouselProps = {
    testimonials: Testimonial[];
};

const AUTO_ADVANCE_MS = 8000;

export function TestimonialCarousel({ testimonials }: TestimonialCarouselProps) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
    const carouselId = useId();
    const activeReview = testimonials[activeIndex];

    useEffect(() => {
        const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
        updatePreference();
        mediaQuery.addEventListener("change", updatePreference);
        return () => mediaQuery.removeEventListener("change", updatePreference);
    }, []);

    useEffect(() => {
        if (testimonials.length < 2 || isPaused || prefersReducedMotion) return;
        const interval = window.setInterval(() => {
            setActiveIndex(current => (current + 1) % testimonials.length);
        }, AUTO_ADVANCE_MS);
        return () => window.clearInterval(interval);
    }, [isPaused, prefersReducedMotion, testimonials.length]);

    if (!activeReview) return null;

    const selectReview = (index: number) => {
        setActiveIndex(index);
        setIsPaused(true);
    };
    const previousReview = () => selectReview((activeIndex - 1 + testimonials.length) % testimonials.length);
    const nextReview = () => selectReview((activeIndex + 1) % testimonials.length);

    return (
        <section id="reviews" className="border-y border-slate-200 bg-white px-4 py-24 dark:border-white/10 dark:bg-white/[.025] sm:px-6 sm:py-32">
            <div className="mx-auto max-w-6xl">
                <div className="mx-auto max-w-3xl text-center">
                    <p className="text-sm font-bold uppercase tracking-[.18em] text-sky-600 dark:text-cyan-300">Customer reviews</p>
                    <h2 className="mt-4 text-4xl font-semibold tracking-[-.04em] sm:text-6xl">Confidence before the conversation matters.</h2>
                    <p className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-400">Real feedback from people who use AllyX to prepare for interviews.</p>
                </div>

                <div
                    className="mx-auto mt-14 max-w-4xl"
                    role="region"
                    aria-roledescription="carousel"
                    aria-label="Customer reviews"
                    onMouseEnter={() => setIsPaused(true)}
                    onFocus={() => setIsPaused(true)}
                >
                    <article
                        id={carouselId}
                        className="relative min-h-[22rem] overflow-hidden rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_100%_0%,rgba(34,211,238,.15),transparent_30%),linear-gradient(145deg,#ffffff,#f2f8ff)] p-7 shadow-[0_24px_80px_-45px_rgba(14,116,144,.45)] dark:border-white/10 dark:bg-[radial-gradient(circle_at_100%_0%,rgba(34,211,238,.16),transparent_30%),linear-gradient(145deg,#111827,#05070b)] sm:min-h-[20rem] sm:p-12"
                        aria-live={isPaused ? "polite" : "off"}
                    >
                        <div className="absolute right-[-3rem] top-[-3rem] h-40 w-40 rounded-full bg-violet-300/20 blur-3xl" />
                        <div className="relative flex h-full flex-col justify-between gap-10">
                            <div>
                                <div className="flex items-center gap-1" aria-label={`${activeReview.rating} out of 5 stars`}>
                                    {Array.from({ length: 5 }, (_, index) => (
                                        <Star key={index} className={`h-5 w-5 ${index < activeReview.rating ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600"}`} aria-hidden="true" />
                                    ))}
                                </div>
                                <blockquote className="mt-7 max-w-3xl text-2xl font-medium leading-relaxed tracking-[-.025em] text-slate-900 dark:text-white sm:text-4xl">“{activeReview.quote}”</blockquote>
                            </div>
                            <footer className="flex items-center gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-lg font-bold text-white dark:bg-white dark:text-slate-950">{activeReview.reviewer.slice(0, 1).toUpperCase()}</div>
                                <div>
                                    <cite className="not-italic font-semibold text-slate-950 dark:text-white">{activeReview.reviewer}</cite>
                                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{activeReview.role}</p>
                                </div>
                            </footer>
                        </div>
                    </article>

                    <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-2" role="group" aria-label="Choose a review">
                            {testimonials.map((review, index) => (
                                <button
                                    key={`${review.reviewer}-${index}`}
                                    type="button"
                                    onClick={() => selectReview(index)}
                                    className={`h-2.5 rounded-full transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600 ${activeIndex === index ? "w-8 bg-sky-600 dark:bg-cyan-300" : "w-2.5 bg-slate-300 hover:bg-slate-400 dark:bg-slate-700 dark:hover:bg-slate-600"}`}
                                    aria-label={`Show review ${index + 1} from ${review.reviewer}`}
                                    aria-current={activeIndex === index ? "true" : undefined}
                                />
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setIsPaused(current => !current)} className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10" aria-label={isPaused ? "Resume automatic review rotation" : "Pause automatic review rotation"}>
                                {isPaused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
                                {isPaused ? "Play" : "Pause"}
                            </button>
                            <button type="button" onClick={previousReview} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10" aria-label="Show previous review"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
                            <button type="button" onClick={nextReview} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10" aria-label="Show next review"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
