# Doctor Service

Doctor Service is an independent HealthLink microservice responsible for doctor profiles, availability, appointment handling, patient report access, telemedicine session linking, and digital prescriptions.

## Runtime

- Port: `4002`
- Health endpoint: `GET /health`
- MongoDB database: `doctor-db`

## Environment Variables

- `PORT`
- `MONGODB_URI`
- `JWT_ACCESS_SECRET` (or `JWT_SECRET` fallback)
- `CORS_ORIGIN`
- `APPOINTMENT_SERVICE_URL`
- `PATIENT_SERVICE_URL`
- `TELEMEDICINE_SERVICE_URL`
- `TELEMEDICINE_JOIN_BASE_URL`
- `NOTIFICATION_SERVICE_URL`
- `REQUEST_TIMEOUT_MS`

## Main APIs

- `POST /api/doctors/register`
- `GET /api/doctors/profile`
- `PUT /api/doctors/profile`
- `GET /api/doctors`
- `GET /api/doctors/:id`
- `PUT /api/doctors/availability`
- `GET /api/doctors/appointments`
- `PATCH /api/doctors/appointments/:id/accept`
- `PATCH /api/doctors/appointments/:id/reject`
- `GET /api/doctors/patient-reports/:patientId`
- `GET /api/doctors/appointments/:id/telemedicine`
- `POST /api/doctors/prescriptions`
- `GET /api/doctors/prescriptions/:appointmentId`
- `PUT /api/doctors/prescriptions/:id`
- `PATCH /api/doctors/:id/status` (admin)
- `PATCH /api/doctors/:id/verify` (admin)

## Kubernetes

Apply service manifests:

```bash
kubectl apply -f doctor-service/k8s/deployment.yaml
kubectl apply -f doctor-service/k8s/service.yaml
```
