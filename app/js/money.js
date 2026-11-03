// Currency handling.
//
// Every currency carries two user-set rates: how many US dollars and how many
// Indian rupees one unit is worth. They are set separately on purpose, so
// they do not have to be mathematically consistent with each other.
//
// A transaction keeps its original amount and currency, plus a snapshot of
// both rates at the time it was entered. Reports convert with the snapshot, so
// changing a rate later does not silently rewrite past months (you can choose
// to re-apply new rates from Settings).

export const REPORT_CURRENCIES = ["INR", "USD"];

export const DEFAULT_CURRENCIES = [
  { id: "INR", code: "INR", name: "Indian rupee", symbol: "₹", toUSD: 0.0113, toINR: 1 },
  { id: "USD", code: "USD", name: "US dollar", symbol: "$", toUSD: 1, toINR: 88.5 }
];

// Offered when adding a currency. Rates are left for the user to fill in.
export const COMMON_CURRENCIES = [
  ["EUR", "Euro", "€"],
  ["GBP", "British pound", "£"],
  ["AED", "UAE dirham", "د.إ"],
  ["SGD", "Singapore dollar", "S$"],
  ["JPY", "Japanese yen", "¥"],
  ["CAD", "Canadian dollar", "C$"],
  ["AUD", "Australian dollar", "A$"],
  ["CHF", "Swiss franc", "CHF"],
  ["THB", "Thai baht", "฿"],
  ["CNY", "Chinese yuan", "¥"],
  ["NPR", "Nepalese rupee", "रू"],
  ["LKR", "Sri Lankan rupee", "Rs"],
  ["BDT", "Bangladeshi taka", "৳"],
  ["MYR", "Malaysian ringgit", "RM"],
  ["IDR", "Indonesian rupiah", "Rp"],
  ["HKD", "Hong Kong dollar", "HK$"],
  ["SAR", "Saudi riyal", "﷼"],
  ["QAR", "Qatari riyal", "QR"],
  ["NZD", "New Zealand dollar", "NZ$"],
  ["ZAR", "South African rand", "R"]
];

/** Rates to stamp onto a transaction entered in `currency`. */
export function rateSnapshot(currency) {
  if (!currency) return { rateUSD: 1, rateINR: 1 };
  return { rateUSD: Number(currency.toUSD) || 0, rateINR: Number(currency.toINR) || 0 };
}

/** Converts a transaction to a report currency ("INR" or "USD"). */
export function convertTxn(txn, target) {
  const amount = Number(txn.amount) || 0;
  if (txn.currency === target) return amount;
  const rate = target === "USD" ? txn.rateUSD : txn.rateINR;
  return amount * (Number(rate) || 0);
}

/** Converts a plain {amount, currency} using the current currency table. */
export function convertAmount(amount, fromCode, target, currenciesByCode) {
  if (!amount) return 0;
  if (fromCode === target) return Number(amount);
  const cur = currenciesByCode.get(fromCode);
  if (!cur) return 0;
  return Number(amount) * (target === "USD" ? Number(cur.toUSD) : Number(cur.toINR));
}

const formatterCache = new Map();

function formatterFor(code, options) {
  const key = `${code}|${JSON.stringify(options)}`;
  if (!formatterCache.has(key)) {
    const locale = code === "INR" ? "en-IN" : "en-US";
    try {
      formatterCache.set(key, new Intl.NumberFormat(locale, { style: "currency", currency: code, ...options }));
    } catch {
      formatterCache.set(key, null);
    }
  }
  return formatterCache.get(key);
}

/**
 * Formats money. `symbol` is used for currencies Intl does not know about.
 * Options: { compact, decimals, sign }
 */
export function formatMoney(value, code = "INR", { compact = false, decimals, sign = false, symbol } = {}) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const maxFrac = decimals ?? (compact ? 1 : abs >= 1000 || Number.isInteger(abs) ? 0 : 2);
  const options = compact
    ? { notation: "compact", maximumFractionDigits: maxFrac }
    : { maximumFractionDigits: maxFrac, minimumFractionDigits: Math.min(maxFrac, Number.isInteger(abs) ? 0 : maxFrac) };
  const fmt = formatterFor(code, options);
  let text;
  if (fmt) {
    text = fmt.format(abs);
  } else {
    const num = new Intl.NumberFormat("en-US", compact ? options : { maximumFractionDigits: maxFrac }).format(abs);
    text = `${symbol || code} ${num}`;
  }
  if (n < 0) return `−${text}`;
  if (sign && n > 0) return `+${text}`;
  return text;
}

/**
 * Evaluates a small arithmetic expression typed into an amount field,
 * e.g. "120+45.5" or "3*250". Only digits, + - * / . ( ) and spaces are
 * allowed. Returns NaN for anything else. No eval().
 */
export function evaluateAmount(input) {
  const src = String(input ?? "").replace(/,/g, "").replace(/×/g, "*").replace(/÷/g, "/").trim();
  if (!src) return NaN;
  if (!/^[0-9+\-*/.()\s]+$/.test(src)) return NaN;
  const tokens = src.match(/\d*\.?\d+|[+\-*/()]/g);
  if (!tokens) return NaN;
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr() {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }
  function parseTerm() {
    let value = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const rhs = parseFactor();
      value = op === "*" ? value * rhs : value / rhs;
    }
    return value;
  }
  function parseFactor() {
    const t = next();
    if (t === "-") return -parseFactor();
    if (t === "(") {
      const v = parseExpr();
      if (next() !== ")") throw new Error("paren");
      return v;
    }
    const n = Number(t);
    if (!Number.isFinite(n)) throw new Error("num");
    return n;
  }

  try {
    const result = parseExpr();
    if (pos !== tokens.length || !Number.isFinite(result)) return NaN;
    return Math.round(result * 100) / 100;
  } catch {
    return NaN;
  }
}
