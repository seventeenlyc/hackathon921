import "./styles/styles.less";
// Instantiated for its side effects: constructing the game wires the AI runtime and
// exposes the programmatic control surface on `window.promptDefense`.
import './Game';
import { strategyPanel } from "./StrategyPanel";
import { UsernameGate, leaderboardPanel } from './leaderboard/LeaderboardUI';
import { clearLegacyUsernameCookie } from './leaderboard/SessionIdentity';
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
    void ensureSessionToken(name);
    leaderboardPanel.refresh();
});

// 人类模式不写排行榜，也就不需要昵称；直接开始上游 inert 的玩法。
if (playMode === 'ai') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => gate.show());
    } else {
        gate.show();
    }
}
