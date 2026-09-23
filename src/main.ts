import "./styles/styles.less";
// Instantiated for its side effects: constructing the game wires the AI runtime and
// exposes the programmatic control surface on `window.promptDefense`.
import './Game';
import { startHumanRun } from './Game';
import { strategyPanel } from "./StrategyPanel";
import { UsernameGate, leaderboardPanel } from './leaderboard/LeaderboardUI';
import { clearLegacyUsernameCookie, getSessionAvatar } from './leaderboard/SessionIdentity';
import { ensureSessionToken } from './leaderboard/LeaderboardClient';
import { playMode } from './PlayMode';
import { audioManager } from './AudioManager';

// Instantiated for its side effects (DOM binding) — see StrategyPanel.ts.
void strategyPanel;

// 清理旧版本的昵称 cookie，但不读取它；当前页面每次都必须重新确认昵称。
clearLegacyUsernameCookie();

// 用户名校验通过后只写入当前页面内存；排行榜面板在导入时即已挂载到左下角。
const gate = new UsernameGate((name) => {
    audioManager.startMusic();
    // 建立会话（AI 代理需要 token）但**不记分**：一局还没开始（IDLE），
    // 服务端第一次记录波次发生在第 1 波真正开始时。
    void ensureSessionToken(name, getSessionAvatar());
    leaderboardPanel.refresh();
    if (playMode === 'human') {
        startHumanRun(name);
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => gate.show());
} else {
    gate.show();
}
