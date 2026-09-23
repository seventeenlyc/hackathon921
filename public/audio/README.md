# Audio assets

The game loads these files through `AudioManager`:

- `background/` - background music. Vite collects supported `.mp3`, `.ogg`,
  `.wav`, and `.m4a` files from this folder at dev/build startup. Tracks named
  `1.mp3`, `151.mp3`, `201.mp3`, and `256.mp3` play once at their matching wave
  and are excluded from the regular random playlist. Other tracks randomly
  cycle without immediately repeating the same track when more than one is
  available. Music volume is 0.24;
- `wave.wav` - a short wave-reached chime;
- `game-over.wav` - a short descending result cue.

The two WAV cue files are deliberately short, low-volume, locally generated
uncompressed PCM placeholders. The previous `background.wav` placeholder is
retained as a legacy file but is not loaded by the game. The project maintainer
confirmed that the supplied `background/background.mp3` is authorized for
redistribution with this repository. The four numbered MP3s are temporary
copies of that authorized track; replace them with milestone tracks later.
Confirm the rights for any additional tracks.

## Temporary demo tracks - 24-hour demo use only

> **These `.mp4` files are temporary and are for a 24-hour demo only.** They
> were dropped in on 2026-09-23 for a short internal demo and are scheduled to
> be removed within 1-2 days. They have **no confirmed redistribution rights**
> and are **not loaded by the game today** (no code references them). Vite still
> copies files in `public/audio/` into `dist/`, including these tracks. Remove
> them before any non-demo release; replace them with cleared tracks before
> wiring them into `AudioManager`.

- `2GO GHOST.mp4`
- `AI戦队タチコマンズ.mp4`
- `Blue.mp4`
- `Freak Out (151波次专用曲).mp4`
- `Hi?.mp4`
- `M01 謡I-Making of Cyborg （201波次启动此曲专用）.mp4`
- `MVlithium flower(256彩蛋专用）.mp4`
- `PRAYER~祈~OPEN.mp4`
- `Star Cluster Collector.mp4`
- `from the roof top~somewhere in the silence.mp4`
- `i do.mp4`
- `inner universe（启动战斗专用不循环）.mp4`
- `living inside the shell.mp4`
- `rise.mp4`
- `サイケデリックソウル.mp4`
- `ロッキーはどこ.mp4`
