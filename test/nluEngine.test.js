const assert = require("assert");
const { localNlu, parseDateRange } = require("../netlify/functions/nluEngine");

const now = new Date("2026-05-27T12:00:00-05:00");

const pullToday = localNlu("Pull today's QC from ServiceTitan and tell me what needs coaching.", now);
assert.strictEqual(pullToday.requiresServiceTitan, true);
assert.strictEqual(pullToday.intent, "coaching_focus");
assert.strictEqual(pullToday.dateRange.fromDate, "2026-05-27");
assert.strictEqual(pullToday.dateRange.toDate, "2026-05-27");

const yesterday = parseDateRange("check yesterday's jobs", now);
assert.strictEqual(yesterday.fromDate, "2026-05-26");
assert.strictEqual(yesterday.toDate, "2026-05-26");

const custom = parseDateRange("review 5/20/2026 to 5/22/2026", now);
assert.strictEqual(custom.fromDate, "2026-05-20");
assert.strictEqual(custom.toDate, "2026-05-22");

const payment = localNlu("Which payments need review?", now);
assert.strictEqual(payment.requiresServiceTitan, false);
assert.strictEqual(payment.intent, "payment_review");
assert.strictEqual(payment.entities.mentionsPayment, true);

console.log("nluEngine tests passed");
