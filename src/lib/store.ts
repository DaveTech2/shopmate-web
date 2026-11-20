// Persistence: Firestore (users/{uid}/cart|orders|searches) when configured, localStorage in demo mode.
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, addDoc, getDocs, orderBy, query, limit, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export interface CartLine { id: string; qty: number }
export interface OrderLine { id: string; title: string; qty: number; price: number; currency: string; image: string }
export interface Order {
  id?: string;
  uid: string;
  lines: OrderLine[];
  subtotal: number;
  delivery: number;
  total: number;
  currency: string; // currency of amounts (NGN — catalog base)
  speed: "standard" | "express";
  eta: string;
  city: string;
  address: string;
  payment: "demo-card" | "pay-on-delivery";
  reference: string;
  createdAt: number;
}

const lsKey = (uid: string, k: string) => `sm_${k}_${uid}`;
const lsGet = <T,>(uid: string, k: string, d: T): T => JSON.parse(localStorage.getItem(lsKey(uid, k)) || "null") ?? d;
const lsSet = (uid: string, k: string, v: unknown) => {
  localStorage.setItem(lsKey(uid, k), JSON.stringify(v));
  window.dispatchEvent(new CustomEvent("sm-store", { detail: k }));
};

export function watchCart(uid: string, cb: (lines: CartLine[]) => void): () => void {
  if (db) {
    return onSnapshot(collection(db, "users", uid, "cart"), (snap) =>
      cb(snap.docs.map((d) => ({ id: d.id, qty: Number(d.data().qty) || 1 }))),
    );
  }
  const emit = () => cb(lsGet<CartLine[]>(uid, "cart", []));
  emit();
  const h = (e: Event) => (e as CustomEvent).detail === "cart" && emit();
  window.addEventListener("sm-store", h);
  return () => window.removeEventListener("sm-store", h);
}

export async function setCartQty(uid: string, id: string, qty: number): Promise<void> {
  if (db) {
    const ref = doc(db, "users", uid, "cart", id);
    if (qty <= 0) await deleteDoc(ref);
    else await setDoc(ref, { qty: Math.min(500, Math.round(qty)), updatedAt: serverTimestamp() }, { merge: true });
    return;
  }
  const lines = lsGet<CartLine[]>(uid, "cart", []).filter((l) => l.id !== id);
  if (qty > 0) lines.push({ id, qty: Math.min(500, Math.round(qty)) });
  lsSet(uid, "cart", lines);
}

export async function clearCart(uid: string, lines: CartLine[]): Promise<void> {
  await Promise.all(lines.map((l) => setCartQty(uid, l.id, 0)));
}

export async function createOrder(order: Order): Promise<string> {
  if (db) {
    const ref = await addDoc(collection(db, "users", order.uid, "orders"), order);
    return ref.id;
  }
  const id = "SM" + Date.now().toString(36).toUpperCase();
  lsSet(order.uid, "orders", [{ ...order, id }, ...lsGet<Order[]>(order.uid, "orders", [])]);
  return id;
}

export async function listOrders(uid: string): Promise<Order[]> {
  if (db) {
    const snap = await getDocs(query(collection(db, "users", uid, "orders"), orderBy("createdAt", "desc"), limit(30)));
    return snap.docs.map((d) => ({ ...(d.data() as Order), id: d.id }));
  }
  return lsGet<Order[]>(uid, "orders", []);
}

export async function saveSearch(uid: string, text: string, source: string): Promise<void> {
  if (db) {
    await addDoc(collection(db, "users", uid, "searches"), { text, source, createdAt: Date.now() }).catch(() => undefined);
    return;
  }
  lsSet(uid, "searches", [{ text, source, createdAt: Date.now() }, ...lsGet<unknown[]>(uid, "searches", [])].slice(0, 20));
}
