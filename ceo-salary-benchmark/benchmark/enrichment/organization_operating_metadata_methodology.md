# Organization work-model and fiscal-sponsor metadata

## Purpose and scope

This enrichment adds two organization-level fields to every organization that
appears in the benchmark application, including organizations that appear only
in a non-CEO position view:

- whether the organization is remote rather than regularly office/site based;
- whether the organization itself serves as a fiscal sponsor for other
  projects.

The review is independent of compensation. Neither salary nor a model outcome
was used to assign either field.

## Work-model rule

`is_remote=true` requires current or reasonably current organization-wide
evidence that the organization is fully remote, remote-first, or distributed
without a regular shared office. `is_remote=false` requires evidence of a
regular office, physical work site, or hybrid arrangement. `unknown` is used
when sources describe only one role, list an address without describing how
staff work, conflict across time, or do not establish an organization-wide
practice.

The app combines office-based and hybrid organizations as
`In-person / hybrid`, giving one binary comparison plus an explicit `Unknown`
category. More detailed source wording remains in the evidence and caveat
fields.

## Fiscal-sponsor rule

`serves_as_fiscal_sponsor=true` requires evidence that the organization itself
legally or administratively hosts projects operated by other groups. Merely
being fiscally sponsored, receiving or regranting funds, using a host for one
program, acting as a secretariat, or having sponsored projects historically is
not sufficient.

`false` is used only when official legal or program evidence affirmatively
resolves that the organization is sponsored by another entity or otherwise
does not itself provide the service. Because absence is difficult to prove,
most cases without affirmative evidence remain `unknown` rather than `false`.

## Evidence and preservation

Current official organization pages, employer recruitment materials, original
regulatory filings, and signed reports are preferred. Existing locally archived
primary sources are reused where they directly support the claim. Each row
preserves the source URL, local path when available, retrieval date, evidence
sentence, overall confidence, and caveats. Programmatically blocked official
pages are listed separately in
`organization_operating_metadata_manual_requests.csv`.

`model_cohort_operating_metadata_followup.md` documents a second, field-by-field
review of every unresolved value in the predictive-model cohort, including the
strict negative-evidence rules and the one resulting source-backed update.

`scripts/build_organization_operating_metadata.py` validates the complete app
organization universe, controlled values, source fields, and local paths; then
it creates the consolidated table and a file-integrity manifest. The generated
app builder refuses to run when any app organization lacks a row or when the
boolean and displayed work-model categories disagree.

## Modeling and weighting

The Bayesian salary model treats work model and fiscal-sponsor status as
regularized multilevel categorical effects. `Unknown` is modeled as its own
category rather than silently treated as remote or office-based. The app also
allows either field to be used for chart colors, filters, or editable
multiplicative weights. Those optional weights are similarity choices, not
causal claims about compensation.
