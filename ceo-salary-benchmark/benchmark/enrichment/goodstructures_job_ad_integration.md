# GoodStructures executive-posting integration

This layer adds seven unique recruitment pages discovered in the public GoodStructures salary dataset. The dataset contained two Cooperative AI Foundation records pointing to the same page and pay range; those records are represented by one vacancy. The dataset author authorized reuse of the auto-scraped pages, as confirmed by the project owner.

Original employer documents or complete mirrors were recovered wherever possible. GoodStructures is used as the salary source only for Taimaka, because its original role document omits pay. That observation is sensitivity-only. The other annual amounts are checked against preserved posting text.

The analytical `salary_min` and `salary_max` fields are source-year USD. Source-native amounts remain in `reported_salary_min`, `reported_salary_max`, `reported_currency`, and `reported_pay_period`. GBP and EUR conversion uses the GoodStructures metadata rate dated 2026-06-20: 1 GBP = 1.323276 USD and 1 EUR = 1.147052 USD. CPI adjustment is applied only after conversion.

ALLFED is not annualized: its source states flexible part-time work at USD 60–65 per hour and does not specify annual hours. The anonymous aquatic-animal posting and First Embrace operations/co-lead role are also context-only. CAIF and EA Germany are recommended recruitment peers; Taimaka and Screwworm Free Future are broader sensitivity observations.
