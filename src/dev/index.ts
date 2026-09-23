// 开发模式单例：把 DevController 接到本项目的页面会话 token 与默认战术资源上。
//
// 单独成文件，避免 DevController 自身引入对 LeaderboardClient / config.json 的依赖，
// 这样 DevController 的状态机与校验逻辑可以脱离浏览器单独测试。
import {initialBalance} from '../config.json';
import {DevController} from './DevController';
import {getSessionToken} from '../leaderboard/LeaderboardClient';

export const devController = new DevController(getSessionToken, { defaultStartCash: initialBalance });

export {
    DevController,
    DEV_MIN_START_WAVE,
    DEV_MAX_START_WAVE,
    DEV_MAX_START_CASH,
} from './DevController';
export type {
    DevState,
    DevConfig,
    DevUnlockReason,
    DevConfigReason,
    DevTransport,
    DevFetchResult,
} from './DevController';
