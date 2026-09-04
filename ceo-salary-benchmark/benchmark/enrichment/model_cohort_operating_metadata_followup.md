# Predictive-model cohort operating-metadata follow-up

**Review date:** 2026-09-04  
**Scope:** 149 normalized organization groups in the predictive-model cohort

## Purpose

This follow-up rechecked every unresolved work-model and fiscal-sponsor field in
the predictive-model cohort. Compensation values and model results were not used
to classify either field. The same conservative rules in
`organization_operating_metadata_methodology.md` were applied throughout:

- a role-specific remote option, office address, or distributed workforce does
  not by itself establish an organization-wide remote operating model;
- silence about fiscal sponsorship does not establish `false`; and
- grants, partnerships, event sponsorship, internal projects, and historical
  arrangements do not establish a current service that legally or
  administratively hosts outside projects.

## Result

The review covered all 149 cohort groups in three alphabetical shards and
rechecked 194 unresolved organization/field pairs. One classification changed:

- **Open Source Initiative — serves as fiscal sponsor: `true`.** Its FY2024
  Form 990 program-service description states that OSI acted as fiscal sponsoree
  for three active projects—ClearlyDefined, FLOSS Desktops for Kids, and SeaGL.
  OSI's 2021 annual report independently states that it served as fiscal sponsor
  to ClearlyDefined and SeaGL. The current source-native filing is already
  archived at
  `benchmark/sources/native/form990/202533079349301473_public.xml` (program-service
  description, line 93 in the preserved XML).

The other 193 checks remained `unknown`. That is a substantive audit outcome,
not a missing-data fill: the reviewed official filings, organization pages,
careers pages, and reports did not support a current organization-wide
classification under the declared rules.

## Notable retained unknowns

- Current recruitment pages for several organizations describe one remote or
  hybrid role without stating how the organization as a whole operates.
- A historical fiscal-sponsorship arrangement at the Niskanen Center had ended
  when the hosted organization obtained its own exemption; it was not promoted
  to a current `true` value.
- The Climate Center's 2020 filing describes historical sponsorship, but the
  reviewed 2024 filing does not establish that the service remains current.
- Parent, affiliate, or internal-project language for organizations such as the
  National Academy for State Health Policy was not treated as hosting an outside
  project.
- Research!America asks some grant applicants to identify a fiscal sponsor; that
  does not establish that Research!America provides fiscal sponsorship itself.

After integration, the full 201-organization application universe has 115
resolved work-model values (49 remote and 66 in-person/hybrid) and 18 resolved
fiscal-sponsor values (14 yes and four no). All unresolved values remain explicit
`Unknown` categories in the app and predictive model.
