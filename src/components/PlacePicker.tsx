import { useMemo, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import { COUNTRIES, flagOf, type Country } from "../data/countries";
import { useShop } from "../state/shop";
import type { Place } from "../lib/delivery";

const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Searchable country + city picker. United States is listed first. */
export function PlacePicker({ onDone }: { onDone?(): void }) {
  const { place, setPlace } = useShop();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Country | null>(null);
  const [other, setOther] = useState("");
  const list = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return COUNTRIES;
    return COUNTRIES.filter((c) => norm(c.name).includes(n) || c.code.toLowerCase() === n || c.cities.some(([city]) => norm(city).includes(n)));
  }, [q]);
  const pick = (p: Place) => { setPlace(p); onDone?.(); };
  return (
    <div className="picker">
      <div className="searchbox"><Search size={15} /><input value={q} onChange={(e) => { setQ(e.target.value); setOpen(null); }} placeholder="Search a country or city" aria-label="Search country or city" />{q && <button className="iconbtn sm" onClick={() => setQ("")} aria-label="Clear"><X size={13} /></button>}</div>
      <div className="plist">
        {list.map((c) => {
          const n = norm(q.trim());
          const cities = n && !norm(c.name).includes(n) ? c.cities.filter(([city]) => norm(city).includes(n)) : c.cities;
          const expanded = open?.code === c.code || (!!n && list.length <= 3);
          return (
            <div key={c.code} className={`pcountry${place.country === c.code ? " cur" : ""}`}>
              <button className="prow" onClick={() => setOpen(open?.code === c.code ? null : c)}>
                <span className="flag">{flagOf(c.code)}</span><span className="pname">{c.name}</span><span className="tiny">{c.currency}</span>
              </button>
              {expanded && (
                <div className="pcities">
                  {cities.map(([city, lat, lon]) => (
                    <button key={city} className={`pill sm${place.country === c.code && place.name === city ? " orange" : ""}`} onClick={() => pick({ name: city, country: c.code, lat, lon })}>{city}</button>
                  ))}
                  <form className="pother" onSubmit={(e) => { e.preventDefault(); const t = other.trim(); if (!t) return; const [, lat, lon] = c.cities[0]; pick({ name: t, country: c.code, lat, lon, approx: true }); }}>
                    <input className="input" value={other} onChange={(e) => setOther(e.target.value)} placeholder={`Other city in ${c.name}`} />
                    <button className="pill sm" type="submit"><MapPin size={12} /> Use</button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
        {!list.length && <p className="tiny" style={{ padding: 10 }}>No match. Try the country name.</p>}
      </div>
    </div>
  );
}

export function PlaceChip({ onClick }: { onClick(): void }) {
  const { place } = useShop();
  return (
    <button className="chip placechip" onClick={onClick} title="Change delivery country and city" aria-label={`Delivering to ${place.name}. Change`}>
      <span className="flag">{flagOf(place.country)}</span><span className="pcity">{place.name}</span>
    </button>
  );
}
