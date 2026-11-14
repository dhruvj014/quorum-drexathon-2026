import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AttackRecord, History, Mode, RoundRecord, Usage } from "./types";
import { MODES, MODE_TEXT, OUTCOME_COLORS, defenderColor, modeOf } from "./types";
import { DEMO, connectLive, fetchAttacks, fetchRounds, withKey } from "./api";
import { demoAttacks, demoHistory, demoRounds, demoUsage } from "./demo";
import Dish from "./Dish";
import { BreachChart, MinRiskChart, SpendChart, TotalsTable } from "./Charts";
import Drawer from "./Drawer";
import Footer from "./Footer";
import Pipeline from "./Pipeline";

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

/** Defenders that appear in the data keys, sorted by name. */
function defendersWithData(attacks: AttackRecord[], rounds: RoundRecord[]): string[] {
  const seen = new Set<string>();
  for (const a of attacks) for (const d of Object.keys(a.decisions ?? {})) seen.add(d);
  for (const r of rounds) for (const d of Object.keys(r.defenders ?? {})) seen.add(d);
  return [...seen].sort();
}

/** Modes that have at least one round, and the one whose latest round is newest. */
function modesWithData(rounds: RoundRecord[]): { modes: Mode[]; newest: Mode | null } {
  const latest = new Map<Mode, number>();
  for (const r of rounds) {
    const m = modeOf(r);
    latest.set(m, Math.max(latest.get(m) ?? -Infinity, r.round));
  }
  const modes = MODES.filter((m) => latest.has(m));
  let newest: Mode | null = null;
  for (const m of modes) if (newest === null || (latest.get(m) ?? 0) >= (latest.get(newest) ?? 0)) newest = m;
  return { modes, newest };
}

export default function App() {
  const [attacks, setAttacks] = useState<AttackRecord[]>([]);
  const [rounds, setRounds] = useState<RoundRecord[]>([]);
  const [demoUse, setDemoUse] = useState<Usage | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [defender, setDefender] = useState<string>("drex");
  const [modeChoice, setModeChoice] = useState<Mode | null>(null); // null = newest mode with data
  const [demoHist, setDemoHist] = useState<History | null | undefined>(undefined);
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
      setDemoHist(demoHistory());
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

  const { modes, newest } = useMemo(() => modesWithData(rounds), [rounds]);
  const mode: Mode = modeChoice !== null && modes.includes(modeChoice) ? modeChoice : newest ?? "swap";
  const modeAttacks = useMemo(() => attacks.filter((a) => modeOf(a) === mode), [attacks, mode]);
  const modeRounds = useMemo(() => rounds.filter((r) => modeOf(r) === mode), [rounds, mode]);

  const defenders = useMemo(() => defendersWithData(modeAttacks, modeRounds), [modeAttacks, modeRounds]);
  useEffect(() => {
    if (defenders.length > 0 && !defenders.includes(defender)) setDefender(defenders[0]);
  }, [defenders, defender]);

  const maxRound = useMemo(() => {
    let m = 0;
    for (const a of modeAttacks) m = Math.max(m, a.round);
    for (const r of modeRounds) m = Math.max(m, r.round);
    return m;
  }, [modeAttacks, modeRounds]);
  const minRound = useMemo(() => {
    let m = Infinity;
    for (const a of modeAttacks) m = Math.min(m, a.round);
    for (const r of modeRounds) m = Math.min(m, r.round);
    return Number.isFinite(m) ? m : 0;
  }, [modeAttacks, modeRounds]);
  const round = shownRound === null ? maxRound : Math.min(shownRound, maxRound);

  const visibleAttacks = useMemo(() => modeAttacks.filter((a) => a.round <= round), [modeAttacks, round]);
  const visibleRounds = useMemo(() => modeRounds.filter((r) => r.round <= round), [modeRounds, round]);

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

      <Pipeline rounds={rounds} demoUsage={demoUse} demoHistory={demoHist} />

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
                    ? { borderColor: defenderColor(d), color: defenderColor(d), fontWeight: 600 }
                    : undefined
                }
              >
                {d}
              </button>
            ))}
          </div>
          <div className="group">
            <span className="label">Mode</span>
            {modes.length === 0 && <span className="label">none yet</span>}
            {modes.map((m) => (
              <button
                key={m}
                onClick={() => {
                  stopReplay();
                  setShownRound(null);
                  setModeChoice(m);
                }}
                aria-pressed={m === mode}
                style={m === mode ? { fontWeight: 600, borderColor: "var(--fg, #ddd)" } : undefined}
              >
                {m}
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
        {modes.length > 0 && <div className="mode-text">{MODE_TEXT[mode]}</div>}
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
        <div className="chart-pair">
          <BreachChart rounds={visibleRounds} defenders={defenders} />
          <MinRiskChart rounds={visibleRounds} defenders={defenders} />
        </div>
        <SpendChart rounds={visibleRounds} defenders={defenders} />
        <TotalsTable rounds={visibleRounds} defenders={defenders} />
      </aside>

      <Footer demo={demoUse} />

      {selectedRec && <Drawer rec={selectedRec} onClose={closeDrawer} demoHistory={demoHist} />}
    </div>
  );
}
