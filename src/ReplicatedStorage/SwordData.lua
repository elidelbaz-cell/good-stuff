-- SwordData (ModuleScript) — place in ReplicatedStorage
-- All sword definitions, rarities, spin weights, and special abilities.

local SwordData = {}

-- Rarity spin weights (higher = more common)
SwordData.RarityWeights = {
	Common    = 55,
	Uncommon  = 25,
	Rare      = 12,
	Epic      = 6,
	Legendary = 2,
}

SwordData.RarityColors = {
	Common    = Color3.fromRGB(180, 180, 180),
	Uncommon  = Color3.fromRGB(80, 200, 80),
	Rare      = Color3.fromRGB(60, 120, 255),
	Epic      = Color3.fromRGB(160, 60, 255),
	Legendary = Color3.fromRGB(255, 180, 0),
}

--[[
    Ability types (handled by CombatHandler):
    "Burn"        — deals 5 damage/sec for 3s
    "Freeze"      — slows target movement by 60% for 2.5s
    "Chain"       — arcs to up to 3 nearby enemies for 50% damage
    "PetalBurst"  — AOE burst around player, 20 damage in 8 stud radius
    "Eruption"    — spawns 5 lava pillars randomly around hit point
    "Void"        — teleports attacker behind target instantly
    "Thunder"     — strikes target location with lightning after 0.5s (30 dmg)
    "HealSlash"   — heals attacker for 25% of damage dealt
    "BloodRush"   — +50% move speed for 3s after kill
    "ShadowStep"  — attacker becomes semi-transparent for 4s (reduced detection)
--]]

SwordData.Swords = {
	-- ─────────────── COMMON ───────────────
	{
		Name             = "Iron Sword",
		Rarity           = "Common",
		Damage           = 15,
		Cooldown         = 0.75,
		ReachStuds       = 6,
		Color            = Color3.fromRGB(150, 150, 155),
		Ability          = nil,
		AbilityCooldown  = 0,
		AbilityDesc      = "No special ability.",
	},
	{
		Name             = "Wooden Sword",
		Rarity           = "Common",
		Damage           = 10,
		Cooldown         = 0.6,
		ReachStuds       = 5,
		Color            = Color3.fromRGB(139, 90, 43),
		Ability          = nil,
		AbilityCooldown  = 0,
		AbilityDesc      = "No special ability.",
	},

	-- ─────────────── UNCOMMON ───────────────
	{
		Name             = "Fire Sword",
		Rarity           = "Uncommon",
		Damage           = 22,
		Cooldown         = 0.8,
		ReachStuds       = 6,
		Color            = Color3.fromRGB(255, 90, 0),
		Ability          = "Burn",
		AbilityCooldown  = 10,
		AbilityDesc      = "Sets enemy on fire: 5 dmg/sec for 3 seconds.",
	},
	{
		Name             = "Frost Blade",
		Rarity           = "Uncommon",
		Damage           = 18,
		Cooldown         = 0.85,
		ReachStuds       = 6,
		Color            = Color3.fromRGB(140, 210, 255),
		Ability          = "Freeze",
		AbilityCooldown  = 12,
		AbilityDesc      = "Slows enemy by 60% for 2.5 seconds.",
	},

	-- ─────────────── RARE ───────────────
	{
		Name             = "Lightning Edge",
		Rarity           = "Rare",
		Damage           = 28,
		Cooldown         = 0.7,
		ReachStuds       = 7,
		Color            = Color3.fromRGB(255, 240, 60),
		Ability          = "Chain",
		AbilityCooldown  = 14,
		AbilityDesc      = "Chains lightning to up to 3 nearby enemies for 50% damage.",
	},
	{
		Name             = "Heal Blade",
		Rarity           = "Rare",
		Damage           = 24,
		Cooldown         = 0.9,
		ReachStuds       = 6,
		Color            = Color3.fromRGB(60, 220, 130),
		Ability          = "HealSlash",
		AbilityCooldown  = 8,
		AbilityDesc      = "Heals you for 25% of damage dealt on hit.",
	},

	-- ─────────────── EPIC ───────────────
	{
		Name             = "Cherry Blossom Blade",
		Rarity           = "Epic",
		Damage           = 35,
		Cooldown         = 0.75,
		ReachStuds       = 7,
		Color            = Color3.fromRGB(255, 160, 190),
		Ability          = "PetalBurst",
		AbilityCooldown  = 16,
		AbilityDesc      = "Unleashes a petal burst — 20 AOE damage in 8 studs.",
	},
	{
		Name             = "Shadow Fang",
		Rarity           = "Epic",
		Damage           = 32,
		Cooldown         = 0.65,
		ReachStuds       = 7,
		Color            = Color3.fromRGB(60, 30, 90),
		Ability          = "ShadowStep",
		AbilityCooldown  = 18,
		AbilityDesc      = "Become semi-transparent for 4 seconds after activating.",
	},

	-- ─────────────── LEGENDARY ───────────────
	{
		Name             = "Volcano Blade",
		Rarity           = "Legendary",
		Damage           = 45,
		Cooldown         = 0.85,
		ReachStuds       = 8,
		Color            = Color3.fromRGB(255, 50, 0),
		Ability          = "Eruption",
		AbilityCooldown  = 20,
		AbilityDesc      = "Eruption: spawns 5 lava pillars around the hit point.",
	},
	{
		Name             = "Void Reaper",
		Rarity           = "Legendary",
		Damage           = 40,
		Cooldown         = 0.7,
		ReachStuds       = 8,
		Color            = Color3.fromRGB(20, 0, 40),
		Ability          = "Void",
		AbilityCooldown  = 22,
		AbilityDesc      = "Teleport instantly behind your target on hit.",
	},
}

-- Build a lookup table by name for fast access
SwordData.ByName = {}
for _, sword in ipairs(SwordData.Swords) do
	SwordData.ByName[sword.Name] = sword
end

-- Returns a random sword name based on rarity weights
function SwordData.RollSword()
	-- First roll a rarity
	local totalWeight = 0
	for _, w in pairs(SwordData.RarityWeights) do
		totalWeight = totalWeight + w
	end
	local roll = math.random(1, totalWeight)
	local cumulative = 0
	local chosenRarity = "Common"
	for rarity, weight in pairs(SwordData.RarityWeights) do
		cumulative = cumulative + weight
		if roll <= cumulative then
			chosenRarity = rarity
			break
		end
	end

	-- Collect swords of that rarity
	local pool = {}
	for _, sword in ipairs(SwordData.Swords) do
		if sword.Rarity == chosenRarity then
			table.insert(pool, sword.Name)
		end
	end

	-- Fallback to Common if rarity pool is empty
	if #pool == 0 then
		pool = { "Iron Sword" }
	end

	return pool[math.random(1, #pool)], chosenRarity
end

return SwordData
