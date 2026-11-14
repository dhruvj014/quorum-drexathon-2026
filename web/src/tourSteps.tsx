import type { ReactNode } from "react";
import type { AttackRecord, Mode, RoundRecord, Usage } from "./types";
import { defenderColor, modeOf } from "./types";
import { blockedRecords, breachRecords, ms, sharedRounds, totalsFor, usd } from "./stats";
import Race from "./Race";

/** What the tour can read and drive. Supplied by App. */
export interface TourApi {
  demo: boolean;
  attacks: AttackRecord[]; // all valid attacks, every mode
  rounds: RoundRecord[]; // all valid rounds, every mode
  usage: Usage | null;
  setMode: (m: Mode) => void;
  setDefender: (d: string) => void;
  setShownRound: (r: number | null) => void;
  select: (key: string | null) => void;
}

export interface Ctx {
  api: TourApi;
  swapRounds: RoundRecord[];
  redirectRounds: RoundRecord[];
  redirectAttacks: AttackRecord[];
  swapAttacks: AttackRecord[];
}

export interface Step {
  id: string;
  title: string;
  focus: "none" | "dish" | "drawer" | "charts" | "pipeline" | "usage";
  card?: string; // which pipeline card to light up
  ms: number;
  skip?: (c: Ctx) => boolean;
  enter?: (c: Ctx) => void | (() => void);
  tick?: (c: Ctx, progress: number) => void;
  body: (c: Ctx) => ReactNode;
  extra?: (c: Ctx, playing: boolean) => ReactNode;
}

export function makeCtx(api: TourApi): Ctx {
  return {
    api,
    swapRounds: api.rounds.filter((r) => modeOf(r) === "swap"),
    redirectRounds: api.rounds.filter((r) => modeOf(r) === "redirect"),
    swapAttacks: api.attacks.filter((a) => modeOf(a) === "swap"),
    redirectAttacks: api.attacks.filter((a) => modeOf(a) === "redirect"),
  };
}

const DEF = "drex";

function sortedRounds(rounds: RoundRecord[]): number[] {
  return [...new Set(rounds.map((r) => r.round))].sort((a, b) => a - b);
}

/** The tour clock drives replay too, so pausing freezes the visible round. */
function sweep(c: Ctx, mode: Mode, rounds: RoundRecord[]): () => void {
  c.api.setMode(mode);
  c.api.setDefender(DEF);
  c.api.setShownRound(sortedRounds(rounds)[0] ?? null);
  return () => c.api.setShownRound(null);
}

function sweepTick(c: Ctx, rounds: RoundRecord[], progress: number): void {
  const list = sortedRounds(rounds);
  c.api.setShownRound(list[Math.min(list.length - 1, Math.floor(progress / .8 * list.length))] ?? null);
}

function scrollTo(band: string): () => void {
  const id = window.setTimeout(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(band)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, 450);
  return () => window.clearTimeout(id);
}

/** The record used for the three evidence steps: a note Drex blocked, preferring the redirect mode. */
function exampleBlocked(c: Ctx): AttackRecord | undefined {
  return blockedRecords(c.redirectAttacks, DEF)[0] ?? blockedRecords(c.swapAttacks, DEF)[0];
}

function pct(v: number | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `${Math.round(v * 100)}%` : "n/a";
}

export const STEPS: Step[] = [
  {
    id: "intro",
    title: "An immune system for AI agents that read documents",
    focus: "none",
    ms: 12000,
    enter: (c) => {
      c.api.select(null);
      c.api.setShownRound(null);
    },
    body: (c) => (
      <>
        <p>
          Every dot in the dish is one invoice. A red-team agent writes forged invoices, round after round, trying to get
          them paid. <b>NDI</b> reads each one, <b>Drex</b> decides approve, verify or block, and we measure what gets
          through.
        </p>
        <p className="tour-note">
          All invoices are synthetic and the attacks are written by an LLM agent: this is not real fraud data.
          {c.api.demo ? " This run uses made-up demo data so the layout can be shown with no backend." : ""}
        </p>
      </>
    ),
  },
  {
    id: "swap",
    title: "Attack 1: swap the bank account",
    focus: "dish",
    ms: 13000,
    skip: (c) => c.swapRounds.length === 0,
    enter: (c) => sweep(c, "swap", c.swapRounds),
    tick: (c, p) => sweepTick(c, c.swapRounds, p),
    body: (c) => {
      const t = totalsFor(c.swapRounds, DEF);
      return (
        <>
          <p>
            The attacker prints its own IBAN on a real supplier's invoice. Plain code sees it differs from the trusted
            record and tells Drex so. Watch the dish fill, round by round: <b className="c-block">teal</b> is blocked,{" "}
            <b className="c-verify">amber</b> is sent to verify, <b className="c-breach">red</b> is paid out.
          </p>
          <p>
            Result for plain Drex: <b>{t.breaches}</b> of <b>{t.poisoned}</b> hostile invoices paid out across{" "}
            {sortedRounds(c.swapRounds).length} rounds.
          </p>
        </>
      );
    },
  },
  {
    id: "redirect",
    title: "Attack 2: only the note is hostile",
    focus: "dish",
    ms: 16000,
    skip: (c) => c.redirectRounds.length === 0,
    enter: (c) => sweep(c, "redirect", c.redirectRounds),
    tick: (c, p) => sweepTick(c, c.redirectRounds, p),
    body: (c) => {
      const t = totalsFor(c.redirectRounds, DEF);
      return (
        <>
          <p>
            Now the printed bank details are untouched. Only a note on the invoice tries to send the
            money elsewhere. The attacker adapts using earlier outcomes; some runs also give it a risk score.
            The model, cost-weighted policy and rule guard decide what happens next.
          </p>
          <p>
            Plain Drex said approve on <b>{t.rawBreaches}</b> of <b>{t.poisoned}</b> hostile invoices. After the policy
            and guard, <b className="c-breach">{t.breaches}</b> remained approved. This experiment makes no actual payments.
          </p>
        </>
      );
    },
  },
  {
    id: "ndi",
    title: "NDI reads the document",
    focus: "drawer",
    card: "ndi",
    ms: 14000,
    skip: (c) => !exampleBlocked(c),
    enter: (c) => {
      const rec = exampleBlocked(c);
      if (rec) c.api.select(rec.key);
      return scrollTo("band-ndi");
    },
    body: () => (
      <p>
        NDI turns the PDF into fields with page locations. The outlines mark the hostile note and the printed IBAN. Drex
        gets values and statuses only: never the file name, an id or a label.
      </p>
    ),
  },
  {
    id: "search",
    title: "Drex Search checks the supplier's history",
    focus: "drawer",
    card: "drex-search",
    ms: 13000,
    skip: (c) => !exampleBlocked(c),
    enter: (c) => { const rec = exampleBlocked(c); if (rec) c.api.select(rec.key); return scrollTo("band-search"); },
    body: (c) => (
      <>
        <p>
          Drex Search read past invoices from the supplier&apos;s own filing cabinet and found the account they normally
          use, with quotes and page numbers. Here it is set against the IBAN on this invoice.
        </p>
        {!c.api.demo && (
          <p className="tour-note">Search confirms the trusted account with evidence; the decision itself still uses the trusted record.</p>
        )}
      </>
    ),
  },
  {
    id: "drex",
    title: "Drex decides",
    focus: "drawer",
    card: "drex",
    ms: 15000,
    skip: (c) => !exampleBlocked(c),
    enter: (c) => { const rec = exampleBlocked(c); if (rec) c.api.select(rec.key); return scrollTo("band-drex"); },
    body: (c) => {
      const t = totalsFor(c.api.rounds, DEF);
      return (
        <p>
          Twelve yes/no questions and one choice, in a single call: about <b>{ms(t.medianMs)}</b> (median of round medians). The bars
          are probabilities. <b>model</b> is what Drex chose; <b>after policy and guard</b> can only be the same or
          higher, never lower. No language model wrote this explanation.
        </p>
      );
    },
  },
  {
    id: "breach",
    title: "When it goes wrong",
    focus: "drawer",
    card: "drex",
    ms: 15000,
    skip: (c) => breachRecords(c.api.attacks, DEF).length === 0,
    enter: (c) => {
      const rec = breachRecords(c.redirectAttacks, DEF)[0] ?? breachRecords(c.api.attacks, DEF)[0];
      if (rec) c.api.select(rec.key);
      return scrollTo("band-drex");
    },
    body: (c) => {
      const rec = breachRecords(c.redirectAttacks, DEF)[0] ?? breachRecords(c.api.attacks, DEF)[0];
      const d = rec?.decisions?.[DEF];
      const mem = totalsFor(c.redirectRounds, "drex+memory");
      const plain = totalsFor(c.redirectRounds, DEF);
      return (
        <>
          <p>
            This hostile invoice was approved in the test. Drex gave <b>{pct(d?.p?.approve)}</b> to approve, and neither the cost-weighted
            policy nor the rule guard stopped it.
          </p>
          {mem.poisoned > 0 && (
            <p>
              With memory of earlier caught notes, <b>{mem.breaches}</b> of {mem.poisoned} got through, against{" "}
              <b>{plain.breaches}</b> without it. &quot;Memory&quot; here is text in the prompt, not training.
            </p>
          )}
        </>
      );
    },
  },
  {
    id: "speed",
    title: "Speed you can feel",
    focus: "none",
    ms: 14000,
    skip: (c) => racers(c) === null,
    enter: (c) => {
      c.api.select(null);
    },
    body: (c) => {
      const pair = racers(c);
      if (!pair) return <p>No comparable latency measurements yet.</p>;
      return (
        <p>
          An illustrative replay at the median of per-round median latencies, using only rounds shared by both systems.
          These counters are not live throughput. {c.api.demo ? "Timings here are made-up demo data." : "Timings come from the recorded run."}
        </p>
      );
    },
    extra: (c, playing) => {
      const pair = racers(c);
      return pair ? <Race a={pair.a} b={pair.b} playing={playing} /> : null;
    },
  },
  {
    id: "scoreboard",
    title: "The scoreboard",
    focus: "charts",
    ms: 17000,
    enter: (c) => {
      c.api.select(null);
      c.api.setShownRound(null);
      c.api.setMode(c.redirectRounds.length > 0 ? "redirect" : "swap");
    },
    body: () => (
      <p>
        <b>Approved</b> is a hostile invoice approved after policy and guard. <b>False alarms</b> are clean invoices held
        by mistake. Samples are small (about 20 hostile invoices per round): a first measurement, not a benchmark.
      </p>
    ),
    extra: (c) => {
      const rounds = c.redirectRounds.length > 0 ? c.redirectRounds : c.swapRounds;
      const names = [...new Set(rounds.flatMap((r) => Object.keys(r.defenders ?? {})))].sort();
      const rows = names.map((n) => totalsFor(rounds, n)).filter((t) => t.poisoned > 0);
      if (rows.length === 0) return null;
      return (
        <table className="tour-table">
          <thead>
            <tr>
              <th>defender</th>
              <th>said approve</th>
              <th>approved</th>
              <th>false alarms</th>
              <th>cost</th>
              <th title="Median of per-round medians">latency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.defender}>
                <td>
                  <i className="dot" style={{ background: defenderColor(t.defender) }} /> {t.defender}
                </td>
                <td>
                  {t.rawBreaches} / {t.poisoned}
                </td>
                <td>
                  <b>{t.breaches}</b>
                </td>
                <td>
                  {t.falseAlarms} / {t.clean}
                </td>
                <td>{usd(t.costUsd)}</td>
                <td>{ms(t.medianMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    },
  },
  {
    id: "intern",
    title: "Built, and attacked, with Intern",
    focus: "pipeline",
    card: "intern",
    ms: 13000,
    body: (c) => {
      const i = c.api.usage?.intern;
      return (
        <>
          <p>
            {i ? (
              <>
                <b>{i.runs}</b> Intern runs, <b>{i.turns}</b> turns and <b>{i.drex_asks}</b> Drex supervision asks
              </>
            ) : (
              "Every module"
            )}{" "}
            contributed to building this project. Coding runs used Claude Opus 5.5 on DeepInfra with Drex supervision;
            the UI was also enhanced directly.
          </p>
          <p>
            The attacker is an Intern agent too, on a different model, with its own empty memory each round. It sees
            earlier outcomes (and, in risk-feedback runs, a risk score), never the defender questions or code.
          </p>
        </>
      );
    },
  },
  {
    id: "close",
    title: "What this shows, and what it does not",
    focus: "none",
    ms: 15000,
    enter: (c) => {
      c.api.select(null);
    },
    body: () => (
      <ul className="tour-list">
        <li>Synthetic invoices; attacks written by one LLM agent; samples of about 20 per round.</li>
        <li>The LLM guard is one large open model with one prompt. Its prompt says not to follow invoice instructions; the Drex questions have no such line.</li>
        <li>Live mode uses recorded results; demo mode uses clearly labelled made-up data. Failed requests count as failures, never approvals.</li>
      </ul>
    ),
  },
];

export function racers(c: Ctx): { a: { name: string; ms: number; color: string }; b: { name: string; ms: number; color: string } } | null {
  const rounds = c.api.rounds;
  const names = [...new Set(rounds.flatMap((r) => Object.keys(r.defenders ?? {})))].filter((n) => n !== DEF);
  const others = names.map((n) => totalsFor(sharedRounds(rounds, DEF, n), n)).filter((t) => t.medianMs !== null);
  const pick = others.find((t) => t.defender === "llm_guard") ?? others.sort((x, y) => (y.medianMs ?? 0) - (x.medianMs ?? 0))[0];
  if (!pick || pick.medianMs === null) return null;
  const aMs = totalsFor(sharedRounds(rounds, DEF, pick.defender), DEF).medianMs;
  if (aMs === null) return null;
  const bName = pick.defender;
  const bMs = pick.medianMs;
  return {
    a: { name: DEF, ms: aMs, color: defenderColor(DEF) },
    b: { name: bName, ms: bMs, color: defenderColor(bName) },
  };
}
