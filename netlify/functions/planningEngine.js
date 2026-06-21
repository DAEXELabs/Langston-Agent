const { createLangstonAnswer } = require("./llmEngine");

async function createPlan(client, model, prompt, nlu, summaryText, brain) {
  if (!client) return { steps: [], finalAnswer: "Planning requires OpenAI." };

  const planPrompt = `
You are Langston's Planning Module. Break down the user's goal into clear, executable steps.
User request: ${prompt}
NLU Intent: ${JSON.stringify(nlu)}
Data Summary: ${summaryText || "No data yet"}

Output valid JSON only:
{
  "goal": "short goal",
  "steps": [
    {"step": 1, "action": "reason or tool use", "tool": "serviceTitan|qc|general|reflect", "expectedOutput": "..."}
  ],
  "requiresData": boolean
}
`;

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: planPrompt }]
    });
    return JSON.parse(response.choices[0].message.content);
  } catch (e) {
    return { steps: [{ step: 1, action: "direct answer", tool: "general" }], finalAnswer: null };
  }
}

async function executePlan(client, model, plan, prompt, brain, qcData) {
  let context = "";
  for (const step of plan.steps) {
    context += `\nStep ${step.step}: ${step.action}\n`;
  }
  return await createLangstonAnswer({ client, model, brain, prompt, summaryText: context });
}

module.exports = { createPlan, executePlan };