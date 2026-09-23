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
