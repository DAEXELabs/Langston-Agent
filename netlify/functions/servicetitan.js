const { fetchServiceTitanJobs } = require("./serviceTitanClient");

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,x-langston-access-code",
      "Access-Control-Allow-Methods": "POST,OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function checkAccess(event) {
  const required = process.env.LANGSTON_ACCESS_CODE;
  if (!required) return true;
  const provided = event.headers["x-langston-access-code"] || event.headers["X-Langston-Access-Code"];
  return provided === required;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  if (!checkAccess(event)) return jsonResponse(401, { error: "Invalid Langston access code." });

  try {
    const body = JSON.parse(event.body || "{}");
    const data = await fetchServiceTitanJobs({
      fromDate: body.fromDate,
      toDate: body.toDate,
      maxJobs: body.maxJobs
    });
    return jsonResponse(200, data);
  } catch (error) {
    return jsonResponse(500, { error: error.message || String(error) });
  }
};
