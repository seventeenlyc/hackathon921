import {
    sanitizeUsername,
    readUsernameCookie,
    writeUsernameCookie,
    readStoredLeaderboard,
    writeStoredLeaderboard,
    submitScore,
} from './LeaderboardStore';

const TOP_N = 10;

// 用户名弹窗：首次进入（无 cookie）时提示输入用户名（无需密码），校验后写入 cookie。
export class UsernameGate {
    private overlay: HTMLElement;
    private input: HTMLInputElement;
    private errorEl: HTMLElement;
    private onDone: (name: string) => void;

    constructor(onDone: (name: string) => void) {
        this.onDone = onDone;
        this.overlay = document.createElement('div');
        this.overlay.className = 'username-overlay';
        this.overlay.innerHTML =
            '<form class="username-card">' +
                '<h2>Welcome!</h2>' +
                '<p>Pick a username for the leaderboard.</p>' +
                '<input type="text" maxlength="16" placeholder="Your name"/>' +
                '<p class="error"></p>' +
                '<button type="submit">Start</button>' +
            '</form>';
        this.input = this.overlay.querySelector('input') as HTMLInputElement;
        this.errorEl = this.overlay.querySelector('.error') as HTMLElement;
        const form = this.overlay.querySelector('form') as HTMLFormElement;
        form.addEventListener('submit', (e) => { e.preventDefault(); this.handleSubmit(); });
        this.input.addEventListener('input', () => { this.errorEl.textContent = ''; });
    }

    private handleSubmit() {
        const name = sanitizeUsername(this.input.value);
        if (!name) {
            this.errorEl.textContent = 'Invalid name (1-16 chars, letters/digits/_/-).';
            return;
        }
        writeUsernameCookie(name);
        this.hide();
        this.onDone(name);
    }

    show() { document.getElementById('inert')!.appendChild(this.overlay); this.input.focus(); }
    hide() { if (this.overlay.parentNode) this.overlay.remove(); }
    get visible(): boolean { return !!this.overlay.parentNode; }
}

// 排行榜面板（界面左下角）：前十 + 用户当前排名，登上前十高亮。
class LeaderboardPanel {
    private root: HTMLElement;
    private listEl: HTMLElement;
    private footerEl: HTMLElement;
    private username: string | null;

    constructor() {
        this.username = readUsernameCookie();
        this.root = document.createElement('div');
        this.root.className = 'leaderboard-panel';
        const title = document.createElement('div');
        title.className = 'leaderboard-title';
        title.textContent = 'Leaderboard';
        this.listEl = document.createElement('ol');
        this.listEl.className = 'leaderboard-list';
        this.footerEl = document.createElement('div');
        this.footerEl.className = 'leaderboard-footer';
        this.root.appendChild(title);
        this.root.appendChild(this.listEl);
        this.root.appendChild(this.footerEl);
        document.getElementById('inert')!.appendChild(this.root);
        this.render();
    }

    setUsername(name: string) { this.username = name; this.render(); }
    refresh() { this.username = readUsernameCookie() || this.username; this.render(); }

    // 转义后以 textContent 渲染，禁止 innerHTML 直出不可信文本。
    private render() {
        const all = readStoredLeaderboard();
        const entries = all || [];
        const top = entries.slice(0, TOP_N);
        this.listEl.textContent = '';
        if (top.length === 0) {
            const li = document.createElement('li');
            li.className = 'empty';
            li.textContent = 'No scores yet - play a run!';
            this.listEl.appendChild(li);
        }
        const ownLower = this.username ? this.username.toLowerCase() : null;
        top.forEach((e, i) => {
            const li = document.createElement('li');
            const isMe = ownLower != null && e.username.toLowerCase() === ownLower;
            if (isMe) li.className = 'me';
            const rankSpan = document.createElement('span');
            rankSpan.className = 'rank';
            rankSpan.textContent = String(i + 1);
            const nameSpan = document.createElement('span');
            nameSpan.className = 'name';
            nameSpan.textContent = e.username;
            const waveSpan = document.createElement('span');
            waveSpan.className = 'wave';
            waveSpan.textContent = 'Wave ' + e.wave;
            li.appendChild(rankSpan);
            li.appendChild(nameSpan);
            li.appendChild(waveSpan);
            this.listEl.appendChild(li);
        });
        if (this.username) {
            const idx = entries.findIndex(e => e.username.toLowerCase() === (this.username as string).toLowerCase());
            const rank = idx >= 0 ? idx + 1 : null;
            this.footerEl.textContent = 'You: ' + this.username + (rank != null ? ' - #' + rank : ' (no run yet)');
        } else {
            this.footerEl.textContent = '';
        }
    }
}

export const leaderboardPanel = new LeaderboardPanel();

export function submitRunScore(name: string, score: number): number | null {
    const clean = sanitizeUsername(name);
    if (!clean) return null;
    const stored = readStoredLeaderboard();
    const { entries, rank } = submitScore(clean, score, stored);
    writeStoredLeaderboard(entries);
    leaderboardPanel.refresh();
    return rank;
}