import "./styles/styles.less";
// Instantiated for its side effects: constructing the game wires the hosted-game
// session and exposes the control surface on `window.promptDefense`.
import './Game';
import { openHostedGame } from './Game';
import { strategyPanel } from "./StrategyPanel";
import { UsernameGate, leaderboardPanel } from './leaderboard/LeaderboardUI';
import { readUsernameCookie } from './leaderboard/LeaderboardStore';
import { ensureSessionToken } from './leaderboard/LeaderboardClient';
import { playMode } from './PlayMode';

// Instantiated for its side effects (DOM binding) — see StrategyPanel.ts.
void strategyPanel;

// 首次进入：若本地没有已保存的用户名（cookie），弹出提示输入用户名（无需密码）。
// 用户名校验通过后写入 cookie，排行榜面板在 LeaderboardUI 导入时即已挂载到左下角。
const gate = new UsernameGate((name) => {
    // 建立会话后打开服务端托管对局（浏览器此时不再自己模拟）。
    void ensureSessionToken(name).then(() => openHostedGame());
    leaderboardPanel.refresh();
});

// 人类模式不入榜、不需要昵称：直接用匿名会话打开对局。
if (playMode === 'ai' && !readUsernameCookie()) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => gate.show());
    } else {
        gate.show();
    }
} else {
    void openHostedGame();
}
