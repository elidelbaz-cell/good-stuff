-- GuiController (LocalScript) — place in StarterPlayerScripts
-- Builds and manages:
--   • HUD (coins, equipped sword, ability cooldown bar, kill feed)
--   • Spin wheel UI
--   • Inventory / equip UI

local Players          = game:GetService("Players")
local TweenService     = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local RS               = game:GetService("ReplicatedStorage")

local player        = Players.LocalPlayer
local playerGui     = player:WaitForChild("PlayerGui")
local SwordData     = require(RS:WaitForChild("SwordData"))

local AddCoins      = RS:WaitForChild("AddCoins")
local GetPlayerData = RS:WaitForChild("GetPlayerData")
local RequestSpin   = RS:WaitForChild("RequestSpin")
local SpinResult    = RS:WaitForChild("SpinResult")
local PlayerDied    = RS:WaitForChild("PlayerDied")
local MapChanged    = RS:WaitForChild("MapChanged")
local AbilityEffect = RS:WaitForChild("AbilityEffect")

-- ── State ─────────────────────────────────────────────────────────────────────

local coins         = 0
local inventory     = {}
local equipped      = "Iron Sword"
local abilityCDEnd  = 0

-- ── Utility ───────────────────────────────────────────────────────────────────

local function MakeLabel(parent, text, size, pos, textColor, fontSize, bgTransparency)
	local frame = Instance.new("Frame")
	frame.Size              = size
	frame.Position          = pos
	frame.BackgroundColor3  = Color3.fromRGB(0, 0, 0)
	frame.BackgroundTransparency = bgTransparency or 0.5
	frame.BorderSizePixel   = 0
	frame.Parent            = parent

	local label = Instance.new("TextLabel")
	label.Size              = UDim2.new(1, 0, 1, 0)
	label.BackgroundTransparency = 1
	label.Text              = text
	label.TextColor3        = textColor or Color3.fromRGB(255, 255, 255)
	label.TextScaled        = true
	label.Font              = Enum.Font.GothamBold
	label.Parent            = frame

	return frame, label
end

local function MakeButton(parent, text, size, pos, bgColor)
	local btn = Instance.new("TextButton")
	btn.Size            = size
	btn.Position        = pos
	btn.BackgroundColor3 = bgColor or Color3.fromRGB(50, 50, 200)
	btn.TextColor3      = Color3.fromRGB(255, 255, 255)
	btn.Text            = text
	btn.TextScaled      = true
	btn.Font            = Enum.Font.GothamBold
	btn.BorderSizePixel = 0
	btn.Parent          = parent

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 6)
	corner.Parent       = btn

	return btn
end

-- ── SCREEN GUI ────────────────────────────────────────────────────────────────

local screenGui = Instance.new("ScreenGui")
screenGui.Name            = "GameGui"
screenGui.ResetOnSpawn    = false
screenGui.ZIndexBehavior  = Enum.ZIndexBehavior.Sibling
screenGui.Parent          = playerGui

-- ── HUD Frame ─────────────────────────────────────────────────────────────────

local hudFrame = Instance.new("Frame")
hudFrame.Name             = "HUD"
hudFrame.Size             = UDim2.new(1, 0, 1, 0)
hudFrame.BackgroundTransparency = 1
hudFrame.Parent           = screenGui

-- Coin counter (top-left)
local coinFrame, coinLabel = MakeLabel(
	hudFrame,
	"Coins: 0",
	UDim2.new(0, 180, 0, 40),
	UDim2.new(0, 10, 0, 10),
	Color3.fromRGB(255, 220, 60),
	0.6
)

-- Equipped sword info (bottom-left)
local equippedFrame, equippedLabel = MakeLabel(
	hudFrame,
	"Iron Sword",
	UDim2.new(0, 220, 0, 40),
	UDim2.new(0, 10, 1, -100),
	Color3.fromRGB(255, 255, 255),
	0.5
)

local rarityLabel = Instance.new("TextLabel")
rarityLabel.Size              = UDim2.new(0, 220, 0, 24)
rarityLabel.Position          = UDim2.new(0, 10, 1, -130)
rarityLabel.BackgroundTransparency = 1
rarityLabel.Text              = "Common"
rarityLabel.TextColor3        = SwordData.RarityColors["Common"]
rarityLabel.TextScaled        = true
rarityLabel.Font              = Enum.Font.GothamBold
rarityLabel.Parent            = hudFrame

local abilityLabel = Instance.new("TextLabel")
abilityLabel.Size             = UDim2.new(0, 220, 0, 24)
abilityLabel.Position         = UDim2.new(0, 10, 1, -60)
abilityLabel.BackgroundTransparency = 0.5
abilityLabel.BackgroundColor3 = Color3.fromRGB(0, 0, 0)
abilityLabel.Text             = "Ability [Q]: No Ability"
abilityLabel.TextColor3       = Color3.fromRGB(180, 180, 255)
abilityLabel.TextScaled       = true
abilityLabel.Font             = Enum.Font.Gotham
abilityLabel.Parent           = hudFrame

-- Ability cooldown bar
local cdBarBG = Instance.new("Frame")
cdBarBG.Size             = UDim2.new(0, 220, 0, 10)
cdBarBG.Position         = UDim2.new(0, 10, 1, -40)
cdBarBG.BackgroundColor3 = Color3.fromRGB(60, 60, 60)
cdBarBG.BorderSizePixel  = 0
cdBarBG.Parent           = hudFrame

local cdBar = Instance.new("Frame")
cdBar.Size             = UDim2.new(0, 0, 1, 0)
cdBar.BackgroundColor3 = Color3.fromRGB(120, 80, 255)
cdBar.BorderSizePixel  = 0
cdBar.Parent           = cdBarBG

-- Crosshair (center dot)
local crosshair = Instance.new("Frame")
crosshair.Size             = UDim2.new(0, 8, 0, 8)
crosshair.AnchorPoint      = Vector2.new(0.5, 0.5)
crosshair.Position         = UDim2.new(0.5, 0, 0.5, 0)
crosshair.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
crosshair.BackgroundTransparency = 0.2
crosshair.BorderSizePixel  = 0
crosshair.Parent           = hudFrame

local crossCorner = Instance.new("UICorner")
crossCorner.CornerRadius = UDim.new(1, 0)
crossCorner.Parent       = crosshair

-- Map name banner (top-center, fades out)
local mapBanner, mapBannerLabel = MakeLabel(
	hudFrame,
	"",
	UDim2.new(0, 300, 0, 50),
	UDim2.new(0.5, -150, 0, 20),
	Color3.fromRGB(255, 255, 200),
	0.3
)
mapBanner.Visible = false

-- Kill feed (top-right)
local killFeedFrame = Instance.new("Frame")
killFeedFrame.Size             = UDim2.new(0, 260, 0, 200)
killFeedFrame.Position         = UDim2.new(1, -270, 0, 10)
killFeedFrame.BackgroundTransparency = 1
killFeedFrame.Parent           = hudFrame

local killFeedEntries = {}

local function AddKillFeedEntry(text, color)
	-- Remove oldest if too many
	if #killFeedEntries >= 6 then
		local oldest = table.remove(killFeedEntries, 1)
		oldest:Destroy()
		-- Shift remaining entries up
		for i, entry in ipairs(killFeedEntries) do
			TweenService:Create(entry, TweenInfo.new(0.2),
				{ Position = UDim2.new(0, 0, 0, (i - 1) * 32) }):Play()
		end
	end

	local entry = Instance.new("TextLabel")
	entry.Size              = UDim2.new(1, 0, 0, 28)
	entry.Position          = UDim2.new(0, 0, 0, #killFeedEntries * 32)
	entry.BackgroundColor3  = Color3.fromRGB(0, 0, 0)
	entry.BackgroundTransparency = 0.4
	entry.Text              = text
	entry.TextColor3        = color or Color3.fromRGB(255, 255, 255)
	entry.TextScaled        = true
	entry.Font              = Enum.Font.Gotham
	entry.TextXAlignment    = Enum.TextXAlignment.Right
	entry.BorderSizePixel   = 0
	entry.Parent            = killFeedFrame
	table.insert(killFeedEntries, entry)

	-- Fade out after 5 seconds
	task.delay(5, function()
		if entry and entry.Parent then
			TweenService:Create(entry, TweenInfo.new(0.5),
				{ BackgroundTransparency = 1, TextTransparency = 1 }):Play()
			task.delay(0.6, function()
				if entry and entry.Parent then
					entry:Destroy()
					local idx = table.find(killFeedEntries, entry)
					if idx then table.remove(killFeedEntries, idx) end
				end
			end)
		end
	end)
end

-- ── Spin button (bottom-right) ────────────────────────────────────────────────

local spinBtn = MakeButton(
	hudFrame,
	"SPIN (100 coins)",
	UDim2.new(0, 180, 0, 44),
	UDim2.new(1, -190, 1, -54),
	Color3.fromRGB(180, 0, 200)
)

-- Inventory button
local invBtn = MakeButton(
	hudFrame,
	"Inventory",
	UDim2.new(0, 130, 0, 36),
	UDim2.new(1, -190, 1, -100),
	Color3.fromRGB(40, 100, 200)
)

-- ── Spin result popup ─────────────────────────────────────────────────────────

local spinPopup = Instance.new("Frame")
spinPopup.Size             = UDim2.new(0, 320, 0, 160)
spinPopup.AnchorPoint      = Vector2.new(0.5, 0.5)
spinPopup.Position         = UDim2.new(0.5, 0, 0.5, 0)
spinPopup.BackgroundColor3 = Color3.fromRGB(20, 20, 30)
spinPopup.BackgroundTransparency = 0.1
spinPopup.BorderSizePixel  = 2
spinPopup.Visible          = false
spinPopup.ZIndex           = 10
spinPopup.Parent           = screenGui

local spinCorner = Instance.new("UICorner")
spinCorner.CornerRadius = UDim.new(0, 12)
spinCorner.Parent       = spinPopup

local spinTitleLabel = Instance.new("TextLabel")
spinTitleLabel.Size   = UDim2.new(1, 0, 0.35, 0)
spinTitleLabel.Position = UDim2.new(0, 0, 0.05, 0)
spinTitleLabel.BackgroundTransparency = 1
spinTitleLabel.Text   = "YOU GOT:"
spinTitleLabel.TextColor3 = Color3.fromRGB(255, 220, 60)
spinTitleLabel.TextScaled = true
spinTitleLabel.Font   = Enum.Font.GothamBold
spinTitleLabel.ZIndex = 11
spinTitleLabel.Parent = spinPopup

local spinSwordLabel = Instance.new("TextLabel")
spinSwordLabel.Size   = UDim2.new(1, -20, 0.3, 0)
spinSwordLabel.Position = UDim2.new(0, 10, 0.42, 0)
spinSwordLabel.BackgroundTransparency = 1
spinSwordLabel.Text   = "Iron Sword"
spinSwordLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
spinSwordLabel.TextScaled = true
spinSwordLabel.Font   = Enum.Font.GothamBold
spinSwordLabel.ZIndex = 11
spinSwordLabel.Parent = spinPopup

local spinRarityLabel = Instance.new("TextLabel")
spinRarityLabel.Size   = UDim2.new(1, 0, 0.2, 0)
spinRarityLabel.Position = UDim2.new(0, 0, 0.74, 0)
spinRarityLabel.BackgroundTransparency = 1
spinRarityLabel.Text   = "Common"
spinRarityLabel.TextColor3 = SwordData.RarityColors["Common"]
spinRarityLabel.TextScaled = true
spinRarityLabel.Font   = Enum.Font.GothamBold
spinRarityLabel.ZIndex = 11
spinRarityLabel.Parent = spinPopup

-- ── Inventory Panel ───────────────────────────────────────────────────────────

local invPanel = Instance.new("Frame")
invPanel.Name             = "InventoryPanel"
invPanel.Size             = UDim2.new(0, 360, 0, 460)
invPanel.AnchorPoint      = Vector2.new(0.5, 0.5)
invPanel.Position         = UDim2.new(0.5, 0, 0.5, 0)
invPanel.BackgroundColor3 = Color3.fromRGB(15, 15, 25)
invPanel.BackgroundTransparency = 0.05
invPanel.BorderSizePixel  = 2
invPanel.Visible          = false
invPanel.ZIndex           = 10
invPanel.Parent           = screenGui

local invCorner = Instance.new("UICorner")
invCorner.CornerRadius = UDim.new(0, 12)
invCorner.Parent = invPanel

local invTitle = Instance.new("TextLabel")
invTitle.Size   = UDim2.new(1, 0, 0, 44)
invTitle.BackgroundTransparency = 1
invTitle.Text   = "Inventory"
invTitle.TextColor3 = Color3.fromRGB(255, 255, 255)
invTitle.TextScaled = true
invTitle.Font   = Enum.Font.GothamBold
invTitle.ZIndex = 11
invTitle.Parent = invPanel

local invScrollFrame = Instance.new("ScrollingFrame")
invScrollFrame.Size             = UDim2.new(1, -20, 1, -60)
invScrollFrame.Position         = UDim2.new(0, 10, 0, 50)
invScrollFrame.BackgroundTransparency = 1
invScrollFrame.ScrollBarThickness = 6
invScrollFrame.ZIndex           = 11
invScrollFrame.Parent           = invPanel

local invListLayout = Instance.new("UIListLayout")
invListLayout.Padding          = UDim.new(0, 6)
invListLayout.FillDirection    = Enum.FillDirection.Vertical
invListLayout.SortOrder        = Enum.SortOrder.LayoutOrder
invListLayout.Parent           = invScrollFrame

local invCloseBtn = MakeButton(invPanel, "Close", UDim2.new(0, 80, 0, 30),
	UDim2.new(1, -90, 0, 7), Color3.fromRGB(180, 30, 30))
invCloseBtn.ZIndex = 12

local function RefreshInventory()
	-- Clear existing buttons
	for _, child in ipairs(invScrollFrame:GetChildren()) do
		if child:IsA("TextButton") or child:IsA("Frame") then
			child:Destroy()
		end
	end

	for i, swordName in ipairs(inventory) do
		local def = SwordData.ByName[swordName]
		if not def then continue end

		local row = Instance.new("Frame")
		row.Size             = UDim2.new(1, 0, 0, 56)
		row.BackgroundColor3 = Color3.fromRGB(30, 30, 50)
		row.BackgroundTransparency = 0.2
		row.BorderSizePixel  = 0
		row.LayoutOrder      = i
		row.ZIndex           = 12
		row.Parent           = invScrollFrame

		local rowCorner = Instance.new("UICorner")
		rowCorner.CornerRadius = UDim.new(0, 6)
		rowCorner.Parent = row

		-- Color swatch
		local swatch = Instance.new("Frame")
		swatch.Size   = UDim2.new(0, 10, 1, -12)
		swatch.Position = UDim2.new(0, 6, 0, 6)
		swatch.BackgroundColor3 = def.Color
		swatch.BorderSizePixel = 0
		swatch.ZIndex = 13
		swatch.Parent = row
		local swatchCorner = Instance.new("UICorner")
		swatchCorner.CornerRadius = UDim.new(0, 4)
		swatchCorner.Parent = swatch

		-- Name
		local nameLabel = Instance.new("TextLabel")
		nameLabel.Size   = UDim2.new(0.55, 0, 0.5, 0)
		nameLabel.Position = UDim2.new(0, 24, 0, 4)
		nameLabel.BackgroundTransparency = 1
		nameLabel.Text   = swordName
		nameLabel.TextColor3 = Color3.fromRGB(255, 255, 255)
		nameLabel.TextScaled = true
		nameLabel.Font   = Enum.Font.GothamBold
		nameLabel.TextXAlignment = Enum.TextXAlignment.Left
		nameLabel.ZIndex = 13
		nameLabel.Parent = row

		-- Rarity
		local rarLabel = Instance.new("TextLabel")
		rarLabel.Size   = UDim2.new(0.55, 0, 0.4, 0)
		rarLabel.Position = UDim2.new(0, 24, 0.55, 0)
		rarLabel.BackgroundTransparency = 1
		rarLabel.Text   = def.Rarity .. " | " .. (def.Ability or "No Ability")
		rarLabel.TextColor3 = SwordData.RarityColors[def.Rarity]
		rarLabel.TextScaled = true
		rarLabel.Font   = Enum.Font.Gotham
		rarLabel.TextXAlignment = Enum.TextXAlignment.Left
		rarLabel.ZIndex = 13
		rarLabel.Parent = row

		-- Equip button
		local isEquipped = swordName == equipped
		local equipBtn = MakeButton(
			row,
			isEquipped and "Equipped" or "Equip",
			UDim2.new(0, 80, 0.65, 0),
			UDim2.new(1, -90, 0.175, 0),
			isEquipped and Color3.fromRGB(40, 160, 40) or Color3.fromRGB(40, 100, 200)
		)
		equipBtn.ZIndex = 13

		equipBtn.MouseButton1Click:Connect(function()
			equipped = swordName
			-- Update sword controller
			local sc = _G.SwordController
			if sc then sc.SetSword(swordName) end
			RefreshInventory()
			UpdateHUD()
		end)
	end

	-- Update scrolling frame canvas size
	invScrollFrame.CanvasSize = UDim2.new(0, 0, 0,
		#inventory * 62 + math.max(0, #inventory - 1) * 6)
end

-- ── HUD update ────────────────────────────────────────────────────────────────

function UpdateHUD()
	coinLabel.Text = "Coins: " .. coins

	local def = SwordData.ByName[equipped]
	if def then
		equippedLabel.Text = equipped
		rarityLabel.Text   = def.Rarity
		rarityLabel.TextColor3 = SwordData.RarityColors[def.Rarity]
		if def.Ability then
			abilityLabel.Text = "Ability [Q]: " .. def.Ability
		else
			abilityLabel.Text = "Ability [Q]: None"
		end
	end
end

-- ── Cooldown bar update loop ──────────────────────────────────────────────────

game:GetService("RunService").RenderStepped:Connect(function()
	local def = SwordData.ByName[equipped]
	if def and def.Ability and def.AbilityCooldown > 0 then
		local remaining = math.max(0, abilityCDEnd - tick())
		local pct       = 1 - (remaining / def.AbilityCooldown)
		cdBar.Size      = UDim2.new(math.clamp(pct, 0, 1), 0, 1, 0)
	else
		cdBar.Size = UDim2.new(1, 0, 1, 0)
	end
end)

-- ── Remote event handlers ─────────────────────────────────────────────────────

AddCoins.OnClientEvent:Connect(function(newTotal)
	coins = newTotal
	UpdateHUD()
end)

SpinResult.OnClientEvent:Connect(function(swordName, rarity, errorMsg)
	if errorMsg then
		-- Show error briefly on coin label
		local prev = coinLabel.Text
		coinLabel.Text = errorMsg
		coinLabel.TextColor3 = Color3.fromRGB(255, 80, 80)
		task.delay(2, function()
			coinLabel.Text = prev
			coinLabel.TextColor3 = Color3.fromRGB(255, 220, 60)
		end)
		return
	end

	-- Add to local inventory if new
	local found = false
	for _, n in ipairs(inventory) do
		if n == swordName then found = true; break end
	end
	if not found then table.insert(inventory, swordName) end

	-- Show spin popup
	spinSwordLabel.Text     = swordName
	spinRarityLabel.Text    = rarity
	spinRarityLabel.TextColor3 = SwordData.RarityColors[rarity] or Color3.fromRGB(255, 255, 255)
	spinPopup.Visible       = true

	-- Animate popup scale
	spinPopup.Size = UDim2.new(0, 0, 0, 0)
	TweenService:Create(spinPopup, TweenInfo.new(0.3, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
		{ Size = UDim2.new(0, 320, 0, 160) }):Play()

	-- Auto-close after 3 seconds
	task.delay(3, function()
		TweenService:Create(spinPopup, TweenInfo.new(0.2),
			{ Size = UDim2.new(0, 0, 0, 0) }):Play()
		task.delay(0.25, function()
			spinPopup.Visible = false
		end)
	end)

	RefreshInventory()
end)

PlayerDied.OnClientEvent:Connect(function(victimName, killerName)
	local isLocalKill = killerName == player.Name
	local isLocalDeath = victimName == player.Name
	local color = isLocalKill and Color3.fromRGB(100, 255, 100)
		or isLocalDeath and Color3.fromRGB(255, 100, 100)
		or Color3.fromRGB(220, 220, 220)
	AddKillFeedEntry(killerName .. " killed " .. victimName, color)
end)

MapChanged.OnClientEvent:Connect(function(mapName)
	mapBannerLabel.Text = mapName == "CherryBlossom" and "Cherry Blossom" or "Volcano"
	mapBanner.Visible = true
	mapBanner.BackgroundTransparency = 0.3
	mapBannerLabel.TextTransparency  = 0

	TweenService:Create(mapBanner, TweenInfo.new(2, Enum.EasingStyle.Linear, Enum.EasingDirection.Out, 0, false, 2),
		{ BackgroundTransparency = 1 }):Play()
	TweenService:Create(mapBannerLabel, TweenInfo.new(2, Enum.EasingStyle.Linear, Enum.EasingDirection.Out, 0, false, 2),
		{ TextTransparency = 1 }):Play()

	task.delay(4.5, function()
		mapBanner.Visible = false
	end)
end)

AbilityEffect.OnClientEvent:Connect(function(abilityName, ...)
	-- Reset ability cooldown bar timer
	local def = SwordData.ByName[equipped]
	if def and def.Ability == abilityName then
		abilityCDEnd = tick() + def.AbilityCooldown
	end
end)

-- ── Button interactions ───────────────────────────────────────────────────────

spinBtn.MouseButton1Click:Connect(function()
	RequestSpin:FireServer()
end)

invBtn.MouseButton1Click:Connect(function()
	invPanel.Visible = not invPanel.Visible
	if invPanel.Visible then
		RefreshInventory()
	end
end)

invCloseBtn.MouseButton1Click:Connect(function()
	invPanel.Visible = false
end)

-- Dismiss spin popup on click
spinPopup.InputBegan:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.MouseButton1 then
		spinPopup.Visible = false
	end
end)

-- ── Load initial player data ──────────────────────────────────────────────────

task.spawn(function()
	local data = GetPlayerData:InvokeServer()
	if data then
		coins     = data.Coins
		inventory = data.Inventory
		equipped  = data.Equipped
		UpdateHUD()
		-- Sync sword controller
		local sc = _G.SwordController
		if sc then sc.SetSword(equipped) end
	end
end)

print("[GuiController] Loaded.")
