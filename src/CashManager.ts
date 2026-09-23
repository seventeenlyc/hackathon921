import {initialBalance} from './config.json'
import {getLang} from './i18n';

/**
 * 资源值展示格式：中文界面用「万/亿」、英文界面用「K/M」缩位，
 * 保证 6 位以上的资源值在状态卡大字内完整可见（低于阈值显示原值）。
 */
export function formatBalance(value: number, lang: 'zh' | 'en'): string {
    const abs = Math.abs(value);
    if (lang === 'zh') {
        if (abs < 100000) return String(value);
        if (abs < 100000000) return `${(value / 10000).toFixed(1)}万`;
        return `${(value / 100000000).toFixed(2)}亿`;
    }
    if (abs < 100000) return String(value);
    if (abs < 1000000) return `${(value / 1000).toFixed(1)}K`;
    if (abs < 1000000000) return `${(value / 1000000).toFixed(2)}M`;
    return `${(value / 1000000000).toFixed(2)}B`;
}

class CashManager {
    private balance: number = initialBalance;

    constructor() {
        this.showBalance();
    }

    add(amount: number) {
        this.balance += amount;
        this.showBalance();
    }

    getBalance() {
        return this.balance;
    }

    /**
     * Directly set the balance. Used only by dev/QA mode to set the starting
     * tactical resources before a run; normal play never resets the balance.
     * Negative or non-integer values are rejected to protect the engine.
     */
    setBalance(amount: number): boolean {
        if (!Number.isInteger(amount) || amount < 0) return false;
        this.balance = amount;
        this.showBalance();
        return true;
    }

    canWithdraw(amount: number) {
        return this.balance - amount >= 0;
    }

    withdraw(amount: number): boolean {
        if (!this.canWithdraw(amount)) return false;
        this.balance -= amount;
        this.showBalance();
        return true;
    }

    private showBalance() {
        const cash = document.getElementById('cash');
        if (!cash) return;
        // 超过 10 万的缩位值切换小一号字，保证完整显示。
        cash.textContent = formatBalance(this.balance, getLang() === 'zh' ? 'zh' : 'en');
        cash.classList.toggle('compact', this.balance >= 100000);
    }
}

export const cashManager = new CashManager();
