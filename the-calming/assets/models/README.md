# Drop Meshy FBX exports here

One folder per asset, FBX + its loose PNG texture set together:

```
assets/models/shadow/shadow.fbx
assets/models/shadow/shadow_texture.png      (base color)
assets/models/shadow/shadow_normal.png
assets/models/shadow/shadow_metallic.png
assets/models/shadow/shadow_roughness.png
assets/models/shadow/shadow_emission.png
```

Then flip the `file` field in `assets/manifest.js`:

```js
shadow: { file: 'assets/models/shadow/shadow.fbx', targetHeight: 2.4, ... },
```

That's the whole swap — the importer reconnects the textures by filename,
normalises scale to `targetHeight` metres, re-centres the pivot to
bottom-centre, and the game uses it everywhere the placeholder was.

**Always QA a new import first:** open `tools/turntable.html?asset=shadow`
(any manifest name). If it lies on its back set `upAxisFix: 'z-up'`; if it
faces the wrong way set `yaw`; if it's giant/tiny adjust `targetHeight`.
