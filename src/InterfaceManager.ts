import {version} from './../package.json'
import {Snackbar} from "./tools/Snackbar";
import {controls} from "./Controls";
import {queryParamsManager} from "./QueryParamsManager";
import {gameLoop, GameState, nextSpeed} from "./agent/GameLoop";

class InterfaceManager {
    private versionElement = document.getElementById('version')!;
    private waveElement = document.getElementById('wave')!;
    private cashElement = document.getElementById('cash')!;
    private stateElement = document.getElementById('state')!;
    private speedElement = document.getElementById('speed')!;
    private gameOverElement = document.getElementById('game-over')!;
    public snackbar = new Snackbar();

    constructor() {
        this.versionElement.textContent = 'v' + version;
        controls.on('focusout', this.showFocusLost.bind(this));
        controls.on('focusin', this.hideFocusLost.bind(this));

        if(!controls.tabHasFocus()) {
            this.showFocusLost()
        }

        document.getElementById('spawner' + queryParamsManager.getDifficulty())!.classList.add('active')

        document.getElementById('pause')!.onclick = () => gameLoop.pause();
        document.getElementById('resume')!.onclick = () => gameLoop.resume();
        this.speedElement.onclick = () => {
            gameLoop.setSpeed(nextSpeed(gameLoop.speed));
            this.updateSpeedLabel();
        };

        gameLoop.onChange(state => this.setState(state));
        this.setState(gameLoop.state);
        this.updateSpeedLabel();
    }

    showFocusLost() {
        this.snackbar.hide();
        this.snackbar.setText('Focus as been lost, click on the window to continue.');
        this.snackbar.show()
    }

    hideFocusLost() {
        this.snackbar.hide();
    }

    setWave(wave: number) {
        this.waveElement.textContent = String(wave);
    }

    setState(state: GameState) {
        // `idle` is the not-started state shown before the player presses Start.
        this.stateElement.textContent = state === 'idle' ? 'NOT STARTED' : state.toUpperCase();
    }

    updateSpeedLabel() {
        this.speedElement.textContent = `Speed x${gameLoop.speed}`;
    }

    setCash(cash: number) {
        this.cashElement.textContent = String(cash);
    }

    showGameOver() {
        this.gameOverElement.classList.add('visible')
    }
}

export const interfaceManager = new InterfaceManager();
