$ErrorActionPreference = "Stop"

$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$password = "Pass@12345"

$doctorAuth = @{
  fullName = "Tele Doc $ts"
  nic = "TD$ts"
  phoneNumber = "+94770$($ts.ToString().Substring($ts.ToString().Length-5))"
  username = "teledoc$ts"
  email = "teledoc$ts@healthlink.com"
  password = $password
  role = "Doctor"
  specialty = "Cardiologist"
}

$patientAuth = @{
  fullName = "Tele Patient $ts"
  nic = "TP$ts"
  phoneNumber = "+94771$($ts.ToString().Substring($ts.ToString().Length-5))"
  username = "telepatient$ts"
  email = "telepatient$ts@healthlink.com"
  password = $password
  role = "patient"
}

$doctorReg = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/register" -Method Post -ContentType "application/json" -Body ($doctorAuth | ConvertTo-Json)
$patientReg = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/register" -Method Post -ContentType "application/json" -Body ($patientAuth | ConvertTo-Json)

$doctorToken = $doctorReg.data.accessToken
$patientToken = $patientReg.data.accessToken
$doctorUserId = $doctorReg.data.user.id
$patientUserId = $patientReg.data.user.id

$doctorHeaders = @{ Authorization = "Bearer $doctorToken" }
$patientHeaders = @{ Authorization = "Bearer $patientToken" }

$appointmentBody = @{
  doctorId = $doctorUserId
  specialty = "Cardiologist"
  scheduledAt = (Get-Date).ToUniversalTime().AddDays(1).ToString("o")
  durationMinutes = 30
  reason = "Telemedicine follow-up"
}

$appointmentCreate = Invoke-RestMethod -Uri "http://localhost:4001/api/appointments" -Method Post -Headers $patientHeaders -ContentType "application/json" -Body ($appointmentBody | ConvertTo-Json)
$appointmentId = $appointmentCreate.data._id

$appointmentAccept = Invoke-RestMethod -Uri "http://localhost:4001/api/appointments/$appointmentId/status" -Method Patch -Headers $doctorHeaders -ContentType "application/json" -Body (@{ status = "confirmed" } | ConvertTo-Json)

$sessionByAppointment = Invoke-RestMethod -Uri "http://localhost:4004/api/telemedicine/session/appointment/$appointmentId" -Method Get -Headers $doctorHeaders
$sessionId = $sessionByAppointment.data._id

$startSession = Invoke-RestMethod -Uri "http://localhost:4004/api/telemedicine/session/$sessionId/start" -Method Patch -Headers $doctorHeaders -ContentType "application/json" -Body "{}"
$endSession = Invoke-RestMethod -Uri "http://localhost:4004/api/telemedicine/session/$sessionId/end" -Method Patch -Headers $doctorHeaders -ContentType "application/json" -Body "{}"

$roomDetails = Invoke-RestMethod -Uri "http://localhost:4004/api/telemedicine/room/$($sessionByAppointment.data.roomName)" -Method Get -Headers $patientHeaders

Write-Host "TEST_SUMMARY:"
@{
  doctorUserId = $doctorUserId
  patientUserId = $patientUserId
  appointmentId = $appointmentId
  appointmentStatus = $appointmentAccept.data.status
  roomName = $sessionByAppointment.data.roomName
  meetingUrl = $sessionByAppointment.data.meetingUrl
  startStatus = $startSession.data.status
  endStatus = $endSession.data.status
  roomLookupSuccess = [bool]$roomDetails.success
} | ConvertTo-Json -Depth 10
