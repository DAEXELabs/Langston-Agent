async function createLangstonAnswer({
  client,
  model,
  brain,
  prompt,
  conversation = [],
  summaryText = "",
  nlu = {},
  serviceTitanResult = null,
  fallback = ""
}) {
  if (!client) return fallback;

  const sourceLine = serviceTitanResult
    ? `Langston pulled ${serviceTitanResult.records.length} ServiceTitan record(s) for ${nlu.dateRange?.label || "the selected range"}.`
    : "No live ServiceTitan pull was performed for this turn.";

  const systemPrompt = `${brain.protected_system_prompt || "You are Langston, a helpful AI assistant."}

Core behavior:
- Operate like a natural chat assistant first.
- Answer the user's actual question directly.
- Keep the tone human, calm, useful, and conversational.
- Do not force every answer into a QC report format.
- Use short sections or bullets only when they improve clarity.
- When the user asks for writing help, give polished copy they can use.
- When the user asks for planning or leadership guidance, give practical next steps.
- When the user asks for QC, ServiceTitan, forms, payments, follow-ups, coaching, or revenue analysis, use the available data only.
- If data is missing, say what is missing and what the user can do next.
- Keep job counts, payment status, customer names, technicians, and ServiceTitan details grounded in the available records.
- Recommend validation in ServiceTitan before important coaching, escalation, refund, warranty, HR, legal, safety, or pay decisions.

Daily QC Summary Format:
${brain.daily_qc_summary_format || ""}

Required Form Rules:
${brain.required_form_rules || ""}

Coaching Language:
${brain.coaching_language || ""}

Guardrails:
${brain.guardrails || ""}`;

  const response = await client.chat.completions.create({
    model,
    temperature: 0.45,
    messages: [
      { role: "system", content: systemPrompt },
      ...conversation,
      {
        role: "user",
        content: `Current user request:
${prompt}

Intent guidance:
${JSON.stringify(nlu, null, 2)}

Data source:
${sourceLine}

Available QC data summary:
${summaryText}

Answer naturally and helpfully.`
      }
    ]
  });

  return response.choices?.[0]?.message?.content?.trim() || fallback;
}

module.exports = { createLangstonAnswer };
