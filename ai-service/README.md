# AI Symptom Checker Service

This service provides safe symptom triage guidance using Cohere.

## Features
- JWT-protected APIs
- Input validation and per-user rate limiting
- Emergency keyword override for high-risk terms
- JSON-only AI response normalization
- MongoDB persistence for analysis history

## APIs
- POST /api/ai/symptoms/analyze
- GET /api/ai/symptoms/history
- GET /api/ai/symptoms/:id
- GET /health

## Run Locally
1. Install dependencies:
   npm install
2. Configure environment:
   copy .env.example .env
3. Start service:
   npm run dev

Default port: 4005
