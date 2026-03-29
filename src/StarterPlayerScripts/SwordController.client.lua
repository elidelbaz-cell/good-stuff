-- SwordController (LocalScript) — place in StarterPlayerScripts
-- Handles local sword rendering on the character's arm, mouse-click swings,
-- and ability key (Q) activation. Sends requests to the server for validation.

local Players          = game:GetService("Players")
local RunService       = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local RS               = game:GetService("ReplicatedStorage")
local TweenService     = game:GetService("TweenService")

local player        = Players.LocalPlayer
local mouse         = player:GetMouse()
local camera        = workspace.CurrentCamera

local SwordData     = require(RS:WaitForChild("SwordData"))
local SwingRequest  = RS:WaitForChild("SwingRequest")
local AbilityRequest = RS:WaitForChild("AbilityRequest")
local HitEffect     = RS:WaitForChild("HitEffect")
local AbilityEffect = RS:WaitForChild("AbilityEffect")
local EquipSword    = RS:WaitForChild("EquipSword")
local GetPlayerData = RS:WaitForChild("GetPlayerData")

local ABILITY_KEY = Enum.KeyCode.Q

-- ── State ─────────────────────────────────────────────────────────────────────

local currentSwordName = "Iron Sword"
local swingCooldown    = false
local abilityCooldown  = false
local swordModel       = nil   -- the Part welded to the character's right hand

-- ── Helpers ───────────────────────────────────────────────────────────────────

local function GetCharacter()
	return player.Character
end

local function GetRightHand()
	local char = GetCharacter()
	return char and (char:FindFirstChild("RightHand") or char:FindFirstChild("Right Arm"))
end

local function GetSwordDef()
	return SwordData.ByName[currentSwordName] or SwordData.ByName["Iron Sword"]
end

-- ── Sword visual model ────────────────────────────────────────────────────────

local function RemoveSwordModel()
	if swordModel then
		swordModel:Destroy()
		swordModel = nil
	end
end

local function BuildSwordModel(swordDef)
	RemoveSwordModel()
	local char = GetCharacter()
	if not char then return end
	local hand = GetRightHand()
	if not hand then return end

	local model = Instance.new("Model")
	model.Name = "SwordModel"

	-- Blade
	local blade = Instance.new("Part")
	blade.Name     = "Blade"
	blade.Size     = Vector3.new(0.15, 2.5, 0.3)
	blade.BrickColor = BrickColor.new(swordDef.Color)
	blade.Material = Enum.Material.SmoothPlastic
	blade.CastShadow = false
	blade.Parent   = model

	-- Guard
	local guard = Instance.new("Part")
	guard.Name   = "Guard"
	guard.Size   = Vector3.new(0.8, 0.15, 0.3)
	guard.BrickColor = BrickColor.new(swordDef.Color)
	guard.Material = Enum.Material.SmoothPlastic
	guard.CastShadow = false
	guard.Parent = model

	-- Handle
	local handle = Instance.new("Part")
	handle.Name   = "Handle"
	handle.Size   = Vector3.new(0.15, 0.8, 0.3)
	handle.BrickColor = BrickColor.new("Reddish brown")
	handle.Material = Enum.Material.SmoothPlastic
	handle.CastShadow = false
	handle.Parent = model

	-- Weld everything to hand
	local function WeldTo(part, offset)
		local weld = Instance.new("Motor6D")
		weld.Part0 = hand
		weld.Part1 = part
		weld.C0    = offset
		weld.Parent = hand
		part.Anchored = false
	end

	-- Position offsets relative to right hand
	WeldTo(blade,  CFrame.new(0.1, -1.6, -0.3) * CFrame.Angles(0, 0, math.rad(10)))
	WeldTo(guard,  CFrame.new(0.1, -0.35, -0.3))
	WeldTo(handle, CFrame.new(0.1, 0.25, -0.3))

	model.Parent = char

	-- Legendary glow
	if swordDef.Rarity == "Legendary" then
		local glow = Instance.new("SelectionBox")
		glow.Color3    = swordDef.Color
		glow.Adornee   = blade
		glow.LineThickness = 0.02
		glow.Parent    = model
	end

	swordModel = model
end

-- ── Sword equip sync ──────────────────────────────────────────────────────────

local function EquipCurrentSword()
	local def = GetSwordDef()
	BuildSwordModel(def)
	EquipSword:FireServer(currentSwordName)
end

-- Called by GuiController when player selects a sword from inventory
local SwordController = {}
function SwordController.SetSword(name)
	currentSwordName = name
	EquipCurrentSword()
end

-- Make accessible to GuiController
_G.SwordController = SwordController

-- ── Swing ─────────────────────────────────────────────────────────────────────

local function DoSwing()
	if swingCooldown then return end
	local char = GetCharacter()
	if not char then return end
	local hum = char:FindFirstChildOfClass("Humanoid")
	if not hum or hum.Health <= 0 then return end

	local def = GetSwordDef()
	swingCooldown = true

	-- Visual swing animation (tween sword model)
	if swordModel then
		local blade = swordModel:FindFirstChild("Blade")
		if blade then
			local weld = blade.Parent:FindFirstChildOfClass("Motor6D")
				or GetRightHand() and GetRightHand():FindFirstChildOfClass("Motor6D")
			-- Simple angle tween via CFrame (best done with AnimationTrack in production)
		end
	end

	-- Raycast from camera to find target player
	local unitRay = camera:ScreenPointToRay(mouse.X, mouse.Y)
	local rayParams = RaycastParams.new()
	rayParams.FilterDescendantsInstances = { char }
	rayParams.FilterType = Enum.RaycastFilterType.Exclude

	local result = workspace:Raycast(unitRay.Origin, unitRay.Direction * (def.ReachStuds + 50), rayParams)

	local targetPlayer = nil
	if result and result.Instance then
		local hitChar = result.Instance.Parent
		targetPlayer = Players:GetPlayerFromCharacter(hitChar)
			or Players:GetPlayerFromCharacter(result.Instance.Parent.Parent)
	end

	-- Always fire to server (server will validate range)
	SwingRequest:FireServer(targetPlayer)

	-- Cooldown
	task.delay(def.Cooldown, function()
		swingCooldown = false
	end)
end

-- ── Ability ───────────────────────────────────────────────────────────────────

local function DoAbility()
	if abilityCooldown then return end
	local char = GetCharacter()
	if not char then return end
	local hum = char:FindFirstChildOfClass("Humanoid")
	if not hum or hum.Health <= 0 then return end

	local def = GetSwordDef()
	if not def.Ability then return end

	abilityCooldown = true

	-- For targeted abilities, find the nearest visible enemy
	local targetPlayer = nil
	local targetPosition = nil

	local unitRay = camera:ScreenPointToRay(mouse.X, mouse.Y)
	local rayParams = RaycastParams.new()
	rayParams.FilterDescendantsInstances = { char }
	rayParams.FilterType = Enum.RaycastFilterType.Exclude

	local result = workspace:Raycast(unitRay.Origin, unitRay.Direction * 100, rayParams)
	if result then
		targetPosition = result.Position
		local hitChar = result.Instance and result.Instance.Parent
		targetPlayer = hitChar and (Players:GetPlayerFromCharacter(hitChar)
			or Players:GetPlayerFromCharacter(hitChar.Parent))
	end

	AbilityRequest:FireServer(targetPlayer, targetPosition)

	-- Show ability cooldown visually (handled in GuiController via AbilityEffect event)
	task.delay(def.AbilityCooldown, function()
		abilityCooldown = false
	end)
end

-- ── Input bindings ────────────────────────────────────────────────────────────

mouse.Button1Down:Connect(DoSwing)

UserInputService.InputBegan:Connect(function(input, gameProcessed)
	if gameProcessed then return end
	if input.KeyCode == ABILITY_KEY then
		DoAbility()
	end
end)

-- ── VFX: HitEffect (client-side particles) ───────────────────────────────────

HitEffect.OnClientEvent:Connect(function(victim, effectType, hitPosition)
	if not victim or not victim.Character then return end
	local root = victim.Character:FindFirstChild("HumanoidRootPart")
	if not root then return end

	local pos = root.Position

	local vfxPart = Instance.new("Part")
	vfxPart.Anchored   = true
	vfxPart.CanCollide = false
	vfxPart.Size       = Vector3.new(0.1, 0.1, 0.1)
	vfxPart.Transparency = 1
	vfxPart.Position   = pos
	vfxPart.Parent     = workspace

	local attachment = Instance.new("Attachment", vfxPart)

	-- Choose particle color based on effect type
	local colors = {
		Burn    = ColorSequence.new(Color3.fromRGB(255, 80, 0)),
		Freeze  = ColorSequence.new(Color3.fromRGB(140, 210, 255)),
		Chain   = ColorSequence.new(Color3.fromRGB(255, 240, 60)),
		Normal  = ColorSequence.new(Color3.fromRGB(255, 255, 255)),
		HealSlash = ColorSequence.new(Color3.fromRGB(60, 220, 130)),
	}

	local emitter = Instance.new("ParticleEmitter")
	emitter.Color       = colors[effectType] or colors.Normal
	emitter.LightEmission = 0.8
	emitter.Size        = NumberSequence.new(0.3)
	emitter.Lifetime    = NumberRange.new(0.3, 0.7)
	emitter.Rate        = 30
	emitter.Speed       = NumberRange.new(5, 15)
	emitter.Parent      = attachment

	game:GetService("Debris"):AddItem(vfxPart, 1)
end)

-- ── VFX: AbilityEffect ────────────────────────────────────────────────────────

AbilityEffect.OnClientEvent:Connect(function(abilityName, targetOrPlayer, position)
	local pos = position
	if not pos and targetOrPlayer and targetOrPlayer.Character then
		local root = targetOrPlayer.Character:FindFirstChild("HumanoidRootPart")
		if root then pos = root.Position end
	end
	if not pos then return end

	if abilityName == "PetalBurst" then
		-- Spawn pink petals flying outward
		for i = 1, 20 do
			local petal = Instance.new("Part")
			petal.Shape       = Enum.PartType.Ball
			petal.Size        = Vector3.new(0.4, 0.4, 0.4)
			petal.BrickColor  = BrickColor.new("Carnation pink")
			petal.Material    = Enum.Material.Neon
			petal.Anchored    = false
			petal.CanCollide  = false
			petal.Position    = pos
			petal.Velocity    = Vector3.new(
				math.random(-15, 15), math.random(5, 20), math.random(-15, 15))
			petal.Parent      = workspace
			game:GetService("Debris"):AddItem(petal, 2)
		end

	elseif abilityName == "Eruption" then
		-- Lava pillar visuals
		for i = 1, 5 do
			local offset = Vector3.new(math.random(-6, 6), 0, math.random(-6, 6))
			local pillar = Instance.new("Part")
			pillar.Size     = Vector3.new(2, 0.1, 2)
			pillar.BrickColor = BrickColor.new("Bright orange")
			pillar.Material = Enum.Material.Neon
			pillar.Anchored = true
			pillar.CanCollide = false
			pillar.Position = pos + offset
			pillar.Parent   = workspace

			local goal = { Size = Vector3.new(2, 10, 2), Position = pos + offset + Vector3.new(0, 5, 0) }
			TweenService:Create(pillar, TweenInfo.new(0.3), goal):Play()
			game:GetService("Debris"):AddItem(pillar, 1.5)
		end

	elseif abilityName == "Freeze" then
		if targetOrPlayer and targetOrPlayer.Character then
			local char = targetOrPlayer.Character
			for _, part in ipairs(char:GetDescendants()) do
				if part:IsA("BasePart") then
					part.BrickColor = BrickColor.new("Light blue")
				end
			end
			task.delay(2.5, function()
				if char and char.Parent then
					for _, part in ipairs(char:GetDescendants()) do
						if part:IsA("BasePart") then
							-- Reset will happen naturally when character resets appearance
						end
					end
				end
			end)
		end

	elseif abilityName == "Thunder" then
		-- Lightning bolt visual
		local bolt = Instance.new("Part")
		bolt.Size     = Vector3.new(0.3, 30, 0.3)
		bolt.BrickColor = BrickColor.new("Bright yellow")
		bolt.Material = Enum.Material.Neon
		bolt.Anchored = true
		bolt.CanCollide = false
		bolt.Position = pos + Vector3.new(0, 15, 0)
		bolt.CFrame   = CFrame.new(pos + Vector3.new(0, 15, 0))
		bolt.Parent   = workspace
		game:GetService("Debris"):AddItem(bolt, 0.5)

	elseif abilityName == "Void" then
		-- Dark portal flash
		local portal = Instance.new("Part")
		portal.Shape  = Enum.PartType.Ball
		portal.Size   = Vector3.new(5, 5, 5)
		portal.BrickColor = BrickColor.new("Really black")
		portal.Material = Enum.Material.Neon
		portal.Anchored = true
		portal.CanCollide = false
		portal.Transparency = 0.3
		portal.Position = pos
		portal.Parent   = workspace
		TweenService:Create(portal, TweenInfo.new(0.5), { Transparency = 1 }):Play()
		game:GetService("Debris"):AddItem(portal, 0.6)

	elseif abilityName == "ShadowStep" then
		-- Dark aura around the user
		if targetOrPlayer and targetOrPlayer.Character then
			local root = targetOrPlayer.Character:FindFirstChild("HumanoidRootPart")
			if root then
				local aura = Instance.new("SelectionBox")
				aura.Color3   = Color3.fromRGB(40, 0, 60)
				aura.Adornee  = root
				aura.LineThickness = 0.05
				aura.Parent   = workspace
				game:GetService("Debris"):AddItem(aura, 4)
			end
		end
	end
end)

-- ── Init ──────────────────────────────────────────────────────────────────────

-- Wait for character, then build initial sword
player.CharacterAdded:Connect(function(char)
	char:WaitForChild("HumanoidRootPart")
	task.wait(0.5)
	EquipCurrentSword()
end)

if player.Character then
	task.wait(0.5)
	EquipCurrentSword()
end

print("[SwordController] Loaded.")
