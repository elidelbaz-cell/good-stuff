# good-stuff

Two games live in this repo:

- **[telescope-game/](telescope-game/)** — *Starfinder*, a mobile phone telescope game: find twelve invented planets at the right time and place, earn credits, upgrade your optics, complete the Planetary Index. Planet models are designed on a Claude Design canvas and used directly in the game.
- **src/** — the first-person Roblox sword fighting game described below.

---

# First-Person Sword Fighting Roblox Game

A first-person PvP sword fighting game with a spin-based progression system, special abilities, and two maps.

## Features

- **First-person camera** — fully locked, head accessories hidden from self
- **10 swords** across 5 rarities (Common → Legendary)
- **10 unique special abilities** (Burn, Freeze, Chain, PetalBurst, Eruption, Void, Thunder, HealSlash, BloodRush, ShadowStep)
- **Spin system** — spend 100 coins per spin for a random sword
- **Coin economy** — earn coins from kills and collectible coin bags on the map
- **Inventory panel** — view and equip any owned sword
- **2 maps** that rotate every 3 minutes:
  - Cherry Blossom — pink trees, torii gate, raised platforms, pond
  - Volcano — lava pools, erupting cone, rocky islands, damage zones
- **Kill feed** (top-right), map banner, ability cooldown bar

## File Structure

```
src/
├── ReplicatedStorage/
│   ├── SwordData.lua          ← ModuleScript — all sword/ability data + RollSword()
│   └── RemoteSetup.lua        ← Script — creates all RemoteEvents/Functions
│
├── ServerScriptService/
│   ├── EconomyManager.server.lua  ← coins, spins, inventory, equipped sword
│   ├── CombatHandler.server.lua   ← swing validation, damage, status effects, abilities
│   ├── MapManager.server.lua      ← builds Cherry Blossom & Volcano maps, rotates them
│   └── GameManager.server.lua     ← character setup, coin bags
│
├── StarterCharacterScripts/
│   └── FirstPerson.client.lua     ← locks camera to first person, hides own head
│
└── StarterPlayerScripts/
    ├── SwordController.client.lua ← sword model on arm, click to swing, Q for ability, VFX
    └── GuiController.client.lua   ← HUD, spin button, inventory panel, kill feed
```

## Installation (Roblox Studio)

1. Open a **new Baseplate** project in Roblox Studio.
2. Enable **Script Editor** and create the scripts manually, or use a plugin like **Rojo** to sync this folder directly.

### Manual setup:
1. In **ReplicatedStorage**, create two `ModuleScript` objects:
   - `SwordData` — paste contents of `ReplicatedStorage/SwordData.lua`
   - `RemoteSetup` — change to a `Script`, paste contents of `ReplicatedStorage/RemoteSetup.lua`
     *(Move RemoteSetup to ServerScriptService and run it first by setting RunContext = Server)*

2. In **ServerScriptService**, create four `Script` objects:
   - `RemoteSetup` — paste `RemoteSetup.lua`  ← run this first
   - `EconomyManager` — paste `EconomyManager.server.lua`
   - `CombatHandler` — paste `CombatHandler.server.lua`
   - `MapManager` — paste `MapManager.server.lua`
   - `GameManager` — paste `GameManager.server.lua`

3. In **StarterCharacterScripts**, create one `LocalScript`:
   - `FirstPerson` — paste `FirstPerson.client.lua`

4. In **StarterPlayerScripts**, create two `LocalScripts`:
   - `SwordController` — paste `SwordController.client.lua`
   - `GuiController` — paste `GuiController.client.lua`

5. In **StarterGui**, set `ResetPlayerGuiOnSpawn = false`.

6. Hit **Play** to test!

### With Rojo:
1. Install [Rojo](https://rojo.space/)
2. Run `rojo serve` in this directory
3. Connect from Roblox Studio

## Controls

| Action | Input |
|--------|-------|
| Swing sword | Left Mouse Button |
| Use ability | Q |
| Open inventory | Click "Inventory" button |
| Spin for sword | Click "SPIN" button |

## Sword Abilities Reference

| Sword | Rarity | Ability | Effect |
|-------|--------|---------|--------|
| Iron Sword | Common | None | — |
| Wooden Sword | Common | None | — |
| Fire Sword | Uncommon | Burn | 5 dmg/sec for 3s |
| Frost Blade | Uncommon | Freeze | -60% speed for 2.5s |
| Lightning Edge | Rare | Chain | Arc to 3 enemies for 50% dmg |
| Heal Blade | Rare | HealSlash | Heal 25% of damage dealt |
| Cherry Blossom Blade | Epic | PetalBurst | 20 AOE dmg in 8 studs |
| Shadow Fang | Epic | ShadowStep | 75% transparent for 4s |
| Volcano Blade | Legendary | Eruption | 5 lava pillars, 18 dmg each |
| Void Reaper | Legendary | Void | Teleport behind target |
