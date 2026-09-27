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
import {TowerInfo} from "./agent/types";
import {Map} from "./Map";
import {towerPlacer} from "./TowerPlacer";
import {getControlLayer} from "./ControlLayer";
import {applyStaticTranslations, onLangChange, t, toggleLang} from './i18n';
import {audioManager} from './AudioManager';
import {cashManager} from './CashManager';
import {tacticalItemsController} from './items/TacticalItems';
import {enemyLifeAtWave, enemySpeedAtWave} from './tools/enemyScaling';
import {isEnemyTypeId} from './tools/enemyCatalog';
import {texturePaths} from './tools/texturePaths';
import {DevPanel} from './DevPanel';

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
    private stateElement = document.getElementById('state')!;
    private speedElement = document.getElementById('speed')!;
    private gameOverElement = document.getElementById('game-over')!;
    private pauseButton = document.getElementById('pause') as HTMLButtonElement;
    private resumeButton = document.getElementById('resume') as HTMLButtonElement;
    private audioButton = document.getElementById('audio-toggle') as HTMLButtonElement | null;
    private hostileStatsWave = 1;
    private selectedTower: TowerInfo | null = null;
    private towerUpgradeHint = document.getElementById('tower-upgrade-hint') as HTMLElement;
    private towerUpgradePanel = document.getElementById('tower-upgrade-panel') as HTMLElement;
    private towerUpgradeName = document.getElementById('tower-upgrade-name') as HTMLElement;
    private towerUpgradeLevel = document.getElementById('tower-upgrade-level') as HTMLElement;
    private towerUpgradeDamage = document.getElementById('tower-upgrade-damage') as HTMLElement;
    private towerUpgradeDps = document.getElementById('tower-upgrade-dps') as HTMLElement;
    private towerUpgradeRange = document.getElementById('tower-upgrade-range') as HTMLElement;
    private towerUpgradeReload = document.getElementById('tower-upgrade-reload') as HTMLElement;
    private towerUpgradeCost = document.getElementById('tower-upgrade-cost') as HTMLElement;
    private towerUpgradeButton = document.getElementById('tower-upgrade-button') as HTMLButtonElement;
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
        };
        this.speedElement.onclick = () => {
            gameLoop.setSpeed(nextSpeed(gameLoop.speed));
            this.updateSpeedLabel();
        };
        this.audioButton?.addEventListener('click', () => {
            audioManager.setMuted(!audioManager.isMuted());
            this.updateAudioLabel();
        });
        this.towerUpgradeButton.addEventListener('click', () => towerPlacer.upgradeSelected());
        cashManager.onBalanceChange(() => this.updateTowerUpgradeAvailability());
        const langButton = document.getElementById('lang') as HTMLButtonElement | null;
        langButton?.addEventListener('click', () => {
            toggleLang();
            applyStaticTranslations();
        });

        gameLoop.onChange(state => {
            this.setState(state);
        });
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
                this.updateTacticalItems();
            });
        }

        this.setState(gameLoop.state);
        this.updateSpeedLabel();
        this.updateAudioLabel();
        this.updateTacticalItems();
        this.setupDatabaseTabs();
        this.setupHostileImages();
        this.updateHostileStats(1); // IDLE 阶段按第 1 波展示基础成长值
        this.startHeaderClock();
        this.setupDevPanel();

        // The class scopes which half of the UI is visible (see styles.less).
        document.getElementById('inert')!.classList.add('mode-' + playMode);
        // Both modes can inspect the same tower catalogue. Only human mode turns
        // a card click into placement; AI mode keeps the cards informational.
        this.setTowers();
        this.setupModeButton();
        onLangChange(() => {
            this.setState(gameLoop.state);
            this.updateSpeedLabel();
            this.updateAudioLabel();
            this.updateTacticalItems();
            this.setupModeButton();
            this.updateHostileStats(this.hostileStatsWave);
            this.refreshSelectedTowerPanel();
            if (this.lastWave > 0) {
                const tag = t('map.waveTag', {wave: String(this.lastWave).padStart(3, '0')});
                setText('map-wave', tag);
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
        this.updateHostileStats(wave);
        this.updateWaveProgress(wave);
    }

    /** 波次进度条：100% = 200 波，每关 0.5%；200 波之后封顶。 */
    private updateWaveProgress(wave: number): void {
        const pct = Math.round(Math.min(wave, 200) / 200 * 1000) / 10;
        const fill = document.getElementById('status-progress-fill');
        if (fill) fill.style.width = `${pct}%`;
        const pctLabel = document.getElementById('status-progress-pct');
        if (pctLabel) pctLabel.textContent = `${pct}%`;
        const bar = fill?.parentElement;
        bar?.setAttribute('aria-valuenow', String(pct));
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
        this.pauseButton.hidden = state === 'paused';
        this.pauseButton.disabled = state === 'idle' || state === 'planning';
        this.resumeButton.hidden = state !== 'paused';
        // The intrusion banner reads as an amber warning while a wave is live;
        // red stays reserved for the settlement screen (issue #66 palette).
        const alert = document.getElementById('map-alert');
        if (alert) alert.hidden = state !== 'running';
        this.updateTacticalItems();
        this.updateTowerUpgradeAvailability();
    }

    updateTacticalItems() {
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
            button.setAttribute('title', `${title}: ${t(descKey)}`);
        };
        button.addEventListener('mouseenter', show);
        button.addEventListener('focus', show);
    }

    updateSpeedLabel() {
        this.speedElement.textContent = t('speed.label', {speed: gameLoop.speed});
    }

    updateAudioLabel() {
        if (!this.audioButton) return;
        this.audioButton.textContent = audioManager.isMuted() ? t('control.audioMuted') : t('control.audio');
        this.audioButton.setAttribute('aria-pressed', String(audioManager.isMuted()));
    }

    /** Wrench in the top-right opens the developer (QA) panel. */
    private setupDevPanel() {
        const wrench = document.getElementById('dev-wrench') as HTMLButtonElement | null;
        if (wrench) new DevPanel(wrench);
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
        const tabTowers = document.getElementById('db-tab-towers') as HTMLButtonElement | null;
        const tabHostile = document.getElementById('db-tab-hostile') as HTMLButtonElement | null;
        const viewTowers = document.getElementById('db-view-towers');
        const viewHostile = document.getElementById('db-view-hostile');
        if (!tabTowers || !tabHostile || !viewTowers || !viewHostile) return;
        const show = (view: 'towers' | 'hostile') => {
            const towersActive = view === 'towers';
            tabTowers.classList.toggle('active', towersActive);
            tabHostile.classList.toggle('active', !towersActive);
            tabTowers.setAttribute('aria-selected', String(towersActive));
            tabHostile.setAttribute('aria-selected', String(!towersActive));
            viewTowers.hidden = !towersActive;
            viewHostile.hidden = towersActive;
        };
        tabTowers.addEventListener('click', () => show('towers'));
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

    /**
     * 敌方情报卡片的实时数值：data-* 保存基础值（与敌方实体字段一致），
     * 按 tools/enemyScaling 换算成当前波次的有效数值（与 WavesManager 生成逻辑同源），
     * 分段条按当前波次下五种敌人的最大值归一化。语言切换时重复调用，先清空再重建。
     */
    private updateHostileStats(wave: number): void {
        const cards = Array.from(document.querySelectorAll<HTMLElement>('.hostile-card[data-life]'));
        if (!cards.length) return;
        this.hostileStatsWave = wave;
        const stats = cards.map(card => {
            // Boss 卡在 201 波起会冻结属性，标记在 data-boss 上以便与引擎同源换算。
            const isBoss = card.dataset.boss === '1';
            return {
                life: enemyLifeAtWave(Number(card.dataset.life), wave, isBoss),
                speed: enemySpeedAtWave(Number(card.dataset.speed), wave, Number(card.dataset.speedCap), isBoss),
                cash: Number(card.dataset.cash),
            };
        });
        const rows: Array<[string, number[], number]> = [
            [t('enemy.stat.hp'), stats.map(s => s.life), Math.max(...stats.map(s => s.life))],
            [t('enemy.stat.speed'), stats.map(s => s.speed), Math.max(...stats.map(s => s.speed))],
            [t('enemy.stat.cash'), stats.map(s => s.cash), Math.max(...stats.map(s => s.cash))],
        ];
        const waveTag = document.getElementById('hostile-wave-tag');
        if (waveTag) waveTag.textContent = t('database.waveTag', {wave: String(wave).padStart(3, '0')});
        cards.forEach((card, index) => {
            const statsEl = card.querySelector('.hostile-stats');
            if (!statsEl) return;
            statsEl.textContent = '';
            rows.forEach(([label, values, max]) => {
                const row = document.createElement('span');
                row.className = 'tower-stat';
                const labelSpan = document.createElement('span');
                labelSpan.className = 'stat-label';
                labelSpan.textContent = label;
                const valueSpan = document.createElement('span');
                valueSpan.className = 'stat-value';
                valueSpan.textContent = String(Math.round(values[index] * 10) / 10);
                const bar = document.createElement('span');
                bar.className = 'stat-bar';
                const fill = document.createElement('span');
                fill.className = 'stat-fill';
                fill.style.width = `${Math.max(0, Math.min(1, values[index] / max)) * 100}%`;
                bar.appendChild(fill);
                row.append(labelSpan, valueSpan, bar);
                statsEl.appendChild(row);
            });
        });
    }

    /** Render live action data only; the panel never receives entity references. */
    setSelectedTower(tower: TowerInfo | null) {
        this.selectedTower = tower;
        this.refreshSelectedTowerPanel();
    }

    private formatTowerValue(value: number): string {
        return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
    }

    private refreshSelectedTowerPanel() {
        const tower = this.selectedTower;
        const selected = Boolean(tower) && playMode === 'human';
        this.towerUpgradeHint.hidden = selected;
        this.towerUpgradePanel.hidden = !selected;

        if (!tower) {
            this.updateTowerUpgradeAvailability();
            return;
        }

        this.towerUpgradeName.textContent = t(`tower.${tower.type}.name`);
        this.towerUpgradeLevel.textContent = String(tower.level);
        this.towerUpgradeDamage.textContent = this.formatTowerValue(tower.damage);
        this.towerUpgradeDps.textContent = this.formatTowerValue(tower.dps);
        this.towerUpgradeRange.textContent = this.formatTowerValue(tower.aimRadius);
        this.towerUpgradeReload.textContent = tower.reloadMs > 0
            ? `${this.formatTowerValue(tower.reloadMs)} ms`
            : t('tower.rateContinuous');
        this.updateTowerUpgradeAvailability();
    }

    private updateTowerUpgradeAvailability() {
        const tower = this.selectedTower;
        const maxed = !tower || tower.upgradeCost === null;
        const affordable = Boolean(
            tower && tower.upgradeCost !== null && cashManager.canWithdraw(tower.upgradeCost)
        );
        const settled = this.gameOverElement.classList.contains('visible');

        this.towerUpgradeCost.textContent = maxed
            ? t('tower.upgrade.max')
            : String(tower!.upgradeCost);
        // A disabled button still has to say why: maxed out or short on funds,
        // otherwise the player cannot tell a blocked upgrade from a broken one.
        this.towerUpgradeButton.textContent = t(
            maxed ? 'tower.upgrade.max'
                : !affordable ? 'tower.upgrade.insufficient'
                : 'tower.upgrade.button'
        );
        this.towerUpgradeButton.disabled = !tower || maxed || !affordable || settled;
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

        const instances = towers.map(TowerClass => new TowerClass(0, 0, Map.TILE_SIZE));
        // 设计稿的属性条按各机体中的最大值归一化。
        const maxDamageOf = (tower: Tower): number =>
            typeof tower.damage === 'object' ? tower.damage.max : tower.damage;
        const maxCost = Math.max(...instances.map(tower => tower.cost));
        const maxDamage = Math.max(...instances.map(maxDamageOf));
        const maxRange = Math.max(...instances.map(tower => tower.aimRadius));
        const maxRate = Math.max(...instances.map(tower => 1000 / tower.reloadDurationMs));

        const statRow = (label: string, value: string, ratio: number): HTMLElement => {
            const row = document.createElement('span');
            row.className = 'tower-stat';
            const labelSpan = document.createElement('span');
            labelSpan.className = 'stat-label';
            labelSpan.textContent = label;
            const valueSpan = document.createElement('span');
            valueSpan.className = 'stat-value';
            valueSpan.textContent = value;
            const bar = document.createElement('span');
            bar.className = 'stat-bar';
            const fill = document.createElement('span');
            fill.className = 'stat-fill';
            fill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
            bar.appendChild(fill);
            row.append(labelSpan, valueSpan, bar);
            return row;
        };

        instances.forEach((tower, index) => {
            const TowerClass = towers[index];
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'tower-card';
            card.setAttribute('aria-label', t('tower.cardAria', {name: tower.displayName, cost: tower.cost}));
            card.title = playMode === 'human'
                ? t('tower.cardPlaceTitle', {name: tower.displayName, cost: tower.cost})
                : t('tower.cardDetailsTitle', {name: tower.displayName, cost: tower.cost});

            const head = document.createElement('span');
            head.className = 'tower-card-head';
            const canvas = document.createElement('canvas');
            canvas.width = canvasSize;
            canvas.height = canvasSize;
            canvas.setAttribute('aria-hidden', 'true');
            const name = document.createElement('span');
            name.className = 'tower-card-name';
            name.textContent = tower.displayName;
            head.append(canvas, name);

            const damage = typeof tower.damage === 'object' ? tower.damage.max : tower.damage;
            const hasDamage = damage > 0;
            const continuous = tower.reloadDurationMs === 0;
            const rate = continuous ? 0 : 1000 / tower.reloadDurationMs;
            const stats = document.createElement('span');
            stats.className = 'tower-card-stats';
            stats.append(
                statRow(t('tower.stat.cost'), String(tower.cost), tower.cost / maxCost),
                statRow(t('tower.stat.dmg'), hasDamage
                    ? typeof tower.damage === 'object'
                        ? `${tower.damage.min}–${tower.damage.max}`
                        : String(tower.damage)
                    : '—', hasDamage ? damage / maxDamage : 0),
                statRow(t('tower.stat.rate'), continuous
                    ? t('tower.rateContinuous')
                    : `${rate.toFixed(1)}/s`, continuous ? 1 : rate / maxRate),
                statRow(t('tower.stat.range'), String(tower.aimRadius), tower.aimRadius / maxRange),
            );

            const flavor = document.createElement('span');
            flavor.className = 'tower-card-flavor';
            flavor.textContent = tower.displayDescription;

            card.append(head, stats, flavor);
            this.towersWrapperElement.appendChild(card);

            const ctx = canvas.getContext('2d')!;
            tower.setCoordinates(pad / 2, pad / 2);
            const drawPreview = () => textureManager.draw(ctx, tower.texturePath, tower.center.x, tower.center.y, tower.width, tower.width);
            drawPreview();
            textureManager.onLoaded(tower.texturePath, drawPreview);

            const selectTower = () => {
                if (selectedCard === card) {
                    selectedCard.classList.remove('selected');
                    selectedCard = null;
                    if (playMode === 'human') towerPlacer.cancel();
                    return;
                }
                selectedCard?.classList.remove('selected');
                selectedCard = card;
                card.classList.add('selected');
                if (playMode === 'human') towerPlacer.place(TowerClass);
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
        this.updateTowerUpgradeAvailability();
    }

    /** The leaderboard is the authority on rank, so it is filled in asynchronously. */
    setResultRank(rank: number | null) {
        setText('result-rank', rank == null ? '—' : '#' + rank);
    }
}

export const interfaceManager = new InterfaceManager();
