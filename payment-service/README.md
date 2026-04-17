# Payment Service

Handles consultation payments for HealthLink:
- Stripe card payments (Payment Intents)
- Bank transfer slip upload and admin verification

## Endpoints
- POST /api/payments/create-intent
- POST /api/payments/verify-otp
- POST /api/payments/verify
- POST /api/payments/webhook
- POST /api/payments/upload-slip
- POST /api/payments/verify-slip
- GET /api/payments/:id
- GET /api/payments/appointment/:appointmentId
- GET /api/payments/status/:paymentId
- GET /health

## Local Run
1. npm install
2. Configure .env
3. npm run dev

Service port: 4006

## Stripe Card OTP Flow

1. Call POST /api/payments/create-intent
2. Payment service sends a 6-digit OTP to the patient email (from auth-service)
3. Verify OTP with POST /api/payments/verify-otp
4. Confirm payment state with POST /api/payments/verify (or provide otp in /verify request)

Without OTP verification, stripe_card payment verification is blocked.

## Stripe Webhook via ngrok
Use ngrok because Stripe cannot reach localhost directly.

1. Start service:
	npm run dev
2. In another terminal, start tunnel:
	npm run ngrok
3. Copy HTTPS forwarding URL from ngrok output:
	https://<random>.ngrok-free.app
4. In Stripe Dashboard > Developers > Webhooks, create endpoint:
	https://<random>.ngrok-free.app/api/payments/webhook
5. Subscribe to events:
	- payment_intent.succeeded
	- payment_intent.payment_failed
6. Copy webhook signing secret (whsec_...) into .env:
	STRIPE_WEBHOOK_SECRET=whsec_xxx
7. Restart payment service.

Optional config file included:
- ngrok.yml

You can still run tunnel manually:
- npx ngrok http 4006
