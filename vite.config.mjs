import { readFileSync, readdirSync } from 'node:fs';
import { defineConfig } from 'vite';

const backgroundDirectory = new URL('./public/audio/background/', import.meta.url);
const demoDirectory = new URL('./public/audio/', import.meta.url);
// Filenames and phase membership are replaceable data, never audio-state logic.
const { milestones: specialTrackNames, phases } = JSON.parse(readFileSync(new URL('./audio-playlist.json', import.meta.url), 'utf8'));
const demoEntries = readdirSync(demoDirectory, { withFileTypes: true });
const backgroundEntries = readdirSync(backgroundDirectory, { withFileTypes: true });
const availableFiles = new Set([
    ...demoEntries.filter(entry => entry.isFile()).map(entry => entry.name),
    ...backgroundEntries.filter(entry => entry.isFile()).map(entry => `background/${entry.name}`),
]);
export function createSpecialMusicPaths(milestones, availableFiles) {
    if (!milestones || typeof milestones !== 'object' || Array.isArray(milestones)) {
        throw new Error('Invalid milestone audio manifest');
    }
    return Object.fromEntries(Object.entries(milestones).map(([wave, name]) => {
        if (!/^[1-9]\d*$/.test(wave) || typeof name !== 'string'
            || !/^(?:background\/)?[^/\\]+\.(mp3|ogg|wav|m4a|mp4)$/i.test(name)
            || !availableFiles.has(name)) {
            throw new Error(`Invalid or missing milestone audio: ${wave}`);
        }
        return [wave, `/audio/${name.split('/').map(encodeURIComponent).join('/')}`];
    }));
}
const specialMusicPaths = createSpecialMusicPaths(specialTrackNames, availableFiles);
const specialNames = new Set(Object.values(specialTrackNames));
const backgroundTracks = [
    ...backgroundEntries
        .filter(entry => entry.isFile() && /\.(mp3|ogg|wav|m4a)$/i.test(entry.name)
            && !specialNames.has(`background/${entry.name}`))
        .map(entry => entry.name)
        .sort()
        .map(name => `/audio/background/${encodeURIComponent(name)}`),
    ...demoEntries
        .filter(entry => entry.isFile() && /\.mp4$/i.test(entry.name) && !specialNames.has(entry.name))
        .map(entry => entry.name)
        .sort()
        .map(name => `/audio/${encodeURIComponent(name)}`),
];
export function createPhaseMusicPaths(phases, backgroundTracks) {
    const availableRegular = new Set(backgroundTracks.map(url => decodeURIComponent(url.slice('/audio/'.length))));
    const assigned = new Set();
    const phaseMusicPaths = {};
    for (const phase of ['tactical', 'siege', 'lastStand']) {
        if (!Array.isArray(phases?.[phase]) || phases[phase].length === 0) {
            throw new Error(`Missing playlist for phase: ${phase}`);
        }
        phaseMusicPaths[phase] = phases[phase].map(name => {
            if (typeof name !== 'string' || !availableRegular.has(name) || assigned.has(name)) {
                throw new Error(`Unknown or duplicate phase track: ${name}`);
            }
            assigned.add(name);
            return `/audio/${name.split('/').map(encodeURIComponent).join('/')}`;
        });
    }
    if (assigned.size !== availableRegular.size) {
        throw new Error('Every regular audio asset must be assigned to exactly one phase');
    }
    return phaseMusicPaths;
}
const phaseMusicPaths = createPhaseMusicPaths(phases, backgroundTracks);

// Public assets cannot be enumerated by the browser. Bake the folder contents
// into the client at build/dev startup, before any user-gesture playback.
export default defineConfig({
    define: {
        __BACKGROUND_TRACKS__: JSON.stringify(backgroundTracks),
        __SPECIAL_MUSIC_PATHS__: JSON.stringify(specialMusicPaths),
        __PHASE_MUSIC_PATHS__: JSON.stringify(phaseMusicPaths),
    },
});
