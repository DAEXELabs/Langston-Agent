const PULL_TERMS = ["pull", "fetch", "get", "load", "sync", "check", "review", "look up", "bring in"];
const SERVICE_TERMS = ["servicetitan", "service titan", "qc", "job", "jobs"];
const SUMMARY_TERMS = ["summary", "summarize", "recap", "overview", "report"];
const COACHING_TERMS = ["coach", "coaching", "pattern", "focus", "training"];
const FOLLOW_UP_TERMS = ["follow up", "follow-up", "callback", "customer"];
const PAYMENT_TERMS = ["payment", "paid", "invoice", "balance"];
const FORM_TERMS = ["form", "forms", "inspection", "water reading", "documentation"];
const ESTIMATE_TERMS = ["estimate", "opportunity", "revenue", "equipment"];

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date) {
  const next = new Date(date);
  const day = next.getDay();
  next.setDate(next.getDate() - day);
  return next;
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function parseSlashDate(value, now = new Date()) {
  const match = String(value || "").match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (!match) return null;
  const year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : now.getFullYear();
  const date = new Date(year, Number(match[1]) - 1, Number(match[2]));
  return Number.isNaN(date.getTime()) ? null : isoDate(date);
}

function parseDateRange(prompt, now = new Date()) {
  const text = String(prompt || "").toLowerCase();
  const today = isoDate(now);

  if (text.includes("yesterday")) {
    const date = isoDate(addDays(now, -1));
    return { fromDate: date, toDate: date, label: "yesterday" };
  }

  if (text.includes("last week")) {
    const thisWeekStart = startOfWeek(now);
    const from = addDays(thisWeekStart, -7);
    const to = addDays(thisWeekStart, -1);
    return { fromDate: isoDate(from), toDate: isoDate(to), label: "last week" };
  }

  if (text.includes("this week") || text.includes("week to date")) {
    return { fromDate: isoDate(startOfWeek(now)), toDate: today, label: "this week" };
  }

  const explicitDates = [...text.matchAll(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g)].map((match) => parseSlashDate(match[0], now)).filter(Boolean);
  if (explicitDates.length >= 2) return { fromDate: explicitDates[0], toDate: explicitDates[1], label: "custom range" };
  if (explicitDates.length === 1) return { fromDate: explicitDates[0], toDate: explicitDates[0], label: explicitDates[0] };

  return { fromDate: today, toDate: today, label: "today" };
}

function detectIntent(prompt) {
  const text = String(prompt || "").toLowerCase();
  if (includesAny(text, SUMMARY_TERMS)) return "qc_summary";
  if (includesAny(text, COACHING_TERMS)) return "coaching_focus";
  if (includesAny(text, PAYMENT_TERMS)) return "payment_review";
  if (includesAny(text, FORM_TERMS)) return "required_forms";
  if (includesAny(text, FOLLOW_UP_TERMS)) return "follow_up";
  if (includesAny(text, ESTIMATE_TERMS)) return "revenue_opportunities";
  if (includesAny(text, ["clean", "flagged", "how many", "count"])) return "qc_counts";
  return "general_ops_question";
}

function localNlu(prompt, now = new Date()) {
  const text = String(prompt || "").toLowerCase();
  const requiresServiceTitan = includesAny(text, PULL_TERMS) && includesAny(text, SERVICE_TERMS);

  return {
    intent: detectIntent(prompt),
    confidence: requiresServiceTitan ? 0.78 : 0.62,
    requiresServiceTitan,
    dateRange: parseDateRange(prompt, now),
    entities: {
      mentionsPayment: includesAny(text, PAYMENT_TERMS),
      mentionsForms: includesAny(text, FORM_TERMS),
      mentionsFollowUp: includesAny(text, FOLLOW_UP_TERMS),
      mentionsRevenue: includesAny(text, ESTIMATE_TERMS),
      mentionsCoaching: includesAny(text, COACHING_TERMS)
    },
    answerStyle: "leadership-ready",
    source: "local_rules"
  };
}

async function modelNlu(prompt, client, model, now = new Date()) {
  if (!client) return localNlu(prompt, now);

  const fallback = localNlu(prompt, now);
  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Classify Langston field-operations requests. Return compact JSON only with keys: intent, confidence, requiresServiceTitan, dateRange {fromDate,toDate,label}, entities object, answerStyle. Use ISO dates. If the user asks to pull, fetch, sync, check, review, or get ServiceTitan/QC/jobs, requiresServiceTitan must be true."
      },
      {
        role: "user",
        content: `Today is ${isoDate(now)}.\nRequest: ${prompt}`
      }
    ]
  });

  try {
    const parsed = JSON.parse(response.choices?.[0]?.message?.content || "{}");
    return {
      ...fallback,
      ...parsed,
      dateRange: {
        ...fallback.dateRange,
        ...(parsed.dateRange || {})
      },
      entities: {
        ...fallback.entities,
        ...(parsed.entities || {})
      },
      source: "openai_nlu"
    };
  } catch {
    return fallback;
  }
}

module.exports = { localNlu, modelNlu, parseDateRange };
