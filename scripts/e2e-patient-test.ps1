$ErrorActionPreference = "Stop"

Set-Location "d:\SLIIT Project\HealthLink\patient-service"

$patientToken = node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({sub:'patient-user-4003', role:'patient', tokenType:'access'}, 'access_secret_123456789_secure_key_service', {expiresIn:'1h'}));"
$doctorToken = node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({sub:'doctor-user-4002', role:'doctor', tokenType:'access'}, 'access_secret_123456789_secure_key_service', {expiresIn:'1h'}));"
$adminToken = node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({sub:'admin-user-4000', role:'Admin', tokenType:'access'}, 'access_secret_123456789_secure_key_service', {expiresIn:'1h'}));"

$patientHeaders = @{ Authorization = "Bearer $patientToken" }
$doctorHeaders = @{ Authorization = "Bearer $doctorToken" }
$adminHeaders = @{ Authorization = "Bearer $adminToken" }

$registerBody = @{
  userId = "patient-user-4003"
  fullName = "Patient Service Test User"
  dob = "1998-08-15T00:00:00.000Z"
  gender = "female"
  phone = "94770012345"
  address = "Colombo, Sri Lanka"
  bloodGroup = "A+"
  allergies = @("Penicillin")
  medicalHistory = @(
    @{ condition = "Asthma"; diagnosisDate = "2014-01-10T00:00:00.000Z"; notes = "Mild and seasonal"; ongoing = $true }
  )
  emergencyContact = @{ name = "Nimal Perera"; relationship = "Father"; phone = "94771111111" }
}

try {
  $registerRes = Invoke-RestMethod -Uri "http://localhost:4003/api/patients/register" -Method Post -Headers $patientHeaders -ContentType "application/json" -Body ($registerBody | ConvertTo-Json -Depth 10)
} catch {
  if ($_.ErrorDetails.Message -and $_.ErrorDetails.Message -like "*already exists*") {
    $registerRes = @{ success = $true; message = "Profile already existed"; data = $null }
  } else {
    throw
  }
}

$profileRes = Invoke-RestMethod -Uri "http://localhost:4003/api/patients/profile" -Method Get -Headers $patientHeaders

$updateBody = @{
  address = "Kandy, Sri Lanka"
  allergies = @("Penicillin", "Dust")
  medicalHistory = @(
    @{ condition = "Asthma"; diagnosisDate = "2014-01-10T00:00:00.000Z"; notes = "Controlled with inhaler"; ongoing = $true },
    @{ condition = "Migraine"; diagnosisDate = "2020-06-01T00:00:00.000Z"; notes = "Occasional"; ongoing = $false }
  )
}

$updateRes = Invoke-RestMethod -Uri "http://localhost:4003/api/patients/profile" -Method Put -Headers $patientHeaders -ContentType "application/json" -Body ($updateBody | ConvertTo-Json -Depth 10)

$sampleFile = "d:\SLIIT Project\HealthLink\patient-service\uploads\reports\sample-report.pdf"
Set-Content -Path $sampleFile -Value "Sample lab report content"

$uploadRaw = curl.exe -s -X POST "http://localhost:4003/api/patients/reports" `
  -H "Authorization: Bearer $patientToken" `
  -F "report=@$sampleFile;type=application/pdf" `
  -F "documentType=lab" `
  -F "title=CBC Report" `
  -F "notes=Uploaded for consultation"
$uploadRes = $uploadRaw | ConvertFrom-Json

$myReportsRes = Invoke-RestMethod -Uri "http://localhost:4003/api/patients/reports" -Method Get -Headers $patientHeaders
$doctorReportsRes = Invoke-RestMethod -Uri "http://localhost:4003/api/patients/patient-user-4003/reports" -Method Get -Headers $doctorHeaders

$prescriptionAddBody = @{
  appointmentId = "appt-4003-test"
  doctorId = "doctor-user-4002"
  medicines = @(
    @{ name = "Paracetamol"; dosage = "500mg"; frequency = "Twice daily"; duration = "5 days"; notes = "After meals" }
  )
  instructions = "Drink more water"
  followUpDate = "2026-04-20T09:00:00.000Z"
}

$addPrescriptionRes = Invoke-RestMethod -Uri "http://localhost:4003/api/patients/patient-user-4003/prescriptions" -Method Post -Headers $doctorHeaders -ContentType "application/json" -Body ($prescriptionAddBody | ConvertTo-Json -Depth 10)

$myHistoryRes = Invoke-RestMethod -Uri "http://localhost:4003/api/patients/history" -Method Get -Headers $patientHeaders
$myPrescriptionsRes = Invoke-RestMethod -Uri "http://localhost:4003/api/patients/prescriptions" -Method Get -Headers $patientHeaders
$adminGetPatientRes = Invoke-RestMethod -Uri "http://localhost:4003/api/patients/patient-user-4003" -Method Get -Headers $adminHeaders

Write-Host "TEST_SUMMARY:"
@{
  patientId = $profileRes.data._id
  uploadedReportId = $uploadRes.data._id
  totalReports = $myReportsRes.data.Count
  totalPrescriptions = $myPrescriptionsRes.data.Count
  adminViewStatus = $adminGetPatientRes.success
} | ConvertTo-Json -Depth 10

Write-Host "REGISTER_RESPONSE:"
$registerRes | ConvertTo-Json -Depth 10
Write-Host "UPLOAD_REPORT_RESPONSE:"
$uploadRes | ConvertTo-Json -Depth 10
Write-Host "DOCTOR_GET_REPORTS_RESPONSE:"
$doctorReportsRes | ConvertTo-Json -Depth 10
Write-Host "ADD_PRESCRIPTION_RESPONSE:"
$addPrescriptionRes | ConvertTo-Json -Depth 10
Write-Host "PATIENT_GET_HISTORY_RESPONSE:"
$myHistoryRes | ConvertTo-Json -Depth 10
Write-Host "PATIENT_GET_PRESCRIPTIONS_RESPONSE:"
$myPrescriptionsRes | ConvertTo-Json -Depth 10
