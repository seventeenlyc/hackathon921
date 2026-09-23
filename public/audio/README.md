# Audio assets

The game loads these files through `AudioManager`:

- `background/` - background tracks for waves 1–200. Vite collects supported
  `.mp3`, `.ogg`, `.wav`, and `.m4a` files from this folder at dev/build startup;
  after a track ends, another is chosen at random without immediately repeating
  the same track when more than one is available. Music volume is 0.24;
- `wave.wav` - a short wave-reached chime;
- `game-over.wav` - a short descending result cue.

The two WAV cue files are deliberately short, low-volume, locally generated
uncompressed PCM placeholders. The previous `background.wav` placeholder is
retained as a legacy file but is not loaded by the game. The project maintainer
confirmed that the supplied `background/background.mp3` is authorized for
redistribution with this repository. Confirm the rights for any tracks added
later.
