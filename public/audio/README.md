# Audio assets

The game loads these files through `AudioManager`:

- `background.mp3` - the looping background track supplied for this build;
- `wave.wav` - a short wave-reached chime;
- `game-over.wav` - a short descending result cue.

The two WAV cue files are deliberately short, low-volume, locally generated
uncompressed PCM placeholders. The previous `background.wav` placeholder is
retained as a legacy file but is not loaded by the game. Any replacement must
be browser-playable and carry its own compatible license; redistribution rights
for the supplied MP3 must be confirmed before publishing it outside this repo.
