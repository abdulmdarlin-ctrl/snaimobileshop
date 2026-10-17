# Firestore quota recovery

The app uses Firebase project `snai-inventory-system`. A `resource-exhausted` / `Quota exceeded` error from checkout indicates a cloud database limit. It is distinct from a browser storage `QuotaExceededError`.

1. Open [the Firebase project](https://console.firebase.google.com/project/snai-inventory-system/overview), select Firestore Database, then Usage. Check the failing read/write quota and the project billing status. The screenshot alone does not identify which metric is exhausted.
2. If the daily free quota was exhausted, wait for the next reset around midnight Pacific time, or have the project owner enable billing to continue beyond the free quota. Enabling billing can incur charges and must be done by the owner. If billing is already enabled, inspect Firestore API quotas and the billing account instead of assuming another daily reset will fix it.
3. After database access is restored, refresh stock and retry the preserved order. Checkout uses the same sale ID on retry and commits inventory and the invoice together. Do not start a replacement sale for the same order while its outcome is uncertain.

## Usage reductions in the app

- Low-stock notifications use one Firestore snapshot listener instead of re-reading all products every ten seconds.
- Successful checkout refreshes only the distinct products sold, instead of downloading the full products, sales, customers and settings collections again.
- First-record and initialization existence checks request one document.
- A failed settings read is propagated as an error; it is never treated as an empty database that needs default records.
- A quota failure is shown persistently in the confirmation dialog, with the order retained for retry.

These changes reduce consumption but cannot restore quota already used. Other screens still load their datasets when opened; server-side pagination/aggregation is a future scaling step as history grows.

Official references: [Firestore limits](https://firebase.google.com/docs/firestore/quotas), [listener billing](https://firebase.google.com/docs/firestore/pricing#listening_to_query_results).
