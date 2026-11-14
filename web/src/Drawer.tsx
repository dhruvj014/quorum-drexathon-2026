import { useEffect, useState } from "react";
import type { AttackDetail, AttackRecord, Citation, Decision } from "./types";
import { DEFENDER_COLORS, DEFENDERS } from "./types";
import { DEMO, fetchAttack, fetchPage } from "./api";
import { demoDetail } from "./demo";

interface Props {
  rec: AttackRecord;
  onClose: () => void;
}

const HIGHLIGHT: Record<string, string> = { notes: "#f56565", iban: "#4299e1" };
const ACTIONS = ["approve", "verify", "block"] as const;
const ACTION_COLORS: Record<string, string> = { approve: "#f56565", verify: "#ecc94b", block: "#38b2ac" };

interface PageImg {
  url: string | null;
  w: number | null; // PDF points
  h: number | null;
}

/** True when every coordinate of every polygon is within 0..1 (normalised units). */
export function isNormalised(cits: Citation[]): boolean {
  return cits.every((c) => c.polygons.every((poly) => poly.every((pt) => pt.every((v) => v <= 1))));
}

function Bar({ name, value, color }: { name: string; value: number; color: string }) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return (
    <div className="bar">
      <span className="name" title={name}>
        {name}
      </span>
      <span className="track">
        <span className="fill" style={{ width: `${v * 100}%`, background: color, display: "block" }} />
      </span>
      <span className="num">{v.toFixed(2)}</span>
    </div>
  );
}

function Act({ a }: { a: string | null }) {
  if (!a) return <span className="mono">–</span>;
  return <b className={`act-${a}`}>{a}</b>;
}

function DefenderCard({ name, d }: { name: string; d: Decision }) {
  return (
    <div className="def-card">
      <h3 style={{ color: DEFENDER_COLORS[name] ?? undefined }}>{name}</h3>
      <div className="row">
        <span>
          <span className="k">raw </span>
          <Act a={d.raw_action} />
        </span>
        <span>
          <span className="k">final </span>
          <Act a={d.final_action} />
        </span>
        <span>
          <span className="k">wall </span>
          <span className="mono">{d.wall_ms} ms</span>
        </span>
        {d.guard?.raised && <span className="act-block">guard raised</span>}
      </div>
      {d.error && (
        <div className="row error-text">
          <span className="k">error </span>
          <span className="mono">{d.error}</span>
        </div>
      )}
      {d.guard?.findings?.length > 0 && (
        <div className="row">
          <span className="k">guard findings</span>
          <ul style={{ margin: 0, paddingLeft: 18, width: "100%" }}>
            {d.guard.findings.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {ACTIONS.map((a) => (
        <Bar key={a} name={`p(${a})`} value={d.p?.[a] ?? 0} color={ACTION_COLORS[a]} />
      ))}
      {d.panel?.length > 0 && <div className="k" style={{ margin: "6px 0 2px" }}>panel p_yes</div>}
      {d.panel?.map((q) => (
        <Bar key={q.id} name={q.id} value={q.p_yes} color="#a0aec0" />
      ))}
    </div>
  );
}

function PageView({ detail, page }: { detail: AttackDetail; page: PageImg }) {
  const fields = detail.parsed ?? {};
  const groups = Object.keys(HIGHLIGHT)
    .map((name) => ({ name, cits: (fields[name]?.citations ?? []).filter((c) => (c.page ?? 1) === 1) }))
    .filter((g) => g.cits.length > 0);
  const all = groups.flatMap((g) => g.cits);
  const norm = isNormalised(all);
  // Normalised: scale by the image (viewBox 0..1). PDF points: scale by the page size headers.
  const vw = norm ? 1 : page.w ?? 612;
  const vh = norm ? 1 : page.h ?? 792;
  const aspect = page.w && page.h ? `${page.w} / ${page.h}` : "612 / 792";
  return (
    <div className="page-box" style={page.url ? undefined : { aspectRatio: aspect }}>
      {page.url ? <img src={page.url} alt="invoice page 1" /> : <div className="page-missing">{DEMO ? "demo: no page image" : "no page image"}</div>}
      <svg viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none">
        {groups.map((g) =>
          g.cits.flatMap((c, ci) =>
            c.polygons.map((poly, pi) => (
              <polygon
                key={`${g.name}-${ci}-${pi}`}
                points={poly.map((pt) => `${pt[0]},${pt[1]}`).join(" ")}
                fill={HIGHLIGHT[g.name]}
                fillOpacity={0.18}
                stroke={HIGHLIGHT[g.name]}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              >
                <title>{`${g.name}: ${c.source_text}`}</title>
              </polygon>
            )),
          ),
        )}
      </svg>
    </div>
  );
}

export default function Drawer({ rec, onClose }: Props) {
  const [detail, setDetail] = useState<AttackDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState<PageImg>({ url: null, w: null, h: null });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    let objUrl: string | null = null;
    setDetail(null);
    setErr(null);
    setPage({ url: null, w: null, h: null });
    if (DEMO) {
      setDetail(demoDetail(rec));
      return;
    }
    fetchAttack(rec.key)
      .then((d) => alive && setDetail(d))
      .catch((e: unknown) => alive && setErr(String(e)));
    fetchPage(rec.key)
      .then((p) => {
        objUrl = p.url;
        if (alive) setPage(p);
        else URL.revokeObjectURL(p.url);
      })
      .catch(() => {
        /* page image missing: drawn as an empty box */
      });
    return () => {
      alive = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [rec]);

  const shown: AttackDetail = detail ?? { ...rec, parsed: null };
  const iban = shown.parsed?.iban?.value;
  const noteParsed = shown.parsed?.notes?.value;
  const names = [
    ...DEFENDERS.filter((d) => shown.decisions?.[d]),
    ...Object.keys(shown.decisions ?? {}).filter((d) => !(DEFENDERS as readonly string[]).includes(d)),
  ];

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`attack ${rec.key}`}>
        <div className="drawer-head">
          <span className="title">
            Round {rec.round} · #{String(rec.id)} · {rec.kind}
            {rec.style ? ` · ${rec.style}` : ""}
          </span>
          {DEMO && <span className="badge demo">demo data</span>}
          <button onClick={onClose} aria-label="close">
            Close (Esc)
          </button>
        </div>
        <div className="drawer-body">
          <PageView detail={shown} page={page} />
          <div className="facts">
            {err && <div className="error-text">{err}</div>}
            <div className="fact">
              <h3>
                <span className="swatch" style={{ background: HIGHLIGHT.notes }} /> note
              </h3>
              <div className="v">{rec.note || (typeof noteParsed === "string" && noteParsed) || "–"}</div>
            </div>
            <div className="fact">
              <h3>
                <span className="swatch" style={{ background: HIGHLIGHT.iban }} /> printed IBAN
              </h3>
              <div className="v mono">{iban !== null && iban !== undefined && iban !== "" ? String(iban) : detail ? "not found" : "…"}</div>
            </div>
            {names.map((n) => (
              <DefenderCard key={n} name={n} d={shown.decisions[n]} />
            ))}
            {names.length === 0 && <div className="fact">no defender decisions</div>}
          </div>
        </div>
      </aside>
    </>
  );
}
