$ErrorActionPreference='Stop'
$OutputEncoding=[Text.UTF8Encoding]::new($false)
Write-Host 'Creates a NEW synthetic test tenant only. No email or payment is sent.'
$demoEmail=Read-Host 'Choose local test email (must end with @example.test)'
$demoSecure=Read-Host 'Choose a password (at least 12 characters)' -AsSecureString
$demoPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($demoSecure)
try {
 $demoPassword=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($demoPointer)
 @{email=$demoEmail;password=$demoPassword} | ConvertTo-Json -Compress | node scripts/local-demo.cjs
 if($LASTEXITCODE -ne 0){throw 'Synthetic demo creation failed; no existing login was reset.'}
} finally {
 [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($demoPointer)
 $demoPassword=$null
}
