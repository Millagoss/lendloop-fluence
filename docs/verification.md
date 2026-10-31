# Verification record

Verified on **31 October 2026** against local Next.js, the actual local Convex backend, a Clerk development application, and Docker-hosted n8n 2.45.7.

| Check | Result |
| --- | --- |
| Targeted automated tests | 24 passed across domain, Convex handlers/HTTP and n8n code tests |
| Root TypeScript check | Passed |
| Convex’s own TypeScript check and function push | Passed; local backend serving on port 3210 |
| ESLint | Passed |
| Next.js optimized production build | Passed |
| Production dependency audit | 0 reported vulnerabilities |
| Actual Clerk-issued JWT accepted by Convex | Passed with fictional development users |
| Actual request → approval → return | Passed |
| Cross-user listing edits / borrower approval / unrelated loan reads | Denied or filtered correctly |
| Real n8n request webhook and signed callbacks | 6 outbox events delivered and durably recorded |
| Real forged n8n webhook request | Rejected; no notification added |
| Dedicated n8n error workflow | Published; successful handler execution #19 retained in n8n history |
| Real forged Convex HTTP request | HTTP 401; no notification added |
| Replayed request notification | Two retries succeeded with no new records |
| Real overdue n8n workflow | Executed twice; exactly one daily reminder recorded |
| Retried reminder callback | Returned `duplicate: true` |
| Public landing page | Inspected in the in-app browser with Convex-backed listings |

The first three events were created before webhook activation and were delivered on the fourth attempt after n8n was activated. This exercised a real transient delivery failure and recovery. Exhausted retries and participant-only retry permissions were also tested in the automated suite.

Reproduction helpers (all enforce local Convex; the auth helper also requires Clerk **development** keys):

```sh
node scripts/verify-live.mjs
node scripts/prepare-overdue-fixture.mjs
npx convex import --table loans --append .local/overdue.jsonl
# Run the overdue workflow twice in n8n, then:
node scripts/verify-automation-live.mjs
```

The fixture helper refuses to prepare another overdue loan when its tool already has an approved loan. Resolve that fixture before rerunning the full preparation. Local test-user IDs, fixture data and raw execution output remain in ignored `.local/`; no credentials belong in this record.

**Limits:** Clerk authentication was exercised through real development session tokens and the Clerk sign-in modal was inspected in the browser; a complete human sign-up/sign-in browser walkthrough remains a manual acceptance step. Admin and failed-state retry cases have backend tests, not a complete multi-user browser walkthrough. No cloud app deployment or job application email has been sent. No claim of production readiness, healthcare compliance, or real email delivery is made. See the README’s production changes.
