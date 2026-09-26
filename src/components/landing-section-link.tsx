"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

export function LandingSectionLink({
    sectionId,
    className,
    children,
}: {
    sectionId: string;
    className?: string;
    children: ReactNode;
}) {
    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
        if (window.location.pathname !== "/") return;

        const section = document.getElementById(sectionId);
        if (!section) return;

        event.preventDefault();
        window.history.pushState(null, "", `#${sectionId}`);
        section.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    return <Link href={`/#${sectionId}`} className={className} onClick={handleClick}>{children}</Link>;
}
