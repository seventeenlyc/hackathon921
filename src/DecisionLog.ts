import type {DecisionEntry} from './agent/AgentRuntime';

/**
 * Read-only view of what the AI actually did (docs/USER_STORY.md「AI 行为的可读性」).
 *
 * It shows actions and outcomes, never the model's raw reasoning. All text goes
 * through `textContent` — the message originates from the model, which is
 * untrusted input (AGENTS.md).
 */
export class DecisionLog {
    private readonly list: HTMLElement;
    private readonly empty: HTMLElement | null;
    private readonly maxEntries = 12;

    constructor() {
        this.list = document.getElementById('decision-log') as HTMLElement;
        this.empty = document.getElementById('decision-empty');
    }

    add(entry: DecisionEntry) {
        const detail = entry.detail ? `${entry.detail} — ` : '';
        this.append(`Wave ${entry.wave} · ${entry.action}: ${detail}${entry.message}`, entry.ok ? 'ok' : 'rejected');
    }

    error(message: string) {
        this.append(message, 'error');
    }

    private append(text: string, kind: string) {
        const item = document.createElement('li');
        item.className = `decision ${kind}`;
        item.textContent = text;

        this.list.insertBefore(item, this.list.firstChild);
        while (this.list.children.length > this.maxEntries) {
            this.list.removeChild(this.list.lastChild as Node);
        }

        if (this.empty) this.empty.style.display = 'none';
    }
}

export const decisionLog = new DecisionLog();
