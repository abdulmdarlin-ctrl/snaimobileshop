# Database quota and checkout recovery

This shop uses the Firebase project `snai-inventory-system`.

## When checkout reports quota exhaustion

1. The project owner should open [Firestore usage](https://console.firebase.google.com/project/snai-inventory-system/firestore/usage) and identify the exhausted read, write, storage, or other service limit. The application does not have access to this dashboard or the project's billing account.
2. Check the project's billing status. A daily free quota can recover at its next reset, or the owner can enable billing if appropriate. Other quota limits require the specific action indicated in the console. These code changes do not increase Google's service limits or change billing.
3. In checkout, choose **Keep order on hold**. Once database access is restored, resume that held order and confirm it again. The same sale ID is retained, so a retry returns an already saved sale rather than deducting inventory twice.

Do not clear browser data or delete business records as a quota workaround. Held orders remain drafts. A receipt is available only after the database confirms the sale or payment. There is no automatic background checkout or offline payment completion.

## Changes that reduce consumption

- Display queries share concurrent requests and a 30-second memory cache across pages. Explicit refresh bypasses the cached value.
- The cache is cleared on sign-in/sign-out and after successful transactions. Normal collection writes invalidate their collection. The cache does not persist business records in browser storage.
- POS loads stock, settings and customers initially. Sales history is loaded only for reports and completed held orders. Opening a particular receipt reads its sale directly.
- Checkout's immediate stock refresh reuses the successful transaction's product snapshots.
- Editing phone inventory still verifies IMEI ownership, but does not rewrite unchanged IMEI registration documents.
- Stock checks, customer restrictions, payment collection, and sale writes always use fresh Firestore transaction reads. Display caches are never used to approve a sale.

Reference: [Firebase usage and limits](https://firebase.google.com/docs/firestore/quotas), [Firestore billing](https://firebase.google.com/docs/firestore/pricing).
