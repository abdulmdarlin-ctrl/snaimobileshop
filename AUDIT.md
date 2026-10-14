# Reliability audit — 14 October 2026

Implemented and covered by regression tests where applicable:
- Atomic purchase receiving, stock logs and recalculated totals. Repeated product lines aggregate, fresh inventory is read, and retry IDs prevent duplicate receiving.
- Atomic consignment issuance and stock logs; insufficient stock and missing agent/product records are rejected.
- Stock adjustments reject stale quantities instead of overwriting another attendant’s sale.
- Expense save guards, failure recovery, safe empty date inputs and date validation.
- Report date buckets preserve years and cover the selected period. Invoice discounts, recorded item costs, repair parts and operating expenses are reflected consistently in profit calculations. Unknown historical costs use the current recorded product cost, or zero if none exists.
- Removed invented expense budgets and remaining-budget figures.
- Missing/failed loads produce errors and clear loading states. Corrupt held-sale JSON no longer crashes the dashboard. Page navigation resets render-error recovery.
- Authentication no longer creates default-password accounts or infers privileges from email text. Login and restored Firebase sessions require an explicitly active staff profile. Remember-me sets Firebase persistence and logout signs out Firebase.
- Serialization preserves repeated object references while omitting actual cycles.

Verification: automated regression tests, TypeScript and production build. No production records were modified for testing. Browser automation could not start because its Windows sandbox runtime failed, so live visual and end-to-end verification remains outstanding.

## Outstanding production concerns

- firestore.rules currently permits public reads and writes. Client-side staff checks do not enforce database access. Secure rules, administrator provisioning and emulator verification are required before production exposure. No rules were deployed in this audit.
- Phone deliveries and consignments still require their dedicated IMEI workflow; the supplier purchase and consignment forms explicitly reject registered phone stock rather than bypass serial tracking.
- Legacy transactions without captured item costs cannot reproduce historical cost precisely. Existing records were not rewritten.
- The production build still reports a large JavaScript bundle warning.
- Transaction retries are covered by a mocked Firestore boundary; multi-device, live-network failure and printer tests remain to be performed.

This audit fixes the identified issues; it is not a guarantee that every possible defect has been removed.
