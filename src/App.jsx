import { useState, useEffect, useCallback } from "react";

// ── Dutch logic ──────────────────────────────────────────────────────────────

function calcDutch(legs, totalStake) {
  const inverses = legs.map(leg => 1 / leg.multiplier);
  const sumInv = inverses.reduce((total, inv) => total + inv, 0);

  const stakes = legs.map((leg, i) => {
    const price = 1 / leg.multiplier;        // ask price for sizing
    const fillPrice = leg.lastPrice || price; // last price for contract count
    const rawStake = totalStake * (inverses[i] / sumInv);
    const fee_rate = 0.07 * fillPrice * (1 - fillPrice);
    const stakeAfterFee = rawStake / (1 + fee_rate); // deduct fee first
    const contracts = Math.floor(stakeAfterFee / fillPrice);
    const actualStake = contracts * fillPrice + (contracts * fee_rate);
    const payout = contracts * 1;
    const fee = contracts * fee_rate;
    return {
      ...leg,
      stake: actualStake,
      payout,
      fee,
      netPayout: payout - fee,
    };
  });

  const totalFees = stakes.reduce((a, s) => a + s.fee, 0);
  const totalActualStake = stakes.reduce((a, s) => a + s.stake, 0);
  const profit = stakes[0].payout - totalActualStake;
  const netProfit = stakes[0].netPayout - totalActualStake;
  const roi = (profit / totalActualStake) * 100;
  const netRoi = (netProfit / totalActualStake) * 100;
  const hasSurplus = profit > 0;
  const netHasSurplus = netProfit > 0;

  return { stakes, sumInv, hasSurplus, profit, roi, netProfit, netRoi, netHasSurplus, totalFees };
}

// ── Country code → flag emoji ─────────────────────────────────────────────

const TEAM_ISO = {
  'Argentina': 'ar', 'Austria': 'at', 'Algeria': 'dz', 'Jordan': 'jo',
  'Portugal': 'pt', 'Colombia': 'co', 'Uzbekistan': 'uz', 'Congo DR': 'cd',
  'England': 'gb-eng', 'Croatia': 'hr', 'Panama': 'pa', 'Ghana': 'gh',
  'France': 'fr', 'Senegal': 'sn', 'Norway': 'no', 'Iraq': 'iq',
  'Spain': 'es', 'Uruguay': 'uy', 'Saudi Arabia': 'sa', 'Cape Verde': 'cv',
  'Belgium': 'be', 'IR Iran': 'ir', 'Egypt': 'eg', 'New Zealand': 'nz',
  'Netherlands': 'nl', 'Japan': 'jp', 'Tunisia': 'tn',
  'Germany': 'de', 'Ecuador': 'ec', 'Ivory Coast': 'ci', 'Curacao': 'cw',
  'USA': 'us', 'Australia': 'au', 'Paraguay': 'py', 'Turkiye': 'tr',
  'Brazil': 'br', 'Morocco': 'ma', 'Scotland': 'gb-sct', 'Haiti': 'ht',
  'Canada': 'ca', 'Switzerland': 'ch', 'Qatar': 'qa',
  'Mexico': 'mx', 'Korea Republic': 'kr', 'South Africa': 'za', 'Denmark': 'dk',
  'Bosnia and Herzegovina': 'ba', 'Czechia': 'cz', 'Sweden': 'se',
  'Poland': 'pl', 'Ukraine': 'ua',
};

function FlagImg({ teamName }) {
  const iso = TEAM_ISO[teamName];
  if (!iso) return null;
  return (
    <img
      src={`https://flagcdn.com/24x18/${iso}.png`}
      width="24"
      height="18"
      alt={teamName}
      style={{ borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }}
    />
  );
}

function formatKickoff(utcDate) {
  if (!utcDate) return null;
  return new Date(utcDate).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

const NAME_MAP = {
  'United States': 'USA',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  'Cape Verde Islands': 'Cape Verde',
  'Turkey': 'Turkiye',
  'Curaçao': 'Curacao',
  'South Korea': 'Korea Republic',
  'IR Iran': 'Iran',
};

function normalizeName(name) {
  return NAME_MAP[name] || name;
}

async function fetchMatchTimes() {
  const res = await fetch('/api/football?path=/competitions/WC/matches&season=2026');
  if (!res.ok) return {};
  const data = await res.json();

  const lookup = {};
  (data.matches || []).forEach(m => {
    if (!m.homeTeam.name || !m.awayTeam.name) return;
    const home = normalizeName(m.homeTeam.name);
    const away = normalizeName(m.awayTeam.name);
    const info = {
      kickoff: m.utcDate,
      homeCrest: m.homeTeam.crest,
      awayCrest: m.awayTeam.crest,
    };
    lookup[`${home} vs ${away}`] = info;
    lookup[`${away} vs ${home}`] = info;
  });
  return lookup;
}


// ── Kalshi fetch ─────────────────────────────────────────────────────────────

async function fetchMatches() {
  let allEvents = [];
  let cursor = "";

  while (true) {
    const url = `/api/kalshi?path=/events&series_ticker=KXWCGAME&status=open&with_nested_markets=true&limit=200${cursor ? `&cursor=${cursor}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch matches");
    const data = await res.json();

    allEvents = [...allEvents, ...(data.events || [])];

    if (!data.cursor || data.cursor === cursor) break;
    cursor = data.cursor;
  }

  return allEvents
    .map(event => ({
      eventTicker: event.event_ticker,
      title: event.title,
      kickoff: event.markets?.[0]?.expected_expiration_time ?? event.markets?.[0]?.close_time,
      markets: (event.markets || [])
        .filter(m => m.status === "active" && m.yes_ask_dollars > 0)
        .map(m => ({
          id: m.ticker,
          label: m.yes_sub_title,
          multiplier: parseFloat((1 / parseFloat(m.last_price_dollars)).toFixed(2)),
          impliedPct: Math.round(parseFloat(m.last_price_dollars) * 100),
          lastPrice: parseFloat(m.last_price_dollars),
          volume: parseFloat(m.volume_fp || 0),
        })),
    }))
    .filter(e => e.markets.length === 3)
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
}

// ── Components ───────────────────────────────────────────────────────────────

function OutcomeRow({ outcome, excluded, onToggle, onRemove, isLive }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px", marginBottom: 8, borderRadius: 10,
      border: excluded ? "1.5px solid #3a3a4a" : "1.5px solid #00e5a0",
      background: excluded ? "#1a1a24" : "#0d2620",
      opacity: excluded ? 0.45 : 1, transition: "all 0.15s",
    }}>
      <button onClick={() => onToggle(outcome.id)} style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "none", border: "none", cursor: "pointer", flex: 1,
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: "50%",
          background: excluded ? "#2a2a38" : "#00e5a0",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, color: "#0a1a14", fontWeight: 700, flexShrink: 0,
        }}>
          {excluded ? "" : "✓"}
        </div>
        <span style={{ color: excluded ? "#555" : "#e0ffe8", fontWeight: 600, fontSize: 14 }}>
          {outcome.label}
        </span>
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ textAlign: "right" }}>
          <span style={{ color: excluded ? "#444" : "#00e5a0", fontWeight: 700, fontSize: 15 }}>
            {outcome.multiplier}x
          </span>
          <span style={{ color: "#555", fontSize: 12, marginLeft: 6 }}>
            {outcome.impliedPct}%
          </span>
        </div>
        {!isLive && (
          <button onClick={() => onRemove(outcome.id)} style={{
            background: "none", border: "none", color: "#333",
            cursor: "pointer", fontSize: 16, padding: "0 4px",
          }}>✕</button>
        )}
      </div>
    </div>
  );
}

function DutchResult({ result }) {
  if (!result) return null;
  const { stakes, sumInv, netProfit, netRoi, netHasSurplus } = result;

  return (
    <div style={{
      padding: 18, borderRadius: 14,
      background: netHasSurplus ? "#0b2a1e" : "#1e1212",
      border: `1.5px solid ${netHasSurplus ? "#00e5a0" : "#ff4d4d"}`,
    }}>

      {/* Net profit */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ color: "#888", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>
            Net Profit (after fees)
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: netHasSurplus ? "#00e5a0" : "#ff4d4d" }}>
            {netHasSurplus ? "+" : "-"}${Math.abs(netProfit).toFixed(2)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#888", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>ROI</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: netHasSurplus ? "#00e5a0" : "#ff4d4d" }}>
            {netRoi.toFixed(1)}%
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: "#1e2030", margin: "12px 0" }} />

      {/* Stake breakdown */}
      <div style={{ color: "#888", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
        Stake breakdown
      </div>
      {stakes.map((s, i) => (
        <div key={i} style={{
          padding: "8px 0",
          borderBottom: i < stakes.length - 1 ? "1px solid #1e2030" : "none",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#ccc", fontSize: 13 }}>{s.label}</span>
            <div style={{ display: "flex", gap: 12 }}>
              <span style={{ color: "#aaa", fontSize: 13 }}>
                Stake: <b style={{ color: "#fff" }}>${s.stake.toFixed(2)}</b>
              </span>
              <span style={{ color: "#aaa", fontSize: 13 }}>
                Payout: <b style={{ color: "#00e5a0" }}>${s.payout.toFixed(2)}</b>
              </span>
            </div>
          </div>
        </div>
      ))}

      {!netHasSurplus && (
        <div style={{
          marginTop: 12, padding: "10px 14px", borderRadius: 8,
          background: "#2a1212", border: "1px solid #4a2020",
          color: "#ff8888", fontSize: 12, lineHeight: 1.5,
        }}>
          ⚠️ These outcomes have {((sumInv - 1) * 100).toFixed(1)}% vig — covering them locks in a loss even after fees.
        </div>
      )}
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  // mode: 'live' | 'manual'
  const [mode, setMode] = useState("live");

  // Live state
  const [matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [matchTimes, setMatchTimes] = useState({});

  // Shared state
  const [excluded, setExcluded] = useState(new Set());
  const [stake, setStake] = useState(100);

  // Manual state
  const [manualOutcomes, setManualOutcomes] = useState([
    { id: 1, label: "Argentina", multiplier: 1.50, impliedPct: 67 },
    { id: 2, label: "Draw",      multiplier: 4.31, impliedPct: 23 },
    { id: 3, label: "Algeria",   multiplier: 7.85, impliedPct: 13 },
  ]);
  const [newLabel, setNewLabel] = useState("");
  const [newMult, setNewMult] = useState("");

  // ── Live fetch ──

  const loadMatches = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchMatches();
      setMatches(data);
      const times = await fetchMatchTimes();   // ← add this
      setMatchTimes(times);
      setLastRefresh(new Date());
      if (data.length > 0) setSelectedMatch(prev => prev ?? data[0].eventTicker);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== "live") return;
    const initialId = setTimeout(loadMatches, 0);
    const intervalId = setInterval(loadMatches, 30000);
    return () => {
      clearTimeout(initialId);
      clearInterval(intervalId);
    };
  }, [mode, loadMatches]);

  useEffect(() => {
    const id = setTimeout(() => setExcluded(new Set()), 0);
    return () => clearTimeout(id);
  }, [selectedMatch, mode]);

  // ── Derived ──

  const activeOutcomes = mode === "live"
    ? (matches.find(m => m.eventTicker === selectedMatch)?.markets ?? [])
    : manualOutcomes;

  const coveredLegs = activeOutcomes.filter(o => !excluded.has(o.id));
  const result = coveredLegs.length >= 2 ? calcDutch(coveredLegs, stake) : null;

  // ── Manual handlers ──

  const addOutcome = () => {
    if (!newLabel || !newMult || isNaN(newMult) || Number(newMult) <= 1) return;
    setManualOutcomes(prev => [...prev, {
      id: Date.now(),
      label: newLabel,
      multiplier: Number(newMult),
      impliedPct: Math.round((1 / Number(newMult)) * 100),
    }]);
    setNewLabel(""); setNewMult("");
  };

  const removeOutcome = (id) => {
    setManualOutcomes(prev => prev.filter(o => o.id !== id));
    setExcluded(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const toggleExclude = (id) => {
    setExcluded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Render ──

  return (
    <div style={{
      minHeight: "100vh", background: "#0e0f17", color: "#e0e0e0",
      fontFamily: "'Inter', system-ui, sans-serif", padding: "0 0 60px",
    }}>

      {/* Header */}
      <div style={{
        padding: "22px 20px 16px", borderBottom: "1px solid #1a1b2a",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "#00e5a0", textTransform: "uppercase", fontWeight: 700 }}>Kalshi</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>Dutch Calculator</div>
        </div>
        {mode === "live" && (
          <button onClick={loadMatches} style={{
            background: "none", border: "1px solid #2a2b3a", borderRadius: 8,
            color: "#888", padding: "6px 12px", fontSize: 12, cursor: "pointer",
          }}>↻ Refresh</button>
        )}
      </div>

      <div style={{ padding: "16px 20px" }}>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {["live", "manual"].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: "9px 0", borderRadius: 9, fontSize: 13, fontWeight: 600,
              border: mode === m ? "1.5px solid #00e5a0" : "1.5px solid #1e1f2e",
              background: mode === m ? "#0d2620" : "#13141f",
              color: mode === m ? "#00e5a0" : "#666",
              cursor: "pointer", textTransform: "capitalize",
            }}>
              {m === "live" ? "🟢 Live Kalshi Markets" : "✏️ Manual Entry"}
            </button>
          ))}
        </div>

        {/* Outcomes */}
        {activeOutcomes.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "#888", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
              Outcomes — toggle off what you think won't happen
            </div>
            {activeOutcomes.map(o => (
              <OutcomeRow
                key={o.id}
                outcome={o}
                excluded={excluded.has(o.id)}
                onToggle={toggleExclude}
                onRemove={removeOutcome}
                isLive={mode === "live"}
              />
            ))}
          </div>
        )}

        {/* Stake */}
        {activeOutcomes.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "#888", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
              Total stake ($)
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[25, 50, 100, 250, 500].map(v => (
                <button key={v} onClick={() => setStake(v)} style={{
                  padding: "7px 14px", borderRadius: 8, fontSize: 13,
                  border: stake === v ? "1.5px solid #00e5a0" : "1.5px solid #1e1f2e",
                  background: stake === v ? "#0d2620" : "#13141f",
                  color: stake === v ? "#00e5a0" : "#888",
                  cursor: "pointer", fontWeight: stake === v ? 700 : 400,
                }}>${v}</button>
              ))}
              <input
                type="number" value={stake}
                onChange={e => setStake(Number(e.target.value))}
                style={{
                  width: 80, padding: "7px 10px", borderRadius: 8,
                  border: "1.5px solid #1e1f2e", background: "#13141f",
                  color: "#fff", fontSize: 13, outline: "none",
                }}
              />
            </div>
          </div>
        )}

        {/* Result */}
        {coveredLegs.length < 2 && activeOutcomes.length > 0 && (
          <div style={{ color: "#555", fontSize: 13, textAlign: "center", padding: 20 }}>
            Select at least 2 outcomes to calculate.
          </div>
        )}
        <DutchResult result={result} stake={stake} />

        {/* ── LIVE MODE ── */}
        {mode === "live" && (
          <>
            {lastRefresh && (
              <div style={{ fontSize: 11, color: "#444", marginBottom: 14 }}>
                Live · refreshes every 30s · last updated {lastRefresh.toLocaleTimeString()}
              </div>
            )}
            {error && (
              <div style={{
                padding: 14, borderRadius: 10, background: "#1e1212",
                border: "1px solid #4a2020", color: "#ff8888", fontSize: 13, marginBottom: 16,
              }}>⚠️ {error}</div>
            )}
            {loading && initialLoad && (
              <div style={{ textAlign: "center", padding: 40, color: "#555" }}>Fetching live matches…</div>
            )}
            {!loading && matches.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: "#888", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
                  Select match
                </div>
                {matches.map(m => {
                  const [team1Name, team2Name] = m.title.split(' vs ');
                  const timeInfo = matchTimes[m.title];        
                  const kickoff = formatKickoff(timeInfo?.kickoff);
                  const isSelected = selectedMatch === m.eventTicker;
                  return (
                    <button key={m.eventTicker} onClick={() => setSelectedMatch(m.eventTicker)} style={{
                      display: "block", width: "100%", padding: "12px 14px", marginBottom: 6,
                      borderRadius: 10, textAlign: "left", cursor: "pointer",
                      border: isSelected ? "1.5px solid #00e5a0" : "1.5px solid #1e1f2e",
                      background: isSelected ? "#0d2620" : "#13141f",
                      color: isSelected ? "#fff" : "#888",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: isSelected ? "#fff" : "#ccc" }}>
                          <FlagImg teamName={team1Name} />{team1Name}
                          <span style={{ color: "#555", margin: "0 6px" }}>vs</span>
                          <FlagImg teamName={team2Name} />{team2Name}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                        {kickoff && <span style={{ fontSize: 11, color: "#555" }}>🕐 {kickoff}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {!loading && matches.length === 0 && !error && (
              <div style={{ textAlign: "center", color: "#555", padding: 30, fontSize: 13 }}>
                No open World Cup matches right now.
              </div>
            )}
          </>
        )}

        {/* ── MANUAL MODE ── */}
        {mode === "manual" && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "#888", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
              Add Outcome
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder="Label (e.g. Argentina)"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addOutcome()}
                style={{
                  flex: 2, padding: "9px 12px", borderRadius: 8,
                  border: "1.5px solid #1e1f2e", background: "#13141f",
                  color: "#fff", fontSize: 13, outline: "none",
                }}
              />
              <input
                placeholder="Multiplier (e.g. 1.50)"
                value={newMult}
                onChange={e => setNewMult(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addOutcome()}
                type="number" min="1.01" step="0.01"
                style={{
                  flex: 1, padding: "9px 12px", borderRadius: 8,
                  border: "1.5px solid #1e1f2e", background: "#13141f",
                  color: "#fff", fontSize: 13, outline: "none",
                }}
              />
              <button onClick={addOutcome} style={{
                padding: "9px 16px", borderRadius: 8, fontWeight: 700,
                background: "#00e5a0", border: "none", color: "#0a1a14",
                fontSize: 13, cursor: "pointer",
              }}>Add</button>
            </div>
            <div style={{ fontSize: 11, color: "#444", marginTop: 6 }}>
              Enter the multiplier shown on Kalshi (e.g. 1.50x → type 1.50)
            </div>
          </div>
        )}

      </div>
    </div>
  );
}