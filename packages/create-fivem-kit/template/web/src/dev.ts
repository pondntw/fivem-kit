// Loaded only in the browser (`npm run dev:ui`), never in-game.
// It plays the part of Lua so you can build the UI with Vite's instant hot reload.
import { mockNui, sendDebug } from './nui';

let cash = 120;
const prices: Record<string, number> = { water: 5, bread: 8, bandage: 25 };

sendDebug('setShop', {
  title: 'Corner Shop',
  items: [
    { name: 'water', label: 'Water', price: 5 },
    { name: 'bread', label: 'Bread', price: 8 },
    { name: 'bandage', label: 'Bandage', price: 25 },
  ],
});
sendDebug('setPlayer', { name: 'John Doe', cash });
sendDebug('setVisible', { visible: true }, 100);

mockNui({
  close: () => {
    sendDebug('setVisible', { visible: false });
    sendDebug('setVisible', { visible: true }, 1000); // reopen so you can keep working
    return {};
  },
  buy: ({ item, amount }) => {
    const total = (prices[item] ?? 0) * amount;
    if (total > cash) return { ok: false, message: 'Not enough cash' };
    cash -= total;
    sendDebug('setPlayer', { name: 'John Doe', cash });
    return { ok: true, message: `Bought ${amount}x ${item} for $${total}` };
  },
});
