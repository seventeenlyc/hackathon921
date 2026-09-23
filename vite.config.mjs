import { readdirSync } from 'node:fs';
import { defineConfig } from 'vite';

const backgroundDirectory = new URL('./public/audio/background/', import.meta.url);
const demoDirectory = new URL('./public/audio/', import.meta.url);
const specialTrackNames = {
    1: 'inner universe（启动战斗专用不循环）.mp4',
    151: 'Freak Out (151波次专用曲).mp4',
    201: 'M01 謡I-Making of Cyborg （201波次启动此曲专用）.mp4',
    256: 'MVlithium flower(256彩蛋专用）.mp4',
};
const specialMusicPaths = Object.fromEntries(Object.entries(specialTrackNames)
    .map(([wave, name]) => [wave, `/audio/${encodeURIComponent(name)}`]));
const specialNames = new Set(Object.values(specialTrackNames));
const demoEntries = readdirSync(demoDirectory, { withFileTypes: true });
const backgroundTracks = [
    ...readdirSync(backgroundDirectory, { withFileTypes: true })
        .filter(entry => entry.isFile() && /\.(mp3|ogg|wav|m4a)$/i.test(entry.name))
        .map(entry => entry.name)
        .sort()
        .map(name => `/audio/background/${encodeURIComponent(name)}`),
    ...demoEntries
        .filter(entry => entry.isFile() && /\.mp4$/i.test(entry.name) && !specialNames.has(entry.name))
        .map(entry => entry.name)
        .sort()
        .map(name => `/audio/${encodeURIComponent(name)}`),
];
for (const name of specialNames) {
    if (!demoEntries.some(entry => entry.isFile() && entry.name === name)) {
        throw new Error(`Missing milestone audio: ${name}`);
    }
}

// Public assets cannot be enumerated by the browser. Bake the folder contents
// into the client at build/dev startup, before any user-gesture playback.
export default defineConfig({
    define: {
        __BACKGROUND_TRACKS__: JSON.stringify(backgroundTracks),
        __SPECIAL_MUSIC_PATHS__: JSON.stringify(specialMusicPaths),
    },
});
