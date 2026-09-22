import "./styles/styles.less";
// Instantiated for its side effects: constructing the game wires the AI runtime and
// exposes the programmatic control surface on `window.promptDefense`.
import './Game';
import { strategyPanel } from "./StrategyPanel";
import { UsernameGate, leaderboardPanel } from './leaderboard/LeaderboardUI';
import { readUsernameCookie } from './leaderboard/LeaderboardStore';
import { ensureSessionToken } from './leaderboard/LeaderboardClient';

// Instantiated for its side effects (DOM binding) — see StrategyPanel.ts.
void strategyPanel;

// 首次进入：若本地没有已保存的用户名（cookie），弹出提示输入用户名（无需密码）。
// 用户名校验通过后写入 cookie，排行榜面板在 LeaderboardUI 导入时即已挂载到左下角。
const gate = new UsernameGate((name) => {
    // 建立会话（AI 代理需要 token）但**不记分**：一局还没开始（IDLE），
    // 服务端第一次记录波次发生在第 1 波真正开始时。
    void ensureSessionToken(name);
    leaderboardPanel.refresh();
});

if (!readUsernameCookie()) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => gate.show());
    } else {
        gate.show();
    }
}
