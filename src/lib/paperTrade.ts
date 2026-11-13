/** Client-side paper trading ledger. Not a live broker. */

export type PaperSide = "BUY" | "SELL";

export type PaperOrder = {
  id: string;
  ticker: string;
  side: PaperSide;
  qty: number;
  price: number;
  value: number;
  at: string;
  mode: "paper";
  note: string;
};

const KEY = "finn-paper-orders-v1";

export function loadPaperOrders(): PaperOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PaperOrder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function placePaperOrder(input: {
  ticker: string;
  side: PaperSide;
  qty: number;
  price: number;
}): PaperOrder {
  const qty = Math.floor(Number(input.qty));
  const price = Number(input.price);
  if (!Number.isFinite(qty) || qty < 1) throw new Error("Enter a quantity of at least 1.");
  if (!Number.isFinite(price) || price <= 0) throw new Error("Live price unavailable — wait and retry.");
  const order: PaperOrder = {
    id: `P-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ticker: input.ticker.toUpperCase(),
    side: input.side,
    qty,
    price,
    value: Math.round(qty * price * 100) / 100,
    at: new Date().toISOString(),
    mode: "paper",
    note: "Paper trade — no real broker order was sent.",
  };
  const next = [order, ...loadPaperOrders()].slice(0, 100);
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("finn-paper-changed"));
  return order;
}
