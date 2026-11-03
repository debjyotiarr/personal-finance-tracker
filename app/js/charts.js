// Hand-rolled SVG charts. No libraries, so the app works fully offline.
// Each function returns an HTML string.

import { escapeHtml } from "./util.js";

/** Donut chart. segments: [{ value, color, label }] */
export function donut(segments, { size = 168, thickness = 22, center = "", sub = "" } = {}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const gap = segments.length > 1 ? Math.min(2, c * 0.004) : 0;
  const arcs = total
    ? segments.map((seg) => {
        const len = (seg.value / total) * c;
        const dash = Math.max(len - gap, 0.001);
        const el = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${seg.color}" stroke-width="${thickness}"
          stroke-dasharray="${dash} ${c - dash}" stroke-dashoffset="${-offset}"><title>${escapeHtml(seg.label)}</title></circle>`;
        offset += len;
        return el;
      }).join("")
    : `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" class="chart-track" stroke-width="${thickness}"></circle>`;
  return `
    <svg class="donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${escapeHtml(center)} ${escapeHtml(sub)}">
      <g transform="rotate(-90 ${size / 2} ${size / 2})">${arcs}</g>
      <text x="50%" y="${size / 2 - 2}" text-anchor="middle" class="donut-value">${escapeHtml(center)}</text>
      <text x="50%" y="${size / 2 + 18}" text-anchor="middle" class="donut-sub">${escapeHtml(sub)}</text>
    </svg>`;
}

/** Stacked horizontal ribbon: the month's spending split by category. */
export function ribbon(segments, { budget = 0, marker = null } = {}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const scale = Math.max(total, budget || 0) || 1;
  const parts = segments.map((s) =>
    `<span class="ribbon-part" style="flex-basis:${(s.value / scale) * 100}%;background:${s.color}" title="${escapeHtml(s.label)}"></span>`
  ).join("");
  const markerEl = marker !== null && budget
    ? `<span class="ribbon-marker" style="left:${Math.min(marker, 1) * (budget / scale) * 100}%" title="Where you'd be at an even pace"></span>`
    : "";
  const budgetEl = budget && total > budget
    ? `<span class="ribbon-budget" style="left:${(budget / scale) * 100}%" title="Budget"></span>`
    : "";
  return `<div class="ribbon" role="img" aria-label="Spending by category">${parts}${markerEl}${budgetEl}</div>`;
}

/** Paired monthly bars for spending and income. rows: [{ label, spent, income }] */
export function monthBars(rows, { height = 170, format = (v) => v, highlight = -1 } = {}) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.spent, r.income)));
  const w = 100 / rows.length;
  const bars = rows.map((r, i) => {
    const hs = (r.spent / max) * (height - 26);
    const hi = (r.income / max) * (height - 26);
    const x = i * w;
    const bw = w * 0.3;
    return `
      <g class="${i === highlight ? "is-current" : ""}">
        <rect class="bar-income" x="${x + w * 0.18}%" y="${height - 20 - hi}" width="${bw}%" height="${Math.max(hi, r.income ? 2 : 0)}" rx="3"><title>${escapeHtml(r.label)} income ${escapeHtml(format(r.income))}</title></rect>
        <rect class="bar-spent" x="${x + w * 0.52}%" y="${height - 20 - hs}" width="${bw}%" height="${Math.max(hs, r.spent ? 2 : 0)}" rx="3"><title>${escapeHtml(r.label)} spent ${escapeHtml(format(r.spent))}</title></rect>
        <text x="${x + w / 2}%" y="${height - 4}" text-anchor="middle" class="axis-label">${escapeHtml(r.label)}</text>
      </g>`;
  }).join("");
  return `<svg class="month-bars" width="100%" height="${height}" role="img" aria-label="Income and spending by month">${bars}</svg>`;
}

/**
 * Cumulative spending line for the month, against last month and budget.
 * current/previous: arrays of running totals by day. `upTo` limits the
 * current line to days that have happened.
 */
export function paceLine(current, previous, { budget = 0, upTo = current.length, format = (v) => v, height = 180 } = {}) {
  const width = 600;
  const pad = { l: 6, r: 6, t: 14, b: 22 };
  const days = Math.max(current.length, previous.length);
  const max = Math.max(1, budget, ...current.slice(0, upTo), ...previous) * 1.08;
  const x = (i) => pad.l + (i / Math.max(days - 1, 1)) * (width - pad.l - pad.r);
  const y = (v) => height - pad.b - (v / max) * (height - pad.t - pad.b);
  const path = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const cur = current.slice(0, upTo);
  const area = cur.length ? `${path(cur)} L${x(cur.length - 1).toFixed(1)},${y(0)} L${x(0)},${y(0)} Z` : "";
  const ticks = [1, 8, 15, 22, days].map((d) => `<text x="${x(d - 1)}" y="${height - 6}" text-anchor="${d === 1 ? "start" : d === days ? "end" : "middle"}" class="axis-label">${d}</text>`).join("");
  const last = cur.length ? `<circle cx="${x(cur.length - 1)}" cy="${y(cur.at(-1))}" r="4" class="pace-dot"></circle>` : "";
  return `
    <svg class="pace" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" width="100%" height="${height}" role="img" aria-label="Spending through the month">
      ${budget ? `<line x1="${pad.l}" x2="${width - pad.r}" y1="${y(budget)}" y2="${y(budget)}" class="pace-budget" vector-effect="non-scaling-stroke"><title>Budget ${escapeHtml(format(budget))}</title></line>` : ""}
      ${previous.length ? `<path d="${path(previous)}" class="pace-prev" vector-effect="non-scaling-stroke"></path>` : ""}
      ${area ? `<path d="${area}" class="pace-area"></path>` : ""}
      ${cur.length ? `<path d="${path(cur)}" class="pace-cur" vector-effect="non-scaling-stroke"></path>` : ""}
      ${last}
      ${ticks}
    </svg>`;
}

/** Simple vertical bars with labels, e.g. weekday averages. */
export function columnBars(values, labels, { format = (v) => v, height = 120 } = {}) {
  const max = Math.max(1, ...values);
  return `<div class="columns" style="height:${height}px">${values.map((v, i) => `
    <div class="column" title="${escapeHtml(labels[i])}: ${escapeHtml(format(v))}">
      <span class="column-bar" style="height:${(v / max) * 100}%"></span>
      <span class="column-label">${escapeHtml(labels[i])}</span>
    </div>`).join("")}</div>`;
}

/** Thin progress meter. ratio may exceed 1. */
export function meter(ratio, { marker = null } = {}) {
  const pct = Math.min(Math.max(ratio, 0), 1) * 100;
  const state = ratio > 1 ? "over" : marker !== null && ratio > marker + 0.1 ? "ahead" : "ok";
  return `<span class="meter meter-${state}"><span style="width:${pct}%"></span>${marker !== null && marker < 1 ? `<i style="left:${marker * 100}%"></i>` : ""}</span>`;
}
