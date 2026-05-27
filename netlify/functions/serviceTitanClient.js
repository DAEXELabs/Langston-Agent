async function getServiceTitanToken() {
  const authUrl = process.env.SERVICETITAN_AUTH_URL;
  const clientId = process.env.SERVICETITAN_CLIENT_ID;
  const clientSecret = process.env.SERVICETITAN_CLIENT_SECRET;

  if (!authUrl || !clientId || !clientSecret) {
    throw new Error("Missing ServiceTitan auth environment variables.");
  }

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  const response = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`ServiceTitan auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

function convertJobToQcRecord(job) {
  const notes = [job.summary, job.businessUnit?.name, job.jobType?.name, job.customer?.name, job.location?.name].filter(Boolean).join(" ");

  return {
    job_id: job.id || job.jobNumber || job.number || "",
    technician: job.technician?.name || job.assignedTechnician?.name || job.technicians?.[0]?.name || "Unknown Technician",
    customer_name: job.customer?.name || job.customerName || "Unknown Customer",
    service_type: job.jobType?.name || job.type || "",
    status: job.status || "",
    notes,
    issues: "",
    recommendations: "",
    coaching_focus: "",
    "Customer Water Readings V2": job.customerWaterReadingsV2 || "",
    "Plumbing Inspection V2": job.plumbingInspectionV2 || "",
    fieldpro_utilized: job.fieldpro_utilized || "",
    salespro_notes_found: job.salespro_notes_found || "",
    paid: job.paid || job.paymentStatus || "",
    follow_up_scheduled: job.followUpScheduled || "",
    estimate_created: job.estimateCreated || "",
    recommended_equipment: job.recommendedEquipment || "",
    report_date: String(job.completedOn || job.completedDate || job.modifiedOn || job.createdOn || "").slice(0, 10),
    raw_job: job
  };
}

async function fetchServiceTitanJobs({ fromDate, toDate, maxJobs = 50 }) {
  const baseUrl = process.env.SERVICETITAN_BASE_URL;
  const tenantId = process.env.SERVICETITAN_TENANT_ID;
  const appKey = process.env.SERVICETITAN_APP_KEY;

  if (!baseUrl || !tenantId || !appKey) {
    throw new Error("Missing ServiceTitan base URL, tenant ID, or app key environment variables.");
  }

  const token = await getServiceTitanToken();
  const limit = Math.min(Number(maxJobs || 50), 200);
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/jpm/v2/tenant/${tenantId}/jobs`);

  if (fromDate) url.searchParams.set("completedOnOrAfter", fromDate);
  if (toDate) url.searchParams.set("completedBefore", toDate);
  url.searchParams.set("pageSize", String(limit));

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "ST-App-Key": appKey,
      Accept: "application/json"
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`ServiceTitan jobs request failed: ${JSON.stringify(data)}`);

  const jobs = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
  const records = jobs.slice(0, limit).map(convertJobToQcRecord);
  return {
    records,
    rawCount: jobs.length,
    note: "ServiceTitan payload shapes vary. Review records and adjust convertJobToQcRecord if needed."
  };
}

module.exports = { convertJobToQcRecord, fetchServiceTitanJobs };
