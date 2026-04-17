HealthLink Deployment Steps

This document contains the deployment steps for the submitted deliverables.

1. Prerequisites
- Install Git.
- Install Docker Desktop (with Docker Compose v2 enabled).
- Install Node.js 20+ and npm.
- Ensure ports 4000-4007 and 5173 are free.

2. Get the source code
- Clone the repository and open the project root folder.
- Example:
  git clone https://github.com/Vishmithahash/HealthLink.git
  cd HealthLink

3. Configure environment files
- Ensure each backend service has a valid .env file:
  auth-service/.env
  appointment-service/.env
  doctor-service/.env
  patient-service/.env
  telemedicine-service/.env
  ai-service/.env
  payment-service/.env
  notification-service/.env
- Update secrets/keys (JWT, DB, Stripe, Twilio, Cohere, email) with valid values for your environment.

4. Deploy backend services (Docker Compose)
- From the project root, run:
  docker compose up -d --build
- Check running containers:
  docker compose ps

5. Start the frontend client
- Open a new terminal:
  cd frontend
  npm install
  npm run dev

6. Verify deployment
- Frontend:
  http://localhost:5173
- Backend health endpoints:
  http://localhost:4000/health
  http://localhost:4001/health
  http://localhost:4002/health
  http://localhost:4003/health
  http://localhost:4004/health
  http://localhost:4005/health
  http://localhost:4006/health
  http://localhost:4007/health

7. Stop deployment
- Stop backend containers:
  docker compose down
- Stop frontend:
  Ctrl + C in the frontend terminal

8. Optional troubleshooting
- View logs for all services:
  docker compose logs -f
- Rebuild cleanly after major changes:
  docker compose down
  docker compose up -d --build
