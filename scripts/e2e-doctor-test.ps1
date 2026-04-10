$ErrorActionPreference = "Stop"

$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$commonPassword = "Pass@12345"

$adminPayload = @{
  fullName = "Admin User $ts"
  nic = "A$ts"
  phoneNumber = "94770$($ts.ToString().Substring($ts.ToString().Length-5))"
  username = "admin$ts"
  email = "admin$ts@test.com"
  password = $commonPassword
  role = "Admin"
}

$doctorPayload = @{
  fullName = "Doctor User $ts"
  nic = "D$ts"
  phoneNumber = "94771$($ts.ToString().Substring($ts.ToString().Length-5))"
  username = "doctor$ts"
  email = "doctor$ts@test.com"
  password = $commonPassword
  role = "Doctor"
  specialty = "Cardiologist"
}

$patientPayload = @{
  fullName = "Patient User $ts"
  nic = "P$ts"
  phoneNumber = "94772$($ts.ToString().Substring($ts.ToString().Length-5))"
  username = "patient$ts"
  email = "patient$ts@test.com"
  password = $commonPassword
  role = "patient"
}

$adminReg = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/register" -Method Post -ContentType "application/json" -Body ($adminPayload | ConvertTo-Json)
$doctorReg = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/register" -Method Post -ContentType "application/json" -Body ($doctorPayload | ConvertTo-Json)
$patientReg = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/register" -Method Post -ContentType "application/json" -Body ($patientPayload | ConvertTo-Json)

$adminToken = $adminReg.data.accessToken
$doctorToken = $doctorReg.data.accessToken
$patientToken = $patientReg.data.accessToken

$doctorUserId = $doctorReg.data.user.id
$patientUserId = $patientReg.data.user.id

$doctorProfileCreateBody = @{
  userId = $doctorUserId
  fullName = "Doctor User $ts"
  specialization = "Cardiologist"
  licenseNumber = "LIC-$ts"
  qualification = "MBBS, MD"
  experienceYears = 8
  consultationFee = 4500
  workingHours = @{ start = "09:00"; end = "17:00"; timezone = "Asia/Colombo" }
}

$doctorCreateHeaders = @{ Authorization = "Bearer $adminToken" }
$doctorCreate = Invoke-RestMethod -Uri "http://localhost:4002/api/doctors/register" -Method Post -Headers $doctorCreateHeaders -ContentType "application/json" -Body ($doctorProfileCreateBody | ConvertTo-Json -Depth 10)

$doctorHeaders = @{ Authorization = "Bearer $doctorToken" }
$patientHeaders = @{ Authorization = "Bearer $patientToken" }

$availabilityBody = @{
  availabilitySlots = @(
    @{ dayOfWeek = 1; startTime = "09:00"; endTime = "12:00"; mode = "online" },
    @{ dayOfWeek = 3; startTime = "14:00"; endTime = "17:00"; mode = "both" }
  )
  unavailablePeriods = @(
    @{ from = (Get-Date).ToUniversalTime().AddDays(7).ToString("o"); to = (Get-Date).ToUniversalTime().AddDays(7).AddHours(2).ToString("o"); reason = "Conference" }
  )
}
$availabilityRes = Invoke-RestMethod -Uri "http://localhost:4002/api/doctors/availability" -Method Put -Headers $doctorHeaders -ContentType "application/json" -Body ($availabilityBody | ConvertTo-Json -Depth 10)

$scheduledAt = (Get-Date).ToUniversalTime().AddDays(1).ToString("o")
$appointmentBody = @{
  patientId = $patientUserId
  doctorId = $doctorUserId
  specialty = "Cardiologist"
  scheduledAt = $scheduledAt
  durationMinutes = 15
  reason = "Routine checkup"
}

$appointmentRes = Invoke-RestMethod -Uri "http://localhost:4001/api/appointments" -Method Post -Headers $patientHeaders -ContentType "application/json" -Body ($appointmentBody | ConvertTo-Json -Depth 10)
$appointmentId = $appointmentRes.data._id

$doctorAppointments = Invoke-RestMethod -Uri "http://localhost:4002/api/doctors/appointments" -Method Get -Headers $doctorHeaders
$acceptRes = Invoke-RestMethod -Uri "http://localhost:4002/api/doctors/appointments/$appointmentId/accept" -Method Patch -Headers $doctorHeaders -ContentType "application/json" -Body "{}"

$prescriptionBody = @{
  appointmentId = $appointmentId
  patientId = $patientUserId
  medicines = @(
    @{ name = "Atorvastatin"; dosage = "10mg"; frequency = "Once daily"; duration = "30 days"; notes = "After dinner" },
    @{ name = "Aspirin"; dosage = "75mg"; frequency = "Once daily"; duration = "30 days"; notes = "After breakfast" }
  )
  instructions = "Monitor blood pressure daily"
  followUpDate = (Get-Date).ToUniversalTime().AddDays(14).ToString("o")
}

$prescriptionRes = Invoke-RestMethod -Uri "http://localhost:4002/api/doctors/prescriptions" -Method Post -Headers $doctorHeaders -ContentType "application/json" -Body ($prescriptionBody | ConvertTo-Json -Depth 10)
$prescriptionGetRes = Invoke-RestMethod -Uri "http://localhost:4002/api/doctors/prescriptions/$appointmentId" -Method Get -Headers $doctorHeaders

Write-Host "TEST_SUMMARY:"
@{
  doctorUserId = $doctorUserId
  patientUserId = $patientUserId
  doctorProfileId = $doctorCreate.data._id
  appointmentId = $appointmentId
  prescriptionId = $prescriptionRes.data._id
  doctorProfileStatus = $doctorCreate.data.status
  doctorVerified = $doctorCreate.data.verified
  appointmentStatusAfterAccept = $acceptRes.data.status
} | ConvertTo-Json -Depth 10

Write-Host "APPOINTMENT_CREATE_RESPONSE:"
$appointmentRes | ConvertTo-Json -Depth 10
Write-Host "DOCTOR_APPOINTMENTS_RESPONSE:"
$doctorAppointments | ConvertTo-Json -Depth 10
Write-Host "PRESCRIPTION_CREATE_RESPONSE:"
$prescriptionRes | ConvertTo-Json -Depth 10
Write-Host "PRESCRIPTION_GET_RESPONSE:"
$prescriptionGetRes | ConvertTo-Json -Depth 10
