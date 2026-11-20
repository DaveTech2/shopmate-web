import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  onAuthStateChanged, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, linkWithPopup, linkWithCredential, EmailAuthProvider, GoogleAuthProvider, updateProfile, signOut,
  type User,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "../lib/firebase";

export interface SMUser { uid: string; name: string; email: string | null; isAnonymous: boolean; isDemo: boolean }
interface AuthCtx {
  user: SMUser | null;
  ready: boolean;
  ensureGuest(): Promise<SMUser>;
  signUp(name: string, email: string, password: string): Promise<void>;
  logIn(email: string, password: string): Promise<void>;
  google(): Promise<void>;
  logOut(): Promise<void>;
}
const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
export const useAuth = () => useContext(Ctx);

const toSM = (u: User): SMUser => ({
  uid: u.uid, name: u.displayName || (u.isAnonymous ? "Guest" : u.email?.split("@")[0] || "Shopper"),
  email: u.email, isAnonymous: u.isAnonymous, isDemo: false,
});

// ---- demo-mode accounts (no Firebase config): local only, clearly labelled in the UI ----
const DEMO_KEY = "sm_demo_user";
const demoLoad = (): SMUser | null => JSON.parse(localStorage.getItem(DEMO_KEY) || "null");
const demoSave = (u: SMUser | null) => (u ? localStorage.setItem(DEMO_KEY, JSON.stringify(u)) : localStorage.removeItem(DEMO_KEY));
const rid = () => Math.random().toString(36).slice(2, 10);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SMUser | null>(isFirebaseConfigured ? null : demoLoad());
  const [ready, setReady] = useState(!isFirebaseConfigured);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => {
      setUser(u ? toSM(u) : null);
      setReady(true);
    });
  }, []);

  const value: AuthCtx = {
    user,
    ready,
    async ensureGuest() {
      if (user) return user;
      if (auth) {
        const cred = await signInAnonymously(auth);
        return toSM(cred.user);
      }
      const u: SMUser = { uid: "demo-" + rid(), name: "Guest", email: null, isAnonymous: true, isDemo: true };
      demoSave(u);
      setUser(u);
      return u;
    },
    async signUp(name, email, password) {
      if (auth) {
        const cur = auth.currentUser;
        // Upgrade a guest session in place so the cart and orders carry over.
        const u = cur?.isAnonymous
          ? (await linkWithCredential(cur, EmailAuthProvider.credential(email, password))).user
          : (await createUserWithEmailAndPassword(auth, email, password)).user;
        await updateProfile(u, { displayName: name });
        setUser(toSM(u));
        return;
      }
      const u: SMUser = { uid: user?.uid || "demo-" + rid(), name, email, isAnonymous: false, isDemo: true };
      demoSave(u);
      setUser(u);
    },
    async logIn(email, password) {
      if (auth) {
        await signInWithEmailAndPassword(auth, email, password);
        return;
      }
      const u: SMUser = { uid: user?.uid || "demo-" + rid(), name: email.split("@")[0], email, isAnonymous: false, isDemo: true };
      demoSave(u);
      setUser(u);
    },
    async google() {
      if (auth) {
        const provider = new GoogleAuthProvider();
        const cur = auth.currentUser;
        if (cur?.isAnonymous) {
          try {
            await linkWithPopup(cur, provider);
            setUser(toSM(auth.currentUser!));
            return;
          } catch (e) {
            if ((e as { code?: string }).code !== "auth/credential-already-in-use") throw e;
          }
        }
        await signInWithPopup(auth, provider);
        return;
      }
      throw new Error("Google sign-in needs a Firebase project. This preview is running in demo mode.");
    },
    async logOut() {
      if (auth) await signOut(auth);
      demoSave(null);
      setUser(null);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
