$ErrorActionPreference = 'Stop'
$privateDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) '.auth-pg'
if ((Resolve-Path -LiteralPath $privateDirectory).Path -ne $privateDirectory) { throw 'Refusing redirected private directory.' }
$operatorSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
# icacls updates DACLs without requesting ownership/audit privileges. Existing
# task sandbox entries are retained; no parent directory ACL is changed.
& icacls.exe $privateDirectory '/inheritance:r' '/grant:r' "*${operatorSid}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Private directory ACL update failed.' }
& icacls.exe $privateDirectory '/remove:g' '*S-1-1-0' '*S-1-5-11' '*S-1-5-32-545' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Broad access removal failed.' }
$verifiedAcl = Get-Acl -LiteralPath $privateDirectory
foreach ($privateRule in $verifiedAcl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])) {
    if ($privateRule.IdentityReference.Value -in @('S-1-1-0','S-1-5-11','S-1-5-32-545')) { throw 'Private directory permissions could not be confirmed.' }
}
Write-Output 'Verified .auth-pg permissions: operator, SYSTEM, administrators and task sandbox only.'
