# Research Brief

Research Brief searches ERIC for education research by keyword, lets a user select papers, and emails plain-language summaries for non-technical readers.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

Create `.env.local` with:

```env
OPENAI_API_KEY=
RESEND_API_KEY=
FROM_EMAIL="Research Brief <onboarding@resend.dev>"
OPENAI_MODEL=gpt-4o-mini
```

`onboarding@resend.dev` is only for testing and can only send to the email attached to your Resend account. To send to any user-entered email, verify a domain in Resend and switch `FROM_EMAIL` to an address on that domain.

## Notes

- ERIC does not require an API key.
- Search is driven by the keywords entered by the user.
- The demo query can use `K-12, AI tutor`, but the app can search other education topics too.
- Full-text PDF records are checked and labeled when ERIC hosts a PDF.
- When ERIC full-text PDFs are available, summaries use extracted PDF text from the selected report. Otherwise, they fall back to the abstract.
- The send route summarizes up to 8 selected papers at once to keep email generation responsive.
