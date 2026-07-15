// ============================================================================
// ASSET MANIFEST — the ONLY file that changes when a real asset arrives.
//
// Every model/sound in the game is requested by logical name through
// src/engine/assets.js. While `file` is null, the engine builds a placeholder
// (grey boxes / synth beeps). Set `file` to the real path and the asset is
// live everywhere — no code changes.
//
// Meshy FBX convention: put the FBX and its loose PNGs in one folder, e.g.
//   assets/models/shadow/shadow.fbx
//   assets/models/shadow/shadow_texture.png     (base color)
//   assets/models/shadow/shadow_normal.png
//   assets/models/shadow/shadow_metallic.png
//   assets/models/shadow/shadow_roughness.png
//   assets/models/shadow/shadow_emission.png
// The importer reconnects maps by filename — the FBX's own paths are ignored
// (Meshy exports carry broken/absolute paths and would import grey).
//
// Per-model import fixes (Meshy files are usually wrong in at least one way):
//   targetHeight — model is uniformly rescaled so its bounding box is this
//                  many metres tall (normalises Meshy's arbitrary units).
//   upAxisFix    — set to 'z-up' if the model imports lying on its back.
//   yaw          — extra Y rotation in degrees if it faces the wrong way.
// Pivot is always re-centred to bottom-centre and transforms baked.
// QA every import in tools/turntable.html?asset=<name> before trusting it.
// ============================================================================

export const MANIFEST = {
  models: {
    //             file: 'assets/models/shadow/shadow.fbx'  <- flip when delivered
    shadow:    { file: null, targetHeight: 2.4, upAxisFix: null, yaw: 0 },
    human:     { file: null, targetHeight: 1.8, upAxisFix: null, yaw: 0 },
    piano:     { file: null, targetHeight: 1.25, upAxisFix: null, yaw: 0 },
    bookshelf: { file: null, targetHeight: 2.2, upAxisFix: null, yaw: 0 },
  },

  audio: {
    // Music. 57s, already trimmed/faded — used as-is.
    melody_main: { file: null }, // 'assets/audio/melody_main.wav'

    // Seven clean piano notes (WAV only — no MP3, encoder padding adds latency).
    note_1: { file: null }, note_2: { file: null }, note_3: { file: null },
    note_4: { file: null }, note_5: { file: null }, note_6: { file: null },
    note_7: { file: null },

    // Off-time flat/detuned variants. If left null while note_N exists,
    // the engine pitch-shifts note_N at runtime instead.
    note_1_flat: { file: null }, note_2_flat: { file: null },
    note_3_flat: { file: null }, note_4_flat: { file: null },
    note_5_flat: { file: null }, note_6_flat: { file: null },
    note_7_flat: { file: null },

    wrong_key:       { file: null }, // dissonant clang
    footstep:        { file: null },
    shelf_fall:      { file: null },
    books_scatter:   { file: null },
    door_slam:       { file: null },
    light_fail:      { file: null },
    ghost_ambience:  { file: null }, // loop; distance drives volume/filter
    chair_fall:      { file: null }, // cutscene
    tv_murmur:       { file: null }, // cutscene, loop
    paper_handling:  { file: null }, // cutscene
    practice_piano:  { file: null }, // cutscene — the uncle playing the melody badly
  },

  data: {
    beatmap:           'assets/beatmaps/melody_main.json',
    cutsceneTimeline:  'assets/data/cutscene_timeline.json',
    chaseTriggers:     'assets/data/chase_triggers.json',
    pianoKeys:         'assets/data/piano_keys.json',
  },
};
