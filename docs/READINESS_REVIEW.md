# Subway readiness portal — review build

Prepared 28 October 2026. Calendar days; Europe/London. This branch is for Oliver's review, not a live cutover.

## Open and exercise

Open `/?view=readiness-review` on the branch preview. It is isolated from the existing tracker at `/`.

1. Save a call snapshot on **Burndown room**.
2. Open **Franchisee portal**. Choose UK/IE for English, NL for Dutch or DE for German.
3. Submit a fictional response with one No answer. It is recorded, the reminder planner stops, and the gap remains in the call view.
4. Return to the burndown room and inspect **Since the last call**.
5. Open a restaurant to review SFK table status, PED return/order stages, kit tracking, action owner/due date and the read-only VM notes area. The local note-entry form has been removed; the production source must be a verified Monday Updates feed or dedicated VM notes column. No such source is connected in the review. This is a presentation filter, not an authorization boundary.
6. Open **Emails & timing**, select each language and the final chaser. Verify FZE To, MFP CC, subject, body, plain text and dates.
7. Download review JSON if wanted. Reset only clears the fictional review state in that browser.

The review uses fictional `999990–999997` stores and `.example` addresses. Responses, photos, snapshots and notes are local to that review browser. Do not put real personal data into it. Photo names/counts remain in history. Files are not uploaded in review mode. No real sender, trigger or Monday mutation is invoked by any review action.

## Delivered source

- `src/readiness/ReadinessApp.jsx`: complete review portal/burndown UI and token-bound recipient view.
- `src/readiness/model.js`: shared date, reminder, validation, reschedule and snapshot rules.
- `src/readiness/copy.js`: English, Dutch and German form and email copy.
- `api/readiness.js`: POST-only recipient API; disabled unless explicitly configured. Same-origin check, signed expiring bearer link, server validation, file limits and authenticated coordinator calls.
- `server/operator-service.js`: invitation/link preparation for the reviewed Brain workflow. No public operator endpoint.
- `server/readiness-core.js`: durable request state transitions, reservations, idempotent submission receipts, invalidated old revisions and Sent-only markers.
- `integrations/ReadinessCoordinator.gs` and generated `ReadinessCore.gs`: standalone Google coordinator. Private Drive state/archive and ScriptLock. Existing PED coordinator and existing Brain source are untouched.
- `tests/readiness.test.js`: automated behavior, security and simulated coordinator filing tests. Mocks are not live integration acceptance.

## Readiness rules

Initial request: install −10 calendar days. Chaser 1: −7, if no response. Chaser 2: −5, if no response; store MFP copied. A missing verified FZE address blocks all delivery; missing MFP blocks the final escalation. No guessed/default recipients. Submission stops form chasers even when answers indicate blockers. No reminder once installation has started, completed, been cancelled or postponed.

Late arrivals receive one consolidated current request rather than three overdue messages; at/after −5 it includes the MFP. No second message for the same installation on the same calendar date. Later runs select only the latest due stage. Rescheduling requires source verification, increments the request revision, invalidates the old token, preserves earlier answers in history and resets current readiness. It is blocked while an external operation is uncertain.

The FZE confirms PEDs **received**. Form **returned** and PED **ordered** are separate operational facts from the existing PED process. The portal neither initiates PED orders nor sets their milestones from checklist activity.

## Existing tracker corrections on this branch

Pulls the existing SFK table response from the verified country-specific column IDs. UKI responses can appear for Ireland. Readiness joins are market-scoped (UK/IE share the UKI board); identical store numbers in DE/NL cannot overwrite each other. Latest response uses server creation time and keeps earlier comments. Existing German translation behavior remains.

Legacy UKI responses contain no verified country/installation binding. They remain legacy evidence, not proof of readiness for a rescheduled installation. New submissions retain the exact binding in canonical archive metadata. Production integration must prefer exact request/revision metadata and label legacy responses explicitly. Do not infer an exact job from a store number alone.

## Source-of-truth and migration

The three old **form entry points** can be retired after cutover, while their Monday boards remain the historical response store. One new portal writes through a controlled server adapter to the appropriate board; it does not delete, rename or overwrite historical submissions. Each new submission creates a new response with the same existing form fields and canonical request/revision metadata in a Monday item update. Country routing: UK/IE → 18379251681; DE → 18391075175; NL → 18396748434. Later consolidation into a single board is a separate migration, not required to have a single portal.

Table IDs: UKI `single_select9i5gdtk`; DE `single_selectztongf2`; NL `single_selectojxswdf`. Other new form fields must use their actual IDs; the countries are not identical schemas. Canonical Yes/No/Pending answers are archived without translation loss. Existing binary Monday columns mirror Pending conservatively as No; the original Pending remains in canonical metadata. The form never guesses Not Applicable for unknown installation types.

Photos stay in a private Drive archive with the request binding; the Monday metadata records their IDs. No public evidence links are generated. Existing historical photo fields are preserved. Approve retention and team access before activation.

## Production wiring — exact dependencies, no invented IDs

Keep protected preview access. Do not enable recipient access or send any FZE email until the following are complete:

1. Obtain and inspect the current installed Brain readiness sender and trigger inventory. The actual seven-trigger production Apps Script project is not contained in `install-status-tracker` or `brian-direct-sign`. The existing PED handover explicitly says not to invent its welcome/sender entry points. Do not recreate a parallel sender or install a new scheduled task here.
2. Map exact current Brain item → country install item, install date/type, FZE and store-specific MFP. Preserve aliases UK/GB and IE/IRL. Verify every live mapping and recipient against source. `RD_SOURCE_MAP` has no defaults: `brainBoardId`, `installLinkColumn`, `countryColumn`, `fzeEmailColumn`, `mfpEmailColumn`, `installDateColumn` must all be supplied from current source. Known Brain ID is 18432365825; Sign Up relationship `board_relation_mm7s293s` is NOT assumed to be the install-item relationship.
3. Deploy the readiness coordinator in its **own** Google Apps Script project. Do not replace the installed FreedomPay/PED `doPost` or reuse its credential namespace. Add the two .gs files. Create private state/archive folders in the existing account; no paid storage.
4. Set private Script Properties: `RD_RPC_SECRET` (at least 32 random characters), `RD_STATE_FOLDER_ID`, `RD_ARCHIVE_FOLDER_ID`, `RD_MONDAY_TOKEN`, reviewed `RD_SOURCE_MAP`. All capabilities default off. `RD_ENABLED=YES` enables authenticated RPC, `RD_OPERATOR_ENABLED=YES` allows reviewed issue/reschedule/note operations, `RD_WRITES_APPROVED=YES` permits response filing. `RD_SEND_APPROVED` remains unset through review.
5. Set Vercel runtime values: `READINESS_COORDINATOR_URL` (standalone Apps Script /exec), `READINESS_RPC_SECRET`, separate `READINESS_LINK_SECRET` (at least 32 random characters), `READINESS_PORTAL_ORIGIN` (exact HTTPS origin). `READINESS_BACKEND_ENABLED` stays unset until supervised acceptance. Secrets are never committed or requested in chat.
6. Call `prepareInvitation` server-side from the existing verified Brain process. The coordinator rechecks native store/board/date and the exact Brain relationship/recipients; it does not trust browser identity. A recipient cannot change store/country/date by editing the URL or form. Credentials travel in a URL fragment and the Authorization header, not URL query strings. Links expire two days after installation, and current native installation status/date is rechecked on opening, submission and dispatch.
7. Integrate `RD_dispatchWithExistingSender(recordId, portalUrl, sender)` into the existing readiness schedule. The adapter must use the existing sender and reconcile its exact Gmail Sent receipt. It must return `{sentMessageId,receiptVerified:true}` only when independently confirmed Sent. A draft, Gmail API attempt or prepared copy is not Sent. No trigger or delivery transport has been installed by this branch.
8. Wire the full burndown view to existing operational sources. Review edits are deliberately fictional/local. Production PED return/order must use the already verified PED milestones; Brian must supply his shipping field/link mapping. Use an authenticated internal service for notes/snapshots; local review filtering is not production access control.
9. Test internal requests for UK, IE, NL and DE, photos, duplicated concurrent submission, source date/status changes, missing MFP, delayed sender outcome and reschedule. Verify private evidence and source/recipient access. Approve the actual email copy and cutover diff.
10. Reconcile legacy responses/open reminders, switch the existing readiness sender to the new link and close old forms to new submissions. Retain all historical responses and existing PED, welcome, H&K and confirmed-install workflows.

## Reconciliation and rollback

Every external filing is preceded by a durable reservation. The coordinator saves archive and Monday item receipts before proceeding. If a timeout/failure occurs, the pending phase blocks retries instead of silently creating another response. Operator recovery must inspect the exact Drive files and Monday item/update before clearing/replaying. This deliberately requires a human reconciliation tool/process; no automatic reset of uncertain operations is provided.

For an issue: unset `RD_SEND_APPROVED`, `READINESS_BACKEND_ENABLED` and `RD_WRITES_APPROVED`; pause only the reviewed readiness integration. Keep evidence and reservations. Do not restart legacy chasers blindly: reconcile what was already sent and submitted first. The original tracker and current forms are untouched on main, so closing this PR removes the preview with no live migration to undo.

## Validation status

23 automated tests passed, including simulated end-to-end Drive/Monday filing and failure-after-item-creation duplicate prevention. Production build passed. Browser checks: English submission with No creates a visible blocker; call snapshot records the readiness change; Dutch SFK and German non-SFK pages select the correct questions/language; historic FZE comment remains visible. These checks do not certify live Google/Monday/Gmail setup.

## Oliver feedback — 28 October

Live, Partially completed and Aborted installations are retained as explicit outcomes with an All outcomes filter and a partial/aborted count. Do not remove these items just because preparation is complete or the attempt failed. Installed - Not Live and Install Revisit Needed map to Partially completed before any success matching. Reminder chasing stops for attempted/completed/aborted outcomes; operational follow-up stays visible. Native labels must be preserved alongside the normalized outcome during production wiring.

VM notes are no longer editable in the review. There is no existing dedicated VM notes column on the four Install→BAU boards inspected. The Brain has Apex Comments / Exception (`long_text_mm7fs00x`), which must NOT be silently relabelled VM notes. Use either the exact installation item's Monday Updates thread (with an explicit shared visibility convention) or a new dedicated VM notes column after source choice. Keep FZE comments independent.

Branding: supplied Subway and VM logo assets retained without CSS recolouring. The approved VM designer exists in Claude; its palette/fonts/tokens are NOT in the current repository or handover. Full brand approval is therefore pending that source; the review's current palette is not asserted to be official VM branding.

## Expanded readiness and mandatory acknowledgement — 28 October

Installation and **handover only**. The form does not offer or promise staff instruction services.

Schema v2 adds:
- SFK table ordered, physically in store, assembled/positioned, delivery-date known/unknown and expected date.
- Existing trading / new opening / remodel context. Opening/reopening and required trading/go-live dates are separate from the installation date. FZE corrections are proposals, never silent changes to the booking. Opening before installation, go-live before installation, table delivery on/after installation and late building works are explicit gaps.
- Power/data installed and tested, correct PED quantity, kit arrival at the correct restaurant, complete/undamaged/secure kit, finished building works, permissions, access/keys/hours, internet and network preparation, and a named contact available for installation/handover.
- Contact name/mobile, access instructions, outstanding work, responsible owner, resolution-date known/unknown and expected resolution. Every applicable question is mandatory. Free-text fields require an answer (use None where appropriate); dates require an explicit unknown/not-yet answer if unavailable. Conditional questions that do not apply are not shown or required.
- Evidence categories: table/area, power/data, PEDs, and kit where missing/damaged. Each applicable evidence question requires either an attached JPEG/PNG or an explicit unavailable answer and explanation. Up to four photos, one per category, 700 KB each; unavailable required evidence remains a gap.
- A separate mandatory acknowledgement, unchecked by default, in English/Dutch/German. It confirms applicable guides have been read, answers are accurate to the FZE's knowledge, an unprepared installation may be delayed/aborted, revisit/corrective-work charges may apply under the agreed terms, and changes must be reported. It does not invent a tariff or automatically levy charges. Exact native-language wording, version `readiness-ack-v1`, country, install type and server timestamp are preserved in the submission archive/history and Monday metadata. Existing agreements remain the charging basis. Wording is available in `src/readiness/extra-copy.js` for Oliver's review.

VM readiness review is separate from FZE submission. Zero FZE gaps produces **FZE says ready — VM review pending**. Approval requires the expanded response, all required evidence, no outstanding gaps and a named VM reviewer. The approval is tied to the current installation revision and submission count; a new response/date revision invalidates it. Review controls are demonstrated in the internal fictional store detail, not on the FZE form. Production coordinator supports a protected `review` transition; production internal authentication remains a wiring dependency. Legacy responses are retained as evidence but cannot pass the expanded readiness approval check.

Validation: 30 automated tests passed. Browser-tested an entirely answered response with the acknowledgement unchecked (submission blocked), then checked (submission saved with gaps and a recorded acknowledgement version/time). Production build passed. External sending/writes remain disabled.

## Explicit table order and delivery questions
SFK section now asks: Has the table been ordered? (Yes/No). If Yes, the actual order date is mandatory and cannot be in the future. Has the table been delivered to the restaurant? (Yes/No). If No, choose Confirmed delivery date, Estimated delivery date (ETA), or No delivery date/ETA yet. Confirmed/estimated dates are mandatory when selected; no-date remains a gap requiring follow-up. Delivered tables retain the assembly/position question and evidence checks. The call table and store detail show the order date, delivery status and date/ETA. Translated consistently into Dutch/German. 33 automated tests passed.

NRO and Remodel date wording is now explicit throughout the form: NRO asks for the planned store opening date; Remodel asks for the planned store reopening date, with matching known-date, confirmation and source-date labels in English, Dutch and German. Existing trading stores skip these questions. Installation and required go-live remain separate. The recorded date field stays `openingDate` with `storeType` distinguishing its meaning.

## Store-specific project binding — supersedes the earlier FZE project selector

The FZE no longer selects NRO/Remodel/trading. Each server record now requires a verified `binding.projectType` (`new`, `remodel`, `trading`) independently of `binding.installType` (`sfk`, `other`). The respondent sees a read-only recorded type and the automatically relevant date/equipment questions. The internal preview restaurant picker selects fictional fixtures of each type; it is not part of the live recipient page.

Verified Monday schema inspected on 28 October:
- Brain 18432365825: Store Opening Type `color_mm7f7r9d`; Kiosk Type / Variant `dropdown_mm7ftf76`; exact Sign Up relationship `board_relation_mm7s293s`.
- Linked Sign Up 5678025992: Store Opening Type `dup__of_store_type5__1`; Project Type `label7` when populated.

The coordinator checks the exact one-item Brain→Sign Up relationship. Brain and Sign Up opening types must both be supported and agree; a populated Sign Up Project Type must agree too. Accepted explicit aliases: NRO / New Restaurant Opening / NRO - SW Special; Remodel / Re-Model / Remodel - SW Special; Retrofit / Retro - Fresh Forward / Retro - Metro. Blank, TBD, Other, Relocation, mixed values and equipment-only labels are held for review. They never default to a trading store. DE's country Type field mixes SFK/D2.0 with project labels and is therefore not used as a project-type fallback. Kiosk variant is independently mapped to SFK or other using verified Brain dropdown labels; unknown variants block invitation.

Server checks run at issuance, opening, submission and dispatch. Client-side storeType changes are rejected; an omitted value is supplied from the server binding. URL country/type parameters cannot override the signed record. Other existing Brain source mappings (exact install relationship/date, verified FZE/MFP recipients) remain mandatory and unresolved fields are not guessed.

A translated **This project type is not correct — contact the team** route collects a mandatory explanation without requiring completion of the readiness form. In production adapter code it records a dated issue on the bound Monday installation Updates thread, retains the assigned project type and puts readiness submission/future reminders on hold. Durable flagging precedes the Monday write. An uncertain write stays held for reconciliation and is not blindly repeated. No FZE can edit the authoritative type. In review it affects fictional browser-local data only.

After the team corrects Monday, the protected `rebindContext` transition independently verifies the revised sources, preserves previous context/answers/issue in history, replaces the token, increments the revision and clears current readiness/approval. It cannot move the request to another installation. `prepareInvitation` uses this transition for revisions after the first. The existing schedule and recipient process must distribute the replacement link; no new sender is installed here.

Validation: 41 tests passed, including missing/conflicting type sources, server refusal of respondent type changes, mismatch-report idempotency, one-time Monday update, current-source rechecks, link invalidation and immutable installation identity. Browser verified read-only NRO context, Remodel + SFK questions and a reported discrepancy holding the form. Production build passed; live activation is still disabled.

## SFK tables on every project journey
The SFK table section is controlled solely by the verified kiosk/equipment scope, independently of NRO, Remodel or Retrofit. Every SFK journey shows the same mandatory order/date/delivered/ETA/assembly questions. A highlighted SFK table section makes this visible in the form. Non-SFK journeys omit it. Rendering tests cover all four markets and all three project contexts, including required order/date and delivery ETA controls.

Validation of this rule: 53 tests passed, including actual component rendering for every combination of UK/IE/NL/DE and NRO/Remodel/trading, with SFK questions present and non-SFK questions omitted. Production build passed.

## Short confirmation journey and hardware wording — 28 October
The earlier expanded checklist was too long for a two-minute target. The default FZE journey now uses five explicit grouped confirmations: power/data/network, hardware delivery/condition/storage, correct PED quantity received, floorplan/area/building works, and team/access/permits/handover. Yes confirms all facts in the visible statement. No/not yet expands the individual checks so the actual gap is preserved. The server expands/validates these confirmations into the same canonical answers; it does not infer readiness from an empty field. Contradictory group/detailed answers and missing confirmations are rejected.

The SFK table sequence stays explicit and mandatory on all SFK scopes. Recognized references now include SFK in longer labels, Small Format Kiosk/Kiosks and Small Form Factor. Verified Brain kiosk variant and relevant linked Sign Up kiosk/layout references participate in SFK scope, independently of project type; unknown non-SFK equipment still blocks rather than guessing.

All visible English kit wording is hardware, including the call table, tracking links and exception/photo labels. Dutch/German hardware labels are aligned. Internal `kit*` field/category identifiers remain unchanged for archive and API compatibility.

The form retains mandatory date confirmation and contacts. Outstanding-work free text appears only for exceptions; an explicit no-other-issues response removes the need to type None. Photo delivery is a mandatory choice: attach now, already shared, or provide separately. Choosing shared/later is not proof of evidence: required photos remain gaps until VM verifies/links them, so no automatic VM approval results. The form can be submitted without immediate uploads. Guides and acknowledgement remain mandatory; the two-minute goal concerns confirming readiness after reading the applicable guides, not reading all guides within two minutes.

57 tests passed; production build passed. Browser checked an SFK Remodel ready-store path with the short confirmations, mandatory dates/contact/acknowledgement and photos-to-follow: submission succeeded without irrelevant exception fields; evidence gaps remained. Actual FZE completion time is a target requiring a timed usability check, not a measured guarantee. Production activation remains off.
