import {
    sanitizeUsername,
    readUsernameCookie,
    writeUsernameCookie,
    readStoredLeaderboard,
    writeStoredLeaderboard,
    submitScore,
} from './LeaderboardStore';
import type { LeaderboardEntry } from './LeaderboardStore';
import { fetchSharedLeaderboard, syncReachedWave } from './LeaderboardClient';
import type { RemoteLeaderboard } from './LeaderboardClient';
import {onLangChange, t} from '../i18n';

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
        // 按钮只确认用户名；对局是 IDLE，玩家随后写 Prompt 再点「Start run」。
        // 不用 "Start" 以免被误认为开始游戏。
        this.overlay.innerHTML =
            '<form class="username-card">' +
                '<h2>' + t('gate.welcome') + '</h2>' +
                '<p>' + t('gate.prompt') + '</p>' +
                '<input type="text" maxlength="16" placeholder="' + t('gate.placeholder') + '"/>' +
                '<p class="error"></p>' +
                '<button type="submit">' + t('gate.continue') + '</button>' +
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
            this.errorEl.textContent = t('gate.invalid');
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
//
// 数据优先来自服务端**共享**排行榜，这样不同设备/浏览器的参与者看到的是同一份排名
// （docs/PRODUCT_CONCEPT.md §9）。API 不可用时回退到本地 localStorage，并在状态行
// 明确标注「Offline - local only」，避免把本机成绩误当成全局排名。
class LeaderboardPanel {
    private root: HTMLElement;
    private listEl: HTMLElement;
    private footerEl: HTMLElement;
    private statusEl: HTMLElement;
    private username: string | null;
    private remote: RemoteLeaderboard | null = null;
    private remoteFailed = false;
    private pendingRemote = false;

    constructor() {
        this.username = readUsernameCookie();
        this.root = document.createElement('div');
        this.root.className = 'leaderboard-panel';
        const title = document.createElement('div');
        title.className = 'leaderboard-title';
        title.textContent = t('lb.title');
        this.statusEl = document.createElement('div');
        this.statusEl.className = 'leaderboard-status';
        this.listEl = document.createElement('ol');
        this.listEl.className = 'leaderboard-list';
        this.footerEl = document.createElement('div');
        this.footerEl.className = 'leaderboard-footer';
        this.root.appendChild(title);
        this.root.appendChild(this.statusEl);
        this.root.appendChild(this.listEl);
        this.root.appendChild(this.footerEl);
        document.getElementById('inert')!.appendChild(this.root);
        this.render();
        // The panel is text-only, so a language switch just re-renders it.
        onLangChange(() => this.render());
        void this.refreshRemote();
    }

    setUsername(name: string) { this.username = name; this.render(); void this.refreshRemote(); }
    refresh() { this.username = readUsernameCookie() || this.username; this.render(); void this.refreshRemote(); }

    /** 拉取服务端共享排行榜；失败则标记离线并继续用本地数据渲染。 */
    private async refreshRemote(): Promise<void> {
        if (this.pendingRemote) return;
        this.pendingRemote = true;
        const result = await fetchSharedLeaderboard(this.username, TOP_N);
        this.pendingRemote = false;
        if (result) {
            this.remote = result;
            this.remoteFailed = false;
        } else {
            this.remote = null;
            this.remoteFailed = true;
        }
        this.render();
    }

    // 转义后以 textContent 渲染，禁止 innerHTML 直出不可信文本。
    private render() {
        const shared = this.remote != null;
        const local: LeaderboardEntry[] = readStoredLeaderboard() || [];
        const entries: LeaderboardEntry[] = shared
            ? this.remote!.entries.map(e => ({ username: e.username, wave: e.wave, timestamp: e.achievedAt }))
            : local;
        const top = entries.slice(0, TOP_N);
        this.listEl.textContent = '';
        if (top.length === 0) {
            const li = document.createElement('li');
            li.className = 'empty';
            li.textContent = t('lb.empty');
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
            waveSpan.textContent = t('lb.wave', {wave: e.wave});
            li.appendChild(rankSpan);
            li.appendChild(nameSpan);
            li.appendChild(waveSpan);
            this.listEl.appendChild(li);
        });

        if (shared) {
            this.statusEl.textContent = t('lb.shared');
            this.statusEl.classList.remove('offline');
        } else if (this.remoteFailed) {
            this.statusEl.textContent = t('lb.offline');
            this.statusEl.classList.add('offline');
        } else {
            this.statusEl.textContent = '';
            this.statusEl.classList.remove('offline');
        }

        if (this.username) {
            // 优先用服务端给出的名次；离线时回退到本地列表里的位置。
            let rank: number | null = null;
            if (shared && this.remote!.me) {
                rank = this.remote!.me.rank;
            } else {
                const idx = entries.findIndex(e => e.username.toLowerCase() === (this.username as string).toLowerCase());
                rank = idx >= 0 ? idx + 1 : null;
            }
            this.footerEl.textContent = t('lb.you', {name: this.username})
                + (rank != null ? t('lb.rank', {rank}) : t('lb.noRun'));
        } else {
            this.footerEl.textContent = '';
        }
    }
}

export const leaderboardPanel = new LeaderboardPanel();

export function submitRunScore(name: string, score: number): number | null {
    const clean = sanitizeUsername(name);
    if (!clean) return null;
    // 本地立即记录：保证离线时玩家仍能看到自己的成绩与名次。
    const stored = readStoredLeaderboard();
    const { entries, rank } = submitScore(clean, score, stored);
    writeStoredLeaderboard(entries);
    leaderboardPanel.refresh();
    // 再异步同步到服务端（共享排行榜的真值来源）；同步完成后刷新一次以拿到全局排名。
    void syncReachedWave(clean, score).then(() => leaderboardPanel.refresh());
    return rank;
}
