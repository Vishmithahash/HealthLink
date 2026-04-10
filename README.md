# HealthLink

Four microservices are included:
- auth-service
- appointment-service
- doctor-service
- patient-service

Both are configured to run with MongoDB in Docker Compose and Kubernetes.

## Docker Compose Run

From project root:

1. Build and start all services:
	docker compose up --build -d
2. Check status:
	docker compose ps
3. Stop:
	docker compose down

Service endpoints:
- Auth: http://localhost:4000/health
- Appointment: http://localhost:4001/health
- Doctor: http://localhost:4002/health
- Patient: http://localhost:4003/health

## Kubernetes Run (Minikube)

1. Start minikube:
	minikube start

2. Build images inside minikube Docker so cluster can pull them:
	minikube image build -t healthlink-auth-service:local ./auth-service
	minikube image build -t healthlink-appointment-service:local ./appointment-service
	minikube image build -t healthlink-doctor-service:local ./doctor-service
	minikube image build -t healthlink-patient-service:local ./patient-service

3. Apply shared infrastructure and config:
	kubectl apply -f k8s/mongo.yaml
	kubectl apply -f k8s/auth-configmap.yaml
	kubectl apply -f k8s/auth-secret.yaml
	kubectl apply -f k8s/appointment-configmap.yaml
	kubectl apply -f k8s/appointment-secret.yaml
	kubectl apply -f k8s/doctor-configmap.yaml
	kubectl apply -f k8s/doctor-secret.yaml
	kubectl apply -f k8s/patient-configmap.yaml
	kubectl apply -f k8s/patient-secret.yaml

4. Apply service workloads:
	kubectl apply -f auth-service/k8s/deployment.yaml
	kubectl apply -f auth-service/k8s/service.yaml
	kubectl apply -f appointment-service/k8s/deployment.yaml
	kubectl apply -f appointment-service/k8s/service.yaml
	kubectl apply -f doctor-service/k8s/deployment.yaml
	kubectl apply -f doctor-service/k8s/service.yaml
	kubectl apply -f patient-service/k8s/deployment.yaml
	kubectl apply -f patient-service/k8s/service.yaml

5. Verify:
	kubectl get pods
	kubectl get svc

6. Access services locally:
	kubectl port-forward svc/auth-service 4000:80
	kubectl port-forward svc/appointment-service 4001:80
	kubectl port-forward svc/doctor-service 4002:80
	kubectl port-forward svc/patient-service 4003:80

## Notes

- JWT_ACCESS_SECRET is intentionally the same across auth-service and appointment-service for token verification.
- JWT_ACCESS_SECRET is intentionally shared with doctor-service for token verification.
- JWT_ACCESS_SECRET is intentionally shared with patient-service for token verification.
- In Docker Compose, MongoDB uses internal host mongo.
- In Kubernetes, MongoDB uses internal service name mongo.