const assert = require("assert");
const { analyzeQcData, formatDailySummary, focusPriorities } = require("../netlify/functions/qcEngine");

const today = "2026-05-27";
const records = [
  {
    job_id: "1",
    report_date: today,
    issues: "Clean job",
    "Customer Water Readings V2": "Completed",
    "Plumbing Inspection V2": "Completed",
    fieldpro_utilized: "yes",
    salespro_notes_found: "yes",
    paid: "paid"
  },
  {
    job_id: "2",
    report_date: today,
    issues: "No FieldPro. Follow-up needed. Estimate opportunity for Water Softener.",
    "Customer Water Readings V2": "Started",
    "Plumbing Inspection V2": "",
    fieldpro_utilized: "no",
    salespro_notes_found: "no",
    paid: "manual review",
    follow_up_needed: "yes",
    estimate_created: "yes",
    recommended_equipment: "Water Softener"
  },
  {
    job_id: "3",
    report_date: "2026-05-26",
    issues: "Clean job",
    "Customer Water Readings V2": "Completed",
    "Plumbing Inspection V2": "Completed"
  }
];

const summary = analyzeQcData(records, today);

assert.strictEqual(summary.jobsReviewed, 2);
assert.strictEqual(summary.cleanJobs, 1);
assert.strictEqual(summary.flaggedJobs, 1);
assert.strictEqual(summary.cleanRate, 50);
assert.match(summary.requiredFormIssues, /2 required form issue/);
assert.match(summary.fieldproSalesproUsageIssues, /1 job/);
assert.match(summary.paymentItemsNeedingReview, /1 payment/);
assert.match(summary.followUpItems, /1 follow-up/);
assert.match(summary.estimateRevenueOpportunities, /Water Softener/);
assert.match(formatDailySummary(summary), /Recommended Leadership Action/);
assert.ok(focusPriorities(summary).length > 0);

console.log("qcEngine tests passed");
