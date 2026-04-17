$ErrorActionPreference = "Stop"

$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$password = "Pass@12345"

$patientAuth = @{
  fullName = "AI Patient $ts"
  nic = "AIP$ts"
  phoneNumber = "+94772$($ts.ToString().Substring($ts.ToString().Length-5))"
  username = "aipatient$ts"
  email = "aipatient$ts@healthlink.com"
  password = $password
  role = "patient"
}

$registerResponse = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/register" -Method Post -ContentType "application/json" -Body ($patientAuth | ConvertTo-Json)
$token = $registerResponse.data.accessToken
$userId = $registerResponse.data.user.id
$headers = @{ Authorization = "Bearer $token" }

$analyzeBody = @{
  symptoms = "Chest pain with sudden breathing difficulty"
  age = 36
  gender = "male"
  duration = "20 minutes"
  severity = "severe"
  notes = "Pain spreading to left arm"
}

$analyzeResponse = Invoke-RestMethod -Uri "http://localhost:4005/api/ai/symptoms/analyze" -Method Post -Headers $headers -ContentType "application/json" -Body ($analyzeBody | ConvertTo-Json)
$recordId = $analyzeResponse.recordId

$historyResponse = Invoke-RestMethod -Uri "http://localhost:4005/api/ai/symptoms/history" -Method Get -Headers $headers
$recordResponse = Invoke-RestMethod -Uri "http://localhost:4005/api/ai/symptoms/$recordId" -Method Get -Headers $headers

Write-Host "TEST_SUMMARY:"
@{
  userId = $userId
  analyzeMessage = $analyzeResponse.message
  urgency = $analyzeResponse.result.urgency
  disclaimerPresent = [bool]($analyzeResponse.result.disclaimer -and $analyzeResponse.result.disclaimer.Length -gt 0)
  recordId = $recordId
  historyCount = $historyResponse.data.total
  recordFetchSuccess = [bool]$recordResponse.success
} | ConvertTo-Json -Depth 10
