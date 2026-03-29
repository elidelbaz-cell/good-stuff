-- CombatHandler (ServerScript) — place in ServerScriptService
-- Validates swings and ability activations sent from clients, applies damage,
-- status effects, and fires VFX events back to all clients.

local Players     = game:GetService("Players")
local RS          = game:GetService("ReplicatedStorage")
local Debris      = game:GetService("Debris")
local SwordData   = require(RS:WaitForChild("SwordData"))

local SwingRequest   = RS:WaitForChild("SwingRequest")
local AbilityRequest = RS:WaitForChild("AbilityRequest")
local HitEffect      = RS:WaitForChild("HitEffect")
local AbilityEffect  = RS:WaitForChild("AbilityEffect")
local PlayerDied     = RS:WaitForChild("PlayerDied")

-- Per-player cooldown tracking
local SwingCooldowns   = {}   -- [userId] = tick()
local AbilityCooldowns = {}   -- [userId] = tick()
local StatusEffects    = {}   -- [userId] = { Burn = endTime, Freeze = endTime, ... }

-- Assist tracking: last attacker who hit a player
local LastHit = {}  -- [victimUserId] = { attackerUserId, tick() }

local ASSIST_WINDOW = 10  -- seconds

-- ── Helpers ───────────────────────────────────────────────────────────────────

local function GetCharacter(player)
	return player and player.Character
end

local function GetHumanoid(char)
	return char and char:FindFirstChildOfClass("Humanoid")
end

local function GetRootPart(char)
	return char and char:FindFirstChild("HumanoidRootPart")
end

local function IsAlive(player)
	local char = GetCharacter(player)
	if not char then return false end
	local hum = GetHumanoid(char)
	return hum and hum.Health > 0
end

local function GetEconomy()
	-- Retrieve EconomyManager API stored in _G by EconomyManager.server.lua
	local eco = _G.EconomyManager
	if not eco then
		warn("[Combat] EconomyManager not found in _G yet — retrying...")
		task.wait(1)
		eco = _G.EconomyManager
	end
	return eco
end

local function ApplyStatusEffect(victimUserId, effectType, duration)
	StatusEffects[victimUserId] = StatusEffects[victimUserId] or {}
	StatusEffects[victimUserId][effectType] = tick() + duration
end

local function HasStatus(victimUserId, effectType)
	local effects = StatusEffects[victimUserId]
	if not effects then return false end
	local expiry = effects[effectType]
	return expiry and tick() < expiry
end

local function DamagePlayer(attacker, victim, amount)
	if not IsAlive(victim) then return false end
	local char = GetCharacter(victim)
	local hum  = GetHumanoid(char)
	if not hum then return false end

	-- Apply freeze slow via WalkSpeed
	if HasStatus(victim.UserId, "Freeze") then
		hum.WalkSpeed = 4
	end

	local wasAlive = hum.Health > 0
	hum:TakeDamage(amount)
	local died = wasAlive and hum.Health <= 0

	-- Track last hit for assist
	LastHit[victim.UserId] = { attackerUserId = attacker.UserId, time = tick() }

	if died then
		PlayerDied:FireAllClients(victim.Name, attacker.Name)
		local eco = GetEconomy()
		if eco then
			eco.AwardKill(attacker)
			-- Check for assist (different attacker who hit recently)
			-- (in this simple version, only direct killer gets coins)
		end
		print(("[Combat] %s killed %s"):format(attacker.Name, victim.Name))
	end

	return died
end

-- ── Burn DoT loop ─────────────────────────────────────────────────────────────

task.spawn(function()
	while true do
		task.wait(1)
		for userId, effects in pairs(StatusEffects) do
			if effects["Burn"] and tick() < effects["Burn"] then
				local victim = Players:GetPlayerByUserId(userId)
				if victim and IsAlive(victim) then
					local hum = GetHumanoid(GetCharacter(victim))
					if hum then hum:TakeDamage(5) end
					HitEffect:FireAllClients(victim, "Burn", nil)
				end
			end
		end
	end
end)

-- ── Freeze decay ─────────────────────────────────────────────────────────────

task.spawn(function()
	while true do
		task.wait(0.5)
		for userId, effects in pairs(StatusEffects) do
			if effects["Freeze"] then
				local victim = Players:GetPlayerByUserId(userId)
				if victim then
					local char = GetCharacter(victim)
					local hum  = char and GetHumanoid(char)
					if hum then
						if tick() >= effects["Freeze"] then
							hum.WalkSpeed = 16  -- restore default
							effects["Freeze"] = nil
						end
					end
				end
			end
		end
	end
end)

-- ── ShadowStep decay (restore transparency) ──────────────────────────────────

local ShadowStepActive = {}  -- [userId] = expiry

task.spawn(function()
	while true do
		task.wait(0.5)
		for userId, expiry in pairs(ShadowStepActive) do
			if tick() >= expiry then
				local player = Players:GetPlayerByUserId(userId)
				if player then
					local char = GetCharacter(player)
					if char then
						for _, part in ipairs(char:GetDescendants()) do
							if part:IsA("BasePart") then
								part.Transparency = 0
							end
						end
					end
				end
				ShadowStepActive[userId] = nil
			end
		end
	end
end)

-- ── Swing handler ─────────────────────────────────────────────────────────────

SwingRequest.OnServerEvent:Connect(function(attacker, targetPlayer)
	if not IsAlive(attacker) then return end

	local eco         = GetEconomy()
	local swordName   = eco and eco.GetEquipped(attacker) or "Iron Sword"
	local swordDef    = SwordData.ByName[swordName] or SwordData.ByName["Iron Sword"]

	-- Swing cooldown check
	local now   = tick()
	local lastSwing = SwingCooldowns[attacker.UserId] or 0
	if now - lastSwing < swordDef.Cooldown then return end
	SwingCooldowns[attacker.UserId] = now

	-- Validate target
	if not targetPlayer or not targetPlayer:IsA("Player") then return end
	if targetPlayer == attacker then return end
	if not IsAlive(targetPlayer) then return end

	-- Distance check (server-side anti-cheat)
	local aRoot = GetRootPart(GetCharacter(attacker))
	local vRoot = GetRootPart(GetCharacter(targetPlayer))
	if not aRoot or not vRoot then return end
	local dist = (aRoot.Position - vRoot.Position).Magnitude
	if dist > swordDef.ReachStuds + 3 then  -- +3 stud leniency for latency
		warn(("[Combat] %s swing rejected — distance %.1f > reach %d"):format(
			attacker.Name, dist, swordDef.ReachStuds))
		return
	end

	local damage = swordDef.Damage
	local died   = DamagePlayer(attacker, targetPlayer, damage)

	-- HealSlash passive (applies on every swing, not just ability key)
	if swordDef.Ability == "HealSlash" then
		local aHum = GetHumanoid(GetCharacter(attacker))
		if aHum then
			local heal = math.floor(damage * 0.25)
			aHum.Health = math.min(aHum.MaxHealth, aHum.Health + heal)
		end
	end

	-- Fire hit VFX
	HitEffect:FireAllClients(targetPlayer, swordDef.Ability or "Normal", aRoot.Position)

	-- BloodRush: grant speed on kill
	if died and swordDef.Ability == "BloodRush" then
		local aHum = GetHumanoid(GetCharacter(attacker))
		if aHum then
			aHum.WalkSpeed = 24
			task.delay(3, function()
				if aHum and aHum.Parent then
					aHum.WalkSpeed = 16
				end
			end)
		end
	end
end)

-- ── Ability handler ───────────────────────────────────────────────────────────

AbilityRequest.OnServerEvent:Connect(function(attacker, targetPlayer, targetPosition)
	if not IsAlive(attacker) then return end

	local eco       = GetEconomy()
	local swordName = eco and eco.GetEquipped(attacker) or "Iron Sword"
	local swordDef  = SwordData.ByName[swordName] or SwordData.ByName["Iron Sword"]

	if not swordDef.Ability then return end

	-- Ability cooldown check
	local now       = tick()
	local lastAbil  = AbilityCooldowns[attacker.UserId] or 0
	if now - lastAbil < swordDef.AbilityCooldown then return end
	AbilityCooldowns[attacker.UserId] = now

	local aChar = GetCharacter(attacker)
	local aRoot = GetRootPart(aChar)
	if not aRoot then return end

	local ability = swordDef.Ability

	-- ── Burn ──
	if ability == "Burn" then
		if not targetPlayer or not IsAlive(targetPlayer) then return end
		ApplyStatusEffect(targetPlayer.UserId, "Burn", 3)
		AbilityEffect:FireAllClients("Burn", targetPlayer, nil)

	-- ── Freeze ──
	elseif ability == "Freeze" then
		if not targetPlayer or not IsAlive(targetPlayer) then return end
		ApplyStatusEffect(targetPlayer.UserId, "Freeze", 2.5)
		local vHum = GetHumanoid(GetCharacter(targetPlayer))
		if vHum then vHum.WalkSpeed = 4 end
		AbilityEffect:FireAllClients("Freeze", targetPlayer, nil)

	-- ── Chain lightning ──
	elseif ability == "Chain" then
		if not targetPlayer or not IsAlive(targetPlayer) then return end
		local vRoot = GetRootPart(GetCharacter(targetPlayer))
		if not vRoot then return end
		local origin = vRoot.Position
		local hit = { targetPlayer }
		DamagePlayer(attacker, targetPlayer, math.floor(swordDef.Damage * 0.5))
		-- Find up to 2 more nearby enemies
		for _, p in ipairs(Players:GetPlayers()) do
			if #hit >= 3 then break end
			if p ~= attacker and p ~= targetPlayer and IsAlive(p) then
				local pRoot = GetRootPart(GetCharacter(p))
				if pRoot and (pRoot.Position - origin).Magnitude <= 15 then
					DamagePlayer(attacker, p, math.floor(swordDef.Damage * 0.5))
					table.insert(hit, p)
				end
			end
		end
		AbilityEffect:FireAllClients("Chain", nil, origin)

	-- ── Petal Burst (AOE) ──
	elseif ability == "PetalBurst" then
		local origin = aRoot.Position
		for _, p in ipairs(Players:GetPlayers()) do
			if p ~= attacker and IsAlive(p) then
				local pRoot = GetRootPart(GetCharacter(p))
				if pRoot and (pRoot.Position - origin).Magnitude <= 8 then
					DamagePlayer(attacker, p, 20)
				end
			end
		end
		AbilityEffect:FireAllClients("PetalBurst", nil, origin)

	-- ── Eruption ──
	elseif ability == "Eruption" then
		local origin = targetPosition or aRoot.Position
		-- Spawn 5 lava pillars (server-side damage pillars)
		for i = 1, 5 do
			local offset = Vector3.new(
				math.random(-6, 6), 0, math.random(-6, 6))
			local pillarPos = origin + offset
			-- Damage any player in range of each pillar
			for _, p in ipairs(Players:GetPlayers()) do
				if p ~= attacker and IsAlive(p) then
					local pRoot = GetRootPart(GetCharacter(p))
					if pRoot and (pRoot.Position - pillarPos).Magnitude <= 3.5 then
						DamagePlayer(attacker, p, 18)
					end
				end
			end
		end
		AbilityEffect:FireAllClients("Eruption", nil, origin)

	-- ── Void (teleport behind target) ──
	elseif ability == "Void" then
		if not targetPlayer or not IsAlive(targetPlayer) then return end
		local vRoot = GetRootPart(GetCharacter(targetPlayer))
		if not vRoot then return end
		-- Teleport attacker 4 studs behind the target's look vector
		local behindPos = vRoot.Position - (vRoot.CFrame.LookVector * 4)
		aRoot.CFrame = CFrame.new(behindPos + Vector3.new(0, 0.5, 0))
		AbilityEffect:FireAllClients("Void", attacker, vRoot.Position)

	-- ── Thunder ──
	elseif ability == "Thunder" then
		if not targetPlayer or not IsAlive(targetPlayer) then return end
		local vRoot = GetRootPart(GetCharacter(targetPlayer))
		if not vRoot then return end
		local strikePos = vRoot.Position
		AbilityEffect:FireAllClients("Thunder", nil, strikePos)
		task.delay(0.5, function()
			-- Strike after visual cue
			if IsAlive(targetPlayer) then
				DamagePlayer(attacker, targetPlayer, 30)
			end
		end)

	-- ── ShadowStep ──
	elseif ability == "ShadowStep" then
		ShadowStepActive[attacker.UserId] = tick() + 4
		for _, part in ipairs(aChar:GetDescendants()) do
			if part:IsA("BasePart") then
				part.Transparency = 0.75
			end
		end
		AbilityEffect:FireAllClients("ShadowStep", attacker, nil)

	-- ── HealSlash (passive — no manual activation) ──
	elseif ability == "HealSlash" then
		-- Already handled in SwingRequest
	end

	print(("[Combat] %s used ability: %s"):format(attacker.Name, ability))
end)

print("[CombatHandler] Loaded.")
