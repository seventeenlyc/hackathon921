/** Latest concise, player-facing decision summary; never renders model text as HTML. */
export class DecisionSummary {
    private readonly panel: HTMLElement;
    private readonly status: HTMLElement;
    private readonly content: HTMLElement;

    constructor(panel: HTMLElement, status: HTMLElement, content: HTMLElement) {
        this.panel = panel;
        this.status = status;
        this.content = content;
    }

    setThinking(message: string): void {
        this.panel.setAttribute('data-state', 'planning');
        this.status.textContent = message;
        this.content.textContent = '';
    }

    setSummary(summary: string, status: string): void {
        const text = summary.trim();
        if (!text) return;
        this.panel.setAttribute('data-state', 'ready');
        this.status.textContent = status;
        this.content.textContent = text;
    }

    setUnavailable(message: string): void {
        this.panel.setAttribute('data-state', 'unavailable');
        this.status.textContent = message;
        this.content.textContent = '';
    }
}
