"use client";

/** Small SVG chart kit for the analytics dashboard. Colours come from the shared design tokens only. */
import { Fragment, useId, useState, type ReactNode } from "react";
import styles from "./analytics-dashboard.module.css";

export const PALETTE = ["var(--md-purple-600)", "var(--md-blue-600)", "var(--md-orange-500)", "var(--md-green-600)", "var(--md-red-600)", "var(--md-purple-300)", "var(--md-amber-600)", "var(--md-neutral-500)"];
export const fmt = (n: number) => n.toLocaleString("en-IN");
const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const niceMax = (v: number) => { if (v <= 4) return Math.max(v, 1); const p = 10 ** Math.floor(Math.log10(v)); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ChartState({ loading, error, empty, children, height = 160 }: { loading?: boolean; error?: string; empty?: boolean; children: ReactNode; height?: number }) {
  if (loading) return <div className={styles.skeleton} style={{ height }} aria-busy="true" />;
  if (error) return <p className={styles.chartMsg} style={{ minHeight: height }} role="alert">{error}</p>;
  if (empty) return <p className={styles.chartMsg} style={{ minHeight: height }}>No data for this period yet.</p>;
  return <>{children}</>;
}

type Series = { key: string; label: string; color?: string };

/** Line or column chart over days. Click a legend item to hide or show it; hover for a tooltip with every value. */
export function TimeChart({ data, series, kind = "line", stacked = false, height = 190 }: { data: ({ date: string } & Record<string, number | string>)[]; series: Series[]; kind?: "line" | "column"; stacked?: boolean; height?: number }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const w = 640, h = height, left = 36, right = 8, top = 8, bottom = 22;
  const shown = series.filter((s) => !hidden.has(s.key));
  const color = (s: Series, i: number) => s.color ?? PALETTE[series.indexOf(s) % PALETTE.length] ?? PALETTE[i];
  const val = (d: (typeof data)[number], k: string) => Number(d[k] ?? 0);
  const rawMax = Math.max(0, ...data.map((d) => (stacked && kind === "column" ? shown.reduce((a, s) => a + val(d, s.key), 0) : Math.max(0, ...shown.map((s) => val(d, s.key))))));
  const max = niceMax(rawMax);
  const iw = w - left - right, ih = h - top - bottom;
  const x = (i: number) => left + (kind === "line" ? (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw) : ((i + 0.5) / data.length) * iw);
  const y = (v: number) => top + ih - (v / max) * ih;
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  const step = Math.max(1, Math.ceil(data.length / 7));
  const bw = Math.max(2, Math.min(28, (iw / Math.max(1, data.length)) * (stacked ? 0.7 : 0.8) / (stacked ? 1 : Math.max(1, shown.length))));
  const tipLeft = hover === null ? 0 : Math.min(Math.max(((x(hover)) / w) * 100, 14), 80);
  return (
    <div className={styles.chartBox}>
      <div className={styles.legend}>
        {series.map((s, i) => (
          <button key={s.key} type="button" aria-pressed={!hidden.has(s.key)} className={`${styles.legendBtn} ${hidden.has(s.key) ? styles.legendOff : ""}`} onClick={() => setHidden((p) => { const n = new Set(p); if (n.has(s.key)) n.delete(s.key); else n.add(s.key); return n; })}>
            <i className={styles.dot} style={{ background: color(s, i) }} />{s.label}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={series.map((s) => s.label).join(", ") + " by day"} onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * w; const idx = kind === "line" ? Math.round(((px - left) / iw) * Math.max(1, data.length - 1)) : Math.floor(((px - left) / iw) * data.length); setHover(idx >= 0 && idx < data.length ? idx : null); }}>
        {ticks.map((t, ti) => <Fragment key={ti}><line x1={left} x2={w - right} y1={y(t)} y2={y(t)} stroke="var(--md-purple-100)" /><text x={left - 6} y={y(t) + 3} fontSize="10" textAnchor="end" fill="var(--md-neutral-500)">{short(t)}</text></Fragment>)}
        {kind === "line" && shown.map((s) => {
          const i0 = series.indexOf(s), path = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(val(d, s.key)).toFixed(1)}`).join(" ");
          return (
            <g key={s.key}>
              {i0 === 0 && data.length > 1 && <path d={`${path} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={color(s, i0)} opacity=".08" />}
              <path d={path} fill="none" stroke={color(s, i0)} strokeWidth="2.2" strokeLinejoin="round" />
              {data.length <= 31 && data.map((d, i) => <circle key={i} cx={x(i)} cy={y(val(d, s.key))} r={hover === i ? 4.5 : 2.6} fill="var(--md-white)" stroke={color(s, i0)} strokeWidth="2" />)}
            </g>
          );
        })}
        {kind === "column" && data.map((d, i) => {
          let acc = 0;
          return shown.map((s, j) => {
            const v = val(d, s.key), i0 = series.indexOf(s), bx = stacked ? x(i) - bw / 2 : x(i) - (bw * shown.length) / 2 + j * bw, base = stacked ? acc : 0;
            if (stacked) acc += v;
            return <rect key={`${i}-${s.key}`} x={bx} y={y(base + v)} width={bw - 1} height={Math.max(0, y(base) - y(base + v))} rx="2" fill={color(s, i0)} opacity={hover === null || hover === i ? 1 : 0.55} />;
          });
        })}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={top} y2={top + ih} stroke="var(--md-purple-300)" strokeDasharray="3 3" />}
        {data.map((d, i) => (i % step === 0 ? <text key={d.date} x={x(i)} y={h - 6} fontSize="10" textAnchor="middle" fill="var(--md-neutral-500)">{dayLabel(d.date)}</text> : null))}
        <title id={id}>{series.map((s) => s.label).join(", ")}</title>
      </svg>
      {hover !== null && data[hover] && (
        <div className={styles.tip} style={{ left: `${tipLeft}%` }} role="status">
          <b>{dayLabel(data[hover].date)}</b>
          {shown.map((s) => <span key={s.key}><i className={styles.dot} style={{ background: color(s, 0) }} />{s.label}: {fmt(val(data[hover!], s.key))}</span>)}
        </div>
      )}
    </div>
  );
}

/** Donut with a centre total, an interactive legend and hover highlight. */
export function Donut({ rows, total, centre = "Total", onPick }: { rows: { name: string; count: number }[]; total?: number; centre?: string; onPick?: (name: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const sum = rows.reduce((a, r) => a + r.count, 0) || 1, grand = total ?? rows.reduce((a, r) => a + r.count, 0);
  const R = 52, r = 34, C = 60;
  const live = rows.filter((x) => x.count > 0);
  const arcs = live.map((row, idx) => {
    const before = live.slice(0, idx).reduce((acc, x) => acc + x.count, 0);
    const i = rows.indexOf(row), a0 = -Math.PI / 2 + (before / sum) * Math.PI * 2, a1 = a0 + (row.count / sum) * Math.PI * 2 - (live.length > 1 ? 0.012 : 0);
    const big = a1 - a0 > Math.PI ? 1 : 0, p = (rad: number, a: number) => `${(C + rad * Math.cos(a)).toFixed(2)},${(C + rad * Math.sin(a)).toFixed(2)}`;
    const full = row.count === sum;
    const d = full ? `M${C - R},${C} A${R},${R} 0 1 1 ${C + R},${C} A${R},${R} 0 1 1 ${C - R},${C} M${C - r},${C} A${r},${r} 0 1 0 ${C + r},${C} A${r},${r} 0 1 0 ${C - r},${C}` : `M${p(R, a0)} A${R},${R} 0 ${big} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${big} 0 ${p(r, a0)} Z`;
    return { row, i, d };
  });
  return (
    <div className={styles.donutWrap}>
      <svg viewBox="0 0 120 120" className={styles.donut} role="img" aria-label={rows.map((x) => `${x.name} ${x.count}`).join(", ")}>
        {arcs.map(({ row, i, d }) => <path key={`${i}-${row.name}`} d={d} fillRule="evenodd" fill={PALETTE[i % PALETTE.length]} opacity={hover && hover !== row.name ? 0.35 : 1} onMouseEnter={() => setHover(row.name)} onMouseLeave={() => setHover(null)} onClick={() => onPick?.(row.name)} style={{ cursor: onPick ? "pointer" : "default" }}><title>{`${row.name}: ${fmt(row.count)} (${Math.round((row.count / sum) * 100)}%)`}</title></path>)}
        <text x="60" y="58" textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--md-color-text)">{short(hover ? rows.find((x) => x.name === hover)?.count ?? 0 : grand)}</text>
        <text x="60" y="72" textAnchor="middle" fontSize="7" fill="var(--md-color-text-secondary)">{hover ?? centre}</text>
      </svg>
      <ul className={styles.donutLegend}>
        {rows.map((row, i) => (
          <li key={`${i}-${row.name}`} onMouseEnter={() => setHover(row.name)} onMouseLeave={() => setHover(null)} className={hover === row.name ? styles.legendHot : ""}>
            <i className={styles.dot} style={{ background: PALETTE[i % PALETTE.length] }} /><span>{row.name}</span><b>{fmt(row.count)}</b><em>{Math.round((row.count / sum) * 100)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HBars({ rows, valueLabel = (n: number) => fmt(n), second, onPick }: { rows: { name: string; count: number; note?: string }[]; valueLabel?: (n: number) => string; second?: string; onPick?: (name: string) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className={styles.hbars}>
      {rows.map((r, i) => (
        <div key={`${i}-${r.name}`} className={styles.hbar} title={`${r.name}: ${valueLabel(r.count)}${r.note ? ` · ${r.note}` : ""}`} onClick={() => onPick?.(r.name)} style={{ cursor: onPick ? "pointer" : "default" }}>
          <span className={styles.hbarName}>{r.name}</span>
          <div className={styles.hbarTrack}><div className={styles.hbarFill} style={{ width: `${Math.max(2, (r.count / max) * 100)}%`, background: PALETTE[0], opacity: 1 - Math.min(i, 5) * 0.1 }} /></div>
          <span className={styles.hbarVal}>{valueLabel(r.count)}{r.note ? <small> {r.note}</small> : second ? <small> {second}</small> : null}</span>
        </div>
      ))}
    </div>
  );
}

/** Funnel as shrinking centred bars with conversion and drop-off between steps. */
export function Funnel({ steps }: { steps: { step: string; count: number }[] }) {
  const max = Math.max(1, steps[0]?.count ?? 1);
  return (
    <div className={styles.funnel}>
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1].count : null, conv = prev ? Math.round((s.count / prev) * 100) : null;
        return (
          <div className={styles.funnelRow} key={`${i}-${s.step}`} title={prev ? `${conv}% of the previous step; ${fmt(Math.max(0, prev - s.count))} dropped off` : "First step"}>
            <span className={styles.funnelLabel}>{s.step}</span>
            <div className={styles.funnelBarWrap}><div className={styles.funnelBar} style={{ width: `${Math.max(6, (s.count / max) * 100)}%`, background: PALETTE[[0, 1, 2, 3][i % 4]] }} /></div>
            <span className={styles.funnelNum}><b>{fmt(s.count)}</b> <small>{conv === null ? "" : `(${conv}%)`}</small></span>
          </div>
        );
      })}
    </div>
  );
}

export function Heat({ grid, unit = "events", compact = false }: { grid: number[][]; unit?: string; compact?: boolean }) {
  const [tip, setTip] = useState("");
  const max = Math.max(1, ...grid.flat());
  return (
    <div>
      <div className={`${styles.heat} ${compact ? styles.heatCompact : ""}`} role="img" aria-label={`${unit} by weekday and hour, Indian Standard Time`}>
        <span />{Array.from({ length: 24 }, (_, hr) => <span key={hr} className={styles.heatHour}>{hr % 3 === 0 ? hr : ""}</span>)}
        {grid.map((row, d) => (
          <Fragment key={d}>
            <span className={styles.heatDay}>{DAYS[d]}</span>
            {row.map((n, hr) => <span key={hr} className={styles.heatCell} onMouseEnter={() => setTip(`${DAYS[d]} ${String(hr).padStart(2, "0")}:00 · ${fmt(n)} ${unit}`)} onMouseLeave={() => setTip("")} title={`${DAYS[d]} ${String(hr).padStart(2, "0")}:00 IST · ${fmt(n)} ${unit}`} style={{ background: `color-mix(in srgb, var(--md-purple-600) ${n ? Math.round(14 + (n / max) * 86) : 5}%, transparent)` }} />)}
          </Fragment>
        ))}
      </div>
      <p className={styles.heatTip} aria-live="polite">{tip || "Hover a cell for the exact count (IST)."}</p>
    </div>
  );
}
