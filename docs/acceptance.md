# Requirement map and live acceptance

Source: [Fluence assignment on Remotive](https://remotive.com/remote-jobs/software-development/full-stack-developer-2091165). The behaviors below are mapped to implementation; a checkmark in source coverage is not evidence of a live provider test.

| Requirement | Implementation | Evidence to collect live |
| --- | --- | --- |
| Next.js App Router + TypeScript | `app/`, strict `tsconfig.json` | Production build |
| Clerk sign-in | Provider, modal SignInButton, proxy | Sign in/out with two accounts |
| Public available names/categories only | `tools.publicList` explicit projection | Inspect anonymous response; no owner/description/IDs |
| Convex persistence | Schema, queries and mutations | Refresh and open second session |
| Create/edit/delete own listing | `tools.create/update/remove` | Owner succeeds, other user rejected |
| Category filter / availability | Member library and server booking projection | Filter categories, approve a loan |
| Date-range borrow requests | `loans.request` | Valid request; invalid/overlapping dates rejected |
| Approve/decline own tool requests | `loans.transition` | Lender succeeds, borrower cannot approve |
| Mark returned | Transition with participant and state checks | Availability returns after return |
| My listings / requests / incoming | Dashboard tabs and scoped queries | Each account sees its own loans |
| Admin remove / all loans / Trusted Lender | Admin query and mutations | Internal role bootstrap, exercise Admin tab |
| Convex-side RBAC | Shared auth guards on every private function | Targeted backend authorization tests |
| Request/status webhook | Transactional outbox and request workflow | n8n execution + Convex notification row |
| Daily overdue reminders | UTC schedule, signed HTTP query/write-back | Overdue fixture, manual scheduled-workflow run |
| Signed integration both directions | Portable and n8n HMAC verification | Valid succeeds; modified signature fails |
| Secrets outside code/export | Ignored env files, runtime reads | Review Git tracked files |
| Idempotent write-backs | Event key / loan-day key, transactional sink | Repeat same workflow; row count unchanged |
| Retries / visible failures | Bounded outbox retries, HTTP-node retries, Error Trigger | Stop n8n, inspect failure; restore and retry |
| Recent loan automation activity | Participant/admin activity details | Reminder and failed-event entries |
| Repository / exported workflows / README | Source + `n8n/workflows` + README | Publish to candidate’s GitHub |
| Production note | README production changes | Explain trade-offs in interview |

## Reviewer walkthrough

1. Start services as described in README. Publish all three n8n workflows, including the error-trigger workflow, and select it in the main workflows’ error settings.
2. Sign in as Neighbor A and list a drill. Sign out; anonymous browsing must show its name and category only.
3. Sign in as Neighbor B. Browse/filter, open the listing, request today through today. Confirm the mock request notification is recorded and Neighbor A sees an incoming request.
4. As A, approve it. As B, check the approved status. Anonymous browsing no longer includes the drill; an overlapping request must fail.
5. As either participant, mark returned. The drill becomes available again. Edit and remove as A. Attempt the same changes as B; Convex must reject them even if the UI is bypassed.
6. Use the internal operator role function to promote one known signed-in user. Exercise listing moderation, all-loan visibility and Trusted Lender. Normal users cannot access these APIs.
7. For an overdue test on a **disposable development deployment**, create/approve a same-day loan and, using the operator dashboard only, set its start/end to yesterday. Run the scheduled workflow manually. Check one `overdue_reminder` record and the loan activity. Run again; there must still be one record for that loan/day. Mark returned and verify the workflow skips it.
8. Stop n8n and cause a status event. After the bounded retries, the loan shows failure and Retry. Restore n8n and retry. Test a tampered envelope and check it cannot create a notification.

Do not create a public “backdate loan” or “make me admin” mutation for demos. Fixture changes and role grants belong in the operator dashboard/internal functions.
