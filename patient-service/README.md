# Patient Service

Patient Service is an independent HealthLink microservice responsible for patient profiles, medical history, report upload, and prescription records.

## Runtime

- Port: 4003
- Health endpoint: GET /health
- MongoDB database: patient-db

## Features

- Patient profile registration and management
- Medical report upload with Multer
- Structured medical history and allergies
- Prescription history retrieval
- Role-based access control for patient, doctor, and admin

## Main APIs

- POST /api/patients/register
- GET /api/patients/profile
- PUT /api/patients/profile
- GET /api/patients/:id
- POST /api/patients/reports
- GET /api/patients/reports
- GET /api/patients/:id/reports
- GET /api/patients/history
- GET /api/patients/prescriptions
- GET /api/patients/:id/prescriptions
- GET /health

## Request/Response Style

All responses follow:

- success: boolean
- message: string
- data: object | array | null

## Uploads

- Field name: report
- Allowed file types: PDF, JPG, PNG, DOC, DOCX
- Upload path: uploads/reports

## Kubernetes

```bash
kubectl apply -f patient-service/k8s/deployment.yaml
kubectl apply -f patient-service/k8s/service.yaml
```
