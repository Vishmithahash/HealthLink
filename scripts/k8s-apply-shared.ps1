param(
  [switch]$SkipMongo
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

try {
  if (-not $SkipMongo) {
    kubectl apply -f k8s/mongo.yaml
  }

  kubectl apply -f k8s/apply-all.yaml

  kubectl get configmap notification-service-config | Out-Null
  kubectl get secret notification-service-secret | Out-Null

  Write-Host "Shared Kubernetes resources applied successfully."
  Write-Host "Verified: notification-service-config and notification-service-secret are present."
}
finally {
  Pop-Location
}
