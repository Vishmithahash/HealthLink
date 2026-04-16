# Notification Service

Notification microservice for HealthLink that is responsible only for sending email notifications to patients and doctors.

## Features

- Gmail SMTP integration via Nodemailer
- Template-based emails
- Generic send-email API for flexible payloads
- Purpose-specific APIs for key workflows
- Dual notifications (patient + doctor)
- Request validation and SMTP error handling
- Optional JWT authentication for trusted service-to-service access
- Health check endpoint

## Run Locally

1. Install dependencies:
   npm install
2. Configure environment:
   copy `.env.example` to `.env` and update values
3. Start the service:
   npm run dev

Service runs on `http://localhost:4007`.

## API Endpoints

- `GET /health`
- `POST /api/notifications/send` (legacy compatibility)
- `POST /api/notifications/send-email`
- `POST /api/notifications/appointment-confirmation`
- `POST /api/notifications/payment-success`
- `POST /api/notifications/consultation-completed`
- `POST /api/notifications/payment-verification`

## Generic Request Example

```json
{
  "to": ["patient@email.com", "doctor@email.com"],
  "subject": "Appointment Confirmation",
  "templateType": "appointment-confirmation",
  "patientName": "John",
  "doctorName": "Dr. Smith",
  "appointmentId": "123",
  "consultationDate": "2026-04-20",
  "message": "Optional custom message"
}
```

## Template Types

- `appointment-confirmation`
- `payment-success`
- `consultation-completed`
- `payment-verification`
- `custom`

## Docker

Build and run:

```bash
docker build -t healthlink-notification-service:local .
docker run --env-file .env -p 4007:4007 healthlink-notification-service:local
```

## Kubernetes

Apply manifests:

```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```
