import {version} from './../package.json'
import {Snackbar} from "./tools/Snackbar";
import {controls} from "./Controls";
import {queryParamsManager} from "./QueryParamsManager";
import {gameLoop, GameState} from "./agent/GameLoop";
import {getControlLayer} from "./ControlLayer";

class InterfaceManager {
    private versionElement = document.getElementById('version')!;
    private waveElement = document.getElementById('wave')!;
    private cashElement = document.getElementById('cash')!;
    private stateElement = document.getElementById('state')!;
    private speedElement = document.getElementById('speed')!;
    private gameOverElement = document.getElementById('game-over')!;
    private pauseButton = document.getElementById('pause') as HTMLButtonElement;
    private resumeButton = document.getElementById('resume') as HTMLButtonElement;
    private controlLayer = getControlLayer();
    public snackbar = new Snackbar();

    constructor() {
        this.versionElement.textContent = 'v' + version;
        controls.on('focusout', this.showFocusLost.bind(this));
        controls.on('focusin', this.hideFocusLost.bind(this));

        if(!controls.tabHasFocus()) {
            this.showFocusLost()
        }

        document.getElementById('spawner' + queryParamsManager.getDifficulty())!.classList.add('active')

        this.pauseButton.onclick = () => gameLoop.pause();
        this.resumeButton.onclick = () => {
            gameLoop.resume();
            this.controlLayer.hide();
        };
        this.speedElement.onclick = () => {
            gameLoop.setSpeed(gameLoop.speed === 1 ? 2 : 1);
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
        this.stateElement.textContent = state.toUpperCase();
        this.pauseButton.hidden = state !== 'running';
        this.resumeButton.hidden = state !== 'paused';
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
