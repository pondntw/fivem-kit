Config = {}

-- Chat command that opens the shop.
Config.Command = '{{command}}'

Config.ShopTitle = 'Corner Shop'

-- Largest amount of one item a player can buy at once (checked on the server).
Config.MaxPerPurchase = 10

-- `name` must exist in your item list.
Config.Items = {
{{#if qbcore}}
    { name = 'water_bottle', label = 'Water', price = 5 },
    { name = 'sandwich', label = 'Sandwich', price = 8 },
    { name = 'bandage', label = 'Bandage', price = 25 },
{{/if}}
{{#if !qbcore}}
    { name = 'water', label = 'Water', price = 5 },
    { name = 'bread', label = 'Bread', price = 8 },
    { name = 'bandage', label = 'Bandage', price = 25 },
{{/if}}
}
