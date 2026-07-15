# Drop WAV files here (WAV only — no MP3)

MP3 encoder padding adds latency and makes rapid piano notes feel mushy.
Everything triggered in-game must be WAV.

Drop a file here, then point its manifest entry at it in `assets/manifest.js`:

```js
melody_main: { file: 'assets/audio/melody_main.wav' },
note_1:      { file: 'assets/audio/note_1.wav' },
```

Until an entry has a file, the engine synthesises a placeholder (beeps,
filtered noise) so the game is always playable. The full wanted list is the
`audio:` block of the manifest — melody, note_1..7 (+ optional `_flat`
variants, otherwise the engine pitch-shifts at runtime), wrong_key,
footsteps, shelf/books, door slam, light fail, ghost ambience loop, and the
cutscene beds (TV murmur, chair fall, paper, practice piano).
