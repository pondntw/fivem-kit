import { useCallback, useEffect, useState } from 'react';
import type { UiMessages } from './bridge.gen';
import { fetchNui, useNuiEvent } from './nui';

type Shop = UiMessages['setShop'];
type Player = UiMessages['setPlayer'];

export function App() {
  const [visible, setVisible] = useState(false);
  const [shop, setShop] = useState<Shop>({ title: '', items: [] });
  const [player, setPlayer] = useState<Player | null>(null);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useNuiEvent('setVisible', ({ visible }) => setVisible(visible));
  useNuiEvent('setShop', setShop);
  useNuiEvent('setPlayer', setPlayer);

  const close = useCallback(() => {
    setVisible(false);
    void fetchNui('close', {});
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, close]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const buy = async (item: string) => {
    setBusy(true);
    try {
      const res = await fetchNui('buy', { item, amount: amounts[item] ?? 1 });
      setToast({ ok: res.ok, text: res.message ?? (res.ok ? 'Done' : 'Failed') });
    } catch (err) {
      setToast({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  // Render nothing while hidden: the NUI page sits over the whole game screen.
  if (!visible) return null;

  return (
    <div className="backdrop">
      <section className="panel" role="dialog" aria-label={shop.title}>
        <header>
          <div>
            <h1>{shop.title}</h1>
            {player && <p className="muted">{player.name}</p>}
          </div>
          {player && <span className="cash">${player.cash.toLocaleString()}</span>}
          <button className="icon" onClick={close} aria-label="Close">✕</button>
        </header>

        <ul className="items">
          {shop.items.map((item) => (
            <li key={item.name}>
              <span className="label">{item.label}</span>
              <span className="price">${item.price}</span>
              <input
                type="number"
                min={1}
                max={10}
                value={amounts[item.name] ?? 1}
                onChange={(e) => setAmounts({ ...amounts, [item.name]: Math.max(1, Number(e.target.value) || 1) })}
                aria-label={`Amount of ${item.label}`}
              />
              <button disabled={busy} onClick={() => void buy(item.name)}>Buy</button>
            </li>
          ))}
        </ul>

        <footer className="muted">Esc to close</footer>
        {toast && <div className={`toast ${toast.ok ? 'ok' : 'error'}`}>{toast.text}</div>}
      </section>
    </div>
  );
}
