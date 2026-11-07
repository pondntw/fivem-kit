# {{name}}

FiveM resource ({{framework}}) with a React + TypeScript NUI, made with [fivem-kit](https://github.com/pondntw/fivem-kit).

## Develop

```bash
npm install
npm run dev       # rebuild on save + restart the resource in-game over RCON
npm run dev:ui    # UI only, in your browser with mock data (instant hot reload)
```

Hot reload in-game needs RCON: copy `.env.example` to `.env`, set `FIVEM_RCON_PASSWORD`,
and put the same password in `server.cfg`:

```cfg
rcon_password "change-me"
```

Then type `/{{command}}` in game.

## Lua ↔ UI messages

Every message is declared once in [`bridge.json`](bridge.json). `fivem-kit` generates:

- `client/bridge.gen.lua`: `Ui.<name>(data)` to send to the UI, `Nui.<name>(handler)` to answer it, with Lua Language Server types
- `web/src/bridge.gen.ts`: types used by `useNuiEvent` and `fetchNui`

Rename a field in `bridge.json` and TypeScript shows you every place in the UI that breaks.

## Ship

```bash
npm run build
```

Commit `web/dist` and the `*.gen.*` files: the server runs them as they are, so it doesn't need Node installed.
