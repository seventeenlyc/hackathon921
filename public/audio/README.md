# Audio assets

The game loads these files through `AudioManager`:

- `background.mp3` - the looping background track supplied for this build;
- `wave.wav` - a short wave-reached chime;
- `game-over.wav` - a short descending result cue.

The two WAV cue files are deliberately short, low-volume, locally generated
uncompressed PCM placeholders. The previous `background.wav` placeholder is
retained as a legacy file but is not loaded by the game. The project maintainer
confirmed that the supplied MP3 is authorized for redistribution with this
repository.
