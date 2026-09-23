export interface PromptInput {
    version: number;
    prompt: string;
    fromWave: number;
}

export interface PromptNode extends PromptInput {
    id: string;
    runId: string;
    prevId: string | null;
    createdAt: number;
}

export type PromptWriteResult =
    | { recorded: true; version: number; fromWave: number }
    | { recorded: false; reason: string };

export interface BestRunPrompts {
    uid: number;
    username: string;
    runId: string | null;
    wave: number | null;
    prompts: PromptNode[];
}

export const MAX_PROMPT_LENGTH = 5000;
