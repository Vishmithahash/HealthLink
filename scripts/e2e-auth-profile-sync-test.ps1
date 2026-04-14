$ErrorActionPreference = "Stop"

$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

$register = {
  param($payload)
  Invoke-RestMethod -Uri "http://localhost:4000/api/auth/register" -Method Post -ContentType "application/json" -Body ($payload | ConvertTo-Json)
}

$doctorAuthPayload = @{
  fullName = "Dr Ovini $ts"
  nic = "DR$ts"
  phoneNumber = "+94770$($ts.ToString().Substring($ts.ToString().Length-5))"
  username = "ovini$ts"
  email = "ovini$ts@healthlink.com"
  password = "Password123!"
  role = "Doctor"
  specialty = "Cardiologist"
}

$patientAuthPayload = @{
  fullName = "Gihan Gajanayaka $ts"
  nic = "P$ts"
  phoneNumber = "+94771$($ts.ToString().Substring($ts.ToString().Length-5))"
  username = "gihan$ts"
  email = "gihan$ts@healthlink.com"
  password = "Password@123"
  role = "patient"
}

$doctorReg = & $register $doctorAuthPayload
$patientReg = & $register $patientAuthPayload

$doctorToken = $doctorReg.data.accessToken
$patientToken = $patientReg.data.accessToken
$doctorUserId = $doctorReg.data.user.id
$patientUserId = $patientReg.data.user.id

$doctorHeaders = @{ Authorization = "Bearer $doctorToken" }
$patientHeaders = @{ Authorization = "Bearer $patientToken" }

$doctorProfileInitial = Invoke-RestMethod -Uri "http://localhost:4002/api/doctors/profile" -Method Get -Headers $doctorHeaders
$patientProfileInitial = Invoke-RestMethod -Uri "http://localhost:4003/api/patients/profile" -Method Get -Headers $patientHeaders

$doctorPatch = @{
  fullName = "Dr Ovini Updated $ts"
  nic = "DRX$ts"
  phoneNumber = "+94772$($ts.ToString().Substring($ts.ToString().Length-5))"
  username = "oviniu$ts"
  email = "oviniu$ts@healthlink.com"
  specialization = "Neurologist"
  qualification = "MBBS, MD"
  experienceYears = 9
  consultationFee = 5000
}

$patientPatch = @{
  fullName = "Gihan Updated $ts"
  nic = "PX$ts"
  username = "gihanu$ts"
  email = "gihanu$ts@healthlink.com"
  phone = "94773330000"
  dob = "1998-08-15T00:00:00.000Z"
  gender = "female"
  address = "Colombo, Sri Lanka"
  bloodGroup = "A+"
  allergies = @("Penicillin")
}

$doctorProfileUpdated = Invoke-RestMethod -Uri "http://localhost:4002/api/doctors/profile" -Method Patch -Headers $doctorHeaders -ContentType "application/json" -Body ($doctorPatch | ConvertTo-Json -Depth 10)
$patientProfileUpdated = Invoke-RestMethod -Uri "http://localhost:4003/api/patients/profile" -Method Patch -Headers $patientHeaders -ContentType "application/json" -Body ($patientPatch | ConvertTo-Json -Depth 10)

$doctorByUser = Invoke-RestMethod -Uri "http://localhost:4002/api/doctors/by-user/$doctorUserId" -Method Get -Headers $doctorHeaders
$patientByUser = Invoke-RestMethod -Uri "http://localhost:4003/api/patients/by-user/$patientUserId" -Method Get -Headers $patientHeaders

Write-Host "TEST_SUMMARY:"
@{
  doctorUserId = $doctorUserId
  patientUserId = $patientUserId
  doctorProfileAutoCreated = $doctorProfileInitial.success
  patientProfileAutoCreated = $patientProfileInitial.success
  doctorUsernameAfterPatch = $doctorProfileUpdated.data.username
  patientUsernameAfterPatch = $patientProfileUpdated.data.username
  doctorLookupByUserId = $doctorByUser.success
  patientLookupByUserId = $patientByUser.success
} | ConvertTo-Json -Depth 10
