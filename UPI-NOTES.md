# Direct UPI Payments

The restaurant can potentially receive payments into its existing current account using the merchant UPI ID (VPA) associated with that account. Account numbers alone are not enough for an app-based UPI integration. Confirm the merchant's acquiring bank/payment provider supports online QR/intent payments for that VPA.

## Payment Initiation vs Confirmation

- QR/intent: a payment QR or compatible UPI-app link can carry the merchant VPA, merchant name, amount and unique order reference. The customer approves payment in their UPI app; app/browser support and merchant eligibility must be tested with the acquiring provider.
- Manual confirmation: without a provider API, staff must verify the credit in their bank/merchant account before recording the payment. A customer screenshot or an "I paid" button is not evidence of settlement.
- Automatic confirmation: obtain the existing provider's payment-status API/webhooks, or integrate a payment provider that supplies them. The backend verifies merchant, reference, amount and payment status, handles duplicate notifications, and marks an order paid only after verification. An existing static QR does not itself supply these APIs.

Required next inputs: merchant UPI ID, registered merchant name, and the bank or QR provider (for example, the merchant's acquiring bank or business payment app). Do not supply bank passwords, OTPs or UPI PINs. No live UPI integration or transfer was enabled by this change.

Sources checked:

- [NPCI UPI FAQs](https://www.npci.org.in/what-we-do/upi/faqs): merchant payment acceptance through QR and intent.
- [Google Pay merchant web integration](https://developers.google.com/pay/india/api/web/intro): verified UPI merchant prerequisites and bank status-check APIs.
- [Google Pay payment response verification](https://developers.google.com/pay-wallet/regions/india/api/web/googlepay-response): verify the transaction and requested amount with the PSP bank.
