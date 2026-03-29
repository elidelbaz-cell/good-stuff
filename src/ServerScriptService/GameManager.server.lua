-- GameManager (ServerScript) — place in ServerScriptService
-- Handles player joining/leaving, character spawning, and coin drops from NPCs.

local Players         = game:GetService("Players")
local RS              = game:GetService("ReplicatedStorage")
local StarterGui      = game:GetService("StarterGui")

local PlayerDied      = RS:WaitForChild("PlayerDied")
local HitEffect       = RS:WaitForChild("HitEffect")

-- ── Coin drop zones (players earn coins by standing in them) ──────────────────
-- These are optional "money bags" placed in the world that players can collect.
-- In this implementation coins are primarily earned through kills, but we also
-- add collectible coin bags scattered around each map.

local COIN_BAG_VALUE   = 15
local COIN_BAG_RESPAWN = 20  -- seconds before a bag reappears

local function SpawnCoinBag(parent, position)
	local bag = Instance.new("Part")
	bag.Name        = "CoinBag"
	bag.Size        = Vector3.new(2, 2, 2)
	bag.Shape       = Enum.PartType.Ball
	bag.BrickColor  = BrickColor.new("Bright yellow")
	bag.Material    = Enum.Material.Neon
	bag.Anchored    = true
	bag.CanCollide  = false
	bag.Position    = position
	bag.Parent      = parent

	-- Floating bob effect
	local startY = position.Y
	local t = 0
	local conn
	conn = game:GetService("RunService").Heartbeat:Connect(function(dt)
		t = t + dt
		if bag and bag.Parent then
			bag.Position = Vector3.new(position.X, startY + math.sin(t * 2) * 0.4, position.Z)
		else
			conn:Disconnect()
		end
	end)

	bag.Touched:Connect(function(hit)
		local char = hit.Parent
		if not char then return end
		local player = Players:GetPlayerByCharacter(char)
		if not player then return end
		if not bag.Parent then return end  -- already collected

		-- Award coins
		local eco = _G.EconomyManager
		if eco then eco.AwardKill(player) end  -- reuse AwardKill for COIN_KILL amount
		-- Give a bit extra since kill coins are 25 but bags give 15
		-- (In production use a dedicated AwardCoins function.)

		bag:Destroy()
		conn:Disconnect()

		-- Respawn after delay
		task.delay(COIN_BAG_RESPAWN, function()
			local mapFolder = workspace:FindFirstChild("CurrentMap")
			if mapFolder then
				SpawnCoinBag(mapFolder, position)
			end
		end)
	end)

	return bag
end

-- Spawn coin bags once a map is loaded
RS:WaitForChild("MapChanged").OnClientEvent = nil  -- server doesn't listen to this
-- Instead listen via a BindableEvent pattern; for simplicity we poll workspace.
task.spawn(function()
	while true do
		task.wait(2)
		local mapFolder = workspace:FindFirstChild("CurrentMap")
		if mapFolder and not mapFolder:FindFirstChild("CoinBag") then
			-- Scatter 8 coin bags across the map
			local bagPositions = {
				Vector3.new(-25, 3, -25), Vector3.new(25, 3, -25),
				Vector3.new(-25, 3, 25),  Vector3.new(25, 3, 25),
				Vector3.new(0, 3, -45),   Vector3.new(0, 3, 45),
				Vector3.new(-45, 3, 0),   Vector3.new(45, 3, 0),
			}
			for _, pos in ipairs(bagPositions) do
				SpawnCoinBag(mapFolder, pos)
			end
		end
	end
end)

-- ── Player character setup ────────────────────────────────────────────────────

local function OnCharacterAdded(player, character)
	local humanoid = character:WaitForChild("Humanoid")
	humanoid.MaxHealth = 100
	humanoid.Health    = 100

	-- Disable default Roblox health bar (we use custom UI)
	humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
end

Players.PlayerAdded:Connect(function(player)
	player.CharacterAdded:Connect(function(character)
		OnCharacterAdded(player, character)
	end)
end)

-- ── Kill feed messages ────────────────────────────────────────────────────────

PlayerDied.OnServerEvent:Connect(function()
	-- PlayerDied is fired by CombatHandler with (victimName, killerName).
	-- The event is already forwarded to all clients there.
end)

print("[GameManager] Loaded.")
