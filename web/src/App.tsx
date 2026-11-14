import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AttackRecord, RoundRecord, Usage } from "./types";
import { DEFENDERS, DEFENDER_COLORS, OUTCOME_COLORS } from "./types";
import { DEMO, connectLive, fetchAttacks, fetchRounds, withKey } from "./api";
import { demoAttacks, demoRounds, demoUsage } from "./demo";
import Dish from "./Dish";
import { BreachChart, SpendChart, TotalsTable } from "./Charts";
import Drawer from "./Drawer";
import Footer from "./Footer";

const REPLAY_MS = 2000;

function upsertAttack(list: AttackRecord[], rec: AttackRecord): AttackRecord[] {
  const i = list.findIndex((a) => a.key === rec.key);
  if (i < 0) return [...list, rec];
  const next = list.slice();
  next[i] = rec;
  return next;
}

function upsertRound(list: RoundRecord[], rec: RoundRecord): RoundRecord[] {
  return [...list.filter((r) => r.round !== rec.round), rec].sort((a, b) => a.round - b.round);
}

/** Defenders that have any data, in the fixed order first, then any others. */
function defendersWithData(attacks: AttackRecord[], rounds: RoundRecord[]): string[] {
  const seen = new Set<string>();
  for (const a of attacks) for (const d of Object.keys(a.decisions ?? {})) seen.add(d);
  for (const r of rounds) for (const d of Object.keys(r.defenders ?? {})) seen.add(d);
  const fixed: string[] = DEFENDERS.filter((d) => seen.has(d));
  const extra = [...seen].filter((d) => !fixed.includes(d)).sort();
  return [...fixed, ...extra];
}

export default function App() {
  const [attacks, setAttacks] = useState<AttackRecord[]>([]);
  const [rounds, setRounds] = useState<RoundRecord[]>([]);
  const [demoUse, setDemoUse] = useState<Usage | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [defender, setDefender] = useState<string>("drex");
  const [shownRound, setShownRound] = useState<number | null>(null); // null = follow latest
  const [replaying, setReplaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const replayTimer = useRef<number | undefined>(undefined);

  // Initial load.
  useEffect(() => {
    if (DEMO) {
      const a = demoAttacks();
      const r = demoRounds(a);
      setAttacks(a);
      setRounds(r);
      setDemoUse(demoUsage(a, r));
      return;
    }
    let alive = true;
    Promise.allSettled([fetchAttacks(), fetchRounds()]).then(([a, r]) => {
      if (!alive) return;
      const errs: string[] = [];
      if (a.status === "fulfilled") setAttacks((cur) => a.value.reduce(upsertAttack, cur));
      else errs.push(String(a.reason));
      if (r.status === "fulfilled") setRounds((cur) => r.value.reduce(upsertRound, cur));
      else errs.push(String(r.reason));
      setLoadErr(errs.length ? errs.join("; ") : null);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Live updates.
  useEffect(() => {
    if (DEMO) return;
    return connectLive(
      (ev) => {
        if (!ev.data || typeof ev.data !== "object") return;
        if (ev.type === "attack") setAttacks((cur) => upsertAttack(cur, withKey(ev.data as AttackRecord)));
        else if (ev.type === "round") setRounds((cur) => upsertRound(cur, ev.data as RoundRecord));
      },
      setLive,
    );
  }, []);

  const defenders = useMemo(() => defendersWithData(attacks, rounds), [attacks, rounds]);
  useEffect(() => {
    if (defenders.length > 0 && !defenders.includes(defender)) setDefender(defenders[0]);
  }, [defenders, defender]);

  const maxRound = useMemo(() => {
    let m = 0;
    for (const a of attacks) m = Math.max(m, a.round);
    for (const r of rounds) m = Math.max(m, r.round);
    return m;
  }, [attacks, rounds]);
  const minRound = useMemo(() => {
    let m = Infinity;
    for (const a of attacks) m = Math.min(m, a.round);
    for (const r of rounds) m = Math.min(m, r.round);
    return Number.isFinite(m) ? m : 0;
  }, [attacks, rounds]);
  const round = shownRound === null ? maxRound : Math.min(shownRound, maxRound);

  const visibleAttacks = useMemo(() => attacks.filter((a) => a.round <= round), [attacks, round]);
  const visibleRounds = useMemo(() => rounds.filter((r) => r.round <= round), [rounds, round]);

  const stopReplay = useCallback(() => {
    window.clearInterval(replayTimer.current);
    replayTimer.current = undefined;
    setReplaying(false);
  }, []);

  const startReplay = useCallback(() => {
    if (maxRound <= 0) return;
    window.clearInterval(replayTimer.current);
    setReplaying(true);
    let r = minRound;
    setShownRound(r);
    replayTimer.current = window.setInterval(() => {
      r += 1;
      if (r >= maxRound) {
        window.clearInterval(replayTimer.current);
        replayTimer.current = undefined;
        setReplaying(false);
        setShownRound(null); // back to following the latest round
      } else {
        setShownRound(r);
      }
    }, REPLAY_MS);
  }, [maxRound, minRound]);

  useEffect(() => () => window.clearInterval(replayTimer.current), []);

  const selectedRec = selected ? attacks.find((a) => a.key === selected) ?? null : null;
  const closeDrawer = useCallback(() => setSelected(null), []);

  return (
    <div className="app">
      <header className="header">
        <h1>Quorum arena</h1>
        {DEMO ? (
          <span className="badge demo">demo data</span>
        ) : (
          <span className={`badge ${live ? "live" : "down"}`}>{live ? "live" : "offline, reconnecting"}</span>
        )}
        {loadErr && <span className="error-text">{loadErr}</span>}
      </header>

      <section className="dish-area">
        <div className="controls">
          <div className="group">
            <span className="label">Defender</span>
            {defenders.length === 0 && <span className="label">none yet</span>}
            {defenders.map((d) => (
              <button
                key={d}
                onClick={() => setDefender(d)}
                aria-pressed={d === defender}
                style={
                  d === defender
                    ? { borderColor: DEFENDER_COLORS[d] ?? "#ccc", color: DEFENDER_COLORS[d] ?? undefined, fontWeight: 600 }
                    : undefined
                }
              >
                {d}
              </button>
            ))}
          </div>
          <div className="group">
            <span className="label">Round</span>
            <input
              type="range"
              min={minRound}
              max={Math.max(maxRound, minRound)}
              step={1}
              value={round}
              disabled={maxRound === 0}
              onChange={(e) => {
                stopReplay();
                const v = Number(e.target.value);
                setShownRound(v >= maxRound ? null : v);
              }}
            />
            <span className="mono">
              {round} / {maxRound}
            </span>
            {replaying ? (
              <button onClick={stopReplay}>stop</button>
            ) : (
              <button onClick={startReplay} disabled={maxRound === 0}>
                replay
              </button>
            )}
          </div>
        </div>
        <Dish attacks={visibleAttacks} defender={defender} onSelect={setSelected} />
        <div className="legend">
          <span>
            <i className="dot" style={{ background: OUTCOME_COLORS.breach }} /> approved forged (breach)
          </span>
          <span>
            <i className="dot" style={{ background: OUTCOME_COLORS.verify }} /> verify
          </span>
          <span>
            <i className="dot" style={{ background: OUTCOME_COLORS.block }} /> block
          </span>
          <span>
            <i className="dot" style={{ background: OUTCOME_COLORS.error }} /> error
          </span>
          <span>
            <i className="dot" style={{ background: "#fff", width: 6, height: 6 }} /> clean
          </span>
          <span>
            <i className="dot" style={{ background: "#fff", width: 6, height: 6, boxShadow: `0 0 0 2px ${OUTCOME_COLORS.breach}` }} /> false alarm
          </span>
        </div>
      </section>

      <aside className="side">
        <div className="chart">
          <h2>Breach rate by round</h2>
          <BreachChart rounds={visibleRounds} defenders={defenders} />
        </div>
        <div className="chart">
          <h2>Spend per round (tokens)</h2>
          <SpendChart rounds={visibleRounds} defenders={defenders} />
        </div>
        <div>
          <h2>Totals</h2>
          <TotalsTable rounds={visibleRounds} defenders={defenders} />
        </div>
      </aside>

      <Footer demo={demoUse} />

      {selectedRec && <Drawer rec={selectedRec} onClose={closeDrawer} />}
    </div>
  );
}
