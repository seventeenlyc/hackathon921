import {version} from './../package.json'
import {Snackbar} from "./tools/Snackbar";
import {LaserTower} from "./entities/towers/LaserTower";
import {SlowTower} from "./entities/towers/SlowTower";
import {textureManager} from "./tools/TextureManager";
import {gameLoop, GameState, nextSpeed} from "./agent/GameLoop";
import {otherMode, playMode, switchPlayMode} from "./PlayMode";
import {requestSpawnCount, spawnSettings} from "./SpawnQueue";
import {CanonTower} from "./entities/towers/CanonTower";
import {GatlingTower} from "./entities/towers/GatlingTower";
import {SniperTower} from "./entities/towers/SniperTower";
import {Tower} from "./entities/towers/Tower";
import {Map} from "./Map";
import {towerPlacer} from "./TowerPlacer";
import {getControlLayer} from "./ControlLayer";

/** Summary shown on the settlement screen after the base falls. */
export interface RunStats {
    wave: number;
    towers: { total: number; byType: Array<{ type: string; count: number }> };
    cash: number;
    decisions: number;
    durationMs: number;
    rank: number | null;
}

function setText(id: string, text: string) {
    const element = document.getElementById(id);
    if (element) element.textContent = text;
}

function formatDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

class InterfaceManager {
    private versionElement = document.getElementById('version')!;
    private waveElement = document.getElementById('wave')!;
    private waveDelayElement = document.getElementById('delay')!;
    private cashElement = document.getElementById('cash')!;
    private towersWrapperElement = document.getElementById('towers-wrapper')!;
    private towersStatsElement = document.getElementById('towers-stats')!;
    private stateElement = document.getElementById('state')!;
    private speedElement = document.getElementById('speed')!;
    private gameOverElement = document.getElementById('game-over')!;
    private pauseButton = document.getElementById('pause') as HTMLButtonElement;
    private resumeButton = document.getElementById('resume') as HTMLButtonElement;
    private controlLayer = getControlLayer();
    public snackbar = new Snackbar();

    constructor() {
        this.versionElement.textContent = 'v' + version;

        // Lane count is queued, not applied here: the change lands at the next wave
        // boundary so the AI's PLANNING round actually sees the new route (#40).
        document.querySelectorAll<HTMLButtonElement>('button.spawner').forEach(button => {
            button.onclick = () => {
                requestSpawnCount(Number(button.dataset.count));
                this.renderSpawners();
            };
        });

        this.pauseButton.onclick = () => gameLoop.pause();
        this.resumeButton.onclick = () => {
            gameLoop.resume();
            this.controlLayer.hide();
        };
        this.speedElement.onclick = () => {
            gameLoop.setSpeed(nextSpeed(gameLoop.speed));
            this.updateSpeedLabel();
        };

        gameLoop.onChange(state => {
            this.setState(state);
            // A queued lane change is applied at the boundary; refresh the badge.
            this.renderSpawners();
        });
        this.setState(gameLoop.state);
        this.updateSpeedLabel();
        this.renderSpawners();

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

    setWave(wave: number) {
        this.waveElement.textContent = String(wave);
    }

    /** Human mode's `delayBetweenWaves` countdown, shown next to the wave number. */
    setWaveDelay(seconds: number) {
        this.waveDelayElement.textContent = `(${seconds}s)`;
    }

    clearWaveDelay() {
        this.waveDelayElement.textContent = '';
    }

    setState(state: GameState) {
        // `idle` is the not-started state shown before the player presses Start.
        this.stateElement.textContent = state === 'idle' ? 'NOT STARTED' : state.toUpperCase();
        this.pauseButton.hidden = state !== 'running';
        this.resumeButton.hidden = state !== 'paused';
    }

    updateSpeedLabel() {
        this.speedElement.textContent = `Speed x${gameLoop.speed}`;
    }

    renderSpawners() {
        const requested = spawnSettings.requested;
        document.querySelectorAll<HTMLButtonElement>('button.spawner').forEach(button => {
            button.classList.toggle('active', Number(button.dataset.count) === requested);
        });

        setText('spawner-status', spawnSettings.isPending
            ? `${spawnSettings.applied} → ${spawnSettings.requested} at next wave`
            : '');
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
        let selectedCard: HTMLButtonElement | null = null;

        towers.forEach(TowerClass => {
            const tower = new TowerClass(0, 0, Map.TILE_SIZE);
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'tower-card';
            card.setAttribute('aria-label', `${tower.name}, costs ${tower.cost} cash`);
            card.title = `${tower.name} · ${tower.cost} cash`;

            const canvas = document.createElement('canvas');
            canvas.width = canvasSize;
            canvas.height = canvasSize;
            canvas.setAttribute('aria-hidden', 'true');
            card.appendChild(canvas);

            const label = document.createElement('span');
            label.className = 'tower-card-label';
            label.textContent = tower.name;
            const cost = document.createElement('span');
            cost.className = 'tower-card-cost';
            cost.textContent = `${tower.cost} ¢`;
            card.append(label, cost);
            this.towersWrapperElement.appendChild(card);

            const ctx = canvas.getContext('2d')!;
            tower.setCoordinates(pad / 2, pad / 2);
            tower.draw(ctx);
            textureManager.onLoaded(tower.texturePath, () => tower.draw(ctx));

            const selectTower = () => {
                selectedCard?.classList.remove('selected');
                selectedCard = card;
                card.classList.add('selected');
                towerPlacer.place(TowerClass);
                this.showTowerStats(tower);
            };
            card.onclick = selectTower;
            card.onkeydown = event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectTower();
                }
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

        const hasDamage = typeof tower.damage === 'number'
            ? tower.damage > 0
            : tower.damage.max > 0;

        this.towersStatsElement.innerHTML = `
            <div class="title">${tower.name}</div>
            <div class="description">${tower.description}</div>
            <table class="table5050">
                <tr><td>Cost: </td><td class="accent">${tower.cost} ¢</td></tr>
                <tr><td>Aim radius:</td><td class="accent">${tower.aimRadius}</td></tr>
                ${hasDamage ? `
                    <tr><td>Damage:</td><td class="accent">${damage}</td></tr>
                    <tr><td>Reload:</td><td class="accent">${reloadDuration.toFixed(3)} s</td></tr>
                    <tr><td title="Damage Per Second">DPS:</td><td class="accent">${dps}</td></tr>
                ` : ''}
            </table>
        `
    }

    /** Settlement screen: the run's numbers plus the rank, once known. */
    showGameOver(stats: RunStats) {
        setText('result-wave', String(stats.wave));
        setText('result-towers', String(stats.towers.total));
        setText('result-decisions', String(stats.decisions));
        setText('result-cash', String(stats.cash));
        setText('result-duration', formatDuration(stats.durationMs));
        setText('result-rank', stats.rank == null ? '—' : '#' + stats.rank);

        const breakdown = document.getElementById('result-breakdown');
        if (breakdown) {
            breakdown.textContent = stats.towers.byType
                .map(entry => `${entry.type} × ${entry.count}`)
                .join('   ');
        }

        this.gameOverElement.classList.add('visible')
    }

    /** The leaderboard is the authority on rank, so it is filled in asynchronously. */
    setResultRank(rank: number | null) {
        setText('result-rank', rank == null ? '—' : '#' + rank);
    }
}

export const interfaceManager = new InterfaceManager();
