import {
    sanitizeUsername,
    readStoredLeaderboard,
    writeStoredLeaderboard,
    submitScore,
    entriesForBoard,
} from './LeaderboardStore';
import type { LeaderboardEntry, PlayMode, LeaderboardMode } from './LeaderboardStore';
import {getSessionUsername, setSessionUsername, setSessionAvatar} from './SessionIdentity';
import {AVATARS, isKnownAvatarId, randomAvatarId} from './AvatarCatalog';
import type {AvatarId} from './AvatarCatalog';
import {AVATAR_SRC} from './avatarAssets';
import { fetchSharedLeaderboard } from './LeaderboardClient';
import type { RemoteLeaderboard } from './LeaderboardClient';
import {runSync} from './RunSync';
import {PromptHistoryDialog} from './PromptHistoryDialog';
import {onLangChange, t} from '../i18n';
import {playMode} from '../PlayMode';

const TOP_N = 10;

// 登录浮窗：AI 模式每次页面加载都要求确认作战档案；昵称与头像只活在当前页面内存。
// 浮窗装饰文案（顶部条/标题/分区编号/底条）是固定双语视觉元素，zh/en 同值地收敛在 i18n 表里。
export class UsernameGate {
    private overlay: HTMLElement;
    private input: HTMLInputElement;
    private errorEl: HTMLElement;
    private counterEl: HTMLElement;
    private selectedAvatar: AvatarId;
    private onDone: (name: string) => void;

    constructor(onDone: (name: string) => void) {
        this.onDone = onDone;
        this.selectedAvatar = randomAvatarId();
        this.overlay = document.createElement('div');
        this.overlay.className = 'username-overlay';
        this.overlay.innerHTML = this.buildTemplate();
        this.input = this.overlay.querySelector('input') as HTMLInputElement;
        this.errorEl = this.overlay.querySelector('.error') as HTMLElement;
        this.counterEl = this.overlay.querySelector('.gate-counter') as HTMLElement;
        const form = this.overlay.querySelector('form') as HTMLFormElement;
        form.addEventListener('submit', (e) => { e.preventDefault(); this.handleSubmit(); });
        this.input.addEventListener('input', () => {
            this.errorEl.textContent = '';
            this.updateCounter();
        });
        const grid = this.overlay.querySelector('.gate-avatar-grid') as HTMLElement;
        grid.addEventListener('click', (e) => {
            const target = (e.target as HTMLElement).closest('.gate-avatar') as HTMLElement | null;
            const id = target?.getAttribute('data-avatar-id');
            if (id && isKnownAvatarId(id)) this.selectAvatar(id);
        });
        const randomButton = this.overlay.querySelector('.gate-random') as HTMLButtonElement;
        randomButton.addEventListener('click', () => this.selectAvatar(randomAvatarId()));
        this.selectAvatar(this.selectedAvatar);
    }

    // 全部走受控 i18n 字典与代码常量；用户输入只经 value/textContent，不进 innerHTML。
    private buildTemplate(): string {
        const cards = AVATARS.map((avatar) =>
            '<button type="button" class="gate-avatar" role="radio" aria-checked="false"'
            + ' data-avatar-id="' + avatar.id + '"'
            + ' aria-label="' + t(avatar.nameKey) + ' ' + avatar.romaji + '">'
            + '<img src="' + AVATAR_SRC[avatar.id] + '" alt=""/>'
            + '<span class="gate-avatar-name">' + t(avatar.nameKey) + '</span>'
            + '<span class="gate-avatar-romaji">' + avatar.romaji + '</span>'
            + '</button>').join('');
        return (
            '<form class="username-card">'
            + '<header class="gate-topbar">'
            + '<div class="gate-topbar-brand"><span class="gate-brand">' + t('gate.brand') + '</span>'
            + '<span class="gate-brand-sub">' + t('gate.brandSub') + '</span></div>'
            + '<span class="gate-online">' + t('gate.systemOnline') + '</span>'
            + '</header>'
            + '<div class="gate-heading"><h2>' + t('gate.title') + '</h2><p>' + t('gate.titleSub') + '</p></div>'
            + '<div class="gate-intro"><h3>' + t('gate.identTitle') + '</h3>'
            + '<p>' + t('gate.identEn') + '</p>'
            + '<p>' + t('gate.identZh') + '</p></div>'
            + '<section class="gate-section"><h3 class="gate-section-title">' + t('gate.profileTitle') + '</h3>'
            + '<p class="gate-section-sub">' + t('gate.profileSub') + '</p>'
            + '<div class="gate-avatar-grid" role="radiogroup" aria-label="' + t('gate.profileSub') + '">' + cards + '</div>'
            + '</section>'
            + '<section class="gate-section"><h3 class="gate-section-title">' + t('gate.codenameTitle') + '</h3>'
            + '<p class="gate-section-sub">' + t('gate.codenameSub') + '</p>'
            + '<div class="gate-codename-row">'
            + '<input type="text" maxlength="16" placeholder="' + t('gate.placeholder') + '"/>'
            + '<span class="gate-counter">0 / 16</span>'
            + '</div></section>'
            + '<p class="error"></p>'
            + '<div class="gate-actions">'
            + '<button type="button" class="gate-random">' + t('gate.random') + '</button>'
            // 按钮只确认档案；对局是 IDLE，玩家随后写 Prompt 再点「下达命令并开始行动」。
            + '<button type="submit" class="gate-submit">' + t('gate.continue') + '</button>'
            + '</div>'
            + '<footer class="gate-footer"><span>' + t('gate.footerLeft') + '</span>'
            + '<span>' + t('gate.footerRight') + '</span></footer>'
            + '</form>');
    }

    private selectAvatar(id: AvatarId) {
        this.selectedAvatar = id;
        this.overlay.querySelectorAll('.gate-avatar').forEach((el) => {
            const button = el as HTMLButtonElement;
            const active = button.getAttribute('data-avatar-id') === id;
            button.classList.toggle('is-selected', active);
            button.setAttribute('aria-checked', active ? 'true' : 'false');
        });
    }

    private updateCounter() {
        this.counterEl.textContent = this.input.value.length + ' / 16';
    }

    private handleSubmit() {
        const name = sanitizeUsername(this.input.value);
        if (!name) {
            this.errorEl.textContent = t('gate.invalid');
            return;
        }
        if (!setSessionAvatar(this.selectedAvatar)) {
            this.errorEl.textContent = t('gate.invalid');
            return;
        }
        if (!setSessionUsername(name)) {
            this.errorEl.textContent = t('gate.invalid');
            return;
        }
        this.hide();
        this.onDone(name);
    }

    // 浮窗每次打开都随机预选一个头像；样式必须保持 scoped 在 #inert 下（见 leaderboard-ui 测试）。
    show() {
        this.selectAvatar(randomAvatarId());
        document.getElementById('inert')!.appendChild(this.overlay);
        this.input.focus();
    }
    hide() { if (this.overlay.parentNode) this.overlay.remove(); }
    get visible(): boolean { return !!this.overlay.parentNode; }
}

// 排行榜面板（界面左下角）：前十 + 用户当前排名，登上前十高亮。
//
// 数据优先来自服务端**共享**排行榜，这样不同设备/浏览器的参与者看到的是同一份排名
// （docs/PRODUCT_CONCEPT.md §9）。API 不可用时回退到本地 localStorage，并在状态行
// 明确标注「Offline - local only」，避免把本机成绩误当成全局排名。
export class LeaderboardPanel {
    private root: HTMLElement;
    private listEl: HTMLElement;
    private footerEl: HTMLElement;
    private statusEl: HTMLElement;
    private retryButton: HTMLButtonElement;
    public modeButton: HTMLButtonElement;
    public currentMode: LeaderboardMode = playMode === 'human' ? 'human' : 'ai';
    private username: string | null;
    private remote: RemoteLeaderboard | null = null;
    private remoteFailed = false;
    private pendingRemote = false;
    private syncFailed = false;
    private remoteRequestNumber = 0;
    private readonly historyDialog: PromptHistoryDialog;

    constructor() {
        this.username = getSessionUsername();
        this.root = document.createElement('section');
        this.root.className = 'leaderboard-panel';
        this.root.setAttribute('aria-labelledby', 'leaderboard-title');
        const title = document.createElement('h2');
        title.id = 'leaderboard-title';
        title.className = 'leaderboard-title';
        title.textContent = t('lb.title');
        this.modeButton = document.createElement('button');
        this.modeButton.type = 'button';
        this.modeButton.className = 'leaderboard-mode-toggle';
        this.modeButton.addEventListener('click', () => this.cycleMode());
        this.statusEl = document.createElement('div');
        this.statusEl.className = 'leaderboard-status';
        this.retryButton = document.createElement('button');
        this.retryButton.type = 'button';
        this.retryButton.className = 'leaderboard-retry';
        this.retryButton.addEventListener('click', () => runSync.retryPending());
        this.historyDialog = new PromptHistoryDialog();
        this.listEl = document.createElement('ol');
        this.listEl.className = 'leaderboard-list';
        this.footerEl = document.createElement('div');
        this.footerEl.className = 'leaderboard-footer';
        this.root.appendChild(title);
        this.root.appendChild(this.modeButton);
        this.root.appendChild(this.statusEl);
        this.root.appendChild(this.retryButton);
        this.root.appendChild(this.listEl);
        this.root.appendChild(this.footerEl);
        const slot = document.getElementById('leaderboard-slot');
        if (slot) {
            slot.appendChild(this.root);
        } else {
            document.getElementById('inert')!.appendChild(this.root);
        }
        this.render();
        runSync.onStatus(status => {
            this.syncFailed = status.state === 'failed';
            this.render();
        });
        runSync.onDrained(() => this.refresh());
        // The panel is text-only, so a language switch just re-renders it.
        onLangChange(() => this.render());
        void this.refreshRemote();
    }

    private cycleMode(): void {
        if (playMode === 'human') {
            // human -> ai -> total -> human
            this.currentMode = this.currentMode === 'human' ? 'ai' : this.currentMode === 'ai' ? 'total' : 'human';
        } else {
            // ai -> human -> total -> ai
            this.currentMode = this.currentMode === 'ai' ? 'human' : this.currentMode === 'human' ? 'total' : 'ai';
        }
        this.refresh(this.currentMode);
    }

    setUsername(name: string) { this.username = name; this.render(); void this.refreshRemote(); }
    async refresh(mode?: LeaderboardMode): Promise<void> {
        if (mode) this.currentMode = mode;
        this.username = getSessionUsername();
        this.render();
        await this.refreshRemote();
    }

    /** 拉取服务端共享排行榜；失败则标记离线并继续用本地数据渲染。 */
    private async refreshRemote(): Promise<void> {
        const requestNumber = ++this.remoteRequestNumber;
        this.pendingRemote = true;
        const result = await fetchSharedLeaderboard(this.username, this.currentMode, TOP_N);
        if (requestNumber !== this.remoteRequestNumber) return;
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
        const modeLabel = this.currentMode === 'ai'
            ? t('lb.boardAi')
            : this.currentMode === 'human'
              ? t('lb.boardHuman')
              : t('lb.boardTotal');
        this.modeButton.textContent = modeLabel;

        const shared = this.remote != null;
        const local: LeaderboardEntry[] = entriesForBoard(readStoredLeaderboard() || [], this.currentMode);
        const entries: LeaderboardEntry[] = shared
            ? this.remote!.entries.map(e => ({ username: e.username, wave: e.wave, timestamp: e.achievedAt, mode: e.mode }))
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

            const modeSpan = document.createElement('span');
            modeSpan.className = 'mode-tag mode-' + e.mode;
            modeSpan.textContent = e.mode === 'human' ? t('lb.modeHuman') : t('lb.modeAi');

            li.appendChild(rankSpan);
            li.appendChild(modeSpan);

            if (e.mode === 'ai') {
                const nameButton = document.createElement('button');
                nameButton.type = 'button';
                nameButton.className = 'name';
                nameButton.textContent = e.username;
                nameButton.setAttribute('aria-label', t('history.open', {name: e.username}));
                nameButton.addEventListener('click', () => { void this.historyDialog.open(e.username); });
                li.appendChild(nameButton);
            } else {
                const nameSpan = document.createElement('span');
                nameSpan.className = 'name';
                nameSpan.textContent = e.username;
                li.appendChild(nameSpan);
            }

            const waveSpan = document.createElement('span');
            waveSpan.className = 'wave';
            waveSpan.textContent = t('lb.wave', {wave: e.wave});
            li.appendChild(waveSpan);
            this.listEl.appendChild(li);
        });

        if (this.syncFailed) {
            this.statusEl.textContent = t('lb.syncFailed');
            this.statusEl.classList.add('offline');
        } else if (shared) {
            this.statusEl.textContent = t('lb.shared');
            this.statusEl.classList.remove('offline');
        } else if (this.remoteFailed) {
            this.statusEl.textContent = t('lb.offline');
            this.statusEl.classList.add('offline');
        } else {
            this.statusEl.textContent = '';
            this.statusEl.classList.remove('offline');
        }
        this.retryButton.hidden = !this.syncFailed;
        this.retryButton.textContent = t('lb.retrySync');

        if (this.username) {
            // 优先用服务端给出的名次；离线时回退到本地列表里的位置。
            let rank: number | null = null;
            if (shared && this.remote!.me) {
                rank = this.remote!.me.rank;
            } else {
                const idx = entries.findIndex(e => e.username.toLowerCase() === (this.username as string).toLowerCase());
                rank = idx >= 0 ? idx + 1 : null;
            }
            let footerText = t('lb.you', {name: this.username});
            if (rank != null) {
                footerText += t('lb.rank', {rank});
                if (this.currentMode === 'total') {
                    const myMode = shared && this.remote!.me && this.remote!.me.mode
                        ? this.remote!.me.mode
                        : (entries.find(e => e.username.toLowerCase() === (this.username as string).toLowerCase())?.mode ?? 'ai');
                    footerText += ` (${myMode === 'human' ? t('lb.modeHuman') : t('lb.modeAi')})`;
                }
            } else {
                footerText += t('lb.noRun');
            }
            this.footerEl.textContent = footerText;
        } else {
            this.footerEl.textContent = '';
        }
    }
}

export const leaderboardPanel = new LeaderboardPanel();

export function submitRunScore(name: string, score: number, mode: PlayMode = 'ai'): number | null {
    const clean = sanitizeUsername(name);
    if (!clean) return null;
    // 本地立即记录：保证离线时玩家仍能看到自己的成绩与名次。
    const stored = readStoredLeaderboard();
    const { entries, rank } = submitScore(clean, score, stored, mode);
    writeStoredLeaderboard(entries);
    leaderboardPanel.refresh();
    // 再异步同步到服务端（共享排行榜的真值来源）；同步完成后刷新一次以拿到全局排名。
    runSync.enqueueWave(clean, score, mode);
    return rank;
}
