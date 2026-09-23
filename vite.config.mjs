import { readdirSync } from 'node:fs';
import { defineConfig } from 'vite';

const backgroundDirectory = new URL('./public/audio/background/', import.meta.url);
const backgroundTracks = readdirSync(backgroundDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(mp3|ogg|wav|m4a)$/i.test(entry.name))
    .map(entry => entry.name)
    .sort()
    .map(name => `/audio/background/${encodeURIComponent(name)}`);

// Public assets cannot be enumerated by the browser. Bake the folder contents
// into the client at build/dev startup, before any user-gesture playback.
export default defineConfig({
    define: { __BACKGROUND_TRACKS__: JSON.stringify(backgroundTracks) },
});
