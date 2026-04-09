# HealthLink Appointment Service

Independent microservice for doctor search and appointment lifecycle management.

## Features
- Doctor search: specialty, name, and availability filter pass-through
- Book appointment
- View one appointment
- Reschedule appointment
- Cancel appointment
- List appointments by patient
- List appointments by doctor
- Update appointment status
- JWT-protected routes
- Health check endpoint for Kubernetes probes

## Endpoints
- GET /health
- GET /api/appointments/doctors
- POST /api/appointments
- GET /api/appointments/:id
- PATCH /api/appointments/:id
- DELETE /api/appointments/:id
- GET /api/appointments/patient/:patientId
- GET /api/appointments/doctor/:doctorId
- PATCH /api/appointments/:id/status

## Run locally
1. Copy .env.example to .env and fill values.
2. Install dependencies: npm install
3. Start: npm run dev

## Notes
- This service validates JWT locally using JWT_ACCESS_SECRET.
- It calls Doctor/Payment/Notification services via configured base URLs.
- It uses a dedicated MongoDB database to keep appointment data isolated.
