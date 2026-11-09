# Master Claude handover addendum: installation readiness

Prepared 28 October 2026. Oliver reports team design sign-off. This is design approval, not evidence of live integration or permission to send production email.

## Start here

Add this module to the existing Claude Brain project and master handover alongside START_HERE.md, OWNER_DECISIONS_AND_REMAINING_WORK.md and the Installation Hub work. Do not rebuild the portal or duplicate the Brian scheduler. The existing combined master ZIP has not been modified by this addendum.

Repository: https://github.com/oliverwilliams-VM/install-status-tracker
Review PR: https://github.com/oliverwilliams-VM/install-status-tracker/pull/1
Branch: readiness-portal-review
Approved UI baseline commit: 818855a2fb311fdf7d2825ad9d69a4761bc7ea6d
Detailed implementation/setup: docs/READINESS_REVIEW.md

Read the current deployed Brain Apps Script and trigger inventory before preparing the live diff. The production readiness sender is not contained in this repository. Preserve existing welcome, confirmed-install, PED/FreedomPay, H&K and Install Hub work. Inspect current deployed state rather than treating old handover notes as certification.

## Sending pattern

The review branch uses the tracker’s existing Europe/London calendar-day offsets. The scheduler handover also refers to working-day rules. Confirm the production calendar policy, execution time and sender before cutover.

| When | To | CC | Condition |
|---|---|---|---|
| Install minus 10 days | Verified FZE | None | Initial personalised portal request |
| Install minus 7 days | Same verified FZE | None | No submitted response |
| Install minus 5 days | Same verified FZE | Verified MFP | No submitted response. Give 24 hours to respond. |
| Install minus 4 days | Same verified FZE | Verified MFP and HFP | No submitted response. Final warning. |
| Install minus 3 days | Internal decision | None | Surface an outstanding response for cancellation and Apex stand-down. |

Review the warning copy in English, Dutch and German. The stand-down step can notify the two internal install leads in Monday so they can verify the latest position, cancel the booking, stand Apex down and record the outcome. The coordinator never changes the booking or contacts Apex. Set `RD_STAND_DOWN_USER_IDS` to the two verified install-lead Monday IDs. Keep `RD_STAND_DOWN_ALERTS_APPROVED` unset until the scheduled dispatch, alert acceptance and recipient access are rehearsed. The internal alert flag is separate from franchisee email approval. Reconcile uncertain notifications manually before any retry. A submitted response stops non-response chasers. Outstanding preparations are routed for VM follow-up.

Keep the verified installation and booking revision as the basis for all actions. Late entries use the latest applicable stage and never send a backlog of overdue messages. The final warning is held if its verified MFP or HFP recipient is missing. The HFP is resolved from the exact linked Sign Up item’s HFP People field. An empty assignment, team, multiple people or an inactive user cannot supply the final-warning recipient. Verify production user lookup permissions and reconcile old request records before cutover. Never assume that a late warning provided a full notice period.

Record delivery only after independently verified Gmail Sent receipt. Draft creation or a successful send attempt alone is not proof. Keep durable reservations/idempotency and reconcile uncertain results before retrying.

## Approved form behavior

- Project type and kiosk type are pre-filled from verified Monday records, with no FZE project selector. Opening date for NRO, reopening date for Remodel; trading restaurants do not get opening/reopening questions.
- Every SFK installation gets table questions regardless of project type. Capture ordered Yes/No, actual order date mandatory when ordered, delivered Yes/No, delivery date/ETA or explicitly unknown when undelivered, and assembled/positioned when delivered. Order-date field appears upfront until Not ordered is selected.
- Use Hardware throughout visible wording. Existing internal kit field keys remain for data compatibility.
- Five grouped readiness confirmations; No/Not yet reveals detailed checks and actions. Every displayed applicable question is mandatory. Two minutes is a usability target, not measured acceptance.
- Name, installation/handover contact and access details, other issues and required dates remain captured. No training is offered: installation and handover only.
- Mandatory unticked, versioned guide acknowledgement records server time and covers preparation, potential delay/abort and agreed revisit/corrective charges.
- Photos may be attached now, already shared or provided separately. Missing/unverified evidence stays outstanding and prevents VM approval.
- Live, partially completed and aborted installations remain visible. FZE comments/history are retained. VM notes must come from the selected Monday source, not a new FZE form notes field.

## Sources and integration work still required

Brain board 18432365825; Sign Up board 5678025992. Verify exact Brain-to-install relationship, booked date, country and FZE/MFP fields in the deployed system; never infer the install relationship from the Sign Up relationship board_relation_mm7s293s.

Existing readiness destination boards: UK/IE 18379251681; DE 18391075175; NL 18396748434. Retain historical responses and comments. Replace the three entry forms only at reconciled cutover; do not delete boards. Country schemas differ. Canonical archive metadata binds exact installation/request/revision; store number alone is insufficient.

Complete RD_SOURCE_MAP from actual source. Connect Brian's verified hardware shipping field. Connect PED returned/ordered from the existing PED process, separately from FZE confirmation of terminals received. Choose and verify Monday Updates or a dedicated VM notes column, with appropriate internal access; review-browser filtering is not production authentication.

Deploy the supplied readiness coordinator in its own Apps Script project without replacing FreedomPay/PED doPost. Configure private Drive state/evidence archive and secrets through secure runtime configuration. See READINESS_REVIEW.md for exact property names and flags. Production backend/writes/sends remain off until acceptance. Reuse RD_dispatchWithExistingSender through the existing verified sender; do not install another sending trigger or ChatGPT automation.

## Required acceptance and cutover evidence

1. Identify deployed sender/trigger inventory, exact source fields, recipient resolution and existing open requests. Document the precise integration diff.
2. Test bound links and responses for UK, IE, NL and DE; NRO, Remodel and trading; SFK and other hardware. Confirm order-date capture and mandatory validation, translations, wrong-type report, dates and acknowledgement.
3. Test minus 10/7/5/4/3, late entry, missing recipients, submitted-but-blocked store, cancelled/live/partial/aborted cases, duplicate/concurrent runs, reschedule and expired/old links. Confirm no unintended email and no duplicate filing.
4. Verify real internal test writes, private photos, Monday history/comments, operational PED/shipping/notes and verified Sent receipts. Automated mocks do not certify this step.
5. Reconcile legacy submissions and pending chasers. Present final email copy, mapping table, test evidence, proposed cutover and rollback to Oliver before activating live sending.
6. At approved cutover switch only readiness links/scheduling, close old forms to new submissions, retain history and monitor first sends/responses. No automatic replay of historical chasers.

Rollback: disable new readiness sending/backend writes, retain reservations and evidence, reconcile sent/submitted state before restoring any legacy chase path. Detailed flags are in READINESS_REVIEW.md.

## Current evidence and completion report

57 automated tests pass and production build passes. Browser review verified the short SFK Remodel submission and retained evidence gaps; rendering tests cover SFK in all four markets and all three project types, including initial order-date visibility. Protected review is deployed. No live Monday/Gmail/Drive acceptance has occurred and the master Claude pack has not been directly edited.

Claude should return: source mapping table; existing sender/trigger identification; proposed code/config diff; internal test results with receipts; unresolved decisions; cutover/rollback plan. Preserve the approved design unless an implementation issue needs Oliver's decision.
