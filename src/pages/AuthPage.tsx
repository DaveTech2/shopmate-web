import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { AppShell } from "../components/ui";
import { useAuth } from "../state/auth";
import { isFirebaseConfigured } from "../lib/firebase";

const friendly = (e: unknown) => {
  const code = (e as { code?: string }).code || "";
  if (code.includes("email-already-in-use")) return "That email already has an account. Try logging in.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Email or password is incorrect.";
  if (code.includes("weak-password")) return "Use a password with at least 6 characters.";
  if (code.includes("popup-closed")) return "Google sign-in was closed before finishing.";
  return (e as Error).message || "Something went wrong. Please try again.";
};

export default function AuthPage({ mode }: { mode: "signup" | "login" }) {
  const { signUp, logIn, google } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const isUp = mode === "signup";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (isUp) await signUp(name.trim() || email.split("@")[0], email.trim(), pw);
      else await logIn(email.trim(), pw);
      nav("/shop");
    } catch (x) {
      setErr(friendly(x));
    } finally {
      setBusy(false);
    }
  }
  async function withGoogle() {
    setErr("");
    try {
      await google();
      nav("/shop");
    } catch (x) {
      setErr(friendly(x));
    }
  }

  return (
    <AppShell>
      <main className="wrap authwrap">
        <form className="card authcard" onSubmit={submit}>
          <span className="logo" style={{ justifyContent: "center" }}><span className="tile"><ShoppingBag size={15} color="#fff" strokeWidth={2.4} /></span></span>
          <h1>{isUp ? "Create your account" : "Welcome back"}</h1>
          {isUp && (
            <div className="field"><label htmlFor="n">Name</label><input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
          )}
          <div className="field"><label htmlFor="e">Email</label><input id="e" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
          <div className="field"><label htmlFor="p">Password</label><input id="p" className="input" type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={isUp ? "new-password" : "current-password"} /></div>
          {err && <div className="err">{err}</div>}
          <button className="btn block" disabled={busy}>{busy ? "Please wait…" : isUp ? "Create account" : "Log in"}</button>
          <div className="or">or</div>
          <button type="button" className="btn dark block" onClick={withGoogle}>Continue with Google</button>
          <p style={{ margin: "16px 0 0", textAlign: "left" }}>
            {isUp ? <Link className="link" to="/login">Already have an account? Log in</Link> : <Link className="link" to="/signup">New to Shopmate? Create an account</Link>}
          </p>
          {!isFirebaseConfigured && <p className="tiny" style={{ textAlign: "left", marginTop: 12 }}>Demo mode: accounts are stored only in this browser until Firebase is connected.</p>}
        </form>
      </main>
    </AppShell>
  );
}
