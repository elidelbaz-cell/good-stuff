-- EconomyManager (ServerScript) — place in ServerScriptService
-- Manages coins, spins, inventory, and equipped sword per player.

local Players        = game:GetService("Players")
local RS             = game:GetService("ReplicatedStorage")
local SwordData      = require(RS:WaitForChild("SwordData"))

local SPIN_COST      = 100   -- coins per spin
local COIN_KILL      = 25    -- coins awarded for a kill
local COIN_ASSIST    = 8     -- coins awarded for an assist

-- Wait for remotes
local AddCoins      = RS:WaitForChild("AddCoins")
local GetPlayerData = RS:WaitForChild("GetPlayerData")
local RequestSpin   = RS:WaitForChild("RequestSpin")
local SpinResult    = RS:WaitForChild("SpinResult")
local EquipSword    = RS:WaitForChild("EquipSword")

-- In-memory player data (reset on server restart; replace with DataStore for persistence)
local PlayerData = {}

local function NewData()
	return {
		Coins     = 150,  -- starting coins so new players can spin immediately
		Inventory = { "Iron Sword" },
		Equipped  = "Iron Sword",
	}
end

local function GetData(player)
	return PlayerData[player.UserId]
end

-- ── Player lifecycle ──────────────────────────────────────────────────────────

Players.PlayerAdded:Connect(function(player)
	PlayerData[player.UserId] = NewData()
	print(("[Economy] %s joined — data initialised."):format(player.Name))
end)

Players.PlayerRemoving:Connect(function(player)
	PlayerData[player.UserId] = nil
end)

-- ── RemoteFunction: GetPlayerData ─────────────────────────────────────────────

GetPlayerData.OnServerInvoke = function(player)
	local data = GetData(player)
	if not data then return nil end
	-- Return a shallow copy so callers can't mutate server state
	return {
		Coins     = data.Coins,
		Inventory = table.clone(data.Inventory),
		Equipped  = data.Equipped,
	}
end

-- ── RemoteEvent: RequestSpin ──────────────────────────────────────────────────

RequestSpin.OnServerEvent:Connect(function(player)
	local data = GetData(player)
	if not data then return end

	if data.Coins < SPIN_COST then
		SpinResult:FireClient(player, nil, nil, "Not enough coins! Need " .. SPIN_COST)
		return
	end

	data.Coins = data.Coins - SPIN_COST

	local swordName, rarity = SwordData.RollSword()

	-- Add to inventory if not already owned
	local owned = false
	for _, name in ipairs(data.Inventory) do
		if name == swordName then owned = true; break end
	end
	if not owned then
		table.insert(data.Inventory, swordName)
	end

	-- Notify client of result
	SpinResult:FireClient(player, swordName, rarity, nil)
	-- Sync updated coin count
	AddCoins:FireClient(player, data.Coins)

	print(("[Economy] %s spun — got %s (%s). Coins left: %d"):format(
		player.Name, swordName, rarity, data.Coins))
end)

-- ── RemoteEvent: EquipSword ───────────────────────────────────────────────────

EquipSword.OnServerEvent:Connect(function(player, swordName)
	local data = GetData(player)
	if not data then return end

	-- Validate ownership
	local owned = false
	for _, name in ipairs(data.Inventory) do
		if name == swordName then owned = true; break end
	end

	if not owned then
		warn(("[Economy] %s tried to equip unowned sword: %s"):format(player.Name, swordName))
		return
	end

	data.Equipped = swordName
	print(("[Economy] %s equipped %s"):format(player.Name, swordName))
end)

-- ── Public API used by CombatHandler ─────────────────────────────────────────

local EconomyManager = {}

function EconomyManager.AwardKill(player)
	local data = GetData(player)
	if not data then return end
	data.Coins = data.Coins + COIN_KILL
	AddCoins:FireClient(player, data.Coins)
end

function EconomyManager.AwardAssist(player)
	local data = GetData(player)
	if not data then return end
	data.Coins = data.Coins + COIN_ASSIST
	AddCoins:FireClient(player, data.Coins)
end

function EconomyManager.GetEquipped(player)
	local data = GetData(player)
	if not data then return "Iron Sword" end
	return data.Equipped
end

-- Expose for other server scripts via a BindableFunction or direct require.
-- Because ServerScripts can't require each other directly we store the API in
-- a shared table in script globals (use a BindableFunction in production).
_G.EconomyManager = EconomyManager

return EconomyManager
