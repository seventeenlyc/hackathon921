import {version} from './../package.json'
import {Snackbar} from "./tools/Snackbar";
import {LaserTower} from "./entities/towers/LaserTower";
import {SlowTower} from "./entities/towers/SlowTower";
import {textureManager} from "./tools/TextureManager";
import {gameLoop, GameState, nextSpeed} from "./agent/GameLoop";
import {otherMode, playMode, switchPlayMode} from "./PlayMode";
import {CanonTower} from "./entities/towers/CanonTower";
import {GatlingTower} from "./entities/towers/GatlingTower";
import {SniperTower} from "./entities/towers/SniperTower";
import {Tower} from "./entities/towers/Tower";
import {Map} from "./Map";
import {towerPlacer} from "./TowerPlacer";
import {getControlLayer} from "./ControlLayer";
import {applyStaticTranslations, onLangChange, t, toggleLang} from './i18n';
import {audioManager} from './AudioManager';
import {cashManager} from './CashManager';
import {naturalOilController, OilActivationResult} from './items/NaturalOil';
import {tacticalItemsController} from './items/TacticalItems';
import {isEnemyTypeId} from './tools/enemyCatalog';
import {texturePaths} from './tools/texturePaths';

type OilFailureReason = Extract<OilActivationResult, {ok: false}>['reason'];

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
    private stateSubElement = document.getElementById('state-sub')!;
    private speedElement = document.getElementById('speed')!;
    private gameOverElement = document.getElementById('game-over')!;
    private pauseButton = document.getElementById('pause') as HTMLButtonElement;
    private resumeButton = document.getElementById('resume') as HTMLButtonElement;
    private audioButton = document.getElementById('audio-toggle') as HTMLButtonElement | null;
    private naturalOilButton = document.getElementById('natural-oil') as HTMLButtonElement;
    private naturalOilStatus = document.getElementById('natural-oil-status')!;
    private naturalOilFailure: OilFailureReason | null = null;
    private tripoButton = document.getElementById('item-tripo') as HTMLButtonElement | null;
    private seeedButton = document.getElementById('item-seeed') as HTMLButtonElement | null;
    private evomapButton = document.getElementById('item-evomap') as HTMLButtonElement | null;
    private hypershellButton = document.getElementById('item-hypershell') as HTMLButtonElement | null;
    private controlLayer = getControlLayer();
    private lastTower: Tower | null = null;
    private lastWave = 0;
    public snackbar = new Snackbar();

    constructor() {
        this.versionElement.textContent = 'v' + version;

        this.pauseButton.onclick = () => gameLoop.pause();
        this.resumeButton.onclick = () => {
            gameLoop.resume();
            this.controlLayer.hide();
        };
        this.speedElement.onclick = () => {
            gameLoop.setSpeed(nextSpeed(gameLoop.speed));
            this.updateSpeedLabel();
        };
        this.audioButton?.addEventListener('click', () => {
            const muted = !audioManager.isMuted();
            audioManager.setMuted(muted);
            if (!muted) audioManager.startMusic();
            this.updateAudioLabel();
        });
        const langButton = document.getElementById('lang') as HTMLButtonElement | null;
        langButton?.addEventListener('click', () => {
            toggleLang();
            applyStaticTranslations();
        });

        gameLoop.onChange(state => {
            this.setState(state);
        });
        this.naturalOilButton.addEventListener('click', () => {
            const result = naturalOilController.activate(gameLoop.state === 'running', cashManager);
            this.naturalOilFailure = result.ok ? null : result.reason;
            this.updateNaturalOil();
        });

        this.bindItemHover(this.naturalOilButton, t('oil.label'), 'oil.desc');
        this.bindItemHover(this.tripoButton, 'Tripo', 'item.tripo.desc');
        this.bindItemHover(this.seeedButton, 'Seeed Studio', 'item.seeed.desc');
        this.bindItemHover(this.evomapButton, 'EvoMap', 'item.evomap.desc');
        this.bindItemHover(this.hypershellButton, 'HyperShell', 'item.hypershell.desc');

        for (const [key, button, brand] of [
            ['evomap', this.evomapButton, 'EvoMap'],
            ['tripo', this.tripoButton, 'Tripo'],
            ['seeed_studio', this.seeedButton, 'Seeed Studio'],
            ['hypershell', this.hypershellButton, 'HyperShell'],
        ] as const) {
            button?.addEventListener('click', () => {
                const result = tacticalItemsController.activate(key, gameLoop.state === 'running', cashManager);
                this.snackbar.toast(t(result.ok ? 'item.used' : `item.failure.${result.reason}`, {name: brand}));
                this.updateNaturalOil();
            });
        }

        this.setState(gameLoop.state);
        this.updateSpeedLabel();
        this.updateAudioLabel();
        this.updateNaturalOil();
        this.setupDatabaseTabs();
        this.setupHostileImages();
        this.startHeaderClock();

        // The class scopes which half of the UI is visible (see styles.less).
        document.getElementById('inert')!.classList.add('mode-' + playMode);
        // Both modes can inspect the same tower catalogue. Only human mode turns
        // a card click into placement; AI mode keeps the cards informational.
        this.setTowers();
        this.towersStatsElement.textContent = t('towers.selectHint');
        this.setupModeButton();
        onLangChange(() => {
            this.setState(gameLoop.state);
            this.updateSpeedLabel();
            this.updateAudioLabel();
            this.updateNaturalOil();
            this.setupModeButton();
            if (this.lastWave > 0) {
                const tag = t('map.waveTag', {wave: String(this.lastWave).padStart(3, '0')});
                setText('map-wave', tag);
            }
            if (this.lastTower) {
                this.showTowerStats(this.lastTower);
            } else {
                this.towersStatsElement.textContent = t('towers.selectHint');
            }
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
        this.lastWave = wave;
        const tag = t('map.waveTag', {wave: String(wave).padStart(3, '0')});
        // 设计稿的波次为三位补零样式（037 / 200 中的前半），与地图 livebar 的 waveTag 一致。
        this.waveElement.textContent = String(wave).padStart(3, '0');
        setText('map-wave', tag);
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
        this.stateElement.textContent = t(`state.${state}`);
        this.stateSubElement.textContent = t(`stateSub.${state}`);
        this.pauseButton.hidden = state === 'paused';
        this.pauseButton.disabled = state === 'idle' || state === 'planning';
        this.resumeButton.hidden = state !== 'paused';
        // The intrusion banner reads as an amber warning while a wave is live;
        // red stays reserved for the settlement screen (issue #66 palette).
        const alert = document.getElementById('map-alert');
        if (alert) alert.hidden = state !== 'running';
        this.updateNaturalOil();
    }

    updateNaturalOil() {
        const state = naturalOilController.state;
        this.naturalOilButton.disabled = state.kind !== 'ready' || gameLoop.state !== 'running';
        this.naturalOilButton.setAttribute('aria-label', t('oil.button', {cost: 1000}));
        if (state.kind === 'active' || state.kind === 'cooldown') {
            const seconds = Math.ceil(state.remainingMs / 1000);
            this.naturalOilStatus.textContent = t(`oil.${state.kind}`, {seconds});
        } else {
            this.naturalOilStatus.textContent = this.naturalOilFailure
                ? t(`oil.failure.${this.naturalOilFailure}`)
                : t(gameLoop.state === 'running' ? 'oil.ready' : 'oil.notRunning');
        }

        const running = gameLoop.state === 'running';
        for (const [key, id, button, brand] of [
            ['evomap', 'evomap', this.evomapButton, 'EvoMap'],
            ['tripo', 'tripo', this.tripoButton, 'Tripo'],
            ['seeed_studio', 'seeed', this.seeedButton, 'Seeed Studio'],
            ['hypershell', 'hypershell', this.hypershellButton, 'HyperShell'],
        ] as const) {
            if (!button) continue;
            const state = tacticalItemsController.getState(key);
            const cost = tacticalItemsController.cost(key);
            const affordable = cashManager.canWithdraw(cost);
            button.disabled = state.kind !== 'ready' || !running || !affordable;
            button.setAttribute('data-state', state.kind);
            const costLabel = cost === 0 ? t('item.free') : t('item.cost', {cost});
            const stateLabel = state.kind === 'ready'
                ? t(!running ? 'item.waiting' : affordable ? 'item.ready' : 'item.insufficient')
                : t(`item.${state.kind}`, {seconds: Math.ceil(state.remainingMs / 1000)});
            setText(`item-${id}-cost`, costLabel);
            setText(`item-${id}-state`, stateLabel);
            button.setAttribute('aria-label', `${brand} · ${t(`item.${id}.name`)} · ${costLabel} · ${stateLabel}`);
        }
    }

    private bindItemHover(button: HTMLElement | null, title: string, descKey: string) {
        if (!button) return;
        const show = () => {
            const desc = t(descKey);
            button.setAttribute('title', `${title}: ${desc}`);
            this.towersStatsElement.innerHTML = `
                <div class="title">${title}</div>
                <div class="description">${desc}</div>
            `;
        };
        const hide = () => {
            if (this.lastTower) {
                this.showTowerStats(this.lastTower);
            } else {
                this.towersStatsElement.textContent = t('towers.selectHint');
            }
        };
        button.addEventListener('mouseenter', show);
        button.addEventListener('mouseleave', hide);
        button.addEventListener('focus', show);
        button.addEventListener('blur', hide);
        button.setAttribute('title', `${title}: ${t(descKey)}`);
    }

    updateSpeedLabel() {
        this.speedElement.textContent = t('speed.label', {speed: gameLoop.speed});
    }

    updateAudioLabel() {
        if (!this.audioButton) return;
        this.audioButton.textContent = audioManager.isMuted() ? t('control.audioMuted') : t('control.audio');
        this.audioButton.setAttribute('aria-pressed', String(audioManager.isMuted()));
    }

    /** Decorative workstation clock in the header (issue #66 art direction). */
    private startHeaderClock() {
        if (typeof window === 'undefined') return;
        const clock = document.getElementById('header-clock');
        if (!clock) return;
        const tick = () => { clock.textContent = new Date().toTimeString().slice(0, 8); };
        tick();
        window.setInterval(tick, 1000);
    }

    /** TACTICAL DATABASE tab switch: friendly units vs hostile attributes. */
    private setupDatabaseTabs() {
        const tabTachikoma = document.getElementById('db-tab-tachikoma') as HTMLButtonElement | null;
        const tabHostile = document.getElementById('db-tab-hostile') as HTMLButtonElement | null;
        const viewTachikoma = document.getElementById('db-view-tachikoma');
        const viewHostile = document.getElementById('db-view-hostile');
        if (!tabTachikoma || !tabHostile || !viewTachikoma || !viewHostile) return;
        const show = (view: 'tachikoma' | 'hostile') => {
            const tachikomaActive = view === 'tachikoma';
            tabTachikoma.classList.toggle('active', tachikomaActive);
            tabHostile.classList.toggle('active', !tachikomaActive);
            tabTachikoma.setAttribute('aria-selected', String(tachikomaActive));
            tabHostile.setAttribute('aria-selected', String(!tachikomaActive));
            viewTachikoma.hidden = !tachikomaActive;
            viewHostile.hidden = tachikomaActive;
        };
        tabTachikoma.addEventListener('click', () => show('tachikoma'));
        tabHostile.addEventListener('click', () => show('hostile'));
    }

    /** HOSTILE tab thumbnails reuse the live enemy textures (no new art). */
    private setupHostileImages() {
        document.querySelectorAll<HTMLImageElement>('img[data-enemy-img]').forEach((img) => {
            const typeId = img.getAttribute('data-enemy-img');
            if (typeId && isEnemyTypeId(typeId)) {
                img.src = texturePaths.enemies[typeId];
            }
        });
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
            card.setAttribute('aria-label', t('tower.cardAria', {name: tower.displayName, cost: tower.cost}));
            card.title = playMode === 'human'
                ? t('tower.cardPlaceTitle', {name: tower.displayName, cost: tower.cost})
                : t('tower.cardDetailsTitle', {name: tower.displayName, cost: tower.cost});

            const canvas = document.createElement('canvas');
            canvas.width = canvasSize;
            canvas.height = canvasSize;
            canvas.setAttribute('aria-hidden', 'true');
            card.appendChild(canvas);

            const label = document.createElement('span');
            label.className = 'tower-card-label';
            label.textContent = tower.displayName;
            const cost = document.createElement('span');
            cost.className = 'tower-card-cost';
            cost.textContent = String(tower.cost);
            card.append(label, cost);
            this.towersWrapperElement.appendChild(card);

            const ctx = canvas.getContext('2d')!;
            tower.setCoordinates(pad / 2, pad / 2);
            tower.draw(ctx);
            textureManager.onLoaded(tower.texturePath, () => tower.draw(ctx));

            const selectTower = () => {
                if (selectedCard === card) {
                    selectedCard.classList.remove('selected');
                    selectedCard = null;
                    this.lastTower = null;
                    if (playMode === 'human') towerPlacer.cancel();
                    this.towersStatsElement.textContent = t('towers.selectHint');
                    return;
                }
                selectedCard?.classList.remove('selected');
                selectedCard = card;
                card.classList.add('selected');
                if (playMode === 'human') towerPlacer.place(TowerClass);
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
        this.lastTower = tower;

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
            <div class="title">${tower.displayName}</div>
            <div class="description">${tower.displayDescription}</div>
            <table class="table5050">
                <tr><td>${t('tower.cost')} </td><td class="accent">${tower.cost}</td></tr>
                <tr><td>${t('tower.aimRadius')}</td><td class="accent">${tower.aimRadius}</td></tr>
                ${hasDamage ? `
                    <tr><td>${t('tower.damage')}</td><td class="accent">${damage}</td></tr>
                    <tr><td>${t('tower.reload')}</td><td class="accent">${reloadDuration.toFixed(3)} s</td></tr>
                    <tr><td title="${t('tower.dpsTitle')}">${t('tower.dps')}</td><td class="accent">${dps}</td></tr>
                ` : ''}
            </table>
        `
        // AI mode keeps the catalogue compact on small screens; bring the
        // selected tower's description into view instead of hiding it below
        // the scroll boundary.
        this.towersStatsElement.scrollIntoView({block: 'nearest'});
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
                .map(entry => t('tower.summary', {name: t(`tower.${entry.type}.name`), count: entry.count}))
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
