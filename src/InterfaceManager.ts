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
import {textureManager} from "./tools/TextureManager";
import {gameLoop, GameState, nextSpeed} from "./agent/GameLoop";
import {otherMode, playMode, switchPlayMode} from "./PlayMode";
import {requestSpawnCount, spawnSettings} from "./SpawnQueue";
import {applyStaticTranslations, onLangChange, t, toggleLang} from "./i18n";

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
    public snackbar = new Snackbar();
    /** Kept so the tower stat rows can be re-rendered when the language changes. */
    private lastTower: Tower | null = null;

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

        document.getElementById('pause')!.onclick = () => gameLoop.pause();
        document.getElementById('resume')!.onclick = () => gameLoop.resume();
        // Language toggle: static markup is re-filled, dynamic text re-rendered.
        document.getElementById('lang')!.onclick = () => {
            toggleLang();
            applyStaticTranslations();
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

        onLangChange(() => {
            this.setState(gameLoop.state);
            this.updateSpeedLabel();
            this.renderSpawners();
            this.setupModeButton();
            if (this.lastTower) this.showTowerStats(this.lastTower);
        });
        applyStaticTranslations();
    }

    /** One button that restarts the game in the other play mode. */
    private setupModeButton() {
        const button = document.getElementById('mode') as HTMLButtonElement;
        const target = otherMode(playMode);
        button.textContent = target === 'human' ? t('mode.toHuman') : t('mode.toAi');
        button.title = target === 'human' ? t('mode.toHumanTitle') : t('mode.toAiTitle');
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
        this.stateElement.textContent = t('state.' + state);
    }

    updateSpeedLabel() {
        this.speedElement.textContent = t('speed.label', {speed: gameLoop.speed});
    }

    renderSpawners() {
        const requested = spawnSettings.requested;
        document.querySelectorAll<HTMLButtonElement>('button.spawner').forEach(button => {
            button.classList.toggle('active', Number(button.dataset.count) === requested);
        });

        setText('spawner-status', spawnSettings.isPending
            ? t('spawner.pending', {applied: spawnSettings.applied, requested: spawnSettings.requested})
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
        this.lastTower = tower;

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
                <tr><td>${t('tower.cost')}</td><td class="accent">${tower.cost} ¢</td></tr>
                <tr><td>${t('tower.aimRadius')}</td><td class="accent">${tower.aimRadius}</td></tr>
                ${typeof tower.damage === 'number' && tower.damage > 0 ? `
                    <tr><td>${t('tower.damage')}</td><td class="accent">${damage}</td></tr>
                    <tr><td>${t('tower.reload')}</td><td class="accent">${reloadDuration.toFixed(3)} s</td></tr>
                    <tr><td title="Damage Per Second">${t('tower.dps')}</td><td class="accent">${dps}</td></tr>
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
