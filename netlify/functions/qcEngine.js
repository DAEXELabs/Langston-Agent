const REQUIRED_FORMS = ["Customer Water Readings V2", "Plumbing Inspection V2"];
const EQUIPMENT_TERMS = ["Water Softener", "Reverse Osmosis", "ONE Filter", "Infinity Filter", "Carbon Filter", "Sediment Filter", "UV System", "PRV", "Water Heater"];

function norm(value) {
  return String(value ?? "").trim().toLowerCase();
}

function hasAny(text, keywords) {
  const lower = String(text || "").toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function safeGet(row, columns) {
  for (const column of columns) {
    if (row && row[column] !== undefined && row[column] !== null && String(row[column]).trim() !== "") return row[column];
  }
  return "";
}

function rowText(row, columns) {
  return columns.map((column) => row?.[column] ?? "").join(" ").trim();
}

function normalizeFormStatus(status) {
  const value = norm(status);
  if (["done", "complete", "completed", "yes", "true", "1"].includes(value)) return "Completed";
  if (["started", "incomplete", "partial", "in progress"].includes(value)) return "Incomplete";
  return "NO";
}

function parseRequiredForms(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function getRequiredFormStatus(row, formName) {
  const possible = [
    formName,
    formName.toLowerCase().replaceAll(" ", "_"),
    formName.toLowerCase().replaceAll(" ", "_").replaceAll("/", "_")
  ];

  for (const column of possible) {
    if (row[column] !== undefined && String(row[column] ?? "").trim()) return normalizeFormStatus(row[column]);
  }

  const forms = parseRequiredForms(row.required_forms);
  if (forms[formName] !== undefined) return normalizeFormStatus(forms[formName]);
  return "NO";
}

function getJobLabel(row) {
  return String(safeGet(row, ["job_id", "jobNumber", "number", "id"]));
}

function getTechnician(row) {
  return String(safeGet(row, ["technician", "technician_name", "tech", "assignedTechnician"]));
}

function getCustomer(row) {
  return String(safeGet(row, ["customer_name", "customer", "customerName", "location_name"]));
}

function getServiceType(row) {
  return String(safeGet(row, ["service_type", "job_type", "jobType", "type"]));
}

function getReportDate(row) {
  return String(safeGet(row, ["report_date", "created_at", "completed_on", "date", "completedDate", "completedOn"])).slice(0, 10);
}

function buildRowReview(row) {
  const combined = rowText(row, ["issues", "recommendations", "coaching_focus", "opportunity_summary", "notes", "tech_notes", "summary", "qc_status", "review_status"]);
  const issueText = rowText(row, ["issues", "recommendations", "coaching_focus", "opportunity_summary", "qc_status", "review_status"]);
  const cleanValues = new Set(["", "clean", "pass", "passed", "no issues", "no issues found", "no recommendations", "no recommendations generated"]);
  const reasons = [];
  const coachingFocus = [];

  for (const form of REQUIRED_FORMS) {
    const status = getRequiredFormStatus(row, form);
    if (status !== "Completed") {
      reasons.push(`${form}: ${status}`);
      coachingFocus.push("Required forms / documentation");
    }
  }

  const fieldproValue = norm(safeGet(row, ["fieldpro_utilized", "fieldpro_used"]));
  const salesproValue = norm(safeGet(row, ["salespro_notes_found", "salespro_used"]));
  if (["false", "no", "0"].includes(fieldproValue) || ["false", "no", "0"].includes(salesproValue) || hasAny(combined, ["fieldpro was not utilized", "no sales pro", "no fieldpro"])) {
    reasons.push("Missing or unclear FieldPro/Sales Pro usage");
    coachingFocus.push("FieldPro / Sales Pro usage");
  }

  const paidValue = norm(safeGet(row, ["paid", "payment_status", "paymentStatus"]));
  if (["unknown", "", "not found", "not available", "manual review", "review"].includes(paidValue) || hasAny(combined, ["payment status needs manual review", "payment manual review"])) {
    reasons.push("Payment status needs manual review");
    coachingFocus.push("Payment review");
  }

  const followValue = norm(safeGet(row, ["follow_up_scheduled", "follow_up_needed", "followUpScheduled"]));
  if (["true", "yes", "needed", "needs follow-up", "needs follow up"].includes(followValue) || hasAny(combined, ["follow-up may be needed", "follow up may be needed", "follow-up needed", "follow up needed"])) {
    reasons.push("Follow-up may need ownership");
    coachingFocus.push("Follow-up ownership");
  }

  const estimateValue = norm(safeGet(row, ["estimate_created", "estimate_status", "estimateCreated"]));
  if (["true", "yes", "created"].includes(estimateValue) || hasAny(combined, ["estimate", "opportunity", "recommended equipment"])) {
    reasons.push("Estimate/revenue opportunity mentioned");
    coachingFocus.push("Estimate / revenue opportunity");
  }

  if (hasAny(combined, ["photo", "picture", "attachment"])) {
    reasons.push("Photo or attachment documentation issue mentioned");
    coachingFocus.push("Photos / attachments");
  }

  const explicitClean = cleanValues.has(norm(issueText)) || hasAny(issueText, ["no issues found", "clean job", "passed qc"]);
  const flagged = reasons.length > 0 || !explicitClean;

  if (!reasons.length && !explicitClean && issueText) {
    reasons.push(issueText.slice(0, 160));
  }

  return {
    jobId: getJobLabel(row),
    technician: getTechnician(row) || "Unknown Technician",
    customer: getCustomer(row) || "Unknown Customer",
    serviceType: getServiceType(row),
    status: String(row.status || ""),
    reportDate: getReportDate(row),
    flagged,
    reasons,
    coachingFocus: [...new Set(coachingFocus)],
    notes: combined.slice(0, 220)
  };
}

function filterByDate(records, selectedDate) {
  if (!selectedDate) return records;
  return records.filter((row) => {
    const value = row.report_date || row.created_at || row.completed_on || row.date || row.completedDate || row.completedOn;
    if (!value) return true;
    return String(value).slice(0, 10) === selectedDate;
  });
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function analyzeQcData(records = [], selectedDate = null) {
  const data = filterByDate(Array.isArray(records) ? records : [], selectedDate);

  if (!data.length) {
    return {
      jobsReviewed: 0,
      flaggedJobs: 0,
      cleanJobs: 0,
      cleanRate: 0,
      mainCoachingPattern: "Not found in available data.",
      requiredFormIssues: "Not found in available data.",
      fieldproSalesproUsageIssues: "Not found in available data.",
      paymentItemsNeedingReview: "Not found in available data.",
      followUpItems: "Not found in available data.",
      estimateRevenueOpportunities: "Not found in available data.",
      flaggedJobDetails: [],
      technicianCoaching: [],
      recommendedLeadershipAction: "Upload QC data or pull ServiceTitan data first."
    };
  }

  const reviews = data.map(buildRowReview);
  const flaggedDetails = reviews.filter((review) => review.flagged);
  const jobsReviewed = reviews.length;
  const flaggedJobs = flaggedDetails.length;
  const cleanJobs = jobsReviewed - flaggedJobs;
  const cleanRate = jobsReviewed ? Number(((cleanJobs / jobsReviewed) * 100).toFixed(1)) : 0;

  const focusCounts = countBy(flaggedDetails.flatMap((review) => review.coachingFocus), (item) => item);
  const mainCoachingPattern = Object.entries(focusCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Not found in available data.";

  const requiredIssues = flaggedDetails.flatMap((review) => review.reasons.filter((reason) => REQUIRED_FORMS.some((form) => reason.startsWith(form))));
  const requiredCounts = countBy(requiredIssues, (item) => item);
  const mostCommonRequired = Object.entries(requiredCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([item]) => item);

  const fieldproCount = flaggedDetails.filter((review) => review.reasons.some((reason) => reason.includes("FieldPro") || reason.includes("Sales Pro"))).length;
  const paymentReviewCount = flaggedDetails.filter((review) => review.reasons.some((reason) => reason.includes("Payment"))).length;
  const followUpCount = flaggedDetails.filter((review) => review.reasons.some((reason) => reason.includes("Follow-up"))).length;
  const estimateCount = flaggedDetails.filter((review) => review.reasons.some((reason) => reason.includes("Estimate") || reason.includes("revenue"))).length;

  const equipmentCounter = {};
  for (const row of data) {
    const equipmentText = `${safeGet(row, ["recommended_equipment", "recommendedEquipment"])} ${rowText(row, ["issues", "recommendations", "coaching_focus", "opportunity_summary", "notes", "tech_notes", "summary"])}`;
    for (const item of EQUIPMENT_TERMS) {
      if (equipmentText.toLowerCase().includes(item.toLowerCase())) equipmentCounter[item] = (equipmentCounter[item] || 0) + 1;
    }
  }

  const technicianGroups = {};
  for (const review of flaggedDetails) {
    const tech = review.technician || "Unknown Technician";
    if (!technicianGroups[tech]) technicianGroups[tech] = { technician: tech, flaggedJobs: 0, coachingFocus: {}, jobs: [] };
    technicianGroups[tech].flaggedJobs += 1;
    review.coachingFocus.forEach((focus) => {
      technicianGroups[tech].coachingFocus[focus] = (technicianGroups[tech].coachingFocus[focus] || 0) + 1;
    });
    technicianGroups[tech].jobs.push({
      jobId: review.jobId,
      customer: review.customer,
      reasons: review.reasons.slice(0, 4)
    });
  }

  const technicianCoaching = Object.values(technicianGroups)
    .map((group) => ({
      technician: group.technician,
      flaggedJobs: group.flaggedJobs,
      topFocus: Object.entries(group.coachingFocus).sort((a, b) => b[1] - a[1]).map(([focus]) => focus).slice(0, 3),
      jobs: group.jobs.slice(0, 5)
    }))
    .sort((a, b) => b.flaggedJobs - a.flaggedJobs);

  const requiredFormIssues = requiredIssues.length
    ? `${requiredIssues.length} required form issue(s) found. Most common: ${mostCommonRequired.join("; ")}`
    : "No required form issues found in available data.";

  const fieldproSalesproUsageIssues = fieldproCount
    ? `${fieldproCount} job(s) show missing or unclear FieldPro/Sales Pro usage.`
    : "No FieldPro/Sales Pro usage issues found in available data.";

  const paymentItemsNeedingReview = paymentReviewCount
    ? `${paymentReviewCount} payment item(s) need manual review.`
    : "No payment review items found in available data.";

  const followUpItems = followUpCount
    ? `${followUpCount} follow-up item(s) need review or ownership.`
    : "No follow-up items found in available data.";

  const equipmentList = Object.entries(equipmentCounter).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([item]) => item).join(", ");
  let estimateRevenueOpportunities = estimateCount
    ? `${estimateCount} estimate/revenue opportunity item(s) found.`
    : "No estimate/revenue opportunities found in available data.";
  if (estimateCount && equipmentList) estimateRevenueOpportunities += ` Recommended equipment mentioned: ${equipmentList}.`;

  const actions = [];
  if (flaggedJobs) actions.push("Review flagged jobs and validate important findings in ServiceTitan.");
  if (requiredIssues.length) actions.push("Coach required form completion before job closeout.");
  if (fieldproCount) actions.push("Reinforce FieldPro/Sales Pro note usage.");
  if (paymentReviewCount) actions.push("Assign payment manual review items.");
  if (followUpCount) actions.push("Assign ownership for follow-up items.");
  if (estimateCount) actions.push("Review estimate opportunities for revenue follow-through.");

  return {
    jobsReviewed,
    flaggedJobs,
    cleanJobs,
    cleanRate,
    mainCoachingPattern,
    requiredFormIssues,
    fieldproSalesproUsageIssues,
    paymentItemsNeedingReview,
    followUpItems,
    estimateRevenueOpportunities,
    flaggedJobDetails: flaggedDetails.slice(0, 25),
    technicianCoaching: technicianCoaching.slice(0, 12),
    recommendedLeadershipAction: actions.length ? actions.join(" ") : "No major leadership action found in available data."
  };
}

function formatDailySummary(summary) {
  const flaggedLines = (summary.flaggedJobDetails || [])
    .slice(0, 8)
    .map((job) => `- Job ${job.jobId || "Unknown"} | ${job.technician} | ${job.customer}: ${job.reasons.join("; ") || "Review needed"}`)
    .join("\n");

  const techLines = (summary.technicianCoaching || [])
    .slice(0, 6)
    .map((item) => `- ${item.technician}: ${item.flaggedJobs} flagged job(s). Focus: ${item.topFocus.join(", ") || "Review job notes"}`)
    .join("\n");

  return `Jobs Reviewed: ${summary.jobsReviewed || 0}\nFlagged Jobs: ${summary.flaggedJobs || 0}\nClean Jobs: ${summary.cleanJobs || 0}\n\nMain Coaching Pattern:\n${summary.mainCoachingPattern || "Not found in available data."}\n\nTechnicians Needing Coaching:\n${techLines || "Not found in available data."}\n\nFlagged Job Details:\n${flaggedLines || "No flagged job details found in available data."}\n\nRequired Form Issues:\n${summary.requiredFormIssues || "Not found in available data."}\n\nFieldPro/Sales Pro Usage Issues:\n${summary.fieldproSalesproUsageIssues || "Not found in available data."}\n\nPayment Items Needing Review:\n${summary.paymentItemsNeedingReview || "Not found in available data."}\n\nFollow-Up Items:\n${summary.followUpItems || "Not found in available data."}\n\nEstimate / Revenue Opportunities:\n${summary.estimateRevenueOpportunities || "Not found in available data."}\n\nRecommended Leadership Action:\n${summary.recommendedLeadershipAction || "Not found in available data."}`;
}

function focusPriorities(summary) {
  const items = [];
  if (summary.flaggedJobs) items.push("Validate flagged QC items in ServiceTitan before coaching or escalating.");
  if (!String(summary.requiredFormIssues || "").startsWith("No required form")) items.push("Coach required form completion: Customer Water Readings V2 and Plumbing Inspection V2.");
  if (!String(summary.fieldproSalesproUsageIssues || "").startsWith("No FieldPro")) items.push("Reinforce FieldPro/Sales Pro documentation.");
  if (!String(summary.paymentItemsNeedingReview || "").startsWith("No payment")) items.push("Review payment items before treating jobs as fully closed.");
  if (!String(summary.estimateRevenueOpportunities || "").startsWith("No estimate")) items.push("Review estimate/revenue opportunities and assign follow-through.");
  return items.slice(0, 3);
}

module.exports = { analyzeQcData, formatDailySummary, focusPriorities, buildRowReview };
