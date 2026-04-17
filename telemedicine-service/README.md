# Telemedicine Service

Telemedicine microservice for HealthLink. It generates Jitsi meeting rooms, tracks consultation lifecycle, and enforces JWT + role-based access for doctor and patient users.

## Run locally

1. Copy .env.example to .env
2. Install dependencies:
   npm install
3. Start service:
   npm start

Service URL:
- Health: http://localhost:4004/health
- Base API: http://localhost:4004/api/telemedicine

## APIs

- POST /api/telemedicine/session
- GET /api/telemedicine/session/appointment/:appointmentId
- GET /api/telemedicine/session/:id
- GET /api/telemedicine/room/:roomName
- PATCH /api/telemedicine/session/:id/start
- PATCH /api/telemedicine/session/:id/end

## Jitsi behavior

No backend room creation is required. The service creates a room name and returns:
- roomName: appointment_<appointmentId>_<timestamp>
- meetingUrl: https://meet.jit.si/<roomName>
