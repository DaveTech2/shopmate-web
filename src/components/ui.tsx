import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Menu, ShoppingBag, Home, LogIn, UserPlus, Search, Compass, Scale, ShoppingCart, Package, Settings, LogOut, X, Cpu, Cloud, FlaskConical,
} from "lucide-react";
import { useAuth } from "../state/auth";
import { useShop } from "../state/shop";
import { isFirebaseConfigured } from "../lib/firebase";
import {
  aiLive, deviceStatus, ensureDeviceModel, getModeSetting, onDownloadProgress, setModeSetting, type DeviceStatus, type ModeSetting, type Source, type Route,
} from "../ai/hybrid";
import { placeOptions } from "../lib/delivery";

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Shopmate home">
      <span className="tile"><ShoppingBag size={15} color="#fff" strokeWidth={2.4} /></span>
      Shopmate
    </Link>
  );
}

export function Footer() {
  return <footer className="foot">Shopmate · built on Firebase AI Logic</footer>;
}

export function MenuDialog({ onClose, onSettings }: { onClose(): void; onSettings(): void }) {
  const { user, logOut } = useAuth();
  const signedIn = user && !user.isAnonymous;
  return (
    <div className="scrim" onClick={onClose} role="dialog" aria-modal="true" aria-label="Menu">
      <div className="card menu" onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ padding: "6px 8px 8px 14px" }}>
          <b style={{ fontSize: 13 }}>Menu</b>
          <button className="iconbtn" onClick={onClose} aria-label="Close menu"><X size={16} /></button>
        </div>
        <Link to="/" onClick={onClose}><Home size={17} /> Home</Link>
        <Link to="/shop" onClick={onClose}><Search size={17} /> Shop with AI</Link>
        <Link to="/discover" onClick={onClose}><Compass size={17} /> Discover</Link>
        <Link to="/compare" onClick={onClose}><Scale size={17} /> Compare</Link>
        <Link to="/cart" onClick={onClose}><ShoppingCart size={17} /> Cart</Link>
        <Link to="/orders" onClick={onClose}><Package size={17} /> Orders</Link>
        <button className="item" onClick={() => { onClose(); onSettings(); }}><Settings size={17} /> AI & delivery settings</button>
        <hr />
        {signedIn ? (
          <button className="item" onClick={() => { logOut(); onClose(); }}><LogOut size={17} /> Log out ({user!.name})</button>
        ) : (
          <>
            <Link to="/login" onClick={onClose}><LogIn size={17} /> Log in</Link>
            <Link to="/signup" onClick={onClose}><UserPlus size={17} /> Create account</Link>
          </>
        )}
      </div>
    </div>
  );
}

export function useDeviceStatus() {
  const [st, setSt] = useState<DeviceStatus>("checking");
  const [prog, setProg] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const check = () => deviceStatus().then((s) => alive && setSt(s));
    check();
    const off = onDownloadProgress((p) => { setProg(p); if (p === null) check(); });
    return () => { alive = false; off(); };
  }, []);
  return { st, prog };
}

const ST_TEXT: Record<DeviceStatus, string> = {
  checking: "Checking Gemini Nano…",
  available: "Gemini Nano ready",
  downloadable: "Gemini Nano downloadable",
  downloading: "Gemini Nano downloading",
  unavailable: "Nano unavailable · cloud",
  unsupported: "No on-device AI · cloud",
};

export function StatusChip({ onClick }: { onClick(): void }) {
  const { st, prog } = useDeviceStatus();
  const cls = st === "available" ? "ok" : st === "downloadable" || st === "downloading" ? "warn" : "cloud";
  return (
    <button className="chip" onClick={onClick} title="On-device model status — click for AI settings">
      <span className={`dot ${cls}`} />
      {prog !== null ? `Downloading Nano ${Math.round(prog * 100)}%` : ST_TEXT[st]}
      {!isFirebaseConfigured && <span style={{ color: "var(--amber)", fontWeight: 600 }}>· Demo mode</span>}
    </button>
  );
}

export function AIBadge({ source, route, label, ms }: { source: Source; route: Route; label?: string; ms?: number }) {
  const t = ms ? ` · ${ms < 1000 ? ms + "ms" : (ms / 1000).toFixed(1) + "s"}` : "";
  if (source === "on_device")
    return <span className="badge dev"><Cpu size={12} /> {label ? label + ": " : ""}On-device · Gemini Nano{t}</span>;
  if (source === "in_cloud")
    return <span className="badge cloud"><Cloud size={12} /> {label ? label + ": " : ""}Cloud · Gemini{t}</span>;
  return (
    <span className="badge demo" title={source === "demo" ? "Demo mode: no Firebase project configured, rules-based simulation" : "Firebase AI call failed; rules fallback"}>
      <FlaskConical size={12} /> {label ? label + ": " : ""}{source === "demo" ? "Demo · simulated" : "Fallback · rules"} ({route === "on-device" ? "on-device route" : "cloud route"})
    </span>
  );
}

export function SettingsDialog({ onClose }: { onClose(): void }) {
  const { place, setPlace, currency, setCurrency } = useShop();
  const { st, prog } = useDeviceStatus();
  const [mode, setMode] = useState<ModeSetting>(getModeSetting());
  return (
    <div className="scrim" onClick={onClose} role="dialog" aria-modal="true" aria-label="Settings">
      <div className="card menu" style={{ padding: 20, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="between"><b>AI & delivery settings</b><button className="iconbtn" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        <div className="stack" style={{ marginTop: 16 }}>
          <div className="field"><label>Deliver to</label>
            <select className="select" value={`${place.name}|${place.country}`} onChange={(e) => setPlace(placeOptions.find((p) => `${p.name}|${p.country}` === e.target.value)!)}>
              {placeOptions.map((p) => <option key={`${p.name}|${p.country}`} value={`${p.name}|${p.country}`}>{p.name}{p.state && p.state !== p.name ? `, ${p.state}` : ""} ({p.country})</option>)}
            </select>
          </div>
          <div className="between"><span className="tiny" style={{ color: "var(--text)", fontWeight: 600, fontSize: 12 }}>Show prices in</span>
            <div className="seg">{(["USD", "NGN"] as const).map((c) => <button key={c} className={currency === c ? "on" : ""} onClick={() => setCurrency(c)}>{c === "USD" ? "$ USD" : "₦ NGN"}</button>)}</div>
          </div>
          <div className="field"><label>Hybrid inference mode</label>
            <select className="select" value={mode} onChange={(e) => { const m = e.target.value as ModeSetting; setMode(m); setModeSetting(m); }}>
              <option value="auto">Auto — on-device for light tasks, cloud for ranking (recommended)</option>
              <option value="PREFER_ON_DEVICE">Prefer on-device for everything</option>
              <option value="ONLY_ON_DEVICE">Only on-device (private / offline)</option>
              <option value="PREFER_IN_CLOUD">Prefer cloud</option>
              <option value="ONLY_IN_CLOUD">Only cloud</option>
            </select>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="between"><span style={{ fontSize: 13 }}>On-device model</span><span className="tiny">{ST_TEXT[st]}</span></div>
            {prog !== null && <div className="progress" style={{ marginTop: 10 }}><i style={{ width: `${prog * 100}%` }} /></div>}
            <p className="tiny" style={{ margin: "10px 0" }}>Gemini Nano runs in Chrome on desktop (v139+). When it isn't available, Shopmate falls back to cloud Gemini automatically.</p>
            <button className="pill sm" disabled={!aiLive || st === "available" || st === "unsupported"} onClick={() => ensureDeviceModel()}>Download / warm up Gemini Nano</button>
          </div>
          {!isFirebaseConfigured && (
            <p className="testnote">Demo mode: this preview isn't connected to a Firebase project yet, so AI answers are simulated and labelled "Demo · simulated". Accounts, cart and orders stay in this browser.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children, landing = false }: { children: ReactNode; landing?: boolean }) {
  const [menu, setMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const { user } = useAuth();
  const { cartCount, toast } = useShop();
  const nav = useNavigate();
  const signedIn = user && !user.isAnonymous;
  const head = (
    <header className="hdr">
      <button className="iconbtn" onClick={() => setMenu(true)} aria-label="Menu"><Menu size={17} /></button>
      <Logo />
      <span className="sp" />
      {!landing && <span className="hide-sm"><StatusChip onClick={() => setSettings(true)} /></span>}
      {!landing && (
        <button className="iconbtn" onClick={() => nav("/cart")} aria-label="Cart">
          <ShoppingCart size={17} />{cartCount > 0 && <span className="count">{cartCount}</span>}
        </button>
      )}
      {signedIn ? (
        <button className="pill" onClick={() => setMenu(true)}>{user!.name}</button>
      ) : (
        <>
          <Link to="/login" className={`pill ${landing ? "" : "hide-sm"}`}>Log in</Link>
          <Link to="/signup" className="pill orange">Sign up</Link>
        </>
      )}
    </header>
  );
  return (
    <>
      {landing ? (
        <div className="wrap landing">{head}</div>
      ) : (
        <div className="apphead">
          <div className="wrap wide">
            {head}
            <div className="show-sm" style={{ paddingBottom: 10 }}><StatusChip onClick={() => setSettings(true)} /></div>
          </div>
        </div>
      )}
      {children}
      {menu && <MenuDialog onClose={() => setMenu(false)} onSettings={() => setSettings(true)} />}
      {settings && <SettingsDialog onClose={() => setSettings(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
