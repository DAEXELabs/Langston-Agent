const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { analyzeQcData, formatDailySummary, focusPriorities } = require("./qcEngine");
const { modelNlu, localNlu } = require("./nluEngine");
const { createLangstonAnswer } = require("./llmEngine");
const { fetchServiceTitanJobs } = require("./serviceTitanClient");
const { createPlan, executePlan } = require("./planningEngine");

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function loadBrain() {
  const brainPath = path.join(process.cwd(), "langston-brain.json");
  try {
    return JSON.parse(fs.readFileSync(brainPath, "utf8"));
  } catch {
    return {};
  }
}

function recentConversation(messages = []) {
  return Array.isArray(messages)
    ? messages
        .slice(-8)
        .filter((message) => ["user", "assistant"].includes(message.role) && message.content)
        .map((message) => ({ role: message.role, content: String(message.content).slice(0, 1200) }))
    : [];
}

function localAnswer(prompt, summary, nlu, serviceTitanResult) {
  const lower = String(prompt || "").toLowerCase();
  const pulled = serviceTitanResult ? `\n\nSource: Pulled ${serviceTitanResult.records.length} ServiceTitan record(s) for ${nlu.dateRange.label}.` : "";

  if (nlu.intent === "qc_summary" || lower.includes("daily") || lower.includes("summary") || lower.includes("jobs reviewed")) {
    return `${formatDailySummary(summary)}${pulled}`;
  }

  if (nlu.intent === "coaching_focus" || lower.includes("focus") || lower.includes("priority") || lower.includes("priorities")) {
    const priorities = focusPriorities(summary);
    return `${priorities.length ? `Top Focus Priorities:\n${priorities.map((item, index) => `${index + 1}. ${item}`).join("\n")}` : "No coaching priorities found in available data."}${pulled}`;
  }

  if (nlu.intent === "qc_counts" || lower.includes("flagged") || lower.includes("clean") || lower.includes("how many")) {
    return `Jobs Reviewed: ${summary.jobsReviewed}\nFlagged Jobs: ${summary.flaggedJobs}\nClean Jobs: ${summary.cleanJobs}\nClean Rate: ${summary.cleanRate}%${pulled}`;
  }

  if (nlu.intent === "required_forms") return `${summary.requiredFormIssues}\n\nRecommended Action:\n${summary.recommendedLeadershipAction}${pulled}`;
  if (nlu.intent === "payment_review") return `${summary.paymentItemsNeedingReview}\n\nRecommended Action:\n${summary.recommendedLeadershipAction}${pulled}`;
  if (nlu.intent === "follow_up") return `${summary.followUpItems}\n\nRecommended Action:\n${summary.recommendedLeadershipAction}${pulled}`;
  if (nlu.intent === "revenue_opportunities") return `${summary.estimateRevenueOpportunities}\n\nRecommended Action:\n${summary.recommendedLeadershipAction}${pulled}`;

  if (!summary.jobsReviewed) {
    return "I can help with QC, ServiceTitan jobs, coaching patterns, required forms, payments, follow-ups, and revenue opportunities. Ask me to pull QC from ServiceTitan when you want live job data.";
  }

  return `${formatDailySummary(summary)}${pulled}`;
}

async function createNlu(prompt, client) {
  const model = process.env.OPENAI_NLU_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  try {
    return await modelNlu(prompt, client, model);
  } catch {
    return localNlu(prompt);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  try {
    const body = JSON.parse(event.body || "{}");
    const prompt = body.prompt || "";
    let qcData = Array.isArray(body.qcData) ? body.qcData : [];
    const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const nlu = await createNlu(prompt, client);
    let serviceTitanResult = null;
    let dataSourceError = null;

    if (nlu.requiresServiceTitan) {
      try {
        serviceTitanResult = await fetchServiceTitanJobs({
          fromDate: nlu.dateRange?.fromDate,
          toDate: nlu.dateRange?.toDate,
          maxJobs: nlu.maxJobs || 50
        });
        qcData = serviceTitanResult.records;
      } catch (error) {
        dataSourceError = error.message || String(error);
      }
    }

    const selectedDate = nlu.dateRange?.fromDate === nlu.dateRange?.toDate ? nlu.dateRange.fromDate : body.selectedDate || null;
    const summary = analyzeQcData(qcData, selectedDate);
    const summaryText = formatDailySummary(summary);

    if (dataSourceError) {
      return jsonResponse(200, {
        answer: `I understood this as a ServiceTitan QC request, but I could not pull live data yet: ${dataSourceError}`,
        summary,
        summaryText,
        nlu,
        usedOpenAI: Boolean(client),
        dataSourceError
      });
    }

    if (body.summaryOnly) return jsonResponse(200, { summary, summaryText, nlu });

    const brain = loadBrain();

    // Planning Loop Trigger (for complex queries)
    let usePlanning = nlu.intent === "general_ops_question" ||
                      prompt.toLowerCase().includes("plan") ||
                      prompt.toLowerCase().includes("how should") ||
                      prompt.length > 100; // heuristic

    let answer;
    const local = localAnswer(prompt, summary, nlu, serviceTitanResult);
    if (usePlanning && client) {
      const plan = await createPlan(client, model, prompt, nlu, summaryText, brain);
      answer = await executePlan(client, model, plan, prompt, brain, qcData);
    } else {
      answer = await createLangstonAnswer({
        client,
        model,
        brain,
        prompt,
        conversation: recentConversation(body.messages),
        summaryText,
        nlu,
        serviceTitanResult,
        fallback: local
      });
    }

    return jsonResponse(200, {
      answer,
      summary,
      summaryText,
      nlu,
      usedOpenAI: Boolean(client),
      serviceTitan: serviceTitanResult
        ? {
            pulled: true,
            rawCount: serviceTitanResult.rawCount,
            records: serviceTitanResult.records.length,
            dateRange: nlu.dateRange
          }
        : { pulled: false },
      qcData
    });
  } catch (error) {
    return jsonResponse(500, { error: error.message || String(error) });
  }
};
