import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { watchCart, setCartQty, type CartLine } from "../lib/store";
import { DEFAULT_PLACE, type Place } from "../lib/delivery";
import { countryOf } from "../data/countries";
import type { Currency } from "../lib/catalog";

interface ShopCtx {
  place: Place;
  setPlace(p: Place): void;
  currency: Currency;
  setCurrency(c: Currency): void;
  cart: CartLine[];
  cartCount: number;
  addToCart(id: string, qty?: number): Promise<void>;
  setQty(id: string, qty: number): Promise<void>;
  compare: string[];
  toggleCompare(id: string): void;
  clearCompare(): void;
  toast: string | null;
  notify(msg: string): void;
}
const Ctx = createContext<ShopCtx>(null as unknown as ShopCtx);
export const useShop = () => useContext(Ctx);

export function ShopProvider({ children }: { children: ReactNode }) {
  const { user, ensureGuest } = useAuth();
  // v2 keys: older builds stored a different default, so every visitor starts on United States.
  const [place, setPlaceState] = useState<Place>(() => { try { return JSON.parse(localStorage.getItem("sm_place_v2") || "null") || DEFAULT_PLACE; } catch { return DEFAULT_PLACE; } });
  const [currency, setCurrencyState] = useState<Currency>(() => localStorage.getItem("sm_cur_v2") || countryOf(place.country)?.currency || "USD");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [compare, setCompare] = useState<string[]>(() => JSON.parse(localStorage.getItem("sm_compare") || "[]"));
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return setCart([]);
    return watchCart(user.uid, setCart);
  }, [user?.uid]);
  useEffect(() => { localStorage.setItem("sm_compare", JSON.stringify(compare)); }, [compare]);

  const value = useMemo<ShopCtx>(() => ({
    place,
    setPlace(p) {
      setPlaceState(p); localStorage.setItem("sm_place_v2", JSON.stringify(p));
      const c = countryOf(p.country)?.currency || "USD";
      setCurrencyState(c); localStorage.setItem("sm_cur_v2", c);
    },
    currency,
    setCurrency(c) { setCurrencyState(c); localStorage.setItem("sm_cur_v2", c); },
    cart,
    cartCount: cart.reduce((n, l) => n + l.qty, 0),
    async addToCart(id, qty = 1) {
      const u = await ensureGuest();
      const cur = cart.find((l) => l.id === id)?.qty || 0;
      await setCartQty(u.uid, id, cur + qty);
      window.dispatchEvent(new Event("sm-cart-add"));
      notifyFn("Added to cart");
    },
    async setQty(id, qty) {
      const u = await ensureGuest();
      await setCartQty(u.uid, id, qty);
    },
    compare,
    toggleCompare(id) {
      setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-3)));
    },
    clearCompare() { setCompare([]); },
    toast,
    notify: notifyFn,
  }), [place, currency, cart, compare, toast, user?.uid]);

  function notifyFn(msg: string) {
    setToast(msg);
    window.clearTimeout((notifyFn as unknown as { t?: number }).t);
    (notifyFn as unknown as { t?: number }).t = window.setTimeout(() => setToast(null), 2200);
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
