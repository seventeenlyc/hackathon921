import {initialBalance} from './config.json'

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
        if (cash) cash.textContent = String(this.balance);
    }
}

export const cashManager = new CashManager();
