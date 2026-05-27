# Langston

Langston is a lean operations intelligence assistant for field leadership.

He can:

- Answer QC and ServiceTitan questions in one chat
- Use a server-side NLU layer to classify intent, extract dates, and decide when ServiceTitan is needed
- Pull QC records from ServiceTitan when the user asks him to pull, fetch, sync, check, or review QC/jobs
- Identify flagged jobs, clean jobs, required form issues, FieldPro/Sales Pro gaps, payment review items, follow-ups, and estimate/revenue opportunities
- Protect access with a private access code

## Local Development

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Set at least:

```env
LANGSTON_ACCESS_CODE=choose-a-private-code
```

Run the Netlify local server:

```bash
npm run dev
```

Run the QC engine test:

```bash
npm test
```

Build:

```bash
npm run build
```

## Deploy to Netlify from GitHub

1. Push this project to your GitHub repository.
2. In Netlify, create a new site from GitHub and select that repository.
3. Use build command `npm run build`.
4. Use publish directory `public`.
5. Add the environment variables below in Netlify.
6. Deploy.

## Netlify Environment Variables

Minimum required:

```env
LANGSTON_ACCESS_CODE=choose-a-private-code
```

Optional OpenAI:

```env
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o-mini
```

ServiceTitan:

```env
SERVICETITAN_AUTH_URL=https://auth.servicetitan.io/connect/token
SERVICETITAN_BASE_URL=https://api.servicetitan.io
SERVICETITAN_CLIENT_ID=your_client_id
SERVICETITAN_CLIENT_SECRET=your_client_secret
SERVICETITAN_APP_KEY=your_app_key
SERVICETITAN_TENANT_ID=your_tenant_id
```

## Notes

This starter does not include a database. Langston works from ServiceTitan API results loaded during the current browser session.
