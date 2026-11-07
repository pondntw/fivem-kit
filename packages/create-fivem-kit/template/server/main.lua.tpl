local RESOURCE = GetCurrentResourceName()
{{#if esx}}
-- `ESX` comes from @es_extended/imports.lua (see fxmanifest.lua).
{{/if}}
{{#if qbcore}}
local QBCore = exports['qb-core']:GetCoreObject()
{{/if}}
{{#if oxmysql}}
-- `MySQL` comes from @oxmysql/lib/MySQL.lua, e.g.
--   local rows = MySQL.query.await('SELECT * FROM users WHERE identifier = ?', { identifier })
{{/if}}

local itemsByName = {}
for _, item in ipairs(Config.Items) do
    itemsByName[item.name] = item
end

---@return { name: string, cash: number }?
local function getPlayer(src)
{{#if esx}}
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return nil end
    return { name = xPlayer.getName(), cash = xPlayer.getMoney() }
{{/if}}
{{#if qbcore}}
    local player = QBCore.Functions.GetPlayer(src)
    if not player then return nil end
    local info = player.PlayerData.charinfo
    return { name = ('%s %s'):format(info.firstname, info.lastname), cash = player.Functions.GetMoney('cash') }
{{/if}}
{{#if standalone}}
    -- No framework: plug in your own economy here.
    return { name = GetPlayerName(src), cash = 1000 }
{{/if}}
end

---Turns any client value into a whole number, or nil. Rejects NaN, inf and decimals.
local function toCount(value)
    local n = tonumber(value)
    return n and math.tointeger(n) or nil
end

local handlers = {}

function handlers.getPlayer(src)
    return getPlayer(src)
end

-- Never trust the client: the price, the item and the amount are all re-checked here.
function handlers.buy(src, itemName, amount)
    local item = type(itemName) == 'string' and itemsByName[itemName] or nil
    local count = toCount(amount)
    if not item or not count or count < 1 or count > Config.MaxPerPurchase then
        return false, 'Invalid request'
    end
    local total = item.price * count
{{#if esx}}

    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return false, 'Player not loaded' end
    if xPlayer.getMoney() < total then return false, 'Not enough cash', getPlayer(src) end
    if not xPlayer.canCarryItem(item.name, count) then return false, 'You cannot carry that', getPlayer(src) end
    xPlayer.removeMoney(total)
    xPlayer.addInventoryItem(item.name, count)
{{/if}}
{{#if qbcore}}

    local player = QBCore.Functions.GetPlayer(src)
    if not player then return false, 'Player not loaded' end
    if not player.Functions.RemoveMoney('cash', total, RESOURCE) then
        return false, 'Not enough cash', getPlayer(src)
    end
    if not player.Functions.AddItem(item.name, count) then
        player.Functions.AddMoney('cash', total, RESOURCE .. ' refund')
        return false, 'You cannot carry that', getPlayer(src)
    end
{{/if}}
{{#if standalone}}

    print(('[%s] %s bought %dx %s for $%d'):format(RESOURCE, GetPlayerName(src), count, item.name, total))
{{/if}}

    return true, ('Bought %dx %s for $%d'):format(count, item.label, total), getPlayer(src)
end

{{#if oxlib}}
for name, handler in pairs(handlers) do
    lib.callback.register(RESOURCE .. ':' .. name, handler)
end
{{/if}}
{{#if !oxlib}}
RegisterNetEvent(RESOURCE .. ':request', function(id, name, ...)
    local src = source
    local handler = handlers[name]
    if type(id) ~= 'number' or not handler then return end
    TriggerClientEvent(RESOURCE .. ':response', src, id, handler(src, ...))
end)
{{/if}}
