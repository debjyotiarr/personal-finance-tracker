// Starter data. IDs are fixed and updatedAt is 0 so that two devices that
// both start fresh produce identical records and merge cleanly; any edit the
// user makes later always wins over the seed.

import { DEFAULT_CURRENCIES } from "./money.js";

export const CATEGORY_COLORS = [
  "#3E8E7E", "#D08C2E", "#5B7DB8", "#C0605A", "#8A6BB0", "#4F9BB8",
  "#B57A4A", "#6E9A4B", "#C46D95", "#7C8590", "#A8913A", "#5C6FA3"
];

export const EMOJI_CHOICES = [
  "🍜", "☕", "🛒", "🚕", "⛽", "🚇", "🧾", "🏠", "💡", "📱", "🛍️", "👕",
  "💊", "🏥", "🏋️", "🎬", "🎮", "🎵", "✈️", "🏨", "🎁", "📚", "🎓", "💇",
  "🐾", "👶", "🍷", "🍕", "🧹", "🔧", "🚗", "🅿️", "💳", "🏦", "💼", "💰",
  "↩️", "📈", "🎉", "❤️", "🌱", "📦", "🧘", "🎨", "💻", "🛡️", "🧑‍🍳", "🙏"
];

const seedCategories = [
  ["food", "Food & dining", "🍜", "expense"],
  ["groceries", "Groceries", "🛒", "expense"],
  ["transport", "Transport", "🚕", "expense"],
  ["bills", "Rent & bills", "🧾", "expense"],
  ["shopping", "Shopping", "🛍️", "expense"],
  ["health", "Health", "💊", "expense"],
  ["fun", "Fun & hobbies", "🎬", "expense"],
  ["travel", "Travel", "✈️", "expense"],
  ["personal", "Personal care", "💇", "expense"],
  ["gifts", "Gifts & giving", "🎁", "expense"],
  ["learning", "Learning", "📚", "expense"],
  ["misc", "Miscellaneous", "📦", "expense"],
  ["salary", "Salary", "💼", "income"],
  ["interest", "Interest", "🏦", "income"],
  ["refunds", "Refunds", "↩️", "income"],
  ["other-income", "Other income", "💰", "income"]
];

export function seedData() {
  return {
    categories: seedCategories.map(([key, name, emoji, kind], index) => ({
      id: `cat-${key}`,
      name,
      emoji,
      kind,
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      budget: null,
      order: index,
      archived: false,
      createdAt: 0,
      updatedAt: 0
    })),
    accounts: [
      { id: "acc-cash", name: "Cash", last4: "", kind: "cash", archived: false, order: 0, createdAt: 0, updatedAt: 0 }
    ],
    currencies: DEFAULT_CURRENCIES.map((c) => ({ ...c, createdAt: 0, updatedAt: 0 })),
    prefs: [
      {
        id: "prefs",
        defaultCurrency: "INR",
        reportCurrency: "INR",
        monthlyBudget: null,
        nearDupTolerance: 10,
        createdAt: 0,
        updatedAt: 0
      }
    ],
    recurring: [],
    transactions: []
  };
}
