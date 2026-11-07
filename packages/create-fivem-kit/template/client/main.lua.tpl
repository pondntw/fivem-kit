-- Ui.* and Nui.* come from client/bridge.gen.lua, generated from bridge.json.
-- Hover them in VS Code (with the Lua extension) to see the exact fields each message takes.

local RESOURCE = GetCurrentResourceName()
local isOpen = false

{{#if oxlib}}
---Ask the server something and wait for the answer (ox_lib callback).
local function callServer(name, ...)
    return lib.callback.await(RESOURCE .. ':' .. name, false, ...)
end
{{/if}}
{{#if !oxlib}}
-- Small request/response over net events. With ox_lib you would use lib.callback instead.
local pending, nextId = {}, 0

RegisterNetEvent(RESOURCE .. ':response', function(id, ...)
    local p = pending[id]
    if not p then return end
    pending[id] = nil
    p:resolve(table.pack(...))
end)

---Ask the server something and wait for the answer.
local function callServer(name, ...)
    nextId = nextId + 1
    local p = promise.new()
    pending[nextId] = p
    TriggerServerEvent(RESOURCE .. ':request', nextId, name, ...)
    local result = Citizen.Await(p)
    return table.unpack(result, 1, result.n)
end
{{/if}}

local function setOpen(open)
    isOpen = open
    SetNuiFocus(open, open)
    Ui.setVisible({ visible = open })
end

RegisterCommand(Config.Command, function()
    if isOpen then return end
    local player = callServer('getPlayer')
    if not player then return end
    Ui.setShop({ title = Config.ShopTitle, items = Config.Items })
    Ui.setPlayer(player)
    setOpen(true)
end, false)

-- The UI calls fetchNui('close') on Escape or the close button.
Nui.close(function()
    setOpen(false)
end)

-- The UI calls fetchNui('buy', { item, amount }). Whatever we return is what fetchNui resolves with.
Nui.buy(function(data)
    local ok, message, player = callServer('buy', data.item, data.amount)
    if player then Ui.setPlayer(player) end
    return { ok = ok == true, message = message }
end)

-- Give the mouse back if the resource restarts while the UI is open (e.g. during hot reload).
AddEventHandler('onResourceStop', function(resource)
    if resource == RESOURCE and isOpen then
        SetNuiFocus(false, false)
    end
end)
