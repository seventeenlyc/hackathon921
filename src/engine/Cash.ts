/**
 * Per-game cash balance.
 *
 * The browser build's `CashManager` wrote to the DOM from its constructor
 * (`interfaceManager.setCash`), so importing it required a document. The engine
 * version is pure: hosts subscribe with `onChange` and decide how to display it.
 */
export class Cash {
    private balance: number;
    private readonly listeners: Array<(balance: number) => void> = [];

    constructor(initialBalance: number) {
        this.balance = initialBalance;
    }

    add(amount: number) {
        this.balance += amount;
        this.notify();
    }

    getBalance() {
        return this.balance;
    }

    canWithdraw(amount: number) {
        return this.balance - amount >= 0;
    }

    withdraw(amount: number) {
        if (this.canWithdraw(amount)) {
            this.balance -= amount;
            this.notify();
        }
    }

    onChange(listener: (balance: number) => void) {
        this.listeners.push(listener);
    }

    private notify() {
        this.listeners.forEach(listener => listener(this.balance));
    }
}
