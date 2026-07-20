// ============================================================================
// THE CALMING — all tunables in one place.
// Anything the designer will want to nudge lives here or in assets/data/*.json.
// ============================================================================

export const CONFIG = {

  // -------------------------------------------------------------- player ----
  player: {
    eyeHeight: 1.6,          // metres, standing
    slideEyeHeight: 0.65,    // metres, while sliding
    bodyHeight: 1.75,        // collision height standing
    slideBodyHeight: 0.8,    // collision height sliding
    radius: 0.35,            // collision radius (XZ)
    sprintSpeed: 7.0,        // m/s — sprint is ALWAYS on, there is no walk
    accel: 40.0,             // ground acceleration
    airControl: 0.35,        // fraction of accel while airborne
    jumpVelocity: 5.2,       // m/s up
    gravity: 14.0,           // m/s^2 (slightly gamey — snappier than 9.8)
    slideDuration: 0.85,     // seconds
    slideCooldown: 0.25,     // seconds after slide before next
    slideBoost: 1.15,        // speed multiplier during slide
    lookSensitivity: 0.0023, // radians per px
    pitchLimit: 1.45,        // radians up/down clamp (chase)
  },

  // --------------------------------------------------------------- ghost ----
  ghost: {
    startGap: 14.0,          // metres behind the player at chase start
    spawnGraceSeconds: 3.5,  // it comes slowly at first — time to turn and run
    graceFactor: 0.3,        // ghost speed multiplier during the grace window
    desiredGap: 12.0,        // the distance it "wants" to hold
    maxGap: 18.0,            // never falls further behind than this
    reopenRate: 0.55,        // m/s the gap re-opens while the player runs clean
    closeSpeed: 6.6,         // m/s ghost speed while the player is slowed/stopped
    matchSpeed: 7.0,         // m/s while holding distance (== sprintSpeed)
    staggerCloseBonus: 3.0,  // extra metres closed instantly per stagger
    staggersToDeath: 3,      // third stagger = caught
    killDistance: 1.1,       // gap below this = death
    hoverHeight: 1.15,       // metres off the floor
    swayAmount: 0.35,        // idle drift of the shadow
    emissiveNear: 3.2,       // emissive intensity at kill distance
    emissiveFar: 0.25,       // emissive intensity at maxGap
    lungeSpeed: 24.0,        // m/s during the final catch lunge
  },

  // --------------------------------------------------------------- chase ----
  chase: {
    corridorWidth: 8.0,       // metres wall-to-wall
    staggerDuration: 0.5,     // seconds lost per mistimed obstacle
    shelfToppleTime: 0.65,    // seconds for a shelf to fall
    shelfTriggerLead: 16.0,   // shelf starts falling this many metres ahead
    jumpBarrierHeight: 0.65,  // fallen-flat shelf: jump over this
    slideBarrierClearance: 1.05, // leaning shelf: gap underneath to slide through
    lightSpacingS: 12.0,      // ceiling light every N metres of path
    bookBurstCount: 14,       // scattered books per toppling shelf
    // Bookshelf trigger placements load from assets/data/chase_triggers.json
  },

  // --------------------------------------------------------------- piano ----
  piano: {
    yawLimit: 0.85,           // radians left/right while seated (edges of vision)
    pitchMin: -0.95,          // look down at the keys
    pitchMax: 0.15,           // barely up
    ghostStartDistance: 11.0, // metres, door threshold to player
    killDistance: 1.2,        // ghost this close = death
    stepOffTime: 0.6,         // metres ghost advances: correct key, off time
    stepWrongKey: 1.6,        // metres: wrong key (BIG step)
    stepMiss: 0.9,            // metres: silence where a note should be
    streakForRecovery: 4,     // clean hits in a row before it starts backing off
    recoveryPerHit: 0.45,     // metres regained per clean hit once streaking
    offTimeWindowMs: 260,     // pressed the right key but this far off = "off time"
    keycapTravel: 0.006,      // metres a key-cap depresses (a few millimetres)
    keycapReturnMs: 110,
    // Key hitbox positions/sizes load from assets/data/piano_keys.json
  },

  // --------------------------------------------------------------- hands ----
  hands: {
    hoverHeight: 0.06,        // metres above the key-caps at rest
    pressLerpTime: 0.09,      // seconds down to the key
    releaseLerpTime: 0.16,    // seconds back up
    travelLerpTime: 0.28,     // seconds of sideways travel to the next key
    lookAheadBeats: 1.0,      // hand moves to hover the next key this early
    // keys 1–3 = left hand, 5–7 = right hand, 4 = least-recently-moved
  },

  // --------------------------------------------------------------- death ----
  death: {
    faceGhostTime: 0.5,       // seconds for the seized camera to turn
    holdTime: 2.0,            // seconds held on the ghost — no cut-away
    blackTime: 1.4,           // seconds of silent black before respawn
  },

  // ------------------------------------------------------------ cutscene ----
  cutscene: {
    // Beat timings load from assets/data/cutscene_timeline.json — retime there.
    skipHoldSeconds: 2.0,     // hold F this long to skip (optional input)
  },

  // --------------------------------------------------------------- audio ----
  audio: {
    masterVolume: 0.8,
    droneFar: 0.03,           // ghost ambience gain at maxGap
    droneNear: 0.55,          // gain at kill distance
    guideToneVolume: 0.12,    // placeholder "song" tones (until melody_main.wav)
    noteVolume: 0.5,
  },

  // ----------------------------------------------------------------- dev ----
  dev: {
    showKeyLabels: true,      // floating 1–7 labels over the key-caps
                              // (placeholder aid — turn off once real piano art lands)
  },

  // Fired when the melody completes. Placeholder behaviour until the ending
  // is decided — swap the body of this function, nothing else listens yet.
  // A window CustomEvent 'OnMelodyComplete' is also dispatched.
  onMelodyComplete(game) {
    game.hud.showMessage('...', 6000);
    game.hud.fadeToBlack(8);
  },
};
