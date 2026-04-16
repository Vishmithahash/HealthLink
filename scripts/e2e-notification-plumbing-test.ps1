$AuthBaseUrl = $env:AUTH_BASE_URL
$AppointmentBaseUrl = $env:APPOINTMENT_BASE_URL
$DoctorBaseUrl = $env:DOCTOR_BASE_URL
$TelemedicineBaseUrl = $env:TELEMEDICINE_BASE_URL
$NotificationBaseUrl = $env:NOTIFICATION_BASE_URL

if ([string]::IsNullOrWhiteSpace($AuthBaseUrl)) { $AuthBaseUrl = "http://localhost:4000" }
if ([string]::IsNullOrWhiteSpace($AppointmentBaseUrl)) { $AppointmentBaseUrl = "http://localhost:4001" }
if ([string]::IsNullOrWhiteSpace($DoctorBaseUrl)) { $DoctorBaseUrl = "http://localhost:4002" }
if ([string]::IsNullOrWhiteSpace($TelemedicineBaseUrl)) { $TelemedicineBaseUrl = "http://localhost:4004" }
if ([string]::IsNullOrWhiteSpace($NotificationBaseUrl)) { $NotificationBaseUrl = "http://localhost:4007" }

$ErrorActionPreference = "Stop"

function Invoke-HealthCheck {
  param(
    [string]$Name,
    [string]$Url
  )

  try {
    $null = Invoke-RestMethod -Uri $Url -Method Get
    Write-Host "[health] $Name OK -> $Url"
  }
  catch {
    throw "Health check failed for $Name at $Url. $($_.Exception.Message)"
  }
}

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Body,
    [hashtable]$Headers
  )

  $payload = $null
  if ($Body) {
    $payload = $Body | ConvertTo-Json -Depth 12
  }

  if ($payload) {
    return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $Headers -ContentType "application/json" -Body $payload
  }

  return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $Headers
}

function Invoke-JsonAllowHttpError {
  param(
    [string]$Uri,
    [hashtable]$Body,
    [hashtable]$Headers
  )

  $payload = $Body | ConvertTo-Json -Depth 12

  try {
    $response = Invoke-WebRequest -Uri $Uri -Method Post -Headers $Headers -ContentType "application/json" -Body $payload -UseBasicParsing
    return @{
      StatusCode = [int]$response.StatusCode
      Body = $response.Content
    }
  }
  catch {
    if (-not $_.Exception.Response) {
      throw
    }

    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $content = $reader.ReadToEnd()

    return @{
      StatusCode = [int]$_.Exception.Response.StatusCode
      Body = $content
    }
  }
}

$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$password = "Pass@12345"

$doctorEmail = "plumbing-doctor-$ts@healthlink.test"
$patientEmail = "plumbing-patient-$ts@healthlink.test"

Invoke-HealthCheck -Name "Auth" -Url "$AuthBaseUrl/health"
Invoke-HealthCheck -Name "Appointment" -Url "$AppointmentBaseUrl/health"
Invoke-HealthCheck -Name "Doctor" -Url "$DoctorBaseUrl/health"
Invoke-HealthCheck -Name "Telemedicine" -Url "$TelemedicineBaseUrl/health"
Invoke-HealthCheck -Name "Notification" -Url "$NotificationBaseUrl/health"

$doctorAuthPayload = @{
  fullName = "Plumbing Doctor $ts"
  nic = "PD$ts"
  phoneNumber = "+94770$($ts.ToString().Substring($ts.ToString().Length - 5))"
  username = "plumbingdoctor$ts"
  email = $doctorEmail
  password = $password
  role = "Doctor"
  specialty = "Cardiologist"
}

$adminAuthPayload = @{
  fullName = "Plumbing Admin $ts"
  nic = "PA$ts"
  phoneNumber = "+94772$($ts.ToString().Substring($ts.ToString().Length - 5))"
  username = "plumbingadmin$ts"
  email = "plumbing-admin-$ts@healthlink.test"
  password = $password
  role = "Admin"
}

$patientAuthPayload = @{
  fullName = "Plumbing Patient $ts"
  nic = "PP$ts"
  phoneNumber = "+94771$($ts.ToString().Substring($ts.ToString().Length - 5))"
  username = "plumbingpatient$ts"
  email = $patientEmail
  password = $password
  role = "patient"
}

$doctorReg = Invoke-Json -Method Post -Uri "$AuthBaseUrl/api/auth/register" -Body $doctorAuthPayload
$adminReg = Invoke-Json -Method Post -Uri "$AuthBaseUrl/api/auth/register" -Body $adminAuthPayload
$patientReg = Invoke-Json -Method Post -Uri "$AuthBaseUrl/api/auth/register" -Body $patientAuthPayload

$doctorToken = $doctorReg.data.accessToken
$adminToken = $adminReg.data.accessToken
$patientToken = $patientReg.data.accessToken

$doctorUserId = $doctorReg.data.user.id
$patientUserId = $patientReg.data.user.id

$doctorHeaders = @{ Authorization = "Bearer $doctorToken" }
$adminHeaders = @{ Authorization = "Bearer $adminToken" }
$patientHeaders = @{ Authorization = "Bearer $patientToken" }

$patientProfilePayload = @{
  userId = $patientUserId
  fullName = "Plumbing Patient $ts"
  dob = "1998-01-01T00:00:00.000Z"
  gender = "female"
  phone = "94771$($ts.ToString().Substring($ts.ToString().Length - 5))"
  address = "Colombo, Sri Lanka"
  bloodGroup = "A+"
  allergies = @()
  medicalHistory = @()
  emergencyContact = @{
    name = "Emergency Contact"
    relationship = "Guardian"
    phone = "94770$($ts.ToString().Substring($ts.ToString().Length - 5))"
  }
}

$null = Invoke-Json -Method Post -Uri "http://localhost:4003/api/patients/register" -Body $patientProfilePayload -Headers $patientHeaders

$null = Invoke-Json -Method Get -Uri "http://localhost:4003/api/patients/profile" -Headers $patientHeaders

$doctorProfilePayload = @{
  userId = $doctorUserId
  fullName = "Plumbing Doctor $ts"
  specialization = "Cardiologist"
  licenseNumber = "PLUMB-$ts"
  qualification = "MBBS"
  experienceYears = 5
  consultationFee = 3000
}

$null = Invoke-Json -Method Post -Uri "$DoctorBaseUrl/api/doctors/register" -Body $doctorProfilePayload -Headers $doctorHeaders

$appointmentPayload = @{
  patientId = $patientUserId
  doctorId = $doctorUserId
  specialty = "Cardiologist"
  scheduledAt = (Get-Date).ToUniversalTime().AddDays(1).ToString("o")
  durationMinutes = 20
  reason = "Notification plumbing validation"
}

$appointmentCreate = Invoke-Json -Method Post -Uri "$AppointmentBaseUrl/api/appointments" -Body $appointmentPayload -Headers $adminHeaders
$appointmentId = $appointmentCreate.data._id

$acceptPayload = @{
  subject = "Appointment Status Update"
  message = "Your appointment has been accepted by the doctor."
}

$appointmentAccept = Invoke-Json -Method Patch -Uri "$DoctorBaseUrl/api/doctors/appointments/$appointmentId/accept" -Body $acceptPayload -Headers $doctorHeaders

$sessionCreatePayload = @{
  appointmentId = $appointmentId
  patientId = $patientUserId
  doctorId = $doctorUserId
}

$null = Invoke-Json -Method Post -Uri "$TelemedicineBaseUrl/api/telemedicine/session" -Body $sessionCreatePayload -Headers $doctorHeaders
$sessionByAppointment = Invoke-Json -Method Get -Uri "$TelemedicineBaseUrl/api/telemedicine/session/appointment/$appointmentId" -Headers $doctorHeaders
$sessionId = $sessionByAppointment.data._id

$null = Invoke-Json -Method Patch -Uri "$TelemedicineBaseUrl/api/telemedicine/session/$sessionId/start" -Body @{} -Headers $doctorHeaders

$sessionEndPayload = @{
  patientEmail = $patientEmail
  doctorEmail = $doctorEmail
  patientName = "Plumbing Patient"
  doctorName = "Plumbing Doctor"
  message = "Consultation completed plumbing test"
}

$sessionEnd = Invoke-Json -Method Patch -Uri "$TelemedicineBaseUrl/api/telemedicine/session/$sessionId/end" -Body $sessionEndPayload -Headers $doctorHeaders

$paymentSuccessProbe = Invoke-JsonAllowHttpError -Uri "$NotificationBaseUrl/api/notifications/payment-success" -Body @{
  to = $patientEmail
  patientName = "Plumbing Patient"
  doctorName = "Plumbing Doctor"
  amount = "1000"
  paymentId = "plumbing-payment-$ts"
  appointmentId = $appointmentId
  message = "Payment success endpoint plumbing probe"
}

$paymentVerificationProbe = Invoke-JsonAllowHttpError -Uri "$NotificationBaseUrl/api/notifications/payment-verification" -Body @{
  to = $patientEmail
  patientName = "Plumbing Patient"
  doctorName = "Plumbing Doctor"
  paymentId = "plumbing-payment-$ts"
  appointmentId = $appointmentId
  message = "Payment verification endpoint plumbing probe"
}

$allowedProbeStatuses = @(200, 502)

if ($allowedProbeStatuses -notcontains $paymentSuccessProbe.StatusCode) {
  throw "Unexpected status from payment-success probe: $($paymentSuccessProbe.StatusCode)"
}

if ($allowedProbeStatuses -notcontains $paymentVerificationProbe.StatusCode) {
  throw "Unexpected status from payment-verification probe: $($paymentVerificationProbe.StatusCode)"
}

Write-Host "TEST_SUMMARY:"
@{
  doctorUserId = $doctorUserId
  patientUserId = $patientUserId
  appointmentId = $appointmentId
  appointmentStatus = $appointmentAccept.data.status
  telemedicineSessionId = $sessionId
  telemedicineStatusAfterEnd = $sessionEnd.data.status
  paymentSuccessProbeStatus = $paymentSuccessProbe.StatusCode
  paymentVerificationProbeStatus = $paymentVerificationProbe.StatusCode
} | ConvertTo-Json -Depth 10
