export function appendNovelTranscript(existing: string, incoming: string): string;

export type LiveQuestionState = {
    append(text: string): string;
    current(): string;
    consume(): string;
    clear(): void;
};

export function createLiveQuestionState(): LiveQuestionState;
