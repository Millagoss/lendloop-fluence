# Verification record

Verified on **31 October 2026** against local Next.js, the actual local Convex backend, a Clerk development application, and Docker-hosted n8n 2.45.7.

| Check | Result |
| --- | --- |
| Targeted automated tests | 25 passed across domain, Convex handlers/HTTP and n8n code tests |
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
| Minimal automation payloads | Verified that request delivery sends only an event ID, and overdue queries return only loan IDs and reminder days |

A follow-up requirement audit removed unused fields from the n8n boundary. The updated code passed all 25 tests, type checks, lint, Convex's own deployment checks, and live n8n signature/retry verification. The live database then contained seven delivered request/status events and one overdue reminder; repeated callbacks still added no duplicate records.

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

## Two-account browser walkthrough

Completed in the in-app browser with Million on `localhost:3000` and the fictional Olive account on `127.0.0.1:3000`. Separate loopback origins kept their Clerk sessions isolated. Olive signed in through Clerk's development email-code flow and signed out afterward; Million's existing session remained signed in.

| Browser check | Result |
| --- | --- |
| Anonymous browsing | Available names/categories shown; owners and descriptions hidden |
| Category filter and text search | Correctly narrowed the member library |
| Create and edit a listing | Olive created an orbital sander, then changed its condition and description |
| Ownership controls and scoped views | Million could request Olive's listing, but had no edit/remove controls; own listing/request views excluded other users' records |
| Request → approve → return | Both accounts updated live; notification delivery appeared; availability returned |
| Conflicting same-day request | Rejected by Convex; the error appeared inside the open request dialog |
| Decline and borrower cancellation | Both terminal states appeared in both accounts with delivered notifications |
| Owner removal | Olive removed the disposable sander; loan history remained visible |
| Admin moderation | Temporarily promoted Olive removed Million's disposable garden fork; it disappeared from Million's listings |
| Admin loan view | Rendered the loan list and neighbor directory; unrelated-user visibility is additionally covered by backend tests |
| Trusted Lender | Admin badge assignment appeared on Olive's listings in Million's session; badge removal succeeded |
| Cleanup | Both disposable listings removed; badge cleared; Olive restored to user and signed out; original pending/overdue fixtures retained |

The walkthrough found and fixed two issues: Next.js blocked development assets on the second loopback hostname, and request errors were hidden behind the native dialog. The allowed development origin is now explicit, and dialog operations render an accessible inline error. After these changes, all 25 tests, TypeScript, ESLint and the optimized production build passed.

**Limits:** New-account sign-up and exhausted-retry recovery were not exercised through the browser; failed-state retry authorization and behavior have backend tests, while transient recovery was exercised with real n8n above. No cloud app deployment or job application email has been sent. Notifications use the documented mock sink; no real email delivery, production readiness or healthcare compliance is claimed. See the README's production changes.
