import { useEffect, useRef } from 'react';
import type { NuiCallbacks, UiMessages } from './bridge.gen';

type FiveMWindow = Window & { invokeNative?: unknown; GetParentResourceName?: () => string };
const w = window as FiveMWindow;

/** True when the page runs in a normal browser (`npm run dev:ui`) instead of in-game. */
export const isBrowser = !w.invokeNative;

const resourceName = isBrowser ? 'browser' : (w.GetParentResourceName?.() ?? 'unknown');

export class NuiError extends Error {
  constructor(callback: string, message: string) {
    super(`NUI callback "${callback}" failed: ${message}`);
    this.name = 'NuiError';
  }
}

type Request<K extends keyof NuiCallbacks> = NuiCallbacks[K]['request'];
type Response<K extends keyof NuiCallbacks> = NuiCallbacks[K]['response'];
type Mocks = { [K in keyof NuiCallbacks]?: (data: Request<K>) => Response<K> | Promise<Response<K>> };

const mocks: Mocks = {};

/** Browser only: fake Lua's answers so the UI works without the game. See dev.ts. */
export function mockNui(handlers: Mocks): void {
  Object.assign(mocks, handlers);
}

/**
 * Call Lua (handled by `Nui.<name>(handler)` in client/main.lua) and get its typed answer.
 * Rejects with NuiError if the Lua handler throws.
 */
export async function fetchNui<K extends keyof NuiCallbacks>(name: K, data: Request<K>): Promise<Response<K>> {
  if (isBrowser) {
    const mock = mocks[name] as ((d: Request<K>) => Response<K> | Promise<Response<K>>) | undefined;
    if (!mock) throw new NuiError(name, 'no mock registered (add one in dev.ts)');
    return mock(data);
  }
  const res = await fetch(`https://${resourceName}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(data),
  });
  const json: unknown = await res.json();
  if (json && typeof json === 'object' && '__error' in json) {
    throw new NuiError(name, String((json as { __error: unknown }).__error));
  }
  return json as Response<K>;
}

/** Run `handler` whenever Lua calls `Ui.<action>(data)`. */
export function useNuiEvent<K extends keyof UiMessages>(action: K, handler: (data: UiMessages[K]) => void): void {
  const saved = useRef(handler);
  useEffect(() => {
    saved.current = handler;
  }, [handler]);

  useEffect(() => {
    const listener = (event: MessageEvent<{ action?: string; data?: unknown }>) => {
      if (event.data?.action === action) saved.current(event.data.data as UiMessages[K]);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [action]);
}

/** Browser only: pretend Lua sent a message. */
export function sendDebug<K extends keyof UiMessages>(action: K, data: UiMessages[K], delayMs = 0): void {
  if (!isBrowser) return;
  setTimeout(() => window.dispatchEvent(new MessageEvent('message', { data: { action, data } })), delayMs);
}
