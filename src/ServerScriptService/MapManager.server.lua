-- MapManager (ServerScript) — place in ServerScriptService
-- Builds Cherry Blossom and Volcano maps procedurally in Workspace,
-- rotates between them every round, and fires MapChanged to all clients.

local Players  = game:GetService("Players")
local RS       = game:GetService("ReplicatedStorage")
local Lighting = game:GetService("Lighting")

local MapChanged = RS:WaitForChild("MapChanged")

local MAP_DURATION = 180  -- seconds per map before rotation
local MAPS         = { "CherryBlossom", "Volcano" }
local currentMapIndex = 1

-- ── Utility ───────────────────────────────────────────────────────────────────

local function ClearMap()
	local mapFolder = workspace:FindFirstChild("CurrentMap")
	if mapFolder then mapFolder:Destroy() end
end

local function MakePart(props)
	local p = Instance.new("Part")
	p.Anchored   = true
	p.CanCollide = true
	for k, v in pairs(props) do
		p[k] = v
	end
	return p
end

-- ── Spawn points ──────────────────────────────────────────────────────────────

local function CreateSpawnPoints(folder, positions)
	for i, pos in ipairs(positions) do
		local sp = Instance.new("SpawnLocation")
		sp.Name        = "Spawn" .. i
		sp.Position    = pos
		sp.Size        = Vector3.new(4, 1, 4)
		sp.Anchored    = true
		sp.CanCollide  = true
		sp.BrickColor  = BrickColor.new("White")
		sp.Transparency = 0.5
		sp.Parent      = folder
	end
end

-- ── CHERRY BLOSSOM MAP ────────────────────────────────────────────────────────

local function BuildCherryBlossom()
	local folder = Instance.new("Folder")
	folder.Name  = "CurrentMap"
	folder.Parent = workspace

	-- Ground
	local ground = MakePart({
		Name      = "Ground",
		Size      = Vector3.new(200, 2, 200),
		Position  = Vector3.new(0, -1, 0),
		BrickColor = BrickColor.new("Bright green"),
		Material  = Enum.Material.Grass,
	})
	ground.Parent = folder

	-- Pond (decorative, kills on contact via script below)
	local pond = MakePart({
		Name      = "Pond",
		Size      = Vector3.new(30, 1, 30),
		Position  = Vector3.new(0, -0.45, 0),
		BrickColor = BrickColor.new("Bright blue"),
		Material  = Enum.Material.SmoothPlastic,
		Transparency = 0.4,
	})
	pond.Parent = folder

	-- Lily pads / stepping stones
	local stonePositions = {
		Vector3.new(-8, 0, -8), Vector3.new(0, 0, -10),
		Vector3.new(8, 0, -8),  Vector3.new(-8, 0, 8),
		Vector3.new(0, 0, 10),  Vector3.new(8, 0, 8),
	}
	for _, pos in ipairs(stonePositions) do
		local stone = MakePart({
			Size      = Vector3.new(3, 0.5, 3),
			Position  = pos,
			BrickColor = BrickColor.new("Sand green"),
			Material  = Enum.Material.SmoothPlastic,
			Shape     = Enum.PartType.Cylinder,
		})
		stone.Parent = folder
	end

	-- Cherry blossom trees (simplified: trunk + canopy)
	local treePositions = {
		Vector3.new(-30, 0, -30), Vector3.new(30, 0, -30),
		Vector3.new(-30, 0, 30),  Vector3.new(30, 0, 30),
		Vector3.new(0, 0, -50),   Vector3.new(0, 0, 50),
		Vector3.new(-50, 0, 0),   Vector3.new(50, 0, 0),
	}
	for _, pos in ipairs(treePositions) do
		-- Trunk
		local trunk = MakePart({
			Size      = Vector3.new(2, 12, 2),
			Position  = pos + Vector3.new(0, 6, 0),
			BrickColor = BrickColor.new("Reddish brown"),
			Material  = Enum.Material.Wood,
		})
		trunk.Parent = folder
		-- Canopy
		local canopy = MakePart({
			Size      = Vector3.new(14, 10, 14),
			Position  = pos + Vector3.new(0, 17, 0),
			BrickColor = BrickColor.new("Carnation pink"),
			Material  = Enum.Material.Neon,
			Transparency = 0.2,
			Shape     = Enum.PartType.Ball,
		})
		canopy.CanCollide = false
		canopy.Parent = folder
	end

	-- Raised platforms for combat
	local platformData = {
		{ Vector3.new(-20, 4, 0),  Vector3.new(12, 2, 12) },
		{ Vector3.new(20, 4, 0),   Vector3.new(12, 2, 12) },
		{ Vector3.new(0, 6, -20),  Vector3.new(10, 2, 10) },
		{ Vector3.new(0, 6, 20),   Vector3.new(10, 2, 10) },
	}
	for _, d in ipairs(platformData) do
		local plat = MakePart({
			Size      = d[2],
			Position  = d[1],
			BrickColor = BrickColor.new("Light stone grey"),
			Material  = Enum.Material.SmoothPlastic,
		})
		plat.Parent = folder
	end

	-- Torii gate (two pillars + crossbeam)
	local gatePos = Vector3.new(0, 0, -60)
	for _, offset in ipairs({ -6, 6 }) do
		local pillar = MakePart({
			Size      = Vector3.new(1.5, 14, 1.5),
			Position  = gatePos + Vector3.new(offset, 7, 0),
			BrickColor = BrickColor.new("Bright red"),
			Material  = Enum.Material.SmoothPlastic,
		})
		pillar.Parent = folder
	end
	local crossbeam = MakePart({
		Size      = Vector3.new(16, 1.5, 1.5),
		Position  = gatePos + Vector3.new(0, 14, 0),
		BrickColor = BrickColor.new("Bright red"),
		Material  = Enum.Material.SmoothPlastic,
	})
	crossbeam.Parent = folder

	-- Boundary walls (invisible)
	for _, d in ipairs({
		{ Vector3.new(101, 20, 0),  Vector3.new(2, 40, 200) },
		{ Vector3.new(-101, 20, 0), Vector3.new(2, 40, 200) },
		{ Vector3.new(0, 20, 101),  Vector3.new(200, 40, 2) },
		{ Vector3.new(0, 20, -101), Vector3.new(200, 40, 2) },
	}) do
		local wall = MakePart({ Size = d[2], Position = d[1], Transparency = 1 })
		wall.Parent = folder
	end

	-- Spawn points
	CreateSpawnPoints(folder, {
		Vector3.new(-40, 2, 0), Vector3.new(40, 2, 0),
		Vector3.new(0, 2, -40), Vector3.new(0, 2, 40),
		Vector3.new(-20, 6, 0), Vector3.new(20, 6, 0),
	})

	-- Lighting for cherry blossom
	Lighting.Ambient         = Color3.fromRGB(180, 160, 170)
	Lighting.OutdoorAmbient  = Color3.fromRGB(200, 180, 190)
	Lighting.TimeOfDay       = "10:00:00"
	Lighting.FogEnd          = 500
	Lighting.FogColor        = Color3.fromRGB(255, 220, 230)

	return folder
end

-- ── VOLCANO MAP ───────────────────────────────────────────────────────────────

local function BuildVolcano()
	local folder = Instance.new("Folder")
	folder.Name  = "CurrentMap"
	folder.Parent = workspace

	-- Ground (dark rock)
	local ground = MakePart({
		Name      = "Ground",
		Size      = Vector3.new(200, 2, 200),
		Position  = Vector3.new(0, -1, 0),
		BrickColor = BrickColor.new("Dark orange"),
		Material  = Enum.Material.Basalt,
	})
	ground.Parent = folder

	-- Lava rivers / pools
	local lavaPools = {
		{ Vector3.new(0, -0.4, 0),     Vector3.new(40, 1, 40) },
		{ Vector3.new(-60, -0.4, 0),   Vector3.new(20, 1, 80) },
		{ Vector3.new(60, -0.4, 0),    Vector3.new(20, 1, 80) },
	}
	for _, d in ipairs(lavaPools) do
		local lava = MakePart({
			Size      = d[2],
			Position  = d[1],
			BrickColor = BrickColor.new("Bright orange"),
			Material  = Enum.Material.Neon,
			Transparency = 0.1,
		})
		lava.Name   = "Lava"
		lava.Parent = folder
		-- Players who touch lava take damage
		lava.Touched:Connect(function(hit)
			local char = hit.Parent
			if char then
				local hum = char:FindFirstChildOfClass("Humanoid")
				if hum and hum.Health > 0 then
					hum:TakeDamage(8)
				end
			end
		end)
	end

	-- Volcano cone
	for i = 1, 6 do
		local layer = MakePart({
			Size      = Vector3.new(30 - i * 3, 6, 30 - i * 3),
			Position  = Vector3.new(0, (i - 1) * 6 + 3, 0),
			BrickColor = BrickColor.new("Dark stone grey"),
			Material  = Enum.Material.Basalt,
			Shape     = Enum.PartType.Cylinder,
		})
		layer.Parent = folder
	end

	-- Glowing crater at top
	local crater = MakePart({
		Size      = Vector3.new(12, 2, 12),
		Position  = Vector3.new(0, 33, 0),
		BrickColor = BrickColor.new("Bright orange"),
		Material  = Enum.Material.Neon,
		Shape     = Enum.PartType.Cylinder,
	})
	crater.Parent = folder
	crater.Touched:Connect(function(hit)
		local hum = hit.Parent and hit.Parent:FindFirstChildOfClass("Humanoid")
		if hum then hum:TakeDamage(20) end
	end)

	-- Rocky platforms / islands
	local platforms = {
		{ Vector3.new(-35, 5, -35), Vector3.new(16, 3, 16) },
		{ Vector3.new(35, 5, -35),  Vector3.new(16, 3, 16) },
		{ Vector3.new(-35, 5, 35),  Vector3.new(16, 3, 16) },
		{ Vector3.new(35, 5, 35),   Vector3.new(16, 3, 16) },
		{ Vector3.new(0, 8, -50),   Vector3.new(14, 3, 14) },
		{ Vector3.new(0, 8, 50),    Vector3.new(14, 3, 14) },
	}
	for _, d in ipairs(platforms) do
		local plat = MakePart({
			Size      = d[2],
			Position  = d[1],
			BrickColor = BrickColor.new("Dark stone grey"),
			Material  = Enum.Material.Basalt,
		})
		plat.Parent = folder
		-- Scorched top
		local top = MakePart({
			Size      = d[2] - Vector3.new(0, 2.5, 0),
			Position  = d[1] + Vector3.new(0, 1.5, 0),
			BrickColor = BrickColor.new("Black"),
			Material  = Enum.Material.Slate,
		})
		top.Parent = folder
	end

	-- Lava fall pillars (decorative neon)
	for _, xz in ipairs({ {-70, -70}, {70, -70}, {-70, 70}, {70, 70} }) do
		local pillar = MakePart({
			Size      = Vector3.new(4, 30, 4),
			Position  = Vector3.new(xz[1], 15, xz[2]),
			BrickColor = BrickColor.new("Bright orange"),
			Material  = Enum.Material.Neon,
			Transparency = 0.5,
		})
		pillar.CanCollide = false
		pillar.Parent = folder
	end

	-- Boundary walls
	for _, d in ipairs({
		{ Vector3.new(101, 20, 0),  Vector3.new(2, 40, 200) },
		{ Vector3.new(-101, 20, 0), Vector3.new(2, 40, 200) },
		{ Vector3.new(0, 20, 101),  Vector3.new(200, 40, 2) },
		{ Vector3.new(0, 20, -101), Vector3.new(200, 40, 2) },
	}) do
		local wall = MakePart({ Size = d[2], Position = d[1], Transparency = 1 })
		wall.Parent = folder
	end

	-- Spawn points on safe platforms
	CreateSpawnPoints(folder, {
		Vector3.new(-35, 8, -35), Vector3.new(35, 8, -35),
		Vector3.new(-35, 8, 35),  Vector3.new(35, 8, 35),
		Vector3.new(0, 11, -50),  Vector3.new(0, 11, 50),
	})

	-- Dramatic volcano lighting
	Lighting.Ambient         = Color3.fromRGB(80, 30, 10)
	Lighting.OutdoorAmbient  = Color3.fromRGB(120, 50, 10)
	Lighting.TimeOfDay       = "20:00:00"
	Lighting.FogEnd          = 300
	Lighting.FogColor        = Color3.fromRGB(120, 50, 10)

	return folder
end

-- ── Map rotation loop ─────────────────────────────────────────────────────────

local builders = {
	CherryBlossom = BuildCherryBlossom,
	Volcano       = BuildVolcano,
}

local function LoadMap(name)
	print(("[MapManager] Loading map: %s"):format(name))
	ClearMap()

	local builder = builders[name]
	if not builder then
		warn("[MapManager] Unknown map: " .. name)
		return
	end

	builder()

	-- Respawn all current players at new spawn points
	task.wait(0.5)
	for _, player in ipairs(Players:GetPlayers()) do
		if player.Character then
			player:LoadCharacter()
		end
	end

	MapChanged:FireAllClients(name)
	print(("[MapManager] Map %s loaded."):format(name))
end

-- Initial map
LoadMap(MAPS[currentMapIndex])

-- Rotate every MAP_DURATION seconds
task.spawn(function()
	while true do
		task.wait(MAP_DURATION)
		currentMapIndex = (currentMapIndex % #MAPS) + 1
		LoadMap(MAPS[currentMapIndex])
	end
end)

print("[MapManager] Loaded.")
