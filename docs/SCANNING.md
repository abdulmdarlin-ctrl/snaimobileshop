# Inventory and POS scanning

Use the HTTPS shop address and allow rear-camera access. Camera frames and barcode decoding stay on the device.

## Supplier Total code

Open a phone product in Inventory and choose **Scan supplier Total**. Fit the complete large code inside the guide, or choose a sharp close-up photo. PDF417, Data Matrix, QR and Aztec codes are supported. Code 128 is also supported for suppliers using a linear batch code.

The decoded payload must contain the actual phone IMEIs. Supported lists include newline/comma-separated IMEIs, packed 15-digit IMEIs, IMEI1/IMEI2-labelled text, CSV with an IMEI1 column, and JSON containing IMEI/IMEI1/primary-IMEI fields or a primary-IMEI array. Every imported primary IMEI must pass its checksum; duplicates and invalid primary entries reject the batch. Labelled IMEI2 entries are excluded. Unlabelled lists must contain primary identities only: the scanner cannot infer which SIM slot a number belongs to.

Review the displayed numbers, remove incorrect entries, confirm one primary IMEI per physical phone for the selected product, and choose **Add IMEIs to product**. Existing entries are skipped, empty stock slots are filled, and additional phones increase draft stock quantity. Nothing is saved until the product is saved. Inventory saving also checks global IMEI ownership and availability.

A printed Total/reference number alone cannot be expanded into phone IMEIs. A code containing only a reference requires the supplier's IMEI export or individual phone scans; there is no supplier lookup service configured. This is barcode decoding, not OCR of all printed rows.

## Scan to sell

In Sales, choose **Scan to sell**, or use a keyboard barcode scanner in the search field and press Enter.

- A registered available phone IMEI selects that product and records the exact unit in the draft order.
- Scan one available phone primary IMEI to add that exact phone to the order.
- If a manually selected phone is missing its IMEI, scanning fills that unit before increasing quantity.
- Duplicate, unavailable, ambiguous or invalid phone IMEIs are rejected. Accessories are selected by name.
- A stationary barcode adds only once. Move to the next phone; the same phone cannot be added twice.

## Customers and documents

Choose a registered customer for account history and any debt or partial sale. A walk-in purchase requires a name and full payment, prints that name, and records the customer type as Walk-in without creating a profile.
Sales invoices identify the goods, totals and outstanding balance. Payment receipts have separate RCT references and acknowledge individual amounts actually received. Unpaid debt has an invoice and no payment receipt. QR codes are not printed on either document.
Existing invoice references remain readable; older payment records receive deterministic receipt references when viewed. Invoice edits cannot rewrite payments or lower totals below money already received.
