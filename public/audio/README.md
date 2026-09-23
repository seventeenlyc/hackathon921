# Audio assets

The game loads these files through `AudioManager`:

- `background/` - the authorized `background.mp3` joins the regular playlist;
- the four milestone `.mp4` tracks listed below play once at the start of waves
  1, 151, 201, and 256, then return to the regular playlist;
- the other twelve `.mp4` tracks join `background/background.mp3` in a random
  playlist that advances at each track's end without an immediate repeat.
  Vite collects these files at dev/build startup; music volume is 0.24;
- `wave.wav` - a short wave-reached chime;
- `game-over.wav` - a short descending result cue.

The two WAV cue files are deliberately short, low-volume, locally generated
uncompressed PCM placeholders. The previous `background.wav` placeholder is
retained as a legacy file but is not loaded by the game. The project maintainer
confirmed that the supplied `background/background.mp3` is authorized for
redistribution with this repository. The four numbered MP3 placeholders have
been replaced by the demo milestone tracks. Confirm the rights for any
additional tracks before non-demo release.

## Temporary demo tracks - 24-hour demo use only

> **These `.mp4` files are temporary and are for a 24-hour demo only.** They
> were dropped in on 2026-09-23 for a short internal demo and are scheduled to
> be removed within 1-2 days. They have **no confirmed redistribution rights**.
> For this demo they are played by `AudioManager` and copied from `public/audio/`
> into `dist/`. This demo-only decision is not an authorization: remove or
> replace them with cleared tracks before any non-demo release.

- `2GO GHOST.mp4`
- `AI戦队タチコマンズ.mp4`
- `Blue.mp4`
- `Freak Out (151波次专用曲).mp4` — wave 151, once;
- `Hi.mp4`
- `M01 謡I-Making of Cyborg （201波次启动此曲专用）.mp4` — wave 201, once;
- `MVlithium flower(256彩蛋专用）.mp4` — wave 256, once;
- `PRAYER~祈~OPEN.mp4`
- `Star Cluster Collector.mp4`
- `from the roof top~somewhere in the silence.mp4`
- `i do.mp4`
- `inner universe（启动战斗专用不循环）.mp4` — wave 1, once;
- `living inside the shell.mp4`
- `rise.mp4`
- `サイケデリックソウル.mp4`
- `ロッキーはどこ.mp4`
