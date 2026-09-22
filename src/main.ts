import "./styles/styles.less";
import { game } from './Game';
import { UsernameGate, leaderboardPanel } from './leaderboard/LeaderboardUI';
import { readUsernameCookie } from './leaderboard/LeaderboardStore';

// 首次进入：若本地没有已保存的用户名（cookie），弹出提示输入用户名（无需密码）。
// 用户名校验通过后写入 cookie，排行榜面板在 LeaderboardUI 导入时即已挂载到左下角。
const gate = new UsernameGate(() => {
    // 首次输入用户名时，立即计入本局已到达的波次。
    game.recordReachedWave();
    leaderboardPanel.refresh();
});

if (!readUsernameCookie()) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => gate.show());
    } else {
        gate.show();
    }
}
