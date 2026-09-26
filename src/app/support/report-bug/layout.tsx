import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Report a Bug",
  description: "Report a problem with AllyX to the support team. No login is required.",
  alternates: { canonical: "/support/report-bug" },
  robots: { index: false, follow: true },
};

export default function ReportBugLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
