// 最小 Node 运行时类型垫片。
//
// 本项目刻意不安装 @types/node（见根 tsconfig.json 的注释）：那样会让浏览器代码也看到
// process / Buffer 等 Node 全局。后端只用到很小的 API 面，因此在后端专属的
// tsconfig.server.json 里（types: []）本地声明即可，前端类型检查完全不受影响。
//
// 这些声明刻意宽松（any）：后端自身的数据模型仍有严格类型，Node 调用点不追求完整类型面。

declare module 'node:http' {
    export function createServer(handler: (req: any, res: any) => void): any;
}

declare module 'node:sqlite' {
    export const DatabaseSync: any;
}

declare module 'node:crypto' {
    export function createHmac(algorithm: string, key: any): any;
    export function timingSafeEqual(a: any, b: any): boolean;
    export function randomBytes(size: number): any;
}

declare module 'node:fs' {
    export function readFileSync(path: string, encoding: string): string;
    export function existsSync(path: string): boolean;
    export function realpathSync(path: string): string;
}

declare module 'node:test' {
    export function test(name: string, fn: () => void | Promise<void>): void;
}

declare module 'node:assert/strict' {
    const assert: any;
    export default assert;
}

declare const process: any;
declare const Buffer: any;
declare const AbortController: any;
declare function setInterval(callback: () => void, ms: number): any;
declare function clearInterval(handle: any): void;
declare function setTimeout(callback: () => void, ms: number): any;
declare function clearTimeout(handle: any): void;
declare function fetch(input: any, init?: any): Promise<any>;
declare const console: {
    log(...args: any[]): void;
    error(...args: any[]): void;
};
