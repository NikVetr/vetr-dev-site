# EA-core candidate screening

`ea_core_candidate_screening.csv` records a pay-blind disposition for each of the 31 frozen candidates coded EA-core before compensation review (`screening_scope = ea_core`). Twenty-three had no completed verification; the peer log listed them only as "not promoted during this pass". Eight carried first-expansion structural dispositions, which are restated with their frozen reasons. Two closely related EA-adjacent candidates with pending first-expansion structure checks, Machine Intelligence Research Institute and Animal Charity Evaluators, were reviewed the same way (`screening_scope = requested_review`).

## Method

The screen used only non-pay facts: legal entity and country, IRS e-file availability by the 2026-08-17 cutoff, form type, Part I scale, Part VII names, titles and hours, grant share of expenses, and fiscal-sponsor or project status. No compensation field was viewed or recorded. The original protocol's rules decide each case: one full-year, full-time, solo organization-wide chief executive of an independent US Form 990 filer; no interim or transition year; non-US organizations analyzed separately; grantmaking-dominated, umbrella and project structures excluded from the main analysis.

## Results

- Thirteen are non-US entities without a US Form 990 filer.
- Three are projects without an employing entity of their own, and Effective Ventures Foundation USA is an umbrella host.
- Six keep their frozen structural classifications (grantmaking, pass-through, donor-advisory or private-foundation structures).
- Three were selected in the frozen first expansion but are below the USD 3M main-analysis limit and have no collected compensation observation.
- Open Philanthropy's Form 990 entity reports its CEO at 2 hours per week; Giving What We Can USA changed to an interim chief executive during 2024; Giving Green's only filing is an empty initial Form 990-EZ; the Centre for Effective Altruism's new US entity has no public filing yet.
- **Berkeley Existential Risk Initiative is admitted.** Its 2024 filing contains an Executive Director transition, so the 2023 filing is used under the prior-year-due-transition rule already applied to Population Reference Bureau, ideas42 and Technical Assistance Collaborative. That filing's Part VII lists a 40-hour solo Executive Director as principal officer; the board chair holds the President title at 1 hour. The disposition was recorded before compensation was extracted. Schedule J has no row for the Executive Director, so the observation is cash-only.

Of the two requested reviews, Machine Intelligence Research Institute has no clean observation: its 2024 filing names a full-time CEO but remains under the compensation-expansion review's source-integrity quarantine for inconsistently classified compensation components, and 2023 was a leadership-transition year. Animal Charity Evaluators keeps its frozen structural classification: grants are about three quarters of expenses and Part VII lists only board members.

Berkeley Existential Risk Initiative is therefore the one EA-core default observation, and it does not report Schedule J base. The decision-range report shows EA-adjacent and functional-only peers side by side because the base-pay evidence contains no EA-core organization.

The admitted observation is defined in `frozen_candidate_followup_compensation.csv`; `scripts/build_app_data.py` checks every reviewed value against the saved IRS XML.
