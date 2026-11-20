import { useNavigate } from "react-router-dom";
import { Sparkles, Compass, Scale, ChevronRight, MessageSquare } from "lucide-react";
import { AppShell, Footer } from "../components/ui";
import { ensureDeviceModel } from "../ai/hybrid";

const EXAMPLES = [
  "Wireless headphones under $50 with good battery life",
  "A laptop for programming under $700",
  "Running shoes for flat feet, size 43",
];

export default function Landing() {
  const nav = useNavigate();
  const go = (q?: string) => {
    ensureDeviceModel(); // user gesture: start/warm the on-device model
    nav(q ? `/shop?q=${encodeURIComponent(q)}` : "/shop");
  };
  return (
    <AppShell landing>
      <main className="wrap landing">
        <h1 className="hero">Let’s Shop Smarter</h1>
        <p className="sub">Your AI personal shopper. Say what you need — Shopmate finds real listings, compares prices and delivers to your door.</p>

        <section className="card glow hero-card">
          <span className="label"><Sparkles size={12} /> AI-powered shopping</span>
          <h2>Find Anything Instantly</h2>
          <p>Describe a product, your budget and what it’s for. Get matching listings with clear reasons why they fit.</p>
          <button className="btn" onClick={() => go()}><Sparkles size={15} /> Start Shopping</button>
        </section>

        <div className="grid2">
          <button className="card feat glow-sm" onClick={() => nav("/discover")}>
            <span className="ic"><Compass size={15} color="#fff" /></span>
            <b>Discover Products</b>
            <span className="row"><span>Browse live listings near you</span><ChevronRight size={15} className="chev" /></span>
          </button>
          <button className="card feat glow-sm" onClick={() => nav("/compare")}>
            <span className="ic"><Scale size={15} color="#fff" /></span>
            <b>Compare Prices</b>
            <span className="row"><span>Side by side, explained by AI</span><ChevronRight size={15} className="chev" /></span>
          </button>
        </div>

        <h3 className="sectionT">Try Asking</h3>
        {EXAMPLES.map((q) => (
          <button key={q} className="card ex" onClick={() => go(q)}>
            <span className="q"><MessageSquare size={15} /></span>
            <span><b>{q}</b><small>Understood on your device with Gemini Nano</small></span>
            <ChevronRight size={16} className="go" />
          </button>
        ))}
      </main>
      <Footer />
    </AppShell>
  );
}
