import { ConfirmDialogProvider } from "@/components/confirm-dialog";

export default function InterviewLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return <ConfirmDialogProvider>{children}</ConfirmDialogProvider>;
}
