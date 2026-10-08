"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

const DesktopNavBar = dynamic(
    () => import("@/components/desktop-nav").then(module => module.DesktopNavBar),
    { ssr: false },
);

const subscribe = () => () => undefined;
const getDesktopSnapshot = () => Boolean(window.electronAPI?.isElectron);
const getServerSnapshot = () => false;

/** Loads native-only controls only inside the installed Electron app. */
export function DesktopChrome() {
    const isDesktop = useSyncExternalStore(subscribe, getDesktopSnapshot, getServerSnapshot);

    return isDesktop ? <DesktopNavBar /> : null;
}
