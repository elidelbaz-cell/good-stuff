-- RemoteSetup (Script) — place in ServerScriptService, runs first
-- Creates all RemoteEvents and RemoteFunctions in ReplicatedStorage.

local RS = game:GetService("ReplicatedStorage")

local function makeRemote(className, name)
	if not RS:FindFirstChild(name) then
		local r = Instance.new(className)
		r.Name = name
		r.Parent = RS
	end
end

-- Economy
makeRemote("RemoteEvent",    "AddCoins")          -- server → client (UI update)
makeRemote("RemoteFunction", "GetPlayerData")     -- client ← server (coins, inventory, equipped)
makeRemote("RemoteEvent",    "RequestSpin")       -- client → server
makeRemote("RemoteEvent",    "SpinResult")        -- server → client (sword name, rarity)
makeRemote("RemoteEvent",    "EquipSword")        -- client → server

-- Combat
makeRemote("RemoteEvent",    "SwingRequest")      -- client → server
makeRemote("RemoteEvent",    "AbilityRequest")    -- client → server
makeRemote("RemoteEvent",    "HitEffect")         -- server → all clients (VFX)
makeRemote("RemoteEvent",    "AbilityEffect")     -- server → all clients (VFX)
makeRemote("RemoteEvent",    "PlayerDied")        -- server → all clients

-- Map
makeRemote("RemoteEvent",    "MapChanged")        -- server → all clients

print("[RemoteSetup] All remotes created.")
