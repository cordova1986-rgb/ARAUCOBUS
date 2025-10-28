import React, { useEffect, useMemo, useState } from "react";

function useLocalTime() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function parseHHMM(str) {
  const [h, m] = str.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}
function minutesUntil(timeStr, now = new Date()) {
  const target = parseHHMM(timeStr);
  let diff = (target.getTime() - now.getTime()) / 60000;
  if (diff < -5) diff += 24 * 60;
  return Math.round(diff);
}
function labelForDay(now = new Date()) {
  const day = now.getDay();
  return day === 0 || day === 6 ? "weekend" : "weekday";
}

export default function App() {
  const now = useLocalTime();
  const [data, setData] = useState({ stops: [], routes: [], trips: [] });
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [routeId, setRouteId] = useState("");
  const [operator, setOperator] = useState("");
  const [query, setQuery] = useState("");
  const [dayType, setDayType] = useState(labelForDay(now));
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem("busapp:favorites:v1") || "[]"); }
    catch { return []; }
  });

  useEffect(() => { setDayType(labelForDay(now)); }, [now]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/data/bus-data.json", { cache: "no-store" });
        setData(await res.json());
      } catch (e) {
        console.error("No se pudo cargar /data/bus-data.json", e);
      }
    })();
  }, []);

  const operators = useMemo(
    () => Array.from(new Set(data.routes.map(r => r.operator))).sort(),
    [data]
  );

  const filteredRoutes = useMemo(() => {
    return data.routes.filter(r => {
      const okOp  = !operator || r.operator === operator;
      const okO   = !origin || r.from_stop_id === origin;
      const okD   = !destination || r.to_stop_id === destination;
      const okQ   = !query || (r.name?.toLowerCase().includes(query.toLowerCase()) || r.code?.toLowerCase().includes(query.toLowerCase()));
      return okOp && okO && okD && okQ;
    });
  }, [data.routes, operator, origin, destination, query]);

  const routesById = useMemo(() => Object.fromEntries(data.routes.map(r => [r.id, r])), [data.routes]);
  const stopsById  = useMemo(() => Object.fromEntries(data.stops.map(s => [s.id, s])), [data.stops]);

  function nextDeparturesFor(route_id, stop_id, n = 5) {
    const t = data.trips.find(x => x.route_id === route_id && x.stop_id === stop_id);
    if (!t) return [];
    const list = (t.times?.[dayType] || []).slice();
    const withDiff = list.map(hhmm => ({ hhmm, mins: minutesUntil(hhmm, now) }))
      .sort((a, b) => a.mins - b.mins)
      .filter(x => x.mins >= -5);
    const upcoming = withDiff.filter(x => x.mins >= 0).slice(0, n);
    if (upcoming.length < n) {
      const topups = withDiff.filter(x => x.mins < 0).slice(0, n - upcoming.length);
      return [...upcoming, ...topups];
    }
    return upcoming;
  }

  function toggleFavorite(key) {
    setFavorites(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      localStorage.setItem("busapp:favorites:v1", JSON.stringify(next));
      return next;
    });
  }
  const isFavorite = (key) => favorites.includes(key);

  const favoriteCards = useMemo(() => {
    return favorites
      .map(key => {
        const [rId, sId] = key.split("::");
        const r = routesById[rId];
        const s = stopsById[sId];
        if (!r || !s) return null;
        const next = nextDeparturesFor(r.id, s.id, 3);
        return { key, route: r, stop: s, next };
      })
      .filter(Boolean);
  }, [favorites, routesById, stopsById, data, dayType, now]);

  return (
    <div className="container">
      <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div>
          <h1>Arabus — Horarios de Buses</h1>
          <div className="muted">MVP gratis: consulta por ruta, paradero y operador</div>
        </div>
        <div className="muted">
          {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(now)} · {dayType === "weekday" ? "día laboral" : "fin de semana"}
        </div>
      </header>

      <section className="card" style={{marginBottom:16}}>
        <h2>Buscar rutas</h2>
        <div className="grid grid-6">
          <div className="col-2">
            <label>Origen</label>
            <select value={origin} onChange={e => setOrigin(e.target.value)}>
              <option value="">Todos</option>
              {data.stops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="col-2">
            <label>Destino</label>
            <select value={destination} onChange={e => setDestination(e.target.value)}>
              <option value="">Todos</option>
              {data.stops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="col-2">
            <label>Operador</label>
            <select value={operator} onChange={e => setOperator(e.target.value)}>
              <option value="">Todos</option>
              {operators.map(op => <option key={op} value={op}>{op}</option>)}
            </select>
          </div>
          <div className="col-3">
            <label>Ruta</label>
            <select value={routeId} onChange={e => setRouteId(e.target.value)}>
              <option value="">Todas</option>
              {filteredRoutes.map(r => <option key={r.id} value={r.id}>{r.code ? `${r.code} — ${r.name}` : r.name}</option>)}
            </select>
          </div>
          <div className="col-3">
            <label>Búsqueda rápida</label>
            <input placeholder="Ej: Arauco, 101, Concepción..." value={query} onChange={e => setQuery(e.target.value)} />
          </div>
        </div>
      </section>

      {favoriteCards.length > 0 && (
        <section style={{marginBottom:16}}>
          <h2>Favoritos</h2>
          <div className="grid grid-2col">
            {favoriteCards.map(({ key, route, stop, next }) => (
              <div key={key} className="card">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <span><b>{route.code ? `${route.code} — ${route.name}` : route.name}</b></span>
                  <button className="fav" onClick={() => { const ok = confirm("¿Quitar de favoritos?"); if (ok) toggleFavorite(key); }}>Quitar</button>
                </div>
                <div className="muted" style={{marginBottom:8}}>Paradero: {stop.name}</div>
                <ul className="list">
                  {next.map((n, i) => (
                    <li key={i}>
                      <span className="mono">{n.hhmm}</span>
                      <span className="muted">{n.mins >= 0 ? `en ${n.mins} min` : `pasó hace ${Math.abs(n.mins)} min`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <h2>Resultados</h2>
          <span className="muted">Pulsa el corazón para guardar ruta/paradero</span>
        </div>

        <div className="grid grid-2col">
          {(routeId ? data.routes.filter(r => r.id === routeId) : filteredRoutes).map(r => {
            const stops = [r.from_stop_id, r.to_stop_id];
            return (
              <div key={r.id} className="card">
                <div style={{marginBottom:8}}>
                  <div><b>{r.code ? `${r.code} — ${r.name}` : r.name}</b></div>
                  <div className="muted">Operador: {r.operator}</div>
                </div>
                {stops.map((sid) => {
                  const favKey = `${r.id}::${sid}`;
                  const stop = stopsById[sid];
                  const next = nextDeparturesFor(r.id, sid, 5);
                  return (
                    <div key={sid} className="card" style={{padding:12, marginTop:8}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                        <div><b>Sale desde {stop?.name}</b></div>
                        <button className={`fav ${isFavorite(favKey) ? 'active' : ''}`} onClick={() => toggleFavorite(favKey)}>
                          {isFavorite(favKey) ? 'Favorito ✓' : '❤️ Fav'}
                        </button>
                      </div>
                      {next.length === 0 ? (
                        <div className="muted">Sin horarios para este día.</div>
                      ) : (
                        <ul className="list">
                          {next.map((n, i) => (
                            <li key={i}>
                              <span className="mono" style={{fontSize:16}}>{n.hhmm}</span>
                              <span className="muted">{n.mins >= 0 ? `en ${n.mins} min` : `pasó hace ${Math.abs(n.mins)} min`}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>

      <footer style={{marginTop:24}} className="muted">
        Hecho con ❤️ para Arauco & Biobío — MVP listo para publicar en Vercel.
      </footer>
    </div>
  );
}
