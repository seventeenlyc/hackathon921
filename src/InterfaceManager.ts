import {version} from './../package.json'
import {CanonTower} from "./entities/towers/CanonTower";
import {GatlingTower} from "./entities/towers/GatlingTower";
import {Tower} from "./entities/towers/Tower";
import {SniperTower} from "./entities/towers/SniperTower";
import {Map} from "./Map";
import {towerPlacer} from "./TowerPlacer";
import {Snackbar} from "./tools/Snackbar";
import {LaserTower} from "./entities/towers/LaserTower";
import {SlowTower} from "./entities/towers/SlowTower";
import {controls} from "./Controls";
import {queryParamsManager} from "./QueryParamsManager";
import {textureManager} from "./tools/TextureManager";
import {gameLoop, GameState, nextSpeed} from "./agent/GameLoop";
import {otherMode, playMode, switchPlayMode} from "./PlayMode";

class InterfaceManager {
    private versionElement = document.getElementById('version')!;
    private waveElement = document.getElementById('wave')!;
    private cashElement = document.getElementById('cash')!;
    private towersWrapperElement = document.getElementById('towers-wrapper')!;
    private towersStatsElement = document.getElementById('towers-stats')!;
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

        // The class scopes which half of the UI is visible (see styles.less).
        document.getElementById('inert')!.classList.add('mode-' + playMode);
        // The tower palette exists only where the human is the player; in AI mode
        // it is hidden and never populated (docs/PRODUCT_CONCEPT.md §5).
        if (playMode === 'human') this.setTowers();
        this.setupModeButton();
    }

    /** One button that restarts the game in the other play mode. */
    private setupModeButton() {
        const button = document.getElementById('mode') as HTMLButtonElement;
        const target = otherMode(playMode);
        button.textContent = `Switch to ${target} play`;
        button.title = `Restart the game in ${target} mode`;
        button.onclick = () => switchPlayMode(target);
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

    private setTowers() {
        const towers = [
            CanonTower,
            GatlingTower,
            SlowTower,
            SniperTower,
            LaserTower
        ];
        const pad = Map.TILE_SIZE * 0.5;
        const canvasSize = Map.TILE_SIZE + pad;

        towers.forEach(TowerClass => {
            const canvas = document.createElement('canvas');
            canvas.width = canvasSize;
            canvas.height = canvasSize;
            this.towersWrapperElement.insertAdjacentElement("beforeend", canvas);

            const ctx = canvas.getContext('2d')!;
            const tower = new TowerClass(0, 0, Map.TILE_SIZE);
            tower.setCoordinates(pad / 2, pad / 2);
            tower.draw(ctx);
            textureManager.onLoaded(tower.texturePath, () => tower.draw(ctx));

            canvas.onclick = () => {
                towerPlacer.place(TowerClass);
                this.showTowerStats(tower);
            };
        })
    }

    private showTowerStats(tower: Tower) {

        const damage = typeof tower.damage === 'object' ?
            `${tower.damage.min} - ${tower.damage.max}` :
            tower.damage;

        const reloadDuration = tower.reloadDurationMs / 1000;
        const dps = typeof tower.damage === 'object' ?
            `${(tower.damage.min / reloadDuration).toFixed(0)} - ${(tower.damage.max / reloadDuration).toFixed(0)}` :
            tower.damage / reloadDuration;

        // `damage` is either a number or a {min,max} range. The typeof guard keeps
        // the range-damage case (laser) from showing nonsense rows.
        this.towersStatsElement.innerHTML = `
            <div class="title">${tower.name}</div>
            <div class="description">${tower.description}</div>
            <table class="table5050">
                <tr><td>Cost: </td><td class="accent">${tower.cost} ¢</td></tr>
                <tr><td>Aim radius:</td><td class="accent">${tower.aimRadius}</td></tr>
                ${typeof tower.damage === 'number' && tower.damage > 0 ? `
                    <tr><td>Damage:</td><td class="accent">${damage}</td></tr>
                    <tr><td>Reload:</td><td class="accent">${reloadDuration.toFixed(3)} s</td></tr>
                    <tr><td title="Damage Per Second">DPS:</td><td class="accent">${dps}</td></tr>
                ` : ''}
            </table>
        `
    }

    showGameOver() {
        this.gameOverElement.classList.add('visible')
    }
}

export const interfaceManager = new InterfaceManager();
