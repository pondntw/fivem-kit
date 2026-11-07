# {{name}}

FiveM resource ({{framework}}) with a React + TypeScript NUI, made with [fivem-kit](https://github.com/pondntw/fivem-kit).

## Develop

```bash
cd web
npm install
npm run dev       # rebuild on save + restart the resource in-game over RCON
npm run dev:ui    # UI only, in your browser with mock data (instant hot reload)
```

Hot reload in-game needs RCON: copy `.env.example` to `.env`, set `FIVEM_RCON_PASSWORD`,
and put the same password in `server.cfg` (it cannot be set from the console once the server runs):

```cfg
set rcon_password "use-a-long-random-password"
```

Then type `/{{command}}` in game.

The Node project (package.json, node_modules, Vite) lives in `web/` on purpose: FXServer's built-in
yarn builder tries to `yarn install` any resource that has a package.json in its root, and won't start
the resource if that fails.

## Lua ↔ UI messages

Every message is declared once in [`bridge.json`](bridge.json). `fivem-kit` generates:

- `client/bridge.gen.lua`: `Ui.<name>(data)` to send to the UI, `Nui.<name>(handler)` to answer it, with Lua Language Server types
- `web/src/bridge.gen.ts`: types used by `useNuiEvent` and `fetchNui`

Rename a field in `bridge.json` and TypeScript shows you every place in the UI that breaks.

## Ship

```bash
cd web
npm run build
```

Commit `web/dist` and the `*.gen.*` files: the server runs them as they are, so it doesn't need Node installed.
