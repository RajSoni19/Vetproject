$ErrorActionPreference = 'Stop'
$ruleName = 'VTV Local WSL document worker PostgreSQL 55440'
$pgPath = 'C:\Program Files\PostgreSQL\17\bin\postgres.exe'
$cluster = 'D:\vetthevat.saas-dev\cluster'
$listener = Get-NetTCPConnection -State Listen -LocalAddress '172.20.240.1' -LocalPort 55440
if (-not $listener) { throw 'The approved PostgreSQL listener is not bound to the WSL vEthernet address.' }
$process = Get-Process -Id $listener[0].OwningProcess
if ($process.Path -ne $pgPath) { throw 'The WSL address/port is not owned by the expected PostgreSQL executable.' }
$status = & 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe' status -D $cluster 2>&1
if (($status -join ' ') -notmatch 'server is running') { throw 'Approved PostgreSQL cluster identity could not be verified.' }
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) { throw 'An exact-name firewall rule already exists; inspect before changing it.' }
$rule = New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Enabled True -Protocol TCP -LocalPort 55440 -LocalAddress '172.20.240.1' -RemoteAddress '172.20.240.0/20' -Program $pgPath -Profile Any
$filter = $rule | Get-NetFirewallAddressFilter
$port = $rule | Get-NetFirewallPortFilter
$application = $rule | Get-NetFirewallApplicationFilter
$remoteScopeMatches = $filter.RemoteAddress -contains '172.20.240.0/20' -or $filter.RemoteAddress -contains '172.20.240.0/255.255.240.0'
if ($rule.Direction -ne 'Inbound' -or $rule.Action -ne 'Allow' -or $filter.LocalAddress -notcontains '172.20.240.1' -or -not $remoteScopeMatches -or $port.Protocol -ne 'TCP' -or $port.LocalPort -notcontains '55440' -or $application.Program -ne $pgPath) { throw 'Created firewall rule does not match the approved narrow scope.' }
Write-Output ('Created local WSL-only firewall rule: ' + $ruleName)
