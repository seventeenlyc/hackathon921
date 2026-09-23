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
