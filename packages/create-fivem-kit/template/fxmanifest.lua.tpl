fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name '{{name}}'
description 'Made with fivem-kit — https://github.com/pondntw/fivem-kit'
version '0.1.0'

shared_scripts {
{{#if oxlib}}
    '@ox_lib/init.lua',
{{/if}}
{{#if esx}}
    '@es_extended/imports.lua',
{{/if}}
    'shared/*.lua',
}

client_scripts {
    'client/bridge.gen.lua', -- generated from bridge.json, must load before your client code
    'client/main.lua',
}

server_scripts {
{{#if oxmysql}}
    '@oxmysql/lib/MySQL.lua',
{{/if}}
    'server/*.lua',
}

-- Built by `npm run dev` / `npm run build` (Vite). Paths inside are relative, as NUI requires.
ui_page 'web/dist/index.html'

files {
    'web/dist/index.html',
    'web/dist/assets/*',
}

dependencies {
{{#if esx}}
    'es_extended',
{{/if}}
{{#if qbcore}}
    'qb-core',
{{/if}}
{{#if oxlib}}
    'ox_lib',
{{/if}}
{{#if oxmysql}}
    'oxmysql',
{{/if}}
}
