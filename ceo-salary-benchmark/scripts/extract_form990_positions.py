#!/usr/bin/env python3
"""Extract auditable non-CEO compensation observations from cached Form 990 XML.

The existing CEO benchmark remains the authoritative CEO data layer. This script
extracts every Part VII, Section A row for provenance, joins Schedule J by exact
person name, and marks only reviewed non-CEO role families as catalog-eligible.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
BENCHMARK = ROOT / "benchmark"
DELIVERABLES = BENCHMARK / "deliverables"
ENRICHMENT = BENCHMARK / "enrichment"
MANIFEST_PATH = DELIVERABLES / "source_acquisition_manifest.csv"
VALIDATED_PATH = DELIVERABLES / "validated_form990_compensation.csv"
REFERENCE_PATH = DELIVERABLES / "expanded_reference_set.csv"
CATEGORY_PATH = DELIVERABLES / "category_explainers" / "organization_category_rationale.csv"
CPI_PATH = BENCHMARK / "data" / "cpi_u.csv"
OBSERVATIONS_PATH = ENRICHMENT / "form990_position_observations.csv"
TAXONOMY_PATH = ENRICHMENT / "form990_position_taxonomy.csv"
REPORT_PATH = ENRICHMENT / "form990_position_methodology.md"
SUPPORTING_SOURCES_PATH = ENRICHMENT / "form990_position_supporting_sources.csv"
POSITION_CATALOG_PATH = ENRICHMENT / "form990_benchmark_position_catalog.csv"

EXPECTED_FORM990_COUNT = 136
EXPECTED_NON_CEO_CATALOG_COUNT = 989
EXPECTED_ROLE_ELIGIBLE_COUNT = 778
EXPECTED_DEFAULT_INCLUDED_COUNT = 755
RP_SOURCE_ID = "SRC-990-RP-REFERENCE"


def normalize_ea_affinity(value: object) -> str:
    """Apply the current two-level analytical taxonomy to derived rows."""
    label = str(value or "").strip()
    return "EA-adjacent" if label.casefold() in {"ea-core", "ea core"} else label


POSITION_SUPPORTING_SOURCES = (
    {
        "source_id": "SRC-POSITION-BULLETIN-2023-ANNUAL-REPORT",
        "observation_id": "SRC-990-EXT-BULLETIN-OF-THE-ATOMIC-SCIENTISTS::johnpope",
        "organization": "Bulletin of the Atomic Scientists",
        "evidence_use": "Expands `Chief Aud. Officer` to `Chief Audience Officer` under Communications and Marketing.",
        "local_path": "benchmark/sources/native/supporting/2023-Bulletin-Annual-Report.pdf",
        "canonical_url": "https://thebulletin.org/wp-content/uploads/2024/05/2023-Bulletin-Annual-Report.pdf",
        "sha256": "cd80e7198b0f2afdcecb1e963b5698ec2b5c603a28fdcc675d39caa63c423304",
        "validation_status": "official_publication_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-AIC-KIMBERLY-SERRANO",
        "observation_id": "SRC-990-EXT-AMERICAN-IMMIGRATION-COUNCIL::kimberlyserrano",
        "organization": "American Immigration Council",
        "evidence_use": "Identifies Serrano as director of the Center for Inclusion and Belonging, a programmatic center rather than an internal HR function.",
        "local_path": "benchmark/sources/native/supporting/position_classification/aic-kimberly-serrano-center-director.html",
        "canonical_url": "https://www.americanimmigrationcouncil.org/press-release/american-immigration-council-welcomes-new-chief-development-officer-and-new-director-center/",
        "sha256": "8743ce0a2a76514cd39ae0caf8d6d2bf3415fe9f02f21d5a814ee1b60de8a966",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-SFC-SAGE-SHARP",
        "observation_id": "SRC-990-EXT-SOFTWARE-FREEDOM-CONSERVANCY::sagesharp",
        "organization": "Software Freedom Conservancy",
        "evidence_use": "Explains that Sharp worked full-time as an Outreachy internship organizer, supporting Programs primary and People secondary.",
        "local_path": "benchmark/sources/native/supporting/position_classification/sfc-sage-sharp-outreachy.html",
        "canonical_url": "https://sfconservancy.org/news/2020/dec/02/sharp-newest-employee/",
        "sha256": "b511b956ebace0f5278358d0aad22ab3489c7c53e0b7ff455319385bccc51552",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-SFC-BRADLEY-KUHN",
        "observation_id": "SRC-990-EXT-SOFTWARE-FREEDOM-CONSERVANCY::bradleymkuhn",
        "organization": "Software Freedom Conservancy",
        "evidence_use": "Separates Kuhn's board Director-at-large role from his compensated staff role as Policy Fellow and Hacker-in-Residence; `Director` is not part of the staff title.",
        "local_path": "benchmark/sources/native/supporting/position_classification/sfc-bradley-kuhn-board.html",
        "canonical_url": "https://sfconservancy.org/about/board/",
        "sha256": "dd06bbedb9710f425427db4acaf631df161e062ce7cd3b0ecd046724ffa198c6",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-LMH-DIVYA-NAIR",
        "observation_id": "SRC-990-EXT-LAST-MILE-HEALTH::divyanair",
        "organization": "Last Mile Health",
        "evidence_use": "Documents that Chief Technical Officer leads health-systems strengthening and global monitoring, evaluation, research, and learning; this is not the Chief Technology Officer benchmark.",
        "local_path": "benchmark/sources/native/supporting/position_classification/last-mile-health-divya-nair.html",
        "canonical_url": "https://lastmilehealth.org/profiles/divya-nair/",
        "sha256": "cc5170483b7db574b9ba56a45d3098d046e0e7d34a84dd37f9588a9daf4bc616",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-RFA-LISA-MORRISON-BUTLER",
        "observation_id": "SRC-990-EXT-RESULTS-FOR-AMERICA::lisavmorrisonbutler",
        "organization": "Results for America",
        "evidence_use": "Expands the filing acronym `CIO` to Chief Impact Officer rather than Chief Information Officer.",
        "local_path": "benchmark/sources/native/supporting/position_classification/results-for-america-lisa-morrison-butler.html",
        "canonical_url": "https://results4america.org/people/lisa-morrison-butler/",
        "sha256": "ceddb5fb9be94d637143abbae523c94abd701bbf6708a4870297dbc5f46369f0",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-CRFB-ADAM-SHIFRISS",
        "observation_id": "SRC-990-EXT-COMMITTEE-FOR-A-RESPONSIBLE-FEDERAL-BUDGET::adamshifrisssenior",
        "organization": "Committee for a Responsible Federal Budget",
        "evidence_use": "Corroborates that `Senior` belongs to Shifriss's job title: Senior Director of Legislative Strategy.",
        "local_path": "benchmark/sources/native/supporting/position_classification/crfb-adam-shifriss.html",
        "canonical_url": "https://www.crfb.org/biography/staff/adam-shifriss",
        "sha256": "6bda95ce963e7d96251a4543aeb71a2292a2244c1d0d4ce1f7df469b1661b199",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-CRFB-SIMONE-FRANK",
        "observation_id": "SRC-990-EXT-COMMITTEE-FOR-A-RESPONSIBLE-FEDERAL-BUDGET::simonegfranksenior",
        "organization": "Committee for a Responsible Federal Budget",
        "evidence_use": "Corroborates that `Senior` belongs to Frank's job title: Senior Advisor, Finance and Operations.",
        "local_path": "benchmark/sources/native/supporting/position_classification/crfb-staff-members.html",
        "canonical_url": "https://www.crfb.org/staff-members",
        "sha256": "571f021d12a88a0fce1d8b8b7b4fae27d8f6325e23bb7ff44971d927bd3a43d9",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-VERA-JAMES-PARSONS",
        "observation_id": "SRC-990-EXT-VERA-INSTITUTE-OF-JUSTICE::jamesparsonsprogram",
        "organization": "Vera Institute of Justice",
        "evidence_use": "Corroborates Jim/James Parsons's identity and program/research-director history; the filing's misplaced `PROGRAM` token is restored to the title.",
        "local_path": "benchmark/sources/native/supporting/position_classification/vera-jim-parsons.html",
        "canonical_url": "https://www.vera.org/newsroom/vera-institute-names-new-research-director",
        "sha256": "7498a51aa3e8817e3f5faec1b711f3a20472f38e1fa054b59e4697e75d38999e",
        "validation_status": "official_organization_page_hash_verified_identity_plus_source_internal_title_spill",
    },
    {
        "source_id": "SRC-POSITION-C2ES-VERENA-RADULOVIC",
        "observation_id": "SRC-990-EXT-CENTER-FOR-CLIMATE-AND-ENERGY-SOLUTIONS::verenaradulovic",
        "organization": "Center for Climate and Energy Solutions",
        "evidence_use": "Describes management of C2ES business-climate programs and policy work, not a communications-only engagement role.",
        "local_path": "benchmark/sources/native/supporting/position_classification/c2es-verena-radulovic.html",
        "canonical_url": "https://www.c2es.org/profile/verena-radulovic/",
        "sha256": "566d1c69362a649761f9bbd1a7f237bea57bd228a202d856bb6556ee194c4978",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-GFI-CAROLINE-BUSHNELL",
        "observation_id": "SRC-990-EXT-GOOD-FOOD-INSTITUTE::carolinebushnell",
        "organization": "Good Food Institute",
        "evidence_use": "Describes leadership of GFI's field-facing corporate engagement program to catalyze alternative-protein innovation and investment.",
        "local_path": "benchmark/sources/native/supporting/position_classification/gfi-caroline-bushnell.html",
        "canonical_url": "https://gfi.org/team/caroline-bushnell/",
        "sha256": "0c3fe89f366f6e166be6a2b1504bf69fed8a8fda8509bad75054bfff8823b8f2",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-IST-ELIZABETH-VISH",
        "observation_id": "SRC-990-EXT-INSTITUTE-FOR-SECURITY-AND-TECHNOLOGY::elizabethvish",
        "organization": "Institute for Security and Technology",
        "evidence_use": "Documents Vish's cyber foreign-policy and capacity-building portfolio, supporting Policy primary and Programs secondary.",
        "local_path": "benchmark/sources/native/supporting/position_classification/ist-elizabeth-vish.html",
        "canonical_url": "https://securityandtechnology.org/person/elizabeth-vish/",
        "sha256": "054d4b3ff6937d2a2e94c9c57c11727280c132c029a5fc9ea01223e054729cdf",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-PAI-CLAIRE-LEIBOWICZ",
        "observation_id": "SRC-990-EXT-PARTNERSHIP-ON-AI::claireleibowicz",
        "organization": "Partnership on AI",
        "evidence_use": "Shows Leibowicz leading PAI's AI and Media Integrity framework and multistakeholder program work.",
        "local_path": "benchmark/sources/native/supporting/position_classification/pai-claire-leibowicz-framework.html",
        "canonical_url": "https://partnershiponai.org/industry-leaders-launch-framework-for-responsible-use-of-ai-generated-media/",
        "sha256": "6ad162c59a027ff1dbc1454709684523fbd2578205567dd492e748e67012d1b0",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-PAI-FELECIA-WEBB",
        "observation_id": "SRC-990-EXT-PARTNERSHIP-ON-AI::feleciawebb",
        "organization": "Partnership on AI",
        "evidence_use": "Expands CSOPP to Chief Strategy Officer, Philanthropy and Partnerships.",
        "local_path": "benchmark/sources/native/supporting/position_classification/pai-felecia-webb-csopp.html",
        "canonical_url": "https://partnershiponai.org/felecia-webb-joins-pai-as-chief-strategy-officer-philanthropy-and-partnerships/",
        "sha256": "ec4d5f7df4b81fb36e9fd1350d319d2089d93d98d6ed77eb64b1d501e226a350",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-PAI-STEPHANIE-BELL",
        "observation_id": "SRC-990-EXT-PARTNERSHIP-ON-AI::stephaniebell",
        "organization": "Partnership on AI",
        "evidence_use": "Expands CPIO to Chief Programs and Insights Officer.",
        "local_path": "benchmark/sources/native/supporting/position_classification/pai-stephanie-bell-cpio.html",
        "canonical_url": "https://partnershiponai.org/partnership-on-ai-strengthens-team-with-respected-leaders/",
        "sha256": "4fc506554453cb02388efe24ce5b0df14af7e1a10077fbd546a4602bb14285e8",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-NEW-ROOTS-JESSE-TANDLER",
        "observation_id": "SRC-990-EXT-NEW-ROOTS-INSTITUTE::jessetandlermanaging",
        "organization": "New Roots Institute",
        "evidence_use": "Confirms Jesse Tandler's Managing Director title, which is split across the filing's PersonNm and TitleTxt fields.",
        "local_path": "benchmark/sources/native/supporting/position_classification/new-roots-jesse-tandler.html",
        "canonical_url": "https://www.newrootsinstitute.org/our-team/jesse-tandler",
        "sha256": "090fd207cf993913f0e5561fe21611451b1b5802afab833704afac3510700e53",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-VILLAGEREACH-OLIVIER-DEFAWE",
        "observation_id": "SRC-990-EXT-VILLAGEREACH::olivierdefawe",
        "organization": "VillageReach",
        "evidence_use": "Identifies Defawe as the program lead for outsourced drone transport and related technical assistance.",
        "local_path": "benchmark/sources/native/supporting/position_classification/villagereach-outsourced-drone-transport.html",
        "canonical_url": "https://www.villagereach.org/project/outsourced-drone-transport/",
        "sha256": "dea4d2a662532aa87c030e28de52f4e43615f1dbef63823208df2963f439dd7f",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-THL-KAREN-NILSEN",
        "observation_id": "SRC-990-EXT-THE-HUMANE-LEAGUE::karennilsen",
        "organization": "The Humane League",
        "evidence_use": "Explains Nilsen's communications and engagement remit across public relations, studios, organizing, and digital engagement.",
        "local_path": "benchmark/sources/native/supporting/position_classification/humane-league-leadership.html",
        "canonical_url": "https://thehumaneleague.org/our-leadership",
        "sha256": "186f218f54a9d353d16270460a0c4fd4038a5c7095fc35bfefebff771664aa49",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-FAS-ERICA-GOLDMAN",
        "observation_id": "SRC-990-EXT-FEDERATION-OF-AMERICAN-SCIENTISTS::ericagoldman",
        "organization": "Federation of American Scientists",
        "evidence_use": "Confirms that Goldman's Director of Science Policy role leads science-policy strategy, with research retained as secondary.",
        "local_path": "benchmark/sources/native/supporting/position_classification/fas-expanded-leadership-policy.html",
        "canonical_url": "https://fas.org/publication/fas-welcomes-expanded-leadership-in-key-policy-areas/",
        "sha256": "718a3c12f82e3ea88ee1045a58a81a84000d4d3fa47a9fc0d9944976ab8b062c",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-CHICAGO-COUNCIL-DINA-SMELTZ",
        "observation_id": "SRC-990-EXT-CHICAGO-COUNCIL-ON-GLOBAL-AFFAIRS::dinasmeltz",
        "organization": "Chicago Council on Global Affairs",
        "evidence_use": "Documents Smeltz's public-opinion survey research leadership, with foreign policy retained as secondary.",
        "local_path": "benchmark/sources/native/supporting/position_classification/chicago-council-2021-public-opinion.pdf",
        "canonical_url": "https://www.thechicagocouncil.org/sites/default/files/2021-10/ccs2021_fpmc.pdf",
        "sha256": "c0a9eb280df4065ba0c7ae4b12060fd6ed301f50142bd1b5f5ef72d2be2b4244",
        "validation_status": "official_publication_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-ELI-RACHEL-JEAN-BAPTISTE",
        "observation_id": "SRC-990-EXT-ENVIRONMENTAL-LAW-INSTITUTE::racheljeanbaptiste",
        "organization": "Environmental Law Institute",
        "evidence_use": "Confirms responsibility for ELI's print and online publications, supporting Communications primary.",
        "local_path": "benchmark/sources/native/supporting/position_classification/eli-rachel-jean-baptiste.html",
        "canonical_url": "https://www.eli.org/bios/rachel-jean-baptiste",
        "sha256": "15c8c93e5c98e3961aa3b14b937448c4b6b5f8dd97d11a4f1d9c75a4f084c07b",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-EVIDENCE-ACTION-GRACE-HOLLISTER",
        "observation_id": "SRC-990-EXT-EVIDENCE-ACTION::gracehollister",
        "organization": "Evidence Action",
        "evidence_use": "Describes Hollister's combined global communications, fundraising, and donor-relations remit.",
        "local_path": "benchmark/sources/native/supporting/position_classification/evidence-action-safe-water-webinar.html",
        "canonical_url": "https://www.evidenceaction.org/safe-water-now-webinar",
        "sha256": "a378a1ddb31b13129ce6f47eedb7ec17c87c9c4a6238ebe396f25a864cd9c4a0",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-CLASP-EDDIE-MARTIN",
        "observation_id": "SRC-990-EXT-CENTER-FOR-LAW-AND-SOCIAL-POLICY::eddiemartinjr",
        "organization": "Center for Law and Social Policy",
        "evidence_use": "Documents Martin's organization-wide racial-equity strategy and planning across communications, personnel, policy, and engagement.",
        "local_path": "benchmark/sources/native/supporting/position_classification/clasp-eddie-martin.html",
        "canonical_url": "https://www.clasp.org/profile/eddie-martin-jr/",
        "sha256": "0c169e427d1be4bec88034097791656d9149564d235b7d5f3d9f37f2064d3f08",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-NIA-ERIK-COTHRON",
        "observation_id": "SRC-990-EXT3-NUCLEAR-INNOVATION-ALLIANCE::erikcothron",
        "organization": "Nuclear Innovation Alliance",
        "evidence_use": "Expands the filing typo `REASEARCH` and describes Cothron's technical and policy analysis work.",
        "local_path": "benchmark/sources/native/supporting/position_classification/nia-team.html",
        "canonical_url": "https://www.nuclearinnovationalliance.org/nia-staff",
        "sha256": "b8d687efb75882503fd7431d5633fa5bf39d53acdfa0789684fa5c4531b2e7f3",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-PROJECT-DRAWDOWN-MATT-SCOTT",
        "observation_id": "SRC-990-EXT-PROJECT-DRAWDOWN::matthewscott",
        "organization": "Project Drawdown",
        "evidence_use": "Expands the truncated `ENGAGEMENT D` filing title to Director of Storytelling and Engagement, supporting Communications primary.",
        "local_path": "benchmark/sources/native/supporting/position_classification/project-drawdown-matt-scott.html",
        "canonical_url": "https://drawdown.org/staff/matt-scott",
        "sha256": "6df75dbd7917a2834199aeea18c3a5f22e94abfb8c142184d99e03cc3ebe7dae",
        "validation_status": "official_organization_page_hash_verified",
    },
    {
        "source_id": "SRC-POSITION-RP-CAROLYN-FOOTITT-TRANSITION",
        "observation_id": "SRC-990-RP-REFERENCE::carolynfootitt",
        "organization": "Rethink Priorities",
        "evidence_use": "RP's 2025 report describes Carolyn Footitt's permanent COO appointment as a 2025 leadership transition, so her 2024 filing amount is not treated as full-year incumbent COO compensation.",
        "local_path": "benchmark/sources/native/supporting/position_classification/rp-2025-results-2026-plans.pdf",
        "canonical_url": "https://rethinkpriorities.org/wp-content/uploads/2025/11/Rethink-Priorities-2025-Results-2026-Plans-and-Funding-Needs.pdf",
        "sha256": "e3e05b09687154273609f35c2157b4ea7a7ea26042f38d959d931a3b0ebfc65e",
        "validation_status": "official_publication_hash_verified_page_8",
    },
)
POSITION_SUPPORTING_SOURCE_FIELDS = (
    "source_id",
    "observation_id",
    "organization",
    "evidence_use",
    "local_path",
    "canonical_url",
    "sha256",
    "validation_status",
)
POSITION_SUPPORTING_SOURCE_BY_OBSERVATION = {
    row["observation_id"]: row for row in POSITION_SUPPORTING_SOURCES
}
PUBLIC_FAMILIES = (
    "operations",
    "finance",
    "chief_of_staff",
    "research",
    "programs",
    "development",
    "policy",
    "communications",
    "legal",
    "people",
    "technology",
    "strategy",
    "general_leadership",
)

# Public position benchmarks are exact or standardized job titles, not broad
# functional areas.  Functional family remains an independent filter.  Sparse
# chief-role keys are still classified for auditability, but the generated
# catalog marks them hidden until at least eight organizations are available.
BENCHMARK_POSITIONS = (
    ("vice_president", "Vice President", "Vice President", "Executive leadership", "Vice-president titles not assigned to a more specific C-suite role."),
    ("program_director", "Program Director", "Program Director", "Directors", "Program Director, Director of Programs, and directors of named program portfolios."),
    ("managing_director", "Managing Director", "Managing Director", "Executive leadership", "Managing Director titles, excluding assistant and hybrid C-suite titles."),
    ("coo", "COO", "COO", "C-suite", "Chief Operating Officer and standard COO aliases."),
    ("senior_vice_president", "Senior Vice President", "Senior Vice President", "Executive leadership", "Senior Vice President, SVP, and Senior VP aliases."),
    ("development_director", "Development / Fundraising Director", "Development Director", "Directors", "Director-level development, fundraising, philanthropy, and advancement roles."),
    ("policy_director", "Policy / Advocacy Director", "Policy Director", "Directors", "Director-level policy, advocacy, legislative, and government-affairs roles."),
    ("communications_director", "Communications / Public Affairs Director", "Communications Director", "Directors", "Director-level communications, editorial, marketing, and public-affairs roles."),
    ("senior_researcher", "Senior Researcher / Fellow / Analyst", "Senior Researcher", "Research", "Senior or principal researchers, fellows, scientists, economists, and analysts without a director or executive title."),
    ("cfo", "CFO", "CFO", "C-suite", "Chief Financial Officer and standard CFO aliases."),
    ("general_counsel", "General Counsel / CLO", "General Counsel", "C-suite", "General Counsel and Chief Legal Officer, excluding associate, deputy, and assistant counsel."),
    ("chief_of_staff", "Chief of Staff", "Chief of Staff", "C-suite", "Chief of Staff, excluding Deputy Chief of Staff and multi-role COO hybrids."),
    ("research_director", "Research Director", "Research Director", "Directors", "Director-level research roles, including Directors of Research."),
    ("finance_director", "Finance Director", "Finance Director", "Directors", "Director-level finance roles, including Director of Finance and Finance Director."),
    ("deputy_director", "Deputy Director", "Deputy Director", "Executive leadership", "Deputy Director titles, excluding deputy vice presidents and deputy functional posts."),
    ("executive_vice_president", "Executive Vice President", "Executive Vice President", "Executive leadership", "Executive Vice President, EVP, and Executive VP aliases."),
    ("deputy_vice_president", "Deputy Vice President", "Deputy Vice President", "Limited samples", "Deputy Vice President and Deputy VP titles, kept separate from Vice President."),
    ("chief_development_officer", "Chief Development Officer", "Chief Development Officer", "C-suite", "Chief Development, Philanthropy, or Advancement Officer titles."),
    ("chief_people_officer", "Chief People Officer", "Chief People Officer", "C-suite", "Chief People, Human Resources, Human Capital, and People-and-Culture Officer titles."),
    ("chief_economist", "Chief Economist", "Chief Economist", "Limited samples", "Chief Economist titles; retained internally until the public sample is large enough."),
    ("chief_research_officer", "Chief Research Officer", "Chief Research Officer", "Limited samples", "Chief Research Officer titles; not pooled with Chief Scientist or Chief Economist."),
    ("chief_scientist", "Chief Scientist", "Chief Scientist", "Limited samples", "Chief Scientist titles; not pooled with other research chiefs."),
    ("cto", "CTO", "CTO", "Limited samples", "Chief Technology Officer and CTO aliases."),
    ("cio", "CIO", "CIO", "Limited samples", "Chief Information Officer and CIO aliases."),
    ("chief_program_officer", "Chief Program Officer", "Chief Program Officer", "Limited samples", "Chief Program or Chief Programs Officer titles."),
    ("chief_impact_officer", "Chief Impact Officer", "Chief Impact Officer", "Limited samples", "Chief Impact Officer titles."),
    ("chief_communications_officer", "Chief Communications Officer", "Chief Communications Officer", "Limited samples", "Chief Communications and Chief Marketing Officer titles."),
    ("chief_strategy_officer", "Chief Strategy Officer", "Chief Strategy Officer", "Limited samples", "Chief Strategy and Chief Innovation Officer titles."),
    ("controller", "Controller", "Controller", "Limited samples", "Controller titles, kept separate from Finance Director."),
    ("deputy_chief_of_staff", "Deputy Chief of Staff", "Deputy Chief of Staff", "Limited samples", "Deputy Chief of Staff, kept separate from Chief of Staff."),
    ("assistant_managing_director", "Assistant Managing Director", "Assistant Managing Director", "Limited samples", "Assistant Managing Director, kept separate from Managing Director."),
)
EXPECTED_PUBLIC_POSITION_DEFAULT_COUNTS = {
    "vice_president": (101, 40),
    "program_director": (35, 17),
    "managing_director": (36, 20),
    "coo": (28, 28),
    "senior_vice_president": (28, 17),
    "development_director": (26, 26),
    "policy_director": (25, 20),
    "communications_director": (24, 23),
    "senior_researcher": (22, 15),
    "cfo": (22, 22),
    "general_counsel": (17, 17),
    "chief_of_staff": (15, 15),
    "research_director": (15, 13),
    "finance_director": (15, 15),
    "deputy_director": (6, 6),
    "executive_vice_president": (12, 10),
    "chief_development_officer": (9, 9),
    "chief_people_officer": (8, 8),
}

# A few source-native Part VII records place a job title in PersonNm and a
# corporate officer label in TitleTxt. These exact, reviewed spillovers are
# classified and displayed using the title embedded in PersonNm, while both raw
# XML fields remain unchanged in the observation output.
REVIEWED_NAME_TITLE_SPILLOVERS = {
    "SRC-990-EXT-BIPARTISAN-POLICY-CENTER::elenamuehlenbeckcfo": {
        "raw_person": "ELENA MUEHLENBECK CFO",
        "raw_title": "SECRETARY & TREASURER",
        "effective_person": "ELENA MUEHLENBECK",
        "effective_title": "CFO",
        "rule": "reviewed_part_vii_person_name_title_spill",
    },
    "SRC-990-EXT-BIPARTISAN-POLICY-CENTER::liselloyevpcoo": {
        "raw_person": "LISEL LOY EVP COO",
        "raw_title": "TREASURER",
        "effective_person": "LISEL LOY",
        "effective_title": "EVP COO",
        "rule": "reviewed_part_vii_person_name_title_spill",
    },
    "SRC-990-EXT-COMMITTEE-FOR-A-RESPONSIBLE-FEDERAL-BUDGET::adamshifrisssenior": {
        "raw_person": "ADAM SHIFRISS SENIOR",
        "raw_title": "DIRECTOR OF LEGISLATIVE STRATEGY",
        "effective_person": "ADAM SHIFRISS",
        "effective_title": "SENIOR DIRECTOR OF LEGISLATIVE STRATEGY",
        "rule": "reviewed_part_vii_person_name_title_spill",
    },
    "SRC-990-EXT-COMMITTEE-FOR-A-RESPONSIBLE-FEDERAL-BUDGET::simonegfranksenior": {
        "raw_person": "SIMONE G FRANK SENIOR",
        "raw_title": "ADVISOR, FINANCE & OPERATIONS",
        "effective_person": "SIMONE G FRANK",
        "effective_title": "SENIOR ADVISOR, FINANCE & OPERATIONS",
        "rule": "reviewed_part_vii_person_name_title_spill",
    },
    "SRC-990-EXT-VERA-INSTITUTE-OF-JUSTICE::jamesparsonsprogram": {
        "raw_person": "JAMES PARSONS PROGRAM",
        "raw_title": "DIRECTOR AND SPECIAL ADVISOR",
        "effective_person": "JAMES PARSONS",
        "effective_title": "PROGRAM DIRECTOR AND SPECIAL ADVISOR",
        "rule": "reviewed_part_vii_person_name_title_spill",
    },
    "SRC-990-EXT-VERA-INSTITUTE-OF-JUSTICE::vinamorrisdirector": {
        "raw_person": "VINA MORRIS DIRECTOR",
        "raw_title": "TECHNOLOGY INNOVATION AND STRATEGY",
        "effective_person": "VINA MORRIS",
        "effective_title": "DIRECTOR, TECHNOLOGY INNOVATION AND STRATEGY",
        "rule": "reviewed_part_vii_person_name_title_spill",
    },
    "SRC-990-EXT-CENTER-FOR-AI-SAFETY::oliverzhangmanagingdirector": {
        "raw_person": "Oliver Zhang Managing Director",
        "raw_title": "Director",
        "effective_person": "Oliver Zhang",
        "effective_title": "Managing Director",
        "rule": "reviewed_part_vii_person_name_title_spill",
    },
    "SRC-990-EXT-NEW-ROOTS-INSTITUTE::jessetandlermanaging": {
        "raw_person": "Jesse Tandler Managing",
        "raw_title": "Director",
        "effective_person": "Jesse Tandler",
        "effective_title": "Managing Director",
        "rule": "reviewed_part_vii_person_name_title_spill",
    },
    "SRC-990-EXT-RESEARCH-AMERICA::jenniferluraysrvp": {
        "raw_person": "JENNIFER LURAY SR VP",
        "raw_title": "STRATEGY & PUBLIC ENGAGEMENT",
        "effective_person": "JENNIFER LURAY",
        "effective_title": "SR VP",
        "rule": "reviewed_part_vii_person_name_title_spill",
    },
    "SRC-990-EXT-CENTER-FOR-DEMOCRACY-TECHNOLOGY::georgeslovergencounsel": {
        "raw_person": "GEORGE SLOVER - GEN COUNSEL",
        "raw_title": "SR. COUNSEL COMP POL. & SECRETARY",
        "effective_person": "GEORGE SLOVER",
        "effective_title": "GEN COUNSEL",
        "rule": "reviewed_part_vii_person_name_title_spill",
    },
}

# Schedule J sometimes contains the untruncated title for the same exactly
# matched person. Only these reviewed pairs may replace a Part VII title for
# classification/display; Schedule J is never used as an open-ended fallback.
REVIEWED_SCHEDULE_J_TITLE_EXPANSIONS = {
    "SRC-990-EXT-PROJECT-DRAWDOWN::reshmapattni": {
        "part_vii_title": "FINANCE DIRE",
        "schedule_j_title": "FINANCE DIRECTOR",
        "effective_title": "FINANCE DIRECTOR",
        "rule": "reviewed_exact_schedule_j_title_expansion",
    },
    "SRC-990-EXT-PROJECT-DRAWDOWN::toodreubold": {
        "part_vii_title": "MARKETING DI",
        "schedule_j_title": "MARKETING DIRECTOR",
        "effective_title": "MARKETING DIRECTOR",
        "rule": "reviewed_exact_schedule_j_title_expansion",
    },
}

# These current Partnership on AI filing acronyms were separately reviewed.
# Expanding them makes their functional content auditable without changing the
# raw Part VII or Schedule J titles.
REVIEWED_ACRONYM_TITLE_EXPANSIONS = {
    "SRC-990-EXT-PARTNERSHIP-ON-AI::feleciawebb": {
        "raw_title": "CSOPP",
        "effective_title": "Chief Strategy Officer, Philanthropy and Partnerships",
        "rule": "reviewed_organization_specific_title_acronym",
    },
    "SRC-990-EXT-PARTNERSHIP-ON-AI::stephaniebell": {
        "raw_title": "CPIO",
        "effective_title": "Chief Programs and Insights Officer",
        "rule": "reviewed_organization_specific_title_acronym",
    },
    "SRC-990-EXT-SOFTWARE-FREEDOM-CONSERVANCY::bradleymkuhn": {
        "raw_title": "Director, Policy Fellow, Outgoing Treasurer",
        "effective_title": "Policy Fellow",
        "rule": "reviewed_staff_title_separated_from_board_and_officer_roles",
    },
    "SRC-990-EXT-RESULTS-FOR-AMERICA::lisavmorrisonbutler": {
        "raw_title": "EXECUTIVE VP AND CIO",
        "effective_title": "Executive Vice President and Chief Impact Officer",
        "rule": "reviewed_organization_specific_title_acronym",
    },
    "SRC-990-EXT-ANIMAL-LEGAL-DEFENSE-FUND::andreajoykroboth": {
        "raw_title": "CHIEF OPERATING OFF (THRU 2/7/25)",
        "effective_title": "Chief Operating Officer (through February 7, 2025)",
        "rule": "reviewed_unambiguous_source_title_truncation",
    },
}

# Part VII compensation is reported for the calendar year that begins within
# the filing period. A later fiscal-period departure must not erase a complete
# compensation-year observation, while a later start must not create one.
REVIEWED_COMPENSATION_YEAR_ROLE_OVERRIDES = {
    "SRC-990-RP-REFERENCE::carolynfootitt": (
        "partial_or_uncertain", "official_report_dates_permanent_coo_appointment_to_2025"
    ),
    "SRC-990-EXT-ANIMAL-LEGAL-DEFENSE-FUND::andreajoykroboth": (
        "verified_full_year", "departure_after_compensation_calendar_year"
    ),
    "SRC-990-EXT-VILLAGE-ENTERPRISE::celestebrubaker": (
        "verified_full_year", "departure_after_compensation_calendar_year"
    ),
    "SRC-990-EXT-FEDERATION-OF-AMERICAN-SCIENTISTS::manizhanabieva": (
        "verified_full_year", "departure_after_compensation_calendar_year"
    ),
    "SRC-990-EXT-INSTITUTE-FOR-WOMEN-S-POLICY-RESEARCH::williamlutz": (
        "verified_full_year", "departure_after_compensation_calendar_year"
    ),
    "SRC-990-EXT-NATIONAL-COMMITTEE-FOR-RESPONSIVE-PHILANTHROPY::janayrichmond": (
        "verified_full_year", "departure_after_compensation_calendar_year"
    ),
    "SRC-990-EXT-VILLAGE-ENTERPRISE::jamesphelan": (
        "verified_full_year", "departure_after_compensation_calendar_year"
    ),
    "SRC-990-EXT-VILLAGEREACH::claudiashilumani": (
        "verified_full_year", "departure_after_compensation_calendar_year"
    ),
    "SRC-990-EXT-CODE-FOR-SCIENCE-SOCIETY::kenamayberry": (
        "not_held", "role_started_after_compensation_calendar_year"
    ),
    "SRC-990-EXT-POPULATION-REFERENCE-BUREAU::immanuelwolff": (
        "not_held", "role_started_after_compensation_calendar_year"
    ),
    "SRC-990-EXT-VILLAGE-ENTERPRISE::winnieauma": (
        "not_held", "role_started_after_compensation_calendar_year"
    ),
}

# The source XML repeats this unpaid board row byte-for-byte. It is collapsed to
# one stable source+person observation and surfaced through duplicate_source_rows.
KNOWN_EXACT_DUPLICATE = (
    "SRC-990-EXT-CHICAGO-COUNCIL-ON-GLOBAL-AFFAIRS",
    "alejandrosilva",
)

# These are source-internal Part VII versus Schedule J differences, not parser
# errors. The map is deliberately exact so any new discrepancy fails the build.
KNOWN_CASH_COMPONENT_DIFFERENCES = {
    "SRC-990-EXT-CENTER-FOR-CLIMATE-AND-ENERGY-SOLUTIONS::bradleytownsend": -10,
    "SRC-990-EXT-CENTER-FOR-ECONOMIC-AND-POLICY-RESEARCH::alexandermain": -1,
    "SRC-990-EXT-FAR-AI::conormcgurk": -602,
}

EXPECTED_LOW_HOURS_ROLE_ELIGIBLE = {
    "SRC-990-EXT-CENTER-FOR-PUBLIC-INTEGRITY::alexiacampbell",
    "SRC-990-EXT-CENTER-FOR-PUBLIC-INTEGRITY::jamiehopkins",
    "SRC-990-EXT-CENTER-FOR-PUBLIC-INTEGRITY::jinding",
    "SRC-990-EXT-CENTER-FOR-PUBLIC-INTEGRITY::matthewderienzo",
    "SRC-990-EXT-CENTER-FOR-PUBLIC-INTEGRITY::mcnellycolontorres",
    "SRC-990-EXT-INSTITUTE-ON-TAXATION-AND-ECONOMIC-POLICY::michaelettlinger",
    "SRC-990-EXT-INSTITUTE-ON-TAXATION-AND-ECONOMIC-POLICY::nicholasjohnson",
    "SRC-990-EXT-INTERNET-SECURITY-RESEARCH-GROUP::kristinberdan",
    "SRC-990-EXT-WORLD-JUSTICE-PROJECT::geroldwlibby",
}

# The validated CEPR record names both co-directors. The filing misspells
# Eileen Appelbaum's surname as Applebaum, so exact source-specific aliases are
# the only permitted extension to the ordinary normalized-name match.
CANONICAL_CEO_ALIASES = {
    "SRC-990-EXT-CENTER-FOR-ECONOMIC-AND-POLICY-RESEARCH": (
        "Eileen Applebaum",
    ),
}
EXPECTED_CEPR_CANONICAL_CO_EXECUTIVES = {
    "SRC-990-EXT-CENTER-FOR-ECONOMIC-AND-POLICY-RESEARCH::eileenapplebaum",
    "SRC-990-EXT-CENTER-FOR-ECONOMIC-AND-POLICY-RESEARCH::markweisbrot",
}

# These exceptions are based on the source-native filing structure, not title
# keywords. Third Way reports a board treasurer paid entirely through a related
# organization; the role is governance even though combined hours are 40.
FORCED_GOVERNANCE_OBSERVATIONS = {
    "SRC-990-EXT-THIRD-WAY-INSTITUTE::stevejdieterlecfo": (
        "reviewed_related_org_paid_board_treasurer_governance"
    ),
}

# Retain these current/fractional functional rows for explicit sensitivity
# analysis, but never include them in the default comparator. CRL reports zero
# filing-organization hours and 40 related-organization hours without mapping
# the related employer; IST labels Eric Davis's role FRACTIONAL.
SENSITIVITY_ONLY_OBSERVATIONS = {
    **{
        f"SRC-990-EXT-CENTER-FOR-RESPONSIBLE-LENDING::{person}":
        "related_org_hours_without_identified_related_employer"
        for person in (
            "andrewkushner",
            "ellenharnick",
            "elizabethjladerman",
            "marcusbowen",
            "michaelcalhoun",
            "mitriaspotser",
            "petersmith",
        )
    },
    "SRC-990-EXT-INSTITUTE-FOR-SECURITY-AND-TECHNOLOGY::ericdavis": (
        "source_labeled_fractional_role"
    ),
    "SRC-990-EXT-CREATIVE-COMMONS::erikadrushka": (
        "related_org_compensation_with_unreconciled_employer_scale_boundary"
    ),
    "SRC-990-EXT-CREATIVE-COMMONS::monicagranados": (
        "related_org_compensation_with_unreconciled_employer_scale_boundary"
    ),
}

SCOPE_OVERRIDES = {
    "SRC-990-EXT-BIPARTISAN-POLICY-CENTER::michelestockwell": (
        "program_or_affiliate", "reviewed_named_affiliate_scope"
    ),
    "SRC-990-EXT-NUCLEAR-THREAT-INITIATIVE::samnunn": (
        "governance", "reviewed_board_cochair_hybrid_scope"
    ),
    "SRC-990-EXT-FAR-AI::conormcgurk": (
        "program_or_affiliate", "explicit_fiscally_sponsored_project_scope"
    ),
    # These Code for Science & Society rows are the executives of fiscally
    # sponsored projects, rather than comparable internal program leaders.
    **{
        f"SRC-990-EXT-CODE-FOR-SCIENCE-SOCIETY::{person}": (
            "program_or_affiliate", "reviewed_fiscally_sponsored_project_scope"
        )
        for person in (
            "alexiahanna", "joybuolamwini", "kaitlinthaney", "melisabok", "timnitgebru"
        )
    },
}

# Form 990 titles are often truncated to 35 characters or use organization-
# specific program names. These reviewed observation-level exceptions keep
# explicitly functional roles out of the generic-leadership family while the
# source-native title remains unchanged in every output row.
REVIEWED_ROLE_OVERRIDES: dict[str, tuple[str, tuple[str, ...], str]] = {
    # Communications / audience and production functions.
    "SRC-990-EXT-PARTNERSHIP-ON-AI::neiluhl": (
        "communications", (), "reviewed_brand_design_function"
    ),
    "SRC-990-EXT-BULLETIN-OF-THE-ATOMIC-SCIENTISTS::johnpope": (
        "communications", (), "reviewed_chief_audience_officer_abbreviation"
    ),
    "SRC-990-EXT-GUTTMACHER-INSTITUTE::kathleenrandall": (
        "communications", (), "reviewed_publication_production_function"
    ),

    # Development, fundraising, membership, and external-revenue functions.
    "SRC-990-EXT-LIVING-GOODS::lauramapp": (
        "development", (), "reviewed_business_development_function"
    ),
    "SRC-990-EXT-INSTITUTE-FOR-THE-STUDY-OF-WAR::alexandermitchell": (
        "communications", ("development",), "reviewed_external_relations_function"
    ),
    "SRC-990-EXT-INSTITUTE-FOR-NONPROFIT-NEWS::courtneylewis": (
        "development", (), "reviewed_growth_revenue_function"
    ),
    "SRC-990-EXT-PEAK-GRANTMAKING::sararichmansanders": (
        "development", (), "reviewed_membership_revenue_function"
    ),
    "SRC-990-EXT-PEAK-GRANTMAKING::clarelarson": (
        "development", (), "reviewed_membership_revenue_function"
    ),
    "SRC-990-EXT-CHICAGO-COUNCIL-ON-GLOBAL-AFFAIRS::sarahbreenbartecki": (
        "development", (), "reviewed_chief_revenue_function"
    ),

    # People / organizational-health functions.
    "SRC-990-EXT-CENTER-FOR-LAW-AND-SOCIAL-POLICY::eddiemartinjr": (
        "people", ("strategy", "policy"),
        "reviewed_organizational_racial_equity_strategy_function"
    ),
    "SRC-990-EXT-AMERICAN-IMMIGRATION-COUNCIL::kimberlyserrano": (
        "programs", ("communications", "research"),
        "reviewed_inclusion_and_belonging_center_program_function"
    ),
    "SRC-990-EXT-FRESH-ENERGY::matlarsonkrisetya": (
        "people", (), "reviewed_organizational_health_function"
    ),
    "SRC-990-EXT-SOFTWARE-FREEDOM-CONSERVANCY::sagesharp": (
        "programs", ("people",), "reviewed_outreachy_program_function"
    ),
    "SRC-990-EXT-IDEAS42::victoriasharelllucas": (
        "people", ("operations",), "reviewed_people_operations_primary_function"
    ),

    # Policy and advocacy functions whose title names an issue area rather than
    # literally including the word "policy".
    "SRC-990-EXT-ELECTRONIC-FRONTIER-FOUNDATION::davidgreene": (
        "policy", (), "reviewed_civil_liberties_function"
    ),
    "SRC-990-EXT-NISKANEN-CENTER::matthewlacorte": (
        "policy", ("programs",), "reviewed_immigration_policy_function"
    ),
    "SRC-990-EXT-NISKANEN-CENTER::gregorynewburn": (
        "policy", (), "reviewed_criminal_justice_function"
    ),
    "SRC-990-EXT-MIGRATION-POLICY-INSTITUTE::margaretmchugh": (
        "policy", ("programs",), "reviewed_immigration_policy_center_function"
    ),
    "SRC-990-EXT-NISKANEN-CENTER::charlessdayton": (
        "policy", (), "reviewed_governance_policy_function"
    ),
    "SRC-990-EXT-ANIMAL-LEGAL-DEFENSE-FUND::loradunn": (
        "policy", (), "reviewed_criminal_justice_program_function"
    ),
    "SRC-990-EXT-R-STREET-INSTITUTE::jilliansnider": (
        "policy", (), "reviewed_criminal_justice_function"
    ),
    "SRC-990-EXT-R-STREET-INSTITUTE::devinhartman": (
        "policy", (), "reviewed_energy_policy_function"
    ),
    "SRC-990-EXT-CENTER-FOR-LAW-AND-SOCIAL-POLICY::wendycervantes": (
        "policy", ("programs",), "reviewed_immigration_policy_function"
    ),
    "SRC-990-EXT-DEMOS::phinguyen": (
        "policy", (), "reviewed_democracy_policy_function"
    ),
    "SRC-990-EXT-DEMOS::carollautier": (
        "programs", ("policy",), "reviewed_movement_building_program_function"
    ),
    "SRC-990-EXT-THE-SENTENCING-PROJECT::joshrovner": (
        "policy", (), "reviewed_youth_justice_policy_function"
    ),
    "SRC-990-EXT-R-STREET-INSTITUTE::mazensaleh": (
        "policy", (), "reviewed_harm_reduction_policy_function"
    ),
    "SRC-990-EXT-SIGHTLINE-INSTITUTE::danbertolet": (
        "policy", (), "reviewed_housing_and_cities_policy_function"
    ),
    "SRC-990-EXT-CENTER-FOR-CLIMATE-AND-ENERGY-SOLUTIONS::amymerrillsteen": (
        "policy", ("programs",), "reviewed_carbon_markets_policy_function"
    ),
    "SRC-990-EXT-BRENNAN-CENTER-FOR-JUSTICE::kareemcrayton": (
        "policy", (), "reviewed_washington_policy_function"
    ),
    "SRC-990-EXT-BREAKTHROUGH-INSTITUTE::davidhong": (
        "policy", (), "reviewed_washington_policy_function"
    ),

    # Research, evaluation, and evidence functions described by a named center,
    # methodology, or research-program shorthand.
    "SRC-990-EXT-MIGRATION-POLICY-INSTITUTE::juliesugarman": (
        "research", ("programs",), "reviewed_education_research_function"
    ),
    "SRC-990-EXT-MIGRATION-POLICY-INSTITUTE::lorenamancilla": (
        "research", ("programs",), "reviewed_education_research_function"
    ),
    "SRC-990-EXT-FEDERATION-OF-AMERICAN-SCIENTISTS::jonwolfsthal": (
        "research", ("strategy",), "reviewed_global_risks_research_function"
    ),
    "SRC-990-EXT-FAR-AI::benjamingoldhaber": (
        "research", ("programs",), "reviewed_research_lab_function"
    ),
    "SRC-990-EXT-ECONOMIC-POLICY-INSTITUTE::valerierwilson": (
        "research", (), "reviewed_pree_research_program_function"
    ),
    "SRC-990-EXT-QUINCY-INSTITUTE-FOR-RESPONSIBLE-STATECRAFT::marcusstanley": (
        "research", (), "reviewed_director_of_studies_function"
    ),
    "SRC-990-EXT-INSTITUTE-FOR-THE-STUDY-OF-WAR::brianbabcocklumish": (
        "research", ("programs",), "reviewed_research_center_function"
    ),
    "SRC-990-EXT-GUTTMACHER-INSTITUTE::susheelasingh": (
        "research", (), "reviewed_scholar_function"
    ),
    "SRC-990-EXT-PETERSON-INSTITUTE-FOR-INTERNATIONAL-ECONOMICS::jessemnoland": (
        "research", (), "reviewed_director_of_studies_function"
    ),
    "SRC-990-EXT-PARTNERSHIP-ON-AI::madhulikasrikumar": (
        "research", (), "reviewed_ai_safety_research_function"
    ),
    "SRC-990-EXT-INSTITUTE-FOR-NONPROFIT-NEWS::emilyroseman": (
        "research", ("technology",), "reviewed_index_research_function"
    ),
    "SRC-990-EXT-LAST-MILE-HEALTH::barbarawillett": (
        "research", ("programs",), "reviewed_merl_function"
    ),
    "SRC-990-EXT-NEW-AMERICA::maryalicemccarthy": (
        "research", ("programs",), "reviewed_education_and_labor_center_function"
    ),
    "SRC-990-EXT-CENTER-FOR-EFFECTIVE-PHILANTHROPY::marinellaboyadzhiev": (
        "research", ("programs",), "reviewed_assessment_and_advisory_function"
    ),
    "SRC-990-EXT-CENTER-FOR-EFFECTIVE-PHILANTHROPY::alicemei": (
        "research", ("programs",), "reviewed_assessment_and_advisory_function"
    ),
    "SRC-990-EXT-CENTER-FOR-EFFECTIVE-PHILANTHROPY::kevinbolduc": (
        "research", ("programs",), "reviewed_assessment_and_advisory_function"
    ),
    "SRC-990-EXT-NEW-AMERICA::peterbergen": (
        "research", ("programs",), "reviewed_studies_and_fellows_function"
    ),

    # Program, partnership, service-delivery, and named issue-area leadership.
    "SRC-990-EXT-GRANTMAKERS-FOR-EDUCATION::paulmoon": (
        "programs", ("communications",), "reviewed_conference_and_events_function"
    ),
    "SRC-990-EXT-NUCLEAR-THREAT-INITIATIVE::ericbrewer": (
        "programs", ("policy",), "reviewed_nuclear_security_program_function"
    ),
    "SRC-990-EXT-JAIN-FAMILY-INSTITUTE::nolanlindquistexecutive": (
        "programs", (), "reviewed_named_center_function"
    ),
    "SRC-990-EXT-CLEAN-AIR-TASK-FORCE::lilyordarno": (
        "programs", (), "reviewed_energy_and_climate_program_function"
    ),
    "SRC-990-EXT-BREAKTHROUGH-INSTITUTE::danielblausteinrejto": (
        "programs", (), "reviewed_food_and_agriculture_program_function"
    ),
    "SRC-990-EXT-CLEAN-AIR-TASK-FORCE::kathyfallon": (
        "programs", (), "reviewed_land_systems_program_function"
    ),
    "SRC-990-EXT-BREAKTHROUGH-INSTITUTE::adamstein": (
        "programs", (), "reviewed_nuclear_energy_program_function"
    ),
    "SRC-990-EXT-BREAKTHROUGH-INSTITUTE::seaverwang": (
        "programs", (), "reviewed_climate_and_energy_program_function"
    ),
    "SRC-990-EXT3-WATTTIME::lauracirincione": (
        "programs", (), "reviewed_partnership_function"
    ),
    "SRC-990-EXT-ANIMAL-WELFARE-INSTITUTE::johannahamburger": (
        "programs", (), "reviewed_wildlife_program_function"
    ),
    "SRC-990-EXT-CLEAN-AIR-TASK-FORCE::terrarogers": (
        "programs", (), "reviewed_geothermal_program_function"
    ),
    "SRC-990-EXT-CLEAN-AIR-TASK-FORCE::johnsteelman": (
        "programs", (), "reviewed_decarbonization_program_function"
    ),
    "SRC-990-EXT-VERA-INSTITUTE-OF-JUSTICE::jamesparsonsprogram": (
        "programs", (), "reviewed_program_director_function"
    ),
    "SRC-990-EXT3-CENTER-FOR-HEALTH-CARE-STRATEGIES::rubygoyalcarkeek": (
        "programs", (), "reviewed_health_and_child_welfare_program_function"
    ),
    "SRC-990-EXT-CENTER-FOR-EFFECTIVE-PHILANTHROPY::whitneyivie": (
        "programs", (), "reviewed_client_services_program_function"
    ),
    "SRC-990-EXT-AMERICAN-IMMIGRATION-COUNCIL::lisamurray": (
        "programs", (), "reviewed_cultural_exchange_program_function"
    ),
    "SRC-990-EXT-CENTER-FOR-CLIMATE-AND-ENERGY-SOLUTIONS::nicholasfranco": (
        "programs", (), "reviewed_net_zero_program_function"
    ),
    "SRC-990-EXT-CREATIVE-COMMONS::brigittevezina": (
        "programs", (), "reviewed_open_culture_program_function"
    ),
    "SRC-990-EXT-CLEAN-AIR-TASK-FORCE::jonathanbanks": (
        "programs", (), "reviewed_methane_program_function"
    ),
    "SRC-990-EXT-ANIMAL-WELFARE-INSTITUTE::georgiahancock": (
        "programs", (), "reviewed_wildlife_program_function"
    ),
    "SRC-990-EXT-INSTITUTE-FOR-NONPROFIT-NEWS::johnathankealing": (
        "programs", ("development",), "reviewed_network_program_function"
    ),
    "SRC-990-EXT-SAN-FRANCISCO-ESTUARY-INSTITUTE::cristinagrosso": (
        "programs", (), "reviewed_misspelled_program_title"
    ),
    "SRC-990-EXT-SAN-FRANCISCO-ESTUARY-INSTITUTE::scottdusterhoff": (
        "programs", (), "reviewed_misspelled_program_title"
    ),
    "SRC-990-EXT-CLEAN-AIR-TASK-FORCE::larissaleebeck": (
        "programs", (), "reviewed_regional_program_function"
    ),
    "SRC-990-EXT3-CENTER-FOR-HEALTH-CARE-STRATEGIES::marklarson": (
        "programs", ("people",), "reviewed_capacity_building_program_function"
    ),
    "SRC-990-EXT-RESULTS-FOR-AMERICA::nicholedunn": (
        "programs", ("policy",), "reviewed_federal_practice_function"
    ),
    "SRC-990-EXT-RESULTS-FOR-AMERICA::zacharymarkovits": (
        "programs", (), "reviewed_local_practice_function"
    ),
    "SRC-990-EXT-NUCLEAR-THREAT-INITIATIVE::scottroecker": (
        "programs", ("policy",), "reviewed_nuclear_security_program_function"
    ),
    "SRC-990-EXT-CENTER-FOR-EFFECTIVE-PHILANTHROPY::davidmckinney": (
        "programs", (), "reviewed_youthtruth_program_function"
    ),
    "SRC-990-EXT-MIGRATION-POLICY-INSTITUTE::juliagelatt": (
        "policy", ("programs",), "reviewed_immigration_policy_program_function"
    ),
    "SRC-990-EXT-ROOSEVELT-INSTITUTE::alibustamante": (
        "programs", ("policy",), "reviewed_worker_power_program_function"
    ),
    "SRC-990-EXT-CENTER-FOR-ECONOMIC-AND-POLICY-RESEARCH::shawnfrenstad": (
        "programs", ("research", "policy"), "reviewed_political_economy_program_function"
    ),
    "SRC-990-EXT-DEMOS::udochionwubiko": (
        "programs", ("policy",), "reviewed_economic_justice_program_function"
    ),
    "SRC-990-EXT-CENTER-FOR-ECONOMIC-AND-POLICY-RESEARCH::algernonaustin": (
        "programs", ("research", "policy"), "reviewed_economic_justice_program_function"
    ),
    "SRC-990-EXT-EVIDENCE-ACTION::paulbyatta": (
        "programs", (), "reviewed_regional_program_function"
    ),
    "SRC-990-EXT-NEW-AMERICA::taramcguinness": (
        "programs", ("research",), "reviewed_named_practice_lab_function"
    ),
    "SRC-990-EXT-PARTNERSHIP-ON-AI::mindyfrisbee": (
        "programs", ("development",), "reviewed_partnership_development_program_function"
    ),

    # Operations and technology roles whose source titles are truncated.
    "SRC-990-EXT-TECHNICAL-ASSISTANCE-COLLABORATIVE::johnabbott": (
        "operations", (), "reviewed_business_operations_truncation"
    ),
    "SRC-990-EXT-ORCID::tomdemeranville": (
        "technology", (), "reviewed_product_function_truncation"
    ),
    "SRC-990-EXT-ORCID::willsimpson": (
        "technology", (), "reviewed_technology_function_truncation"
    ),
    "SRC-990-EXT-ORCID::georgenash": (
        "technology", (), "reviewed_technology_lead_function"
    ),
    "SRC-990-EXT-ANIMAL-LEGAL-DEFENSE-FUND::thomaslinney": (
        "legal", (), "reviewed_pro_bono_legal_function"
    ),
    "SRC-990-EXT-PHYSICIANS-COMMITTEE-FOR-RESPONSIBLE-MEDICINE::betsywasoncfre": (
        "development", (), "reviewed_development_abbreviation"
    ),
    "SRC-990-EXT-OPENSECRETS::victoriasorg": (
        "development", ("communications",), "reviewed_revenue_and_external_relations_function"
    ),

    # Strategy / organization-wide innovation functions.
    "SRC-990-EXT-IDEAS42::piyushtantia": (
        "strategy", (), "reviewed_chief_innovation_function"
    ),
    "SRC-990-EXT-INSTITUTE-FOR-SECURITY-AND-TECHNOLOGY::stevenkelly": (
        "strategy", ("policy",), "reviewed_trust_strategy_function"
    ),
    "SRC-990-EXT-FEDERATION-OF-AMERICAN-SCIENTISTS::saraschapiro": (
        "programs", ("strategy",), "reviewed_social_innovation_program_function"
    ),
    "SRC-990-EXT-PUBLIC-AGENDA::michellegrove": (
        "strategy", ("programs",), "reviewed_strategy_and_impact_primary_function"
    ),
    "SRC-990-EXT-NUCLEAR-THREAT-INITIATIVE::samanthaneakrase": (
        "strategy", ("programs",), "reviewed_strategic_initiatives_primary_function"
    ),
    "SRC-990-EXT-QUINCY-INSTITUTE-FOR-RESPONSIBLE-STATECRAFT::georgebeebe": (
        "programs", ("strategy",), "reviewed_grand_strategy_program_primary_function"
    ),

    # Roles initially caught by a misleading keyword in a different family.
    "SRC-990-EXT-PRECISION-DEVELOPMENT::alexanderramirez": (
        "technology", (), "reviewed_software_development_function"
    ),
    "SRC-990-EXT3-NUCLEAR-INNOVATION-ALLIANCE::jamesrichards": (
        "research", ("programs",), "reviewed_economics_and_project_development_function"
    ),
    "SRC-990-EXT-INSTITUTE-FOR-ENERGY-ECONOMICS-AND-FINANCIAL-ANALYSIS::paulwilliamsderry": (
        "research", ("finance",), "reviewed_energy_finance_analyst_function"
    ),
    "SRC-990-EXT-INSTITUTE-FOR-ENERGY-ECONOMICS-AND-FINANCIAL-ANALYSIS::abhisheksinha": (
        "research", ("finance",), "reviewed_energy_finance_analyst_function"
    ),
    "SRC-990-EXT-INSTITUTE-FOR-ENERGY-ECONOMICS-AND-FINANCIAL-ANALYSIS::johnhauberjr": (
        "research", ("finance", "strategy"), "reviewed_energy_finance_research_function"
    ),
    "SRC-990-EXT-GOOD-FOOD-INSTITUTE::sarahdavid": (
        "legal", ("finance",), "reviewed_general_counsel_primary_function"
    ),
    "SRC-990-EXT-ECONOMIC-POLICY-INSTITUTE::celinemcnicholas": (
        "policy", ("legal",), "reviewed_policy_and_general_counsel_hybrid"
    ),
    "SRC-990-EXT-SOFTWARE-FREEDOM-CONSERVANCY::bradleymkuhn": (
        "policy", ("research",), "reviewed_policy_fellow_staff_function"
    ),
    "SRC-990-EXT-LAST-MILE-HEALTH::divyanair": (
        "programs", ("research",), "reviewed_health_systems_and_merl_function"
    ),
    "SRC-990-EXT-GLOBAL-HEALTH-CORPS::hannahtaylor": (
        "communications", ("programs",), "reviewed_community_engagement_not_engineering"
    ),

    # Source-reviewed engagement, policy, research, publication, and digital
    # roles. Generic engagement/media/digital keywords are intentionally not
    # enough on their own to select a primary family.
    "SRC-990-EXT-CENTER-FOR-CLIMATE-AND-ENERGY-SOLUTIONS::verenaradulovic": (
        "programs", ("policy",), "reviewed_business_engagement_program_function"
    ),
    "SRC-990-EXT-GOOD-FOOD-INSTITUTE::carolinebushnell": (
        "programs", (), "reviewed_corporate_engagement_program_function"
    ),
    "SRC-990-EXT-INSTITUTE-FOR-SECURITY-AND-TECHNOLOGY::elizabethvish": (
        "policy", ("programs",), "reviewed_international_cyber_policy_function"
    ),
    "SRC-990-EXT-PARTNERSHIP-ON-AI::claireleibowicz": (
        "programs", ("policy", "research"), "reviewed_ai_media_integrity_program_function"
    ),
    "SRC-990-EXT-VILLAGEREACH::olivierdefawe": (
        "programs", (), "reviewed_private_sector_health_program_function"
    ),
    "SRC-990-EXT-THE-HUMANE-LEAGUE::karennilsen": (
        "communications", ("programs", "strategy"),
        "reviewed_digital_engagement_communications_function"
    ),
    "SRC-990-EXT-FEDERATION-OF-AMERICAN-SCIENTISTS::ericagoldman": (
        "policy", ("research",), "reviewed_science_policy_primary_function"
    ),
    "SRC-990-EXT3-NUCLEAR-INNOVATION-ALLIANCE::erikcothron": (
        "research", ("strategy",), "reviewed_research_typo_primary_function"
    ),
    "SRC-990-EXT-CHICAGO-COUNCIL-ON-GLOBAL-AFFAIRS::dinasmeltz": (
        "research", ("policy",), "reviewed_public_opinion_research_function"
    ),
    "SRC-990-EXT-ENVIRONMENTAL-LAW-INSTITUTE::racheljeanbaptiste": (
        "communications", ("programs",), "reviewed_publications_primary_function"
    ),
    "SRC-990-EXT-EVIDENCE-ACTION::gracehollister": (
        "communications", ("development",),
        "reviewed_external_relations_communications_and_fundraising"
    ),
    "SRC-990-EXT-CENTER-FOR-EFFECTIVE-PHILANTHROPY::andreadeforest": (
        "programs", ("communications",),
        "reviewed_organizational_learning_and_communications_function"
    ),
    "SRC-990-EXT-PROJECT-DRAWDOWN::matthewscott": (
        "communications", ("programs",),
        "reviewed_storytelling_and_engagement_title_expansion"
    ),
}

REVIEWED_ROLE_OVERRIDE_CITATIONS = {
    "SRC-990-EXT-BULLETIN-OF-THE-ATOMIC-SCIENTISTS::johnpope": (
        "Official 2023 Bulletin annual report expands `Chief Aud. Officer` to "
        "`Chief Audience Officer` under Communications and Marketing: "
        "benchmark/sources/native/supporting/2023-Bulletin-Annual-Report.pdf "
        "(https://thebulletin.org/wp-content/uploads/2024/05/2023-Bulletin-Annual-Report.pdf)"
    ),
}

PART_VII_TAG = "Form990PartVIISectionAGrp"
SCHEDULE_J_TAG = "RltdOrgOfficerTrstKeyEmplGrp"

ROLE_PATTERNS: dict[str, tuple[str, ...]] = {
    "chief_of_staff": (r"\bCHIEF OF STAFF\b", r"\bCOS\b"),
    "operations": (
        r"\bCOO\b", r"\bCFOO\b", r"CHIEF (?:OPERATING|OPERATIONS|ADMINISTRATIVE)",
        r"\bOPERAT(?:ING|IONS?)?\b", r"\bOPS\b", r"ADMINISTRAT(?:IVE|ION)",
    ),
    "finance": (
        r"\bCFO\b", r"\bCFAO\b", r"\bCFOO\b", r"CHIEF FINANC", r"\bFIN(?:ANCE|ANCIAL|\.)",
        r"\bCONTROLLER\b", r"\bACCOUNT", r"\bTREASUR", r"\bAUDIT",
    ),
    "people": (
        r"\bPEOPLE\b", r"HUMAN RES", r"\bHR\b", r"\bTALENT\b", r"PEOPLE.{0,8}CULTURE",
        r"\bPERSONNEL\b", r"HUMAN CAPITAL",
    ),
    "legal": (
        r"GENERAL COUNS(?:EL)?", r"\bCOUNSEL\b", r"\bLEGAL\b", r"\bATTORNEY\b", r"\bLAWYER\b",
        r"\bDGC\b", r"\bLITIGAT",
    ),
    "development": (
        r"\bDEVELOPMENT\b", r"\bFUNDRAIS", r"\bADVANCEMENT\b", r"MAJOR GIFTS?",
        r"\bPHILANTHROP", r"\bCDO\b", r"INSTITUTIONAL GIVING", r"ANNUAL GIVING",
        r"RESOURCE MOBILIZATION", r"CHIEF REVENUE", r"CHIEF RELATIONSHIP",
    ),
    "communications": (
        r"\bCOMMUNIC", r"\bCOMMS?\b", r"\bEDITOR", r"\bREPORTER\b", r"\bJOURNAL",
        r"PUBLIC AFFAIRS", r"\bMARKET(?:ING)?\b", r"\bCONTENT\b", r"\bPUBLICATIONS?\b",
        r"EXTERNAL AFFAIRS", r"PUBLIC REL", r"STRATEGIC COMMUNIC", r"\bDIGITAL STRATEGY\b",
    ),
    "technology": (
        r"\bTECH(?:NOLOGY|NICAL|\.)", r"\bCTO\b", r"\bENGINEE", r"\bSOFTWARE\b",
        r"\bDATA\b", r"INFORMATION (?:OFFICER|TECH)", r"\bCIO\b",
        r"\bPRODUCTS?\b", r"\bPLATFORM\b", r"SYSTEM ADMIN", r"\bIT\b",
        r"(?:SOFTWARE|FRONT END|PRODUCTS?/)\s+ENG\b",
    ),
    "research": (
        r"\bRESEARCH", r"\bREASEARCH", r"\bRSRCH\b", r"\bSCIEN", r"\bSCIE\b", r"\bECONOMIST",
        r"\bFELLOW\b", r"\bEVALUAT", r"\bEVIDENCE\b", r"\bANALY", r"\bMETHODOLOG",
        r"\bINSIG", r"ACADEMIC AFF", r"CLINICAL RES", r"BEHAVIORAL DESIGN", r"\bSCHOLAR\b",
        r"DIRECTOR OF STUDIES", r"\bMERL\b", r"MONITORING AND EVALUATION", r"PUBLIC OPINION",
    ),
    "policy": (
        r"\bPOLICY\b", r"\bADVOC", r"GOVERNMENT AFFAIRS", r"GOVT\.? REL", r"\bLEGISLAT",
        r"\bCAMPAIGN", r"PUBLIC SECTOR", r"AI GOVERNANCE", r"\bGOVERNANCE LAB\b",
        r"GOVERNMENT RELATIONS", r"GOVT\.? AFFAIRS", r"EDUCATION POLICY",
    ),
    "programs": (
        r"\bPROGRAM", r"\bPRGRM", r"\bPORGRAM", r"\bIMPACT\b", r"\bPROJECT", r"\bINITIATIVES?\b",
        r"\bGRANTS?\b", r"\bFIELD\b", r"\bPARTNERSHIPS?\b", r"\bEDUCATION\b", r"\bLEARNING\b",
    ),
    "strategy": (r"\bSTRATEG", r"SPECIAL INITIATIVES?"),
}

# These phrases have a substantive meaning that generic source-order keyword
# precedence would reverse. They also serve as regression-safe mappings for
# equivalent future titles; observation-level overrides below still record the
# reviewed evidence and rationale for the current filing rows.
PHRASE_ROLE_TAGS: tuple[tuple[re.Pattern[str], tuple[str, ...]], ...] = (
    (re.compile(r"\bSCIENCE POLICY\b"), ("policy", "research")),
    (re.compile(r"\bPUBLIC OPINION\b.*\bPOLICY\b"), ("research", "policy")),
    (re.compile(r"\bPUBLICATIONS?\b.*\bEDUCATION\b"), ("communications", "programs")),
    (re.compile(r"\bDIGITAL STRATEGY\b"), ("communications", "strategy")),
    (re.compile(r"\bREASEARCH\b.*\bSTRATEGY\b"), ("research", "strategy")),
    (re.compile(r"\bSTRATEGY\b.*\bPUBLIC ENGAGEMENT\b"), ("strategy", "communications")),
)

PRIMARY_ROLE_ORDER = (
    "chief_of_staff", "operations", "finance", "people", "legal", "development",
    "communications", "technology", "research", "policy", "programs", "strategy",
)

GENERAL_LEADERSHIP_PATTERNS = (
    r"\bMANAGING DIR", r"\bDEPUTY\b", r"\bEXECUTIVE VICE PRESIDENT\b",
    r"\bEXEC(?:\.|UTIVE)? VP\b", r"\bEVP\b",
    r"\bSENIOR VICE PRESIDENT\b", r"\bSR\.? VP\b", r"\bVICE PRESIDENT\b", r"\bVP\b",
    r"\bPRESIDENT\b", r"\bDIRECTOR\b", r"\bDIR\.?\b", r"\bHEAD\b", r"\bMANAGER\b",
    r"\bMNGR\b", r"\bLEAD\b", r"\bOFFICER\b",
)

CEO_TITLE_PATTERNS = (
    r"\bCEO\b", r"^CEO", r"CHIEF EXECUTIVE", r"^(?:CO-)?EXECUTIVE DIRECTOR\b",
    r"^EXECUTIVE DIR(?:\.|ECTOR)?\b", r"^EXECUTIVE DI\b", r"PRESIDENT.{0,8}CEO",
    r"CHEIF EXECUTIVE",
)

TRANSITION_PATTERN = re.compile(
    r"\b(?:PARTIAL(?: YEAR)?|FORMER|INTERIM|ACTING|OUTGOING|THRU|THROUGH|UNTIL|TILL|"
    r"ENDED?|START(?:ED)?|FROM|AFTER|INCOMING|BEG(?:AN|INS?)?|PRESENT|DEPART(?:ED|URE))\b|"
    r"\bTO\s+(?=\d)",
    re.IGNORECASE,
)

PROGRAM_EXECUTIVE_PATTERN = re.compile(
    r"\b(?:EPOCH|APOLLO|USA|U\.S\.|AFRICA|REGIONAL|REGION|BPCA|HEALTH|DEMOCRACY|"
    r"ENERGY|HOUSING|AFRICA FRONTLINE FIRST)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Classification:
    record_type: str
    family: str
    role_tags: tuple[str, ...]
    title_group: str
    seniority: str
    scope: str
    incumbency: str
    rule: str
    confidence: str


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=fieldnames,
            extrasaction="raise",
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(rows)


def lname(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def clean_text(value: object) -> str:
    text = "" if value is None else str(value).strip()
    return "" if text.lower() in {"", "nan", "none"} else text


def direct_values(element: ET.Element) -> dict[str, str]:
    return {lname(child.tag): clean_text(child.text) for child in list(element)}


def first_value(root: ET.Element, *names: str) -> str:
    wanted = set(names)
    for element in root.iter():
        if lname(element.tag) in wanted and clean_text(element.text):
            return clean_text(element.text)
    return ""


def integer(record: dict[str, str] | None, field: str) -> int | None:
    if record is None or not clean_text(record.get(field)):
        return None
    return int(round(float(record[field].replace(",", ""))))


def number(value: object) -> float | None:
    text = clean_text(value)
    if not text:
        return None
    parsed = float(text)
    if not math.isfinite(parsed):
        raise ValueError(f"Non-finite number: {value!r}")
    return parsed


def boolean(value: object) -> bool:
    return clean_text(value).lower() in {"true", "yes", "1", "x"}


def normalize_name(value: str) -> str:
    return "".join(re.findall(r"[a-z0-9]+", value.lower()))


def person_tokens(value: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]+", value.lower())
    prefixes = {"dr", "mr", "mrs", "ms", "prof"}
    suffixes = {"md", "phd", "ph", "d", "esq", "cpa", "cfp", "cfre", "sphr", "mba", "jd"}
    while tokens and tokens[0] in prefixes:
        tokens.pop(0)
    while tokens and tokens[-1] in suffixes:
        tokens.pop()
    return tokens


def split_people(value: str) -> list[str]:
    if not value or re.search(r"no clean|transition|not reported|leadership", value, re.I):
        return []
    return [part.strip() for part in re.split(r"\s*/\s*|\s+and\s+", value) if part.strip()]


def matches_person(candidate: str, targets: list[str]) -> bool:
    candidate_tokens = person_tokens(candidate)
    if not candidate_tokens:
        return False
    for target in targets:
        target_tokens = person_tokens(target)
        if not target_tokens:
            continue
        if candidate_tokens == target_tokens:
            return True
        if candidate_tokens[-1] == target_tokens[-1] and candidate_tokens[0][0] == target_tokens[0][0]:
            return True
    return False


def normalize_title(value: str) -> str:
    normalized = value.upper().replace("&", " AND ")
    normalized = re.sub(r"[^A-Z0-9/+ -]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip(" -")
    return normalized


def effective_identity_title(
    source_id: str,
    part: dict[str, str],
    schedule: dict[str, str] | None,
) -> tuple[str, str, str, str]:
    """Return reviewed display identity/title while preserving source fields.

    The default is exactly the Part VII identity and title. Every departure is
    observation-specific and validates the expected raw input so a later filing
    or parser change cannot silently inherit an obsolete correction.
    """
    raw_person = part.get("PersonNm", "")
    raw_title = part.get("TitleTxt", "")
    observation_id = f"{source_id}::{normalize_name(raw_person)}"

    spillover = REVIEWED_NAME_TITLE_SPILLOVERS.get(observation_id)
    if spillover:
        if (
            raw_person != spillover["raw_person"]
            or raw_title != spillover["raw_title"]
        ):
            raise ValueError(
                f"Reviewed name/title spillover source fields changed: {observation_id}"
            )
        return (
            spillover["effective_person"],
            spillover["effective_title"],
            "part_vii_person_name_reviewed_spillover",
            spillover["rule"],
        )

    acronym = REVIEWED_ACRONYM_TITLE_EXPANSIONS.get(observation_id)
    if acronym:
        if raw_title != acronym["raw_title"]:
            raise ValueError(
                f"Reviewed title acronym source field changed: {observation_id}"
            )
        return (
            raw_person,
            acronym["effective_title"],
            "reviewed_organization_title_acronym",
            acronym["rule"],
        )

    schedule_expansion = REVIEWED_SCHEDULE_J_TITLE_EXPANSIONS.get(observation_id)
    if schedule_expansion:
        schedule_title = schedule.get("TitleTxt", "") if schedule else ""
        if (
            raw_title != schedule_expansion["part_vii_title"]
            or schedule_title != schedule_expansion["schedule_j_title"]
        ):
            raise ValueError(
                f"Reviewed Schedule J title expansion source fields changed: {observation_id}"
            )
        return (
            raw_person,
            schedule_expansion["effective_title"],
            "schedule_j_reviewed_expansion",
            schedule_expansion["rule"],
        )

    return raw_person, raw_title, "part_vii_native", "part_vii_native_title"


def title_matches(title: str, patterns: tuple[str, ...]) -> bool:
    return any(re.search(pattern, title) for pattern in patterns)


def functional_tags(title: str) -> tuple[str, ...]:
    """Return functional tags in source-title order, with stable tie-breaking.

    A fixed global family order made phrases such as "software development",
    "general counsel / treasurer", and "finance and operations" choose the
    wrong primary function. Source order is a more transparent default for
    genuinely combined titles; reviewed exceptions remain explicit above.
    """
    for pattern, phrase_tags in PHRASE_ROLE_TAGS:
        if pattern.search(title):
            return phrase_tags

    tie_order = {family: index for index, family in enumerate(PRIMARY_ROLE_ORDER)}
    matches: list[tuple[int, int, str]] = []
    for family, patterns in ROLE_PATTERNS.items():
        starts = [match.start() for pattern in patterns if (match := re.search(pattern, title))]
        if starts:
            matches.append((min(starts), tie_order[family], family))
    return tuple(family for _, _, family in sorted(matches))


def board_governance(record: dict[str, str], title: str, cash: int) -> bool:
    director_flag = boolean(record.get("IndividualTrusteeOrDirectorInd"))
    officer_flag = boolean(record.get("OfficerInd"))
    hours = (
        (number(record.get("AverageHoursPerWeekRt")) or 0)
        + (number(record.get("AverageHoursPerWeekRltdOrgRt")) or 0)
    )
    board_title = bool(re.fullmatch(
        r"(?:BOARD )?(?:MEMBER|DIRECTOR|TRUSTEE|CHAIR(?:MAN|WOMAN)?|VICE CHAIR|SECRETARY|TREASURER)"
        r"(?: AND (?:SECRETARY|TREASURER))?",
        title,
    ))
    return board_title and (
        cash == 0 or (director_flag and hours <= 15) or (director_flag and not officer_flag)
    )


def title_level(title: str, family: str, record_type: str, governance: bool) -> tuple[str, str]:
    if governance:
        return "board_governance", "governance"
    if record_type in {"canonical_ceo", "generic_ceo_like"}:
        return "chief_executive", "executive"
    if re.search(r"\bCHIEF\b|\b(?:COO|CFO|CTO|CIO|CPO|CDO|CFAO|CFOO)\b", title):
        return "chief_officer", "executive"
    if (
        re.search(r"\b(?:GENERAL|GEN) COUNS(?:EL)?\b", title)
        and not re.search(r"\b(?:ASSOCIATE|ASSOC|DEPUTY|ASSISTANT|ASST) (?:GENERAL |GEN )?COUNS", title)
    ):
        return "chief_officer", "executive"
    if re.search(r"\bEXECUTIVE VICE[- ]?PRESIDENT\b|\bEXEC(?:UTIVE)?\.? VP\b|\bEVP\b", title):
        return "executive_leadership", "executive"
    if re.search(r"\bSENIOR VICE PRESIDENT\b|\bSENIOR VP\b|\bSR\.? VP\b|\bSVP\b|\bVICE PRESIDENT\b|\bVP\b", title):
        return "vice_president", "senior_leader"
    if re.search(r"\bPRESIDENT\b", title):
        return "executive_leadership", "executive"
    if re.search(r"\bMANAGING DIR|\bMG DIR|\bDEPUTY\b", title):
        return "managing_or_deputy_director", "senior_leader"
    if re.search(r"\bDIRECTOR\b|\bDIRECOTR\b|\bDIR\.?\b", title):
        return "director", "senior_leader"
    if re.search(r"\bHEAD\b|\bLEAD\b", title):
        return "head_or_lead", "senior_leader"
    if re.search(r"\bMANAGER\b|\bMNGR\b", title):
        return "manager", "manager"
    if re.search(r"\bSENIOR\b|\bSR\.?\b|\bPRINCIPAL\b|\bADVISOR\b|\bFELLOW\b", title):
        return "senior_individual_contributor", "individual_contributor"
    if family:
        return "functional_individual_contributor", "individual_contributor"
    return "unclassified", "unknown"


def benchmark_position(title: str, classification: Classification) -> dict[str, str]:
    """Assign one conservative standardized title without duplicating hybrids."""
    empty = {
        "key": "",
        "rule": "not_a_supported_standardized_title",
        "alias_quality": "",
        "hybrid_status": "none",
        "hybrid_reason": "",
    }
    if classification.record_type != "non_ceo_position":
        return empty

    def result(key: str, rule: str, quality: str = "expanded") -> dict[str, str]:
        return {
            "key": key,
            "rule": rule,
            "alias_quality": quality,
            "hybrid_status": "none",
            "hybrid_reason": "",
        }

    def hybrid(reason: str) -> dict[str, str]:
        return {
            "key": "",
            "rule": "hybrid_title_excluded_from_strict_position_benchmark",
            "alias_quality": "ambiguous",
            "hybrid_status": "multi_role",
            "hybrid_reason": reason,
        }

    has_coo = bool(re.search(r"\bCOO\b|\bCHIEF (?:OPERATING|OPERATIONS) OFFICER\b|\bCHIEF OF OPERATIONS\b", title))
    has_cfo = bool(re.search(r"\bCFO\b|\bCHIEF FINANCIAL OFFICER\b", title))
    has_chief_of_staff = "CHIEF OF STAFF" in title
    has_general_counsel = bool(re.search(r"\bGENERAL COUNS(?:EL)?\b|\bGEN COUNS(?:EL)?\b|\bCHIEF LEGAL OFFICER\b", title))
    has_managing_director = bool(re.search(r"\b(?:MANAGING|MG) DIR(?:ECTOR)?\b", title))
    hybrid_rules = (
        (r"CHIEF (?:FINANCIAL|FINANCE) AND OPERAT|\bCFOO\b|\bCFAO\b", "combined or ambiguous finance-and-operations chief"),
        (r"\bCOO\b.*CHIEF OF STAFF|CHIEF OF STAFF.*\bCOO\b", "COO and Chief of Staff combined in one title"),
        (r"CHIEF OPERAT(?:ING|IONS) OFFICER.*CHIEF LEGAL", "COO and Chief Legal Officer combined in one title"),
        (r"CHIEF PROGRAM AND OPERAT|CHIEF OF PROGRAMS AND STRATEGY|CHIEF OPERATIONS AND PEOPLE", "multiple organization-wide chief functions combined in one title"),
        (r"OPERATIONS AND CTO", "operations and technology chief combined in one title"),
        (r"CHIEF STRATEGY AND IMPACT", "strategy and impact chief combined in one title"),
        (r"(?<!VICE )\bPRESIDENT AND COO", "President and COO combined in one title"),
        (r"COO AND MANAGING DIRECTOR", "COO and Managing Director combined in one title"),
        (r"(?<!VICE )\bPRESIDENT AND CTO", "President and CTO combined in one title"),
        (r"(?:\bPOLICY\b.*GENERAL COUNS|GENERAL COUNS.*\bPOLICY\b)", "Policy Director and General Counsel combined in one title"),
    )
    for pattern, reason in hybrid_rules:
        if re.search(pattern, title):
            return hybrid(reason)

    if "DEPUTY CHIEF OF STAFF" in title:
        return result("deputy_chief_of_staff", "explicit_deputy_chief_of_staff", "exact")

    if has_coo:
        quality = "standard_abbreviation" if re.search(r"\bCOO\b", title) else "exact"
        return result("coo", "standard_coo_alias", quality)
    if has_cfo:
        quality = "standard_abbreviation" if re.search(r"\bCFO\b", title) else "exact"
        return result("cfo", "standard_cfo_alias", quality)
    if classification.family == "chief_of_staff" and has_chief_of_staff:
        return result("chief_of_staff", "explicit_chief_of_staff", "exact")
    if has_general_counsel and not re.search(r"\b(?:ASSOCIATE|ASSOC|DEPUTY|ASSISTANT|ASST) (?:GENERAL |GEN )?COUNSEL\b", title):
        quality = "exact" if "GENERAL COUNSEL" in title else "expanded"
        return result("general_counsel", "general_counsel_or_clo_alias", quality)

    if re.search(r"\bCHIEF (?:OF )?PEOPLE\b|\bCHIEF HUMAN (?:RESOURCES|CAPITAL)\b|\bCHIEF PEOPLE\b", title):
        return result("chief_people_officer", "people_chief_alias")
    if re.search(r"\bCHIEF DEVELOPMENT OFFICER\b|\bCHIEF OF DEVELOPMENT\b|\bCHIEF REVENUE OFFICER\b|\bCHIEF PHILANTHROP", title):
        return result("chief_development_officer", "development_chief_alias")
    if re.search(r"\bCHIEF COMMUNICATIONS? OFFICER\b|\bCHIEF COMMUNICATION OFFICE\b|\bCHIEF MARKETING OFFICER", title):
        return result("chief_communications_officer", "communications_chief_alias")
    if re.search(r"\bCHIEF STRATEGY OFFICER\b|\bCHIEF OF STRATEGY\b|\bCHIEF STRATEGIST\b|\bCHIEF INNOVATION OFFICER\b|\bCHF STRATEGY OFCR\b", title):
        return result("chief_strategy_officer", "strategy_chief_alias")
    if re.search(r"\bCHIEF PROGRAMS? OFFICER\b|\bCHIEF OF PROGRAMS\b", title):
        return result("chief_program_officer", "program_chief_alias")
    if re.search(r"\bCHIEF IMPACT OFFICER\b", title):
        return result("chief_impact_officer", "explicit_chief_impact_officer", "exact")
    if re.search(r"\bCHIEF ECONOMIST\b", title):
        return result("chief_economist", "explicit_chief_economist", "exact")
    if re.search(r"\bCHIEF (?:RESEARCH|RSRCH) OFFICER\b|\bCHIEF OF RESEARCH\b|\bCHIEF RSRCH\b", title):
        return result("chief_research_officer", "research_chief_alias")
    if re.search(r"\bCHIEF SCIENTIST\b", title):
        return result("chief_scientist", "explicit_chief_scientist", "exact")
    if re.search(r"\bCTO\b|\bCHIEF TECHNOLOGY OFFICER\b|\bCHIEF PRODUCT AND TECHNOLOGY\b", title):
        quality = "standard_abbreviation" if re.search(r"\bCTO\b", title) else "exact"
        return result("cto", "standard_cto_alias", quality)
    if re.search(r"\bCHIEF INFORMATION OFFICER\b", title):
        return result("cio", "explicit_chief_information_officer", "exact")

    if re.search(r"\bEXECUTIVE VICE[- ]?PRESIDENT\b|\bEXECUTIVE VP\b|\bEXEC\.? VP\b|\bEVP\b", title):
        return result("executive_vice_president", "executive_vice_president_alias")
    if re.search(r"\bSENIOR VICE PRESIDENT\b|\bSENIOR VP\b|\bSR\.? VP\b|\bSVP\b", title):
        return result("senior_vice_president", "senior_vice_president_alias")
    if re.search(r"\bDEPUTY (?:VICE PRESIDENT|VP)\b", title):
        return result("deputy_vice_president", "deputy_vice_president_alias")
    if re.search(r"\bVICE PRESIDENT\b|\bVP\b", title):
        return result("vice_president", "vice_president_alias")

    if re.search(r"\bASSISTANT MANAGING DIRECTOR\b", title):
        return result("assistant_managing_director", "explicit_assistant_managing_director", "exact")
    if has_managing_director and not re.search(r"\bASS(?:ISTANT|T)\b", title):
        return result("managing_director", "managing_director_alias")
    if re.fullmatch(r"DEPUTY DIR(?:ECTOR)?", title):
        return result("deputy_director", "deputy_director_alias")

    is_director = bool(re.search(r"\b(?:DIRECTOR|DIR|DIRECOTR)\b", title))
    if is_director:
        family_position = None
        if classification.family == "programs" and re.search(r"\bPROGRAMS?\b", title):
            family_position = ("program_director", "explicit_program_director_alias")
        elif classification.family == "research" and re.search(r"\b(?:RESEARCH|RSRCH|RESEA)\b", title):
            family_position = ("research_director", "explicit_research_director_alias")
        elif classification.family == "development" and re.search(r"DEVELOP|PHILANTHROP|ADVANCEMENT|GIVING|RESOURCE MOBILIZATION|REVENUE|MEMBERSHIP", title):
            family_position = ("development_director", "explicit_development_director_alias")
        elif classification.family == "policy" and re.search(r"POLICY|ADVOCACY|GOVERNMENT AFFAIRS|LEGISLATIVE|PUBLIC POLICY", title):
            family_position = ("policy_director", "explicit_policy_director_alias")
        elif classification.family == "communications" and re.search(r"COMM|PUBLIC AFFAIRS|EXTERNAL AFFAIRS|MARKETING|EDITORIAL", title):
            family_position = ("communications_director", "explicit_communications_director_alias")
        elif classification.family == "finance" and re.search(r"FINANCE|FINANCIAL", title):
            family_position = ("finance_director", "explicit_finance_director_alias")
        if family_position:
            return result(*family_position)

    if classification.family == "finance" and re.search(r"\bCONTROLLER\b", title):
        return result("controller", "explicit_controller_title", "exact")

    if (
        classification.family == "research"
        and re.search(r"\b(?:SENIOR|SR\.?|PRINCIPAL|DISTINGUISHED|DIST|LEAD)\b", title)
        and re.search(r"FELLOW|RESEARCH|SCIENTIST|SCIEN|ECONOMIST|ANALY", title)
        and classification.title_group in {"senior_individual_contributor", "functional_individual_contributor"}
    ):
        return result("senior_researcher", "senior_research_title")
    return empty


def classify_record(
    record: dict[str, str],
    canonical_ceo: bool,
    source_id: str,
    schedule_title: str = "",
) -> Classification:
    raw_title = record.get("TitleTxt", "")
    title = normalize_title(raw_title)
    org_cash = integer(record, "ReportableCompFromOrgAmt") or 0
    related_cash = integer(record, "ReportableCompFromRltdOrgAmt") or 0
    cash = org_cash + related_cash
    observation_id = f"{source_id}::{normalize_name(record.get('PersonNm', ''))}"
    tags = functional_tags(title)
    forced_governance_rule = FORCED_GOVERNANCE_OBSERVATIONS.get(observation_id)
    governance = board_governance(record, title, cash) or bool(forced_governance_rule)
    transition_text = f"{record.get('PersonNm', '')} {raw_title} {schedule_title}"
    incumbency = (
        "fractional"
        if re.search(r"\bFRACTIONAL\b", transition_text, re.IGNORECASE)
        else
        "former_or_partial"
        if boolean(record.get("FormerOfcrDirectorTrusteeInd")) or TRANSITION_PATTERN.search(transition_text)
        else "current"
    )

    if governance:
        family = ""
        tags = ()
        record_type = "governance"
        scope = "governance"
        rule = (
            forced_governance_rule
            or "part_vii_board_flag_and_board_title"
        )
        confidence = "high"
    elif canonical_ceo:
        family = ""
        record_type = "canonical_ceo"
        scope = "organization_wide"
        rule = "validated_ceo_name_override"
        confidence = "high"
    elif title_matches(title, CEO_TITLE_PATTERNS):
        family = ""
        record_type = "generic_ceo_like"
        scope = "program_or_affiliate" if PROGRAM_EXECUTIVE_PATTERN.search(title) else "uncertain"
        rule = "ceo_like_title_not_authoritative_ceo"
        confidence = "medium"
    else:
        family = tags[0] if tags else ""
        if not family and title_matches(title, GENERAL_LEADERSHIP_PATTERNS):
            family = "general_leadership"
        record_type = "non_ceo_position" if family else "unmapped_position"
        scope = "functional" if family else "uncertain"
        rule = f"title_keywords:{family}" if family else "no_reviewed_family_match"
        confidence = "high" if family and len(tags) <= 1 and family != "general_leadership" else "medium" if family else "low"

    role_override = REVIEWED_ROLE_OVERRIDES.get(observation_id)
    if role_override and record_type not in {"canonical_ceo", "generic_ceo_like", "governance"}:
        family, secondary_tags, override_rule = role_override
        tags = tuple(dict.fromkeys((family, *secondary_tags)))
        record_type = "non_ceo_position"
        scope = "functional"
        rule = f"reviewed_record_override:{override_rule}"
        confidence = "high"

    title_group, seniority = title_level(title, family, record_type, governance)
    if source_id == RP_SOURCE_ID and record.get("PersonNm") in {"Jaime Sevilla", "Tamay Besiroglu", "Charlotte Stix"}:
        scope = "program_or_affiliate"
        rule += "+rp_named_project_scope"
    if observation_id in SCOPE_OVERRIDES:
        scope, override_rule = SCOPE_OVERRIDES[observation_id]
        rule += f"+{override_rule}"
    return Classification(
        record_type=record_type,
        family=family,
        role_tags=tags,
        title_group=title_group,
        seniority=seniority,
        scope=scope,
        incumbency=incumbency,
        rule=rule,
        confidence=confidence,
    )


def cpi_factor(year: int) -> float:
    rows = read_csv(CPI_PATH)
    target = [number(row["index_value"]) for row in rows if row["period"] == "2026-07"]
    annual = [number(row["index_value"]) for row in rows if re.fullmatch(fr"{year}-\d{{2}}", row["period"])]
    if len(target) != 1 or len(annual) != 12 or any(value is None for value in annual):
        raise ValueError(f"Incomplete CPI series for {year}")
    return float(target[0]) / (sum(float(value) for value in annual) / 12)


def stable_taxonomy_id(key: tuple[str, ...]) -> str:
    digest = hashlib.sha256("\x1f".join(key).encode("utf-8")).hexdigest()[:14]
    return f"F990TAX-{digest}"


def format_number(value: int | float | None) -> str | int | float:
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:.6f}".rstrip("0").rstrip(".")
    return value


def bool_text(value: bool) -> str:
    return "yes" if value else "no"


def join_nonempty(values: list[str], separator: str = " | ") -> str:
    return separator.join(dict.fromkeys(value for value in values if value))


def source_path(manifest: dict[str, str]) -> Path:
    path = BENCHMARK / manifest["current_local_path"]
    if not path.is_file():
        raise FileNotFoundError(f"Missing Form 990 XML: {path}")
    return path


def main() -> None:
    assert functional_tags("DIRECTOR OF SCIENCE POLICY")[:2] == ("policy", "research")
    assert functional_tags("VP PUBLIC OPINION FOREIGN POLICY")[:2] == ("research", "policy")
    assert functional_tags("VICE PRESIDENT PUBLICATIONS AND EDUCATION")[:2] == (
        "communications", "programs"
    )
    assert functional_tags("SR DIR DIGITAL STRATEGY")[:2] == ("communications", "strategy")
    assert functional_tags("MANAGER REASEARCH AND STRATEGY")[:2] == ("research", "strategy")
    assert functional_tags("STRATEGY AND PUBLIC ENGAGEMENT")[:2] == (
        "strategy", "communications"
    )
    assert "communications" not in functional_tags("VP FOR BUSINESS ENGAGEMENT")
    assert "communications" not in functional_tags("HEAD OF AI AND MEDIA INTEGRITY")
    assert "technology" not in functional_tags("SR DIR DIGITAL STRATEGY")

    # Regression guards for the board/staff boundary. The first record reaches
    # the previously latent `not officer` branch with positive cash and high
    # reported hours; the second is a paid officer and must remain staff-like.
    assert board_governance(
        {
            "IndividualTrusteeOrDirectorInd": "true", "OfficerInd": "false",
            "AverageHoursPerWeekRt": "40", "PersonNm": "Alex Example",
        },
        "DIRECTOR",
        100_000,
    )
    assert not board_governance(
        {
            "IndividualTrusteeOrDirectorInd": "true", "OfficerInd": "true",
            "AverageHoursPerWeekRt": "40", "PersonNm": "Alex Example",
        },
        "DIRECTOR",
        100_000,
    )

    if len(POSITION_SUPPORTING_SOURCE_BY_OBSERVATION) != len(POSITION_SUPPORTING_SOURCES):
        raise ValueError("Duplicate position-classification supporting-source observation IDs")
    if len({row["source_id"] for row in POSITION_SUPPORTING_SOURCES}) != len(POSITION_SUPPORTING_SOURCES):
        raise ValueError("Duplicate position-classification supporting-source IDs")
    for supporting_source in POSITION_SUPPORTING_SOURCES:
        missing_fields = [
            field for field in POSITION_SUPPORTING_SOURCE_FIELDS
            if not clean_text(supporting_source.get(field))
        ]
        if missing_fields:
            raise ValueError(
                f"Incomplete position-classification supporting source "
                f"{supporting_source.get('source_id', '<unknown>')}: {missing_fields}"
            )
        supporting_path = ROOT / supporting_source["local_path"]
        if not supporting_path.is_file():
            raise FileNotFoundError(f"Missing position-classification supporting source: {supporting_path}")
        supporting_hash = hashlib.sha256(supporting_path.read_bytes()).hexdigest()
        if supporting_hash != supporting_source["sha256"]:
            raise ValueError(
                f"SHA-256 mismatch for position-classification supporting source "
                f"{supporting_source['source_id']}"
            )
    assert not board_governance(
        {
            "IndividualTrusteeOrDirectorInd": "true", "OfficerInd": "true",
            "AverageHoursPerWeekRt": "2", "AverageHoursPerWeekRltdOrgRt": "38",
            "PersonNm": "Alex Example",
        },
        "BOARD TREASURER",
        100_000,
    )

    manifest_rows = [row for row in read_csv(MANIFEST_PATH) if row["evidence_stream"] == "form990"]
    if len(manifest_rows) != EXPECTED_FORM990_COUNT:
        raise ValueError(f"Expected {EXPECTED_FORM990_COUNT} Form 990 records, found {len(manifest_rows)}")
    if len({row["source_id"] for row in manifest_rows}) != len(manifest_rows):
        raise ValueError("Duplicate Form 990 source IDs in acquisition manifest")

    validated_rows = read_csv(VALIDATED_PATH)
    validated_by_source = {row["source_id"]: row for row in validated_rows}
    if len(validated_by_source) != 135:
        raise ValueError(f"Expected 135 validated peer filings, found {len(validated_by_source)}")
    references = read_csv(REFERENCE_PATH)
    reference_by_ein = {row["ein"].replace("-", ""): row for row in references if row["ein"]}
    category_rows = [row for row in read_csv(CATEGORY_PATH) if row["evidence_stream"] == "form990"]
    category_by_source = {row["source_id"]: row for row in category_rows}
    if category_by_source.keys() != validated_by_source.keys():
        raise ValueError("Form 990 category metadata does not cover the validated filing set exactly")

    raw_observations: list[dict] = []
    schedule_count = 0
    contractor_count = 0
    exact_duplicate_count = 0
    identity_checks = 0
    cash_component_differences: dict[str, int] = {}
    schedule_lettercase_differences = 0

    for manifest in manifest_rows:
        source_id = manifest["source_id"]
        path = source_path(manifest)
        actual_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual_hash != manifest["current_sha256"]:
            raise ValueError(f"SHA-256 mismatch for {source_id}")
        root = ET.parse(path).getroot()
        xml_ein = first_value(root, "EIN")
        xml_begin = first_value(root, "TaxPeriodBeginDt")
        xml_end = first_value(root, "TaxPeriodEndDt")
        return_type = first_value(root, "ReturnTypeCd")
        if (
            xml_ein != manifest["ein"].replace("-", "")
            or xml_begin != manifest["tax_period_begin"]
            or xml_end != manifest["tax_period_end"]
            or return_type != "990"
        ):
            raise ValueError(f"Form identity mismatch for {source_id}")
        identity_checks += 1

        part_elements = [element for element in root.iter() if lname(element.tag) == PART_VII_TAG]
        schedule_elements = [element for element in root.iter() if lname(element.tag) == SCHEDULE_J_TAG]
        contractor_count += sum(lname(element.tag) == "ContractorCompensationGrp" for element in root.iter())
        schedule_count += len(schedule_elements)

        part_groups: dict[str, list[tuple[int, dict[str, str]]]] = defaultdict(list)
        for index, element in enumerate(part_elements, start=1):
            record = direct_values(element)
            person = record.get("PersonNm", "")
            if not person:
                raise ValueError(f"Part VII row without PersonNm in {source_id} at index {index}")
            part_groups[normalize_name(person)].append((index, record))

        collapsed_parts: dict[str, tuple[int, dict[str, str], int]] = {}
        for person_key, matches in part_groups.items():
            if len(matches) == 1:
                index, record = matches[0]
                collapsed_parts[person_key] = (index, record, 1)
                continue
            identity = (source_id, person_key)
            if identity != KNOWN_EXACT_DUPLICATE or any(record != matches[0][1] for _, record in matches[1:]):
                raise ValueError(f"Unexpected duplicate Part VII person: {source_id}/{person_key}")
            index, record = matches[0]
            collapsed_parts[person_key] = (index, record, len(matches))
            exact_duplicate_count += len(matches) - 1

        schedule_by_person: dict[str, tuple[int, dict[str, str]]] = {}
        for index, element in enumerate(schedule_elements, start=1):
            record = direct_values(element)
            person_key = normalize_name(record.get("PersonNm", ""))
            if not person_key:
                raise ValueError(f"Schedule J row without PersonNm in {source_id} at index {index}")
            if person_key in schedule_by_person:
                raise ValueError(f"Duplicate Schedule J person: {source_id}/{person_key}")
            if person_key not in collapsed_parts:
                raise ValueError(f"Unmatched Schedule J person: {source_id}/{person_key}")
            part_name = collapsed_parts[person_key][1]["PersonNm"]
            schedule_name = record["PersonNm"]
            if part_name.casefold() != schedule_name.casefold():
                raise ValueError(
                    f"Schedule J requires non-case normalization to match Part VII: "
                    f"{source_id}/{part_name!r}/{schedule_name!r}"
                )
            if part_name != schedule_name:
                schedule_lettercase_differences += 1
            schedule_by_person[person_key] = (index, record)

        validated = validated_by_source.get(source_id, {})
        reference = reference_by_ein.get(xml_ein, {})
        category = category_by_source.get(source_id, {})
        ceo_targets = []
        for field in ("observed_ceo_name", "matched_target_name", "ceo_name"):
            ceo_targets.extend(split_people(validated.get(field, "")))
        ceo_targets.extend(CANONICAL_CEO_ALIASES.get(source_id, ()))
        if source_id == RP_SOURCE_ID:
            ceo_targets.extend(["Marcus Davis", "Peter Hurford"])

        compensation_year = int(float(validated["compensation_calendar_year"])) if validated.get("compensation_calendar_year") else int(xml_begin[:4])
        factor = number(validated.get("cpi_factor")) or cpi_factor(compensation_year)
        if factor <= 0:
            raise ValueError(f"Invalid CPI factor for {source_id}")

        for person_key, (part_index, part, duplicate_count) in collapsed_parts.items():
            person = part["PersonNm"]
            observation_id = f"{source_id}::{person_key}"
            schedule_match = schedule_by_person.get(person_key)
            schedule_index = schedule_match[0] if schedule_match else None
            schedule = schedule_match[1] if schedule_match else None
            canonical_ceo = matches_person(person, ceo_targets)
            (
                effective_person,
                effective_title,
                effective_title_source,
                effective_title_rule,
            ) = effective_identity_title(source_id, part, schedule)
            classification_record = {**part, "TitleTxt": effective_title}
            classification = classify_record(
                classification_record,
                canonical_ceo,
                source_id,
                schedule.get("TitleTxt", "") if schedule else "",
            )

            part_org = integer(part, "ReportableCompFromOrgAmt")
            part_related = integer(part, "ReportableCompFromRltdOrgAmt")
            part_other = integer(part, "OtherCompensationAmt")
            if None in {part_org, part_related, part_other}:
                raise ValueError(f"Incomplete Part VII compensation fields for {observation_id}")
            part_cash = int(part_org) + int(part_related)
            part_total = part_cash + int(part_other)

            schedule_fields = {
                "base_org": "BaseCompensationFilingOrgAmt",
                "base_related": "CompensationBasedOnRltdOrgsAmt",
                "bonus_org": "BonusFilingOrganizationAmount",
                "bonus_related": "BonusRelatedOrganizationsAmt",
                "other_reportable_org": "OtherCompensationFilingOrgAmt",
                "other_reportable_related": "OtherCompensationRltdOrgsAmt",
                "deferred_org": "DeferredCompensationFlngOrgAmt",
                "deferred_related": "DeferredCompRltdOrgsAmt",
                "nontaxable_org": "NontaxableBenefitsFilingOrgAmt",
                "nontaxable_related": "NontaxableBenefitsRltdOrgsAmt",
                "total_org": "TotalCompensationFilingOrgAmt",
                "total_related": "TotalCompensationRltdOrgsAmt",
                "reported_prior_org": "CompReportPrior990FilingOrgAmt",
                "reported_prior_related": "CompReportPrior990RltdOrgsAmt",
            }
            schedule_values: dict[str, int | None] = {}
            if schedule:
                for output_field, xml_field in schedule_fields.items():
                    schedule_values[output_field] = integer(schedule, xml_field) or 0
                expected_org_total = sum(schedule_values[field] for field in (
                    "base_org", "bonus_org", "other_reportable_org", "deferred_org", "nontaxable_org"
                ))
                expected_related_total = sum(schedule_values[field] for field in (
                    "base_related", "bonus_related", "other_reportable_related", "deferred_related", "nontaxable_related"
                ))
                if schedule_values["total_org"] != expected_org_total:
                    raise ValueError(f"Schedule J filing-org total does not reconcile for {observation_id}")
                if schedule_values["total_related"] != expected_related_total:
                    raise ValueError(f"Schedule J related-org total does not reconcile for {observation_id}")
                schedule_reportable_cash = sum(schedule_values[field] for field in (
                    "base_org", "base_related", "bonus_org", "bonus_related",
                    "other_reportable_org", "other_reportable_related",
                ))
                difference = part_cash - schedule_reportable_cash
                if difference:
                    cash_component_differences[observation_id] = difference
            else:
                schedule_values = {field: None for field in schedule_fields}

            schedule_base = (
                schedule_values["base_org"] + schedule_values["base_related"]
                if schedule else None
            )
            schedule_total = (
                schedule_values["total_org"] + schedule_values["total_related"]
                if schedule else None
            )
            peer_primary = boolean(validated.get("primary_eligible"))
            positive_compensation = part_cash > 0
            filing_hours = number(part.get("AverageHoursPerWeekRt")) or 0
            related_hours = number(part.get("AverageHoursPerWeekRltdOrgRt")) or 0
            total_reported_hours = filing_hours + related_hours
            default_hours_eligible = total_reported_hours >= 30
            sensitivity_only_reason = SENSITIVITY_ONLY_OBSERVATIONS.get(
                observation_id, ""
            )
            compensation_year_role_status = (
                "no_transition_indicated"
                if classification.incumbency == "current"
                else "fractional"
                if classification.incumbency == "fractional"
                else "partial_or_uncertain"
            )
            compensation_year_role_rule = "derived_from_source_title_and_part_vii_status"
            if observation_id in REVIEWED_COMPENSATION_YEAR_ROLE_OVERRIDES:
                compensation_year_role_status, compensation_year_role_rule = (
                    REVIEWED_COMPENSATION_YEAR_ROLE_OVERRIDES[observation_id]
                )
            catalog_eligible = classification.family in PUBLIC_FAMILIES and classification.record_type == "non_ceo_position"
            role_eligible = (
                catalog_eligible
                and positive_compensation
                and (
                    compensation_year_role_status in {
                        "no_transition_indicated", "verified_full_year"
                    }
                    or bool(sensitivity_only_reason)
                )
                and classification.scope not in {"governance", "program_or_affiliate", "uncertain"}
            )
            default_included = (
                role_eligible
                and source_id != RP_SOURCE_ID
                and default_hours_eligible
                and compensation_year_role_status in {
                    "no_transition_indicated", "verified_full_year"
                }
                and not sensitivity_only_reason
            )
            exclusion_reasons = []
            if classification.record_type == "canonical_ceo":
                exclusion_reasons.append("CEO retained in authoritative CEO dataset")
            elif classification.record_type == "generic_ceo_like":
                exclusion_reasons.append("CEO-like title is not the validated organization-wide CEO")
            elif classification.record_type == "governance":
                exclusion_reasons.append("board/governance role")
            elif not classification.family:
                exclusion_reasons.append("no reviewed public role-family mapping")
            if not positive_compensation:
                exclusion_reasons.append("no positive Part VII reportable compensation")
            if compensation_year_role_status == "not_held":
                exclusion_reasons.append("role not held during compensation calendar year")
            elif compensation_year_role_status == "partial_or_uncertain":
                exclusion_reasons.append(
                    "source indicates or cannot rule out a transition during the compensation calendar year"
                )
            elif compensation_year_role_status == "fractional":
                exclusion_reasons.append("source-labeled fractional role")
            if classification.scope in {"program_or_affiliate", "uncertain"}:
                exclusion_reasons.append(f"{classification.scope.replace('_', ' ')} scope")
            if role_eligible and not default_hours_eligible:
                exclusion_reasons.append("below_30_weekly_hours_or_source_anomaly")
            if sensitivity_only_reason == "related_org_hours_without_identified_related_employer":
                exclusion_reasons.append(
                    "related-organization hours without identified related employer"
                )
            elif sensitivity_only_reason == "related_org_compensation_with_unreconciled_employer_scale_boundary":
                exclusion_reasons.append(
                    "related-organization compensation with an unreconciled employer/scale boundary"
                )
            if source_id == RP_SOURCE_ID:
                exclusion_reasons.append("RP reference observation, never part of fitted peer distribution")

            native_normalized_title = normalize_title(part.get("TitleTxt", ""))
            normalized_title = normalize_title(effective_title)
            standardized = benchmark_position(normalized_title, classification)
            taxonomy_key = (
                normalized_title,
                classification.record_type,
                classification.family,
                ";".join(classification.role_tags),
                classification.title_group,
                classification.seniority,
                classification.scope,
                classification.incumbency,
                classification.rule,
                classification.confidence,
                standardized["key"],
                standardized["rule"],
                standardized["alias_quality"],
                standardized["hybrid_status"],
                standardized["hybrid_reason"],
            )
            taxonomy_id = stable_taxonomy_id(taxonomy_key)
            part_locator = f"Return/ReturnData/IRS990/{PART_VII_TAG}[{part_index}]"
            schedule_locator = f"Return/ReturnData/IRS990ScheduleJ/{SCHEDULE_J_TAG}[{schedule_index}]" if schedule_index else ""
            source_local_path = f"benchmark/{manifest['current_local_path']}"
            classification_source = POSITION_SUPPORTING_SOURCE_BY_OBSERVATION.get(
                observation_id, {}
            )

            raw_observations.append({
                "observation_id": observation_id,
                "source_id": source_id,
                "organization": manifest["organization"],
                "ein": manifest["ein"],
                "irs_object_id": manifest["irs_object_id"],
                "is_rp_reference": bool_text(source_id == RP_SOURCE_ID),
                "person_name": person,
                "person_key": person_key,
                "native_title": part.get("TitleTxt", ""),
                "native_normalized_title": native_normalized_title,
                "effective_person_name": effective_person,
                "effective_title": effective_title,
                "effective_title_source": effective_title_source,
                "effective_title_rule": effective_title_rule,
                "normalized_title": normalized_title,
                "taxonomy_id": taxonomy_id,
                "record_type": classification.record_type,
                "position_family": classification.family,
                "secondary_role_tags": ";".join(tag for tag in classification.role_tags if tag != classification.family),
                "title_group": classification.title_group,
                "seniority_group": classification.seniority,
                "role_scope": classification.scope,
                "incumbency_status": classification.incumbency,
                "compensation_year_role_status": compensation_year_role_status,
                "compensation_year_role_rule": compensation_year_role_rule,
                "classification_rule": classification.rule,
                "classification_confidence": classification.confidence,
                "benchmark_position": standardized["key"],
                "benchmark_position_rule": standardized["rule"],
                "benchmark_position_alias_quality": standardized["alias_quality"],
                "benchmark_position_hybrid_status": standardized["hybrid_status"],
                "benchmark_position_hybrid_reason": standardized["hybrid_reason"],
                "benchmark_position_eligible": bool_text(
                    bool(standardized["key"]) and role_eligible
                ),
                "benchmark_position_default_included": bool_text(
                    bool(standardized["key"]) and default_included
                ),
                "classification_source_id": classification_source.get("source_id", ""),
                "classification_source_url": classification_source.get("canonical_url", ""),
                "classification_source_local_path": classification_source.get("local_path", ""),
                "classification_source_sha256": classification_source.get("sha256", ""),
                "catalog_eligible": bool_text(catalog_eligible),
                "role_eligible": bool_text(role_eligible),
                "peer_primary_eligible": bool_text(peer_primary),
                "default_included": bool_text(default_included),
                "sensitivity_only_reason": sensitivity_only_reason,
                "default_exclusion_reason": "; ".join(dict.fromkeys(exclusion_reasons)),
                "tax_period_begin": xml_begin,
                "tax_period_end": xml_end,
                "compensation_calendar_year": compensation_year,
                "filing_date": validated.get("filing_date", ""),
                "average_hours_per_week": part.get("AverageHoursPerWeekRt", ""),
                "average_hours_related_orgs": part.get("AverageHoursPerWeekRltdOrgRt", ""),
                "total_reported_hours": format_number(total_reported_hours),
                "default_hours_eligible": bool_text(default_hours_eligible),
                "individual_trustee_or_director": bool_text(boolean(part.get("IndividualTrusteeOrDirectorInd"))),
                "officer": bool_text(boolean(part.get("OfficerInd"))),
                "key_employee": bool_text(boolean(part.get("KeyEmployeeInd"))),
                "highest_compensated_employee": bool_text(boolean(part.get("HighestCompensatedEmployeeInd"))),
                "former_officer_director_trustee": bool_text(boolean(part.get("FormerOfcrDirectorTrusteeInd"))),
                "duplicate_source_rows": duplicate_count,
                "part_vii_org_nominal": part_org,
                "part_vii_related_nominal": part_related,
                "part_vii_other_nominal": part_other,
                "part_vii_cash_nominal": part_cash,
                "part_vii_total_nominal": part_total,
                "schedule_j_present": bool_text(schedule is not None),
                "schedule_j_title": schedule.get("TitleTxt", "") if schedule else "",
                "schedule_j_base_org_nominal": format_number(schedule_values["base_org"]),
                "schedule_j_base_related_nominal": format_number(schedule_values["base_related"]),
                "schedule_j_base_total_nominal": format_number(schedule_base),
                "schedule_j_bonus_org_nominal": format_number(schedule_values["bonus_org"]),
                "schedule_j_bonus_related_nominal": format_number(schedule_values["bonus_related"]),
                "schedule_j_other_reportable_org_nominal": format_number(schedule_values["other_reportable_org"]),
                "schedule_j_other_reportable_related_nominal": format_number(schedule_values["other_reportable_related"]),
                "schedule_j_deferred_org_nominal": format_number(schedule_values["deferred_org"]),
                "schedule_j_deferred_related_nominal": format_number(schedule_values["deferred_related"]),
                "schedule_j_nontaxable_org_nominal": format_number(schedule_values["nontaxable_org"]),
                "schedule_j_nontaxable_related_nominal": format_number(schedule_values["nontaxable_related"]),
                "schedule_j_total_org_nominal": format_number(schedule_values["total_org"]),
                "schedule_j_total_related_nominal": format_number(schedule_values["total_related"]),
                "schedule_j_total_nominal": format_number(schedule_total),
                "schedule_j_reported_prior_org_nominal": format_number(schedule_values["reported_prior_org"]),
                "schedule_j_reported_prior_related_nominal": format_number(schedule_values["reported_prior_related"]),
                "cpi_factor_to_july_2026": f"{factor:.12f}".rstrip("0").rstrip("."),
                "part_vii_cash_july_2026": format_number(round(part_cash * factor, 2)),
                "part_vii_total_july_2026": format_number(round(part_total * factor, 2)),
                "schedule_j_base_total_july_2026": format_number(round(schedule_base * factor, 2) if schedule_base is not None else None),
                "schedule_j_total_july_2026": format_number(round(schedule_total * factor, 2) if schedule_total is not None else None),
                "peer_tier": validated.get("tier_group", "Reference" if source_id == RP_SOURCE_ID else ""),
                "reference_tier": reference.get("reference_tier", "Reference" if source_id == RP_SOURCE_ID else ""),
                "ea_affinity": normalize_ea_affinity(
                    category.get(
                        "ea_relationship",
                        "EA-adjacent" if source_id == RP_SOURCE_ID else validated.get("ea_affinity", ""),
                    )
                ),
                "comparability_score": validated.get("comparability_score", ""),
                "topic_cluster": reference.get("topic_cluster", category.get("topic_model", "RP reference organization" if source_id == RP_SOURCE_ID else "")),
                "country_or_region": reference.get("country_or_region", "US" if source_id == RP_SOURCE_ID else ""),
                "expected_structure": reference.get("expected_structure", category.get("expected_structure", "independent nonprofit" if source_id == RP_SOURCE_ID else "")),
                "organization_revenue": validated.get("observed_revenue", ""),
                "organization_expenses": validated.get("observed_expenses", ""),
                "organization_staff": validated.get("observed_employee_count", ""),
                "peer_analysis_status": validated.get("analysis_status", "reference only" if source_id == RP_SOURCE_ID else ""),
                "peer_structure_flag": validated.get("structure_flag", "reference" if source_id == RP_SOURCE_ID else ""),
                "official_irs_url": validated.get("official_irs_url", manifest.get("fallback_url_2", "")),
                "propublica_url": validated.get("propublica_url", manifest.get("fallback_url_1", "")),
                "canonical_bulk_url": manifest["canonical_url"],
                "source_local_path": source_local_path,
                "source_sha256": manifest["current_sha256"],
                "part_vii_xml_locator": part_locator,
                "schedule_j_xml_locator": schedule_locator,
            })

    if schedule_count != 814:
        raise ValueError(f"Expected 814 Schedule J rows, found {schedule_count}")
    if schedule_lettercase_differences != 3:
        raise ValueError(
            f"Expected three Schedule J letter-case-only name differences, found "
            f"{schedule_lettercase_differences}"
        )
    if exact_duplicate_count != 1:
        raise ValueError(f"Expected one reviewed exact duplicate, found {exact_duplicate_count}")
    if cash_component_differences != KNOWN_CASH_COMPONENT_DIFFERENCES:
        raise ValueError(
            "Unexpected Part VII/Schedule J reportable-cash differences: "
            + json.dumps(cash_component_differences, sort_keys=True)
        )
    if len(raw_observations) != 2785:
        raise ValueError(f"Expected 2,785 deduplicated Part VII observations, found {len(raw_observations)}")
    if len({row["observation_id"] for row in raw_observations}) != len(raw_observations):
        raise ValueError("Duplicate stable observation IDs")

    observations_by_id = {row["observation_id"]: row for row in raw_observations}
    if missing_supporting_observations := (
        POSITION_SUPPORTING_SOURCE_BY_OBSERVATION.keys() - observations_by_id.keys()
    ):
        raise ValueError(
            "Position-classification supporting sources do not resolve to observations: "
            f"{sorted(missing_supporting_observations)}"
        )
    for observation_id, supporting_source in POSITION_SUPPORTING_SOURCE_BY_OBSERVATION.items():
        observation = observations_by_id[observation_id]
        if observation["organization"] != supporting_source["organization"]:
            raise ValueError(
                f"Position-classification supporting-source organization mismatch: {observation_id}"
            )
        if (
            observation["classification_source_id"] != supporting_source["source_id"]
            or observation["classification_source_url"] != supporting_source["canonical_url"]
            or observation["classification_source_local_path"] != supporting_source["local_path"]
            or observation["classification_source_sha256"] != supporting_source["sha256"]
        ):
            raise ValueError(
                f"Position-classification supporting-source fields were not applied: {observation_id}"
            )
    if missing_overrides := REVIEWED_ROLE_OVERRIDES.keys() - observations_by_id.keys():
        raise ValueError(f"Reviewed role overrides do not resolve: {sorted(missing_overrides)}")
    for observation_id, (expected_family, expected_secondary, _) in REVIEWED_ROLE_OVERRIDES.items():
        observation = observations_by_id[observation_id]
        if (
            observation["position_family"] != expected_family
            or tuple(filter(None, observation["secondary_role_tags"].split(";"))) != expected_secondary
            or not observation["classification_rule"].startswith("reviewed_record_override:")
        ):
            raise ValueError(f"Reviewed role override was not applied: {observation_id}")

    reviewed_effective_ids = (
        REVIEWED_NAME_TITLE_SPILLOVERS.keys()
        | REVIEWED_SCHEDULE_J_TITLE_EXPANSIONS.keys()
        | REVIEWED_ACRONYM_TITLE_EXPANSIONS.keys()
    )
    if missing_effective_ids := reviewed_effective_ids - observations_by_id.keys():
        raise ValueError(
            f"Reviewed effective-title records do not resolve: {sorted(missing_effective_ids)}"
        )
    expected_effective_positions = {
        "SRC-990-EXT-ANIMAL-LEGAL-DEFENSE-FUND::andreajoykroboth":
            ("ANDREA JOY KROBOTH", "Chief Operating Officer (through February 7, 2025)", "operations", "coo"),
        "SRC-990-EXT-BIPARTISAN-POLICY-CENTER::elenamuehlenbeckcfo":
            ("ELENA MUEHLENBECK", "CFO", "finance", "cfo"),
        "SRC-990-EXT-BIPARTISAN-POLICY-CENTER::liselloyevpcoo":
            ("LISEL LOY", "EVP COO", "operations", "coo"),
        "SRC-990-EXT-CENTER-FOR-AI-SAFETY::oliverzhangmanagingdirector":
            ("Oliver Zhang", "Managing Director", "general_leadership", "managing_director"),
        "SRC-990-EXT-NEW-ROOTS-INSTITUTE::jessetandlermanaging":
            ("Jesse Tandler", "Managing Director", "general_leadership", "managing_director"),
        "SRC-990-EXT-RESEARCH-AMERICA::jenniferluraysrvp":
            ("JENNIFER LURAY", "SR VP", "general_leadership", "senior_vice_president"),
        "SRC-990-EXT-CENTER-FOR-DEMOCRACY-TECHNOLOGY::georgeslovergencounsel":
            ("GEORGE SLOVER", "GEN COUNSEL", "legal", "general_counsel"),
        "SRC-990-EXT-PROJECT-DRAWDOWN::reshmapattni":
            ("RESHMA PATTNI", "FINANCE DIRECTOR", "finance", "finance_director"),
        "SRC-990-EXT-PROJECT-DRAWDOWN::toodreubold":
            ("TOOD REUBOLD", "MARKETING DIRECTOR", "communications", "communications_director"),
        "SRC-990-EXT-PARTNERSHIP-ON-AI::feleciawebb":
            ("FELECIA WEBB", "Chief Strategy Officer, Philanthropy and Partnerships", "strategy", "chief_strategy_officer"),
        "SRC-990-EXT-PARTNERSHIP-ON-AI::stephaniebell":
            ("STEPHANIE BELL", "Chief Programs and Insights Officer", "programs", ""),
        "SRC-990-EXT-COMMITTEE-FOR-A-RESPONSIBLE-FEDERAL-BUDGET::adamshifrisssenior":
            ("ADAM SHIFRISS", "SENIOR DIRECTOR OF LEGISLATIVE STRATEGY", "policy", "policy_director"),
        "SRC-990-EXT-COMMITTEE-FOR-A-RESPONSIBLE-FEDERAL-BUDGET::simonegfranksenior":
            ("SIMONE G FRANK", "SENIOR ADVISOR, FINANCE & OPERATIONS", "finance", ""),
        "SRC-990-EXT-RESULTS-FOR-AMERICA::lisavmorrisonbutler":
            ("LISA V MORRISON BUTLER", "Executive Vice President and Chief Impact Officer", "programs", "chief_impact_officer"),
        "SRC-990-EXT-SOFTWARE-FREEDOM-CONSERVANCY::bradleymkuhn":
            ("Bradley M Kuhn", "Policy Fellow", "policy", ""),
        "SRC-990-EXT-VERA-INSTITUTE-OF-JUSTICE::jamesparsonsprogram":
            ("JAMES PARSONS", "PROGRAM DIRECTOR AND SPECIAL ADVISOR", "programs", "program_director"),
        "SRC-990-EXT-VERA-INSTITUTE-OF-JUSTICE::vinamorrisdirector":
            ("VINA MORRIS", "DIRECTOR, TECHNOLOGY INNOVATION AND STRATEGY", "technology", ""),
    }
    for observation_id, expected in expected_effective_positions.items():
        observation = observations_by_id[observation_id]
        actual = (
            observation["effective_person_name"],
            observation["effective_title"],
            observation["position_family"],
            observation["benchmark_position"],
        )
        if actual != expected:
            raise ValueError(
                f"Reviewed effective title was not applied: {observation_id}: "
                f"expected={expected!r}, actual={actual!r}"
            )
        if observation["effective_title_source"] == "part_vii_native":
            raise ValueError(f"Reviewed effective title lacks provenance: {observation_id}")

    if missing_compensation_year_overrides := (
        REVIEWED_COMPENSATION_YEAR_ROLE_OVERRIDES.keys() - observations_by_id.keys()
    ):
        raise ValueError(
            "Reviewed compensation-year role overrides do not resolve: "
            f"{sorted(missing_compensation_year_overrides)}"
        )
    for observation_id, (expected_status, expected_rule) in (
        REVIEWED_COMPENSATION_YEAR_ROLE_OVERRIDES.items()
    ):
        observation = observations_by_id[observation_id]
        if (
            observation["compensation_year_role_status"] != expected_status
            or observation["compensation_year_role_rule"] != expected_rule
        ):
            raise ValueError(
                f"Compensation-year role override was not applied: {observation_id}"
            )
    schedule_transition = observations_by_id[
        "SRC-990-EXT-CLEAN-AIR-TASK-FORCE::kaymcconagha"
    ]
    if (
        schedule_transition["schedule_j_title"] != "TREAS/COO(THRU SEPT)"
        or schedule_transition["incumbency_status"] != "former_or_partial"
        or schedule_transition["default_included"] != "no"
    ):
        raise ValueError("Schedule J transition text was not applied to COO incumbency")

    expected_evp_rows = {
        "SRC-990-EXT-COUNCIL-ON-STRATEGIC-RISKS::mallorystewart",
        "SRC-990-EXT-EVIDENCE-ACTION::brettsedgewick",
        "SRC-990-EXT-EVIDENCE-ACTION::paulbyatta",
        "SRC-990-EXT-CENTER-FOR-RESPONSIBLE-LENDING::ellenharnick",
    }
    for observation_id in expected_evp_rows:
        observation = observations_by_id[observation_id]
        if observation["benchmark_position"] != "executive_vice_president":
            raise ValueError(f"Executive VP alias was not applied: {observation_id}")

    expected_deputy_vp_rows = {
        "SRC-990-EXT-NUCLEAR-THREAT-INITIATIVE::ericbrewer",
        "SRC-990-EXT-NUCLEAR-THREAT-INITIATIVE::hayleyseverance",
    }
    if any(
        observations_by_id[observation_id]["benchmark_position"] != "deputy_vice_president"
        for observation_id in expected_deputy_vp_rows
    ):
        raise ValueError("Deputy Vice President leaked into the strict Vice President benchmark")
    expected_deputy_directors = {
        "SRC-990-EXT-BREAKTHROUGH-INSTITUTE::alextrembath",
        "SRC-990-EXT-COUNCIL-ON-STRATEGIC-RISKS::johnmoulton",
        "SRC-990-EXT-INSTITUTE-FOR-POLICY-STUDIES::kathleengaspard",
        "SRC-990-EXT-INSTITUTE-ON-TAXATION-AND-ECONOMIC-POLICY::jonwhiten",
        "SRC-990-EXT-MIGRATION-POLICY-INSTITUTE::nataliabanulescubogdan",
        "SRC-990-EXT-TECHCONGRESS::gracemckinney",
    }
    actual_deputy_directors = {
        row["observation_id"] for row in raw_observations
        if row["benchmark_position"] == "deputy_director"
    }
    if actual_deputy_directors != expected_deputy_directors:
        raise ValueError("Functional deputy roles leaked into strict Deputy Director")
    epi_hybrid = observations_by_id[
        "SRC-990-EXT-ECONOMIC-POLICY-INSTITUTE::celinemcnicholas"
    ]
    if (
        epi_hybrid["secondary_role_tags"] != "legal"
        or epi_hybrid["benchmark_position"]
        or epi_hybrid["benchmark_position_hybrid_status"] != "multi_role"
    ):
        raise ValueError("Policy Director / General Counsel hybrid was not kept out of strict positions")
    last_mile_technical = observations_by_id[
        "SRC-990-EXT-LAST-MILE-HEALTH::divyanair"
    ]
    if (
        last_mile_technical["position_family"] != "programs"
        or last_mile_technical["secondary_role_tags"] != "research"
        or last_mile_technical["benchmark_position"]
    ):
        raise ValueError("Chief Technical Officer leaked into Chief Technology Officer")
    rfa_impact = observations_by_id[
        "SRC-990-EXT-RESULTS-FOR-AMERICA::lisavmorrisonbutler"
    ]
    if (
        rfa_impact["effective_title"] != "Executive Vice President and Chief Impact Officer"
        or rfa_impact["benchmark_position"] != "chief_impact_officer"
    ):
        raise ValueError("RFA Chief Impact Officer acronym was treated as Information CIO")
    general_counsel_rows = [
        row for row in raw_observations
        if row["benchmark_position"] == "general_counsel" and row["default_included"] == "yes"
    ]
    if not general_counsel_rows or any(
        row["title_group"] != "chief_officer" or row["seniority_group"] != "executive"
        for row in general_counsel_rows
    ):
        raise ValueError("Strict General Counsel rows are not classified as C-suite executives")
    expected_strict_title_levels = {
        "vice_president": ("vice_president", "senior_leader"),
        "senior_vice_president": ("vice_president", "senior_leader"),
        "executive_vice_president": ("executive_leadership", "executive"),
        "managing_director": ("managing_or_deputy_director", "senior_leader"),
        "program_director": ("director", "senior_leader"),
        "general_counsel": ("chief_officer", "executive"),
        "coo": ("chief_officer", "executive"),
    }
    for position_key, expected_level in expected_strict_title_levels.items():
        members = [
            row for row in raw_observations
            if row["benchmark_position"] == position_key and row["default_included"] == "yes"
        ]
        if not members or any(
            (row["title_group"], row["seniority_group"]) != expected_level
            for row in members
        ):
            raise ValueError(f"Inconsistent strict title level for {position_key}")

    cepr_canonical_co_executives = {
        row["observation_id"]
        for row in raw_observations
        if row["source_id"] == "SRC-990-EXT-CENTER-FOR-ECONOMIC-AND-POLICY-RESEARCH"
        and row["record_type"] == "canonical_ceo"
    }
    if cepr_canonical_co_executives != EXPECTED_CEPR_CANONICAL_CO_EXECUTIVES:
        raise ValueError(
            "CEPR validated co-executive coverage mismatch: "
            + json.dumps(sorted(cepr_canonical_co_executives))
        )

    third_way_treasurer = observations_by_id[
        "SRC-990-EXT-THIRD-WAY-INSTITUTE::stevejdieterlecfo"
    ]
    if (
        third_way_treasurer["record_type"] != "governance"
        or third_way_treasurer["catalog_eligible"] != "no"
        or third_way_treasurer["role_eligible"] != "no"
        or third_way_treasurer["default_included"] != "no"
        or third_way_treasurer["part_vii_org_nominal"] != 0
        or third_way_treasurer["part_vii_related_nominal"] != 181205
        or third_way_treasurer["total_reported_hours"] != "40"
    ):
        raise ValueError("Related-org-paid Third Way board treasurer was not excluded as governance")

    if SENSITIVITY_ONLY_OBSERVATIONS.keys() - observations_by_id.keys():
        raise ValueError("Sensitivity-only observation override does not resolve")
    for observation_id, expected_reason in SENSITIVITY_ONLY_OBSERVATIONS.items():
        observation = observations_by_id[observation_id]
        if (
            observation["role_eligible"] != "yes"
            or observation["default_included"] != "no"
            or observation["sensitivity_only_reason"] != expected_reason
        ):
            raise ValueError(f"Sensitivity-only override was not applied: {observation_id}")
    crl_sensitivity_rows = [
        observations_by_id[observation_id]
        for observation_id in SENSITIVITY_ONLY_OBSERVATIONS
        if observation_id.startswith("SRC-990-EXT-CENTER-FOR-RESPONSIBLE-LENDING::")
    ]
    if len(crl_sensitivity_rows) != 7 or any(
        row["average_hours_per_week"] not in {"0", "0.0", "0.00"}
        or row["average_hours_related_orgs"] not in {"40", "40.0", "40.00"}
        for row in crl_sensitivity_rows
    ):
        raise ValueError("CRL unresolved-related-employer hours changed unexpectedly")
    if observations_by_id[
        "SRC-990-EXT-INSTITUTE-FOR-SECURITY-AND-TECHNOLOGY::ericdavis"
    ]["incumbency_status"] != "fractional":
        raise ValueError("IST fractional role was not labeled explicitly")

    low_hours_role_eligible = {
        row["observation_id"]
        for row in raw_observations
        if row["role_eligible"] == "yes" and row["default_hours_eligible"] == "no"
    }
    if low_hours_role_eligible != EXPECTED_LOW_HOURS_ROLE_ELIGIBLE:
        raise ValueError(
            "Unexpected sub-30-hour role-eligible set: "
            + json.dumps(sorted(low_hours_role_eligible))
        )
    if any(observations_by_id[observation_id]["default_included"] == "yes" for observation_id in low_hours_role_eligible):
        raise ValueError("Sub-30-hour role leaked into the default sample")

    typo_ceo = observations_by_id["SRC-990-EXT-MUCKROCK-FOUNDATION::amandahickman"]
    if typo_ceo["record_type"] != "generic_ceo_like" or typo_ceo["catalog_eligible"] != "no":
        raise ValueError("Misspelled chief-executive title leaked into the non-CEO catalog")

    taxonomy_groups: dict[str, list[dict]] = defaultdict(list)
    for row in raw_observations:
        taxonomy_groups[row["taxonomy_id"]].append(row)
    taxonomy_rows: list[dict] = []
    for taxonomy_id, members in sorted(taxonomy_groups.items()):
        first = members[0]
        invariant_fields = (
            "normalized_title", "record_type", "position_family", "secondary_role_tags", "title_group",
            "seniority_group", "role_scope", "incumbency_status", "classification_rule",
            "classification_confidence", "catalog_eligible", "benchmark_position",
            "benchmark_position_rule", "benchmark_position_alias_quality",
            "benchmark_position_hybrid_status", "benchmark_position_hybrid_reason",
        )
        for field in invariant_fields:
            if len({member[field] for member in members}) != 1:
                raise ValueError(f"Taxonomy group {taxonomy_id} is not invariant for {field}")
        review_status = (
            "manual_review_required"
            if first["record_type"] in {"generic_ceo_like", "unmapped_position"}
            or first["classification_confidence"] == "low"
            else "reviewed_observation_override"
            if "reviewed" in first["classification_rule"]
            or any(member["effective_title_source"] != "part_vii_native" for member in members)
            else "rule_assigned_multi_role"
            if first["secondary_role_tags"]
            else "rule_assigned"
        )
        taxonomy_notes: list[str] = []
        if first["record_type"] in {"canonical_ceo", "generic_ceo_like"}:
            taxonomy_notes.append(
                "CEO rows remain governed by validated_form990_compensation.csv and are not a generic position family."
            )
        elif first["record_type"] == "unmapped_position":
            taxonomy_notes.append(
                "Retained for manual classification; not exposed in the public Position catalog."
            )
        if first["classification_rule"].startswith("reviewed_record_override:"):
            taxonomy_notes.append(
                "Primary family received an observation-level review because the filing title is truncated, organization-specific, or multi-function."
            )
        if any(member["effective_title_source"] != "part_vii_native" for member in members):
            taxonomy_notes.append(
                "Classification/display uses an explicit reviewed effective title; the source-native Part VII identity and title remain preserved in the observation file."
            )
        taxonomy_notes.extend(
            REVIEWED_ROLE_OVERRIDE_CITATIONS[member["observation_id"]]
            for member in members
            if member["observation_id"] in REVIEWED_ROLE_OVERRIDE_CITATIONS
        )
        taxonomy_notes.extend(
            (
                f"{POSITION_SUPPORTING_SOURCE_BY_OBSERVATION[member['observation_id']]['evidence_use']} "
                f"Source: {POSITION_SUPPORTING_SOURCE_BY_OBSERVATION[member['observation_id']]['local_path']} "
                f"({POSITION_SUPPORTING_SOURCE_BY_OBSERVATION[member['observation_id']]['canonical_url']})"
            )
            for member in members
            if member["observation_id"] in POSITION_SUPPORTING_SOURCE_BY_OBSERVATION
            and member["observation_id"] not in REVIEWED_ROLE_OVERRIDE_CITATIONS
        )
        taxonomy_rows.append({
            "taxonomy_id": taxonomy_id,
            "normalized_title": first["normalized_title"],
            "source_title_variants": join_nonempty(sorted({member["native_title"] for member in members})),
            "effective_title_variants": join_nonempty(sorted({member["effective_title"] for member in members})),
            "effective_title_sources": join_nonempty(sorted({member["effective_title_source"] for member in members})),
            "effective_title_rules": join_nonempty(sorted({member["effective_title_rule"] for member in members})),
            "record_type": first["record_type"],
            "position_family": first["position_family"],
            "secondary_role_tags": first["secondary_role_tags"],
            "title_group": first["title_group"],
            "seniority_group": first["seniority_group"],
            "role_scope": first["role_scope"],
            "incumbency_status": first["incumbency_status"],
            "classification_rule": first["classification_rule"],
            "classification_confidence": first["classification_confidence"],
            "benchmark_position": first["benchmark_position"],
            "benchmark_position_rule": first["benchmark_position_rule"],
            "benchmark_position_alias_quality": first["benchmark_position_alias_quality"],
            "benchmark_position_hybrid_status": first["benchmark_position_hybrid_status"],
            "benchmark_position_hybrid_reason": first["benchmark_position_hybrid_reason"],
            "classification_source_ids": join_nonempty(sorted({
                member["classification_source_id"] for member in members
            })),
            "classification_source_urls": join_nonempty(sorted({
                member["classification_source_url"] for member in members
            })),
            "classification_source_local_paths": join_nonempty(sorted({
                member["classification_source_local_path"] for member in members
            })),
            "review_status": review_status,
            "catalog_eligible": first["catalog_eligible"],
            "role_eligible": (
                "all"
                if all(member["role_eligible"] == "yes" for member in members)
                else "none"
                if all(member["role_eligible"] == "no" for member in members)
                else "some"
            ),
            "record_count": len(members),
            "compensated_record_count": sum(int(member["part_vii_cash_nominal"]) > 0 for member in members),
            "organization_count": len({member["organization"] for member in members}),
            "example_organizations": join_nonempty(sorted({member["organization"] for member in members})[:8]),
            "notes": join_nonempty(taxonomy_notes),
        })

    for row in raw_observations:
        if row["catalog_eligible"] == "yes" and row["position_family"] not in PUBLIC_FAMILIES:
            raise ValueError(f"Catalog-eligible unmapped position: {row['observation_id']}")
        if row["record_type"] in {"canonical_ceo", "generic_ceo_like"} and row["catalog_eligible"] == "yes":
            raise ValueError(f"CEO row leaked into generic position catalog: {row['observation_id']}")

    non_ceo = [row for row in raw_observations if row["record_type"] == "non_ceo_position"]
    role_eligible_rows = [row for row in non_ceo if row["role_eligible"] == "yes"]
    default_rows = [row for row in non_ceo if row["default_included"] == "yes"]
    if (
        len(non_ceo), len(role_eligible_rows), len(default_rows)
    ) != (
        EXPECTED_NON_CEO_CATALOG_COUNT,
        EXPECTED_ROLE_ELIGIBLE_COUNT,
        EXPECTED_DEFAULT_INCLUDED_COUNT,
    ):
        raise ValueError(
            "Reviewed non-CEO inclusion counts changed: "
            f"catalog={len(non_ceo)}, role_eligible={len(role_eligible_rows)}, "
            f"default={len(default_rows)}"
        )

    peer_sensitivity_ids = {
        row["observation_id"]
        for row in role_eligible_rows
        if row["default_included"] == "no" and row["is_rp_reference"] == "no"
    }
    expected_peer_sensitivity_ids = (
        EXPECTED_LOW_HOURS_ROLE_ELIGIBLE | set(SENSITIVITY_ONLY_OBSERVATIONS)
    )
    if peer_sensitivity_ids != expected_peer_sensitivity_ids:
        raise ValueError(
            "Reviewed sensitivity-only set changed: "
            + json.dumps(sorted(peer_sensitivity_ids))
        )

    position_keys = {definition[0] for definition in BENCHMARK_POSITIONS}
    unknown_position_keys = {
        row["benchmark_position"] for row in raw_observations
        if row["benchmark_position"] and row["benchmark_position"] not in position_keys
    }
    if unknown_position_keys:
        raise ValueError(f"Unknown standardized position keys: {sorted(unknown_position_keys)}")
    position_catalog_rows = []
    for key, label, page_label, menu_group, description in BENCHMARK_POSITIONS:
        position_rows = [
            row for row in raw_observations
            if row["benchmark_position"] == key and row["is_rp_reference"] == "no"
        ]
        eligible = [row for row in position_rows if row["benchmark_position_eligible"] == "yes"]
        default = [row for row in position_rows if row["benchmark_position_default_included"] == "yes"]
        organizations = {row["organization"] for row in default}
        support_level = (
            "primary"
            if len(default) >= 15 and len(organizations) >= 12
            else "exploratory"
            if len(organizations) >= 8
            else "hidden"
        )
        position_catalog_rows.append({
            "position_key": key,
            "label": label,
            "page_label": page_label,
            "menu_group": menu_group,
            "description": description,
            "support_level": support_level,
            "catalog_rows": len(position_rows),
            "role_eligible_rows": len(eligible),
            "default_rows": len(default),
            "default_organizations": len(organizations),
            "default_schedule_j_base_rows": sum(
                bool(row["schedule_j_base_total_nominal"]) for row in default
            ),
            "rp_reference_rows": sum(
                row["benchmark_position"] == key
                and row["is_rp_reference"] == "yes"
                and row["benchmark_position_eligible"] == "yes"
                for row in raw_observations
            ),
        })

    actual_public_counts = {
        row["position_key"]: (row["default_rows"], row["default_organizations"])
        for row in position_catalog_rows
        if row["position_key"] in EXPECTED_PUBLIC_POSITION_DEFAULT_COUNTS
    }
    if actual_public_counts != EXPECTED_PUBLIC_POSITION_DEFAULT_COUNTS:
        raise ValueError(
            "Strict standardized-position membership changed: "
            + json.dumps(actual_public_counts, sort_keys=True)
        )

    observation_fields = list(raw_observations[0])
    taxonomy_fields = list(taxonomy_rows[0])
    write_csv(OBSERVATIONS_PATH, sorted(raw_observations, key=lambda row: (row["organization"], row["person_name"], row["observation_id"])), observation_fields)
    write_csv(TAXONOMY_PATH, taxonomy_rows, taxonomy_fields)
    write_csv(
        POSITION_CATALOG_PATH,
        position_catalog_rows,
        list(position_catalog_rows[0]),
    )
    write_csv(
        SUPPORTING_SOURCES_PATH,
        list(POSITION_SUPPORTING_SOURCES),
        list(POSITION_SUPPORTING_SOURCE_FIELDS),
    )

    sensitivity_rows = [
        row for row in role_eligible_rows
        if row["default_included"] == "no" and row["is_rp_reference"] == "no"
    ]
    peer_catalog_rows = [row for row in non_ceo if row["is_rp_reference"] == "no"]
    rp_catalog_rows = [row for row in non_ceo if row["is_rp_reference"] == "yes"]
    peer_role_eligible_rows = [
        row for row in role_eligible_rows if row["is_rp_reference"] == "no"
    ]
    rp_role_eligible_rows = [
        row for row in role_eligible_rows if row["is_rp_reference"] == "yes"
    ]
    review_status_counts = Counter(row["review_status"] for row in taxonomy_rows)
    family_lines = []
    for family in PUBLIC_FAMILIES:
        catalog = [row for row in non_ceo if row["position_family"] == family]
        eligible = [row for row in catalog if row["role_eligible"] == "yes"]
        default = [row for row in catalog if row["default_included"] == "yes"]
        schedule_base = [row for row in eligible if row["schedule_j_base_total_nominal"] != ""]
        family_lines.append(
            f"| {family.replace('_', ' ').title()} | {len(catalog)} | {len(eligible)} | "
            f"{len({row['organization'] for row in eligible})} | {len(schedule_base)} | {len(default)} |"
        )
    standardized_position_lines = [
        f"| {row['label']} | {row['support_level'].title()} | {row['default_rows']} | "
        f"{row['default_organizations']} | {row['default_schedule_j_base_rows']} |"
        for row in position_catalog_rows
        if row["support_level"] != "hidden"
    ]
    primary_position_count = sum(
        row["support_level"] == "primary" for row in position_catalog_rows
    )
    nonhidden_position_count = sum(
        row["support_level"] != "hidden" for row in position_catalog_rows
    )
    default_hybrid_count = sum(
        row["default_included"] == "yes"
        and row["benchmark_position_hybrid_status"] == "multi_role"
        for row in raw_observations
    )

    record_type_counts = Counter(row["record_type"] for row in raw_observations)
    exclusion_counts = Counter()
    for row in non_ceo:
        if row["role_eligible"] == "no":
            for reason in row["default_exclusion_reason"].split("; "):
                if reason:
                    exclusion_counts[reason] += 1
    schedule_base_positive = sum(
        row["schedule_j_base_total_nominal"] != "" and float(row["schedule_j_base_total_nominal"]) > 0
        for row in raw_observations
    )

    report_lines = [
        "# Form 990 all-position extraction and taxonomy",
        "",
        "## Release boundary",
        "",
        "This layer extracts Form 990 Part VII, Section A people and compensation for non-CEO position analysis. The existing hand-validated CEO table remains authoritative: canonical and other CEO-like rows are retained here for provenance but are never catalog-eligible.",
        "",
        "## Source and arithmetic validation",
        "",
        f"- Official Form 990 XML filings parsed: **{identity_checks}** (135 peer filings plus RP).",
        "- Every file hash, EIN, tax-period boundary, and return type matches the acquisition manifest.",
        f"- Raw Part VII rows: **2,786**; stable observations after collapsing one reviewed exact unpaid-board duplicate: **{len(raw_observations):,}**.",
        f"- Schedule J rows: **{schedule_count}**; all match exactly one Part VII person by case-insensitive exact name, with no fuzzy, duplicate, or unmatched matches. Three names differ only in letter case.",
        f"- Schedule J rows with positive filing-plus-related base compensation: **{schedule_base_positive}**.",
        "- Every Schedule J filing-organization and related-organization total exactly equals base + bonus + other reportable + deferred + nontaxable components.",
        "- Part VII reportable cash equals Schedule J base + bonus + other reportable compensation in 811 of 814 Schedule J rows. Three source-internal differences are retained exactly: $10 (C2ES/Bradley Townsend), $1 (CEPR/Alexander Main), and $602 (FAR AI/Conor McGurk).",
        f"- Part VII, Section B contractor rows observed and deliberately excluded: **{contractor_count}**. These are vendor/contractor payments and service descriptions, not employee salaries.",
        "",
        "## Public non-CEO catalog",
        "",
        f"`Catalog rows` retain all rows assigned to a public family, including display-only RP references. `Role-eligible` additionally requires positive Part VII cash and functional scope (not governance, program/affiliate, or uncertain). It normally requires either no source-indicated transition during the compensation calendar year or a separately verified full-year role, but {len(sensitivity_rows)} explicitly reviewed source-anomaly, fractional, or entity-boundary peer rows remain role-eligible only so the app can expose them as sensitivity observations. `Default included` is stricter: it requires one of those eligible compensation-year statuses, at least 30 combined filing-organization plus related-organization hours per week, no explicit sensitivity-only flag, and a selected peer rather than RP. `No transition indicated` is an absence-of-transition screen, not independently verified tenure.",
        "",
        "| Position family | Catalog rows | Role-eligible | Organizations | With Schedule J base | Default included |",
        "|---|---:|---:|---:|---:|---:|",
        *family_lines,
        "",
        f"- Catalog-eligible non-CEO observations: **{len(non_ceo):,}** (**{len(peer_catalog_rows):,}** peers plus **{len(rp_catalog_rows):,}** RP display references).",
        f"- Role-eligible paid observations: **{len(role_eligible_rows):,}** (**{len(peer_role_eligible_rows):,}** peers plus **{len(rp_role_eligible_rows):,}** RP display references).",
        f"- Default-included peer observations: **{len(default_rows):,}**.",
        f"- Role-eligible peer observations retained only for sensitivity analysis: **{len(sensitivity_rows):,}** (9 below-30-hour/source-anomaly rows, 7 rows with 40 related-organization hours but no identified related employer, 1 source-labeled fractional role, and 2 Creative Commons related-employer boundary rows).",
        f"- Taxonomy groups: **{len(taxonomy_rows):,}**: **{review_status_counts['rule_assigned']:,}** rule-assigned single-family groups, **{review_status_counts['rule_assigned_multi_role']:,}** rule-assigned multi-role groups, **{review_status_counts['reviewed_observation_override']:,}** reviewed observation-override groups, and **{review_status_counts['manual_review_required']:,}** groups not published without further review.",
        "",
        "## Standardized position benchmarks",
        "",
        f"The Position control uses an exclusive standardized-title layer, not the broad functional family. C-suite aliases such as COO/Chief Operating Officer are consolidated, while levels remain separate (for example Vice President, Senior Vice President, and Executive Vice President). {default_hybrid_count} default executive rows with genuinely combined or ambiguous titles are retained in the extraction but excluded from strict named-position samples so they cannot enter two benchmarks at once.",
        "",
        "A position is `Primary` with at least 15 default rows across at least 12 organizations, `Exploratory` with at least 8 organizations, and hidden below 8 organizations. Only Primary positions are exposed in the public Position control. Sparse titles remain classified in `form990_benchmark_position_catalog.csv` for audit and future expansion rather than being pooled into misleading umbrella positions.",
        "",
        "| Standardized position | Support | Default rows | Organizations | With Schedule J base |",
        "|---|---|---:|---:|---:|",
        *standardized_position_lines,
        "",
        "## Retained non-public records",
        "",
        *[f"- `{label}`: **{count:,}** observations." for label, count in sorted(record_type_counts.items()) if label != "non_ceo_position"],
        "",
        "Most frequent role-eligibility exclusions (reasons can overlap):",
        "",
        *[f"- {reason}: **{count:,}**." for reason, count in exclusion_counts.most_common()],
        "",
        "## Compensation semantics",
        "",
        "- Part VII organization and related-organization amounts are reportable W-2/1099 compensation. Their sum is a cash/reportable-compensation proxy, not exact salary. Part VII other compensation is retained separately.",
        "- Schedule J base is the only exact base-compensation field. A missing Schedule J row remains null; it is never converted to zero or inferred from Part VII.",
        "- Schedule J is threshold-selected. Under the IRS instructions, it generally covers listed people whose Part VII reportable plus other compensation exceeds $150,000, as well as specified former people and other required cases. Part VII non-officer coverage is itself selective (key employees and generally the five highest-paid employees over $100,000). Non-CEO results therefore describe 990-reported people, not a complete employee salary census.",
        "- Compensation is for the calendar year ending with or within the tax year. Nominal fields are preserved; July 2026 values use the same CPI-U convention as the CEO benchmark.",
        "- Filing-organization and related-organization fields stay separate and are also provided as explicit totals.",
        "",
        "Official interpretation references: [2024 Form 990 instructions](https://www.irs.gov/pub/irs-prior/i990--2024.pdf) and [Schedule J instructions](https://www.irs.gov/pub/irs-pdf/i990sj.pdf).",
        "",
        "## Taxonomy and review model",
        "",
        "The source-native Part VII person and title fields are never overwritten. Each observation receives a stable source+person ID, a reviewed effective person/title where an explicit source-internal spillover, Schedule J expansion, or organization-specific acronym has been validated, a primary public family when supported, secondary functional tags for combined roles, a title-level/seniority group, scope, filing-time incumbency, compensation-year role status, a transparent rule, and a confidence label. Effective-title source and rule fields remain alongside the raw fields. The taxonomy artifact groups identical classification outcomes so ambiguous and multi-function titles can be reviewed without losing row-level provenance.",
        "",
        "All role-eligible and default-candidate rows were systematically audited after initial extraction, not only low-confidence or previously unmapped groups. This does not mean every row has an external biographical source: ordinary `rule_assigned` groups are classified from the source-native XML title, while `reviewed_observation_override` marks a documented row-level judgment. Combined functions normally use the first substantive function in the source title as primary, with the others retained as secondary tags. Narrow phrase rules and explicit observation-level reviews handle misleading abbreviations, truncated titles, organization-specific program names, and terms such as software development that would otherwise resemble fundraising. Generic vice-president, deputy, managing-director, director, president, and manager titles remain in General Leadership only when the source does not identify a supported function.",
        "",
        f"Official organization pages or publications are used for **{len(POSITION_SUPPORTING_SOURCES):,}** non-obvious title expansions or organization-specific classifications. These include the Bulletin of the Atomic Scientists' expansion of John Pope's `Chief Aud. Officer` to `Chief Audience Officer`, plus reviewed program-versus-internal-function distinctions. Every supporting file is cached under `benchmark/sources/native/supporting/`, hash-pinned, and recorded in `benchmark/enrichment/form990_position_supporting_sources.csv`; the canonical third-party URL remains alongside the local copy.",
        "Each externally supported observation exposes `classification_source_id`, `classification_source_url`, `classification_source_local_path`, and `classification_source_sha256` as machine-readable provenance; ordinary XML-only classifications leave these fields blank. The extractor fails if a supporting file is absent, its hash differs, or its manifest row does not resolve to exactly the intended observation. Andrea De Forest's source-native title is reviewed as Programs with Communications secondary, but no external page is attached because the available organization pages name Jennifer/Jen de Forest and identity is not reconciled.",
        "",
        "Reviewed inclusion exceptions are also explicit. Both validated CEPR co-executives resolve to the authoritative CEO layer despite the filing's `Applebaum`/validated `Appelbaum` spelling difference. Third Way's `BOARD TREASURER` is governance because the filing reports 2 filing-organization hours, 38 related-organization hours, and compensation entirely from the related organization. Later departures do not erase a complete earlier compensation year, while roles beginning only after that year remain ineligible. Seven Center for Responsible Lending rows with 0 filing-organization and 40 related-organization hours but no identified related employer, IST's source-labeled `FRACTIONAL SVP`, and two Creative Commons related-employer rows are sensitivity-only rather than default comparators.",
        "",
        "CEO-like titles that do not match the validated organization-wide CEO are excluded rather than guessed. This prevents program and affiliate executives—such as project CEOs or program Executive Directors—from silently entering the CEO or general-leadership distributions. Former, interim, partial-year, governance, unpaid, program/affiliate, and uncertain rows remain in the observation file with explicit exclusion reasons.",
        "",
        "## Recommended app contract",
        "",
        "- Join organization metadata once by `source_id`/EIN, but treat `observation_id` as the compensation-row key.",
        f"- Default Position to CEO using the existing validated CEO dataset; expose the **{primary_position_count:,}** primary standardized non-CEO titles from `form990_benchmark_position_catalog.csv`, not the broader functional families. The catalog also retains **{nonhidden_position_count - primary_position_count:,}** exploratory titles for audit and future sample growth.",
        "- Keep Part VII cash, Part VII total, Schedule J base, and Schedule J total as separate compensation measures.",
        "- When several people from one organization share a family, use organization-balanced weights (each organization's rows sum to one) as the default or expose person-balanced weighting as an explicit sensitivity. Do not silently let larger organizations dominate.",
        "- RP rows are comparison markers only. Several RP families have more than one reported person, so display all applicable RP references or require a reviewed single-role choice; never include them in fit or quantile estimation.",
        "- Label distributions as `Form 990-reported compensation` because reporting thresholds create material left truncation, especially outside officer roles.",
        "",
        "## Artifacts",
        "",
        "- `benchmark/enrichment/form990_benchmark_position_catalog.csv`: exclusive standardized-title catalog, support thresholds, and sample counts used by the Position control.",
        "- `benchmark/enrichment/form990_position_observations.csv`: row-level, source-linked observations and all compensation fields.",
        "- `benchmark/enrichment/form990_position_taxonomy.csv`: grouped title/classification review surface.",
        "- `benchmark/enrichment/form990_position_supporting_sources.csv`: hashed provenance manifest for non-XML classification evidence.",
        "- `scripts/extract_form990_positions.py`: deterministic extractor and validation gate.",
        "",
    ]
    REPORT_PATH.write_text("\n".join(report_lines), encoding="utf-8")
    print(
        json.dumps(
            {
                "filings": identity_checks,
                "observations": len(raw_observations),
                "schedule_j": schedule_count,
                "taxonomy_groups": len(taxonomy_rows),
                "catalog_non_ceo": len(non_ceo),
                "role_eligible": len(role_eligible_rows),
                "default_included": len(default_rows),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
