import './Game';
import { UsernameGate, leaderboardPanel } from './leaderboard/LeaderboardUI';
import { readUsernameCookie } from './leaderboard/LeaderboardStore';

// 首次进入：若本地没有已保存的用户名（cookie），弹出提示输入用户名（无需密码）。
// 用户名校验通过后写入 cookie，排行榜面板在 LeaderboardUI 导入时即已挂载到左下角。
const gate = new UsernameGate(() => {
    // cookie 已由 gate 写入；刷新面板（从 cookie 重新读取当前用户名）。
    leaderboardPanel.refresh();
});

if (!readUsernameCookie()) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => gate.show());
    } else {
        gate.show();
    }
}
