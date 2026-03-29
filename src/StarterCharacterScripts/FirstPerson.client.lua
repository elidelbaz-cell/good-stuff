-- FirstPerson (LocalScript) — place in StarterCharacterScripts
-- Forces first-person camera and hides the local character's head/hat parts
-- from the player's own screen (they still appear to others).

local Players      = game:GetService("Players")
local RunService   = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local player    = Players.LocalPlayer
local camera    = workspace.CurrentCamera
local character = script.Parent
local humanoid  = character:WaitForChild("Humanoid")
local rootPart  = character:WaitForChild("HumanoidRootPart")
local head      = character:WaitForChild("Head")

-- ── Lock camera to first person ───────────────────────────────────────────────

camera.CameraType = Enum.CameraType.Custom

-- Prevent zooming out past first-person (zoom distance = 0)
player.CameraMinZoomDistance = 0
player.CameraMaxZoomDistance = 0

-- Hide local head and hair accessories so they don't block view
for _, obj in ipairs(character:GetDescendants()) do
	if obj:IsA("BasePart") and obj.Name == "Head" then
		obj.LocalTransparencyModifier = 1
	end
	if obj:IsA("Accessory") then
		local handle = obj:FindFirstChild("Handle")
		if handle then
			handle.LocalTransparencyModifier = 1
		end
	end
end

character.DescendantAdded:Connect(function(obj)
	if obj:IsA("Accessory") then
		local handle = obj:FindFirstChild("Handle")
		if handle then
			handle.LocalTransparencyModifier = 1
		end
	end
end)

-- ── Camera update loop ────────────────────────────────────────────────────────

RunService.RenderStepped:Connect(function()
	-- Keep camera type locked in case Roblox resets it
	if camera.CameraType ~= Enum.CameraType.Custom then
		camera.CameraType = Enum.CameraType.Custom
	end

	-- Force CFrame to first-person head position
	if humanoid.Health > 0 then
		local headCF = head.CFrame
		-- Position camera inside the head, looking in the camera's current direction
		local currentLook = camera.CFrame.LookVector
		camera.CFrame = CFrame.new(headCF.Position, headCF.Position + currentLook)
	end
end)

print("[FirstPerson] First-person camera active.")
