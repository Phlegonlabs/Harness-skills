<# 
Usage:
  pwsh scripts/maintenance/bump-version.ps1
  pwsh scripts/maintenance/bump-version.ps1 -Version 2026.03.11
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [ValidatePattern('^\d{4}\.\d{2}\.\d{2}$')]
  [string] $Version
)

$ErrorActionPreference = 'Stop'
$versionPattern = '^\d{4}\.\d{2}\.\d{2}$'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$versionPath = Join-Path $root 'VERSION'
$skillPath = Join-Path $root 'SKILL.md'
$readmePath = Join-Path $root 'README.md'

if (-not (Test-Path $versionPath)) {
  throw "Missing VERSION file: $versionPath"
}

$currentVersion = (Get-Content $versionPath -Raw).Trim()
if (-not [regex]::IsMatch($currentVersion, $versionPattern)) {
  throw "Current VERSION format invalid: $currentVersion"
}

$currentDate = [datetime]::ParseExact($currentVersion, 'yyyy.MM.dd', [System.Globalization.CultureInfo]::InvariantCulture)
$nextVersion = if ($Version) { 
  $Version 
} else {
  $today = [datetime]::Today
  $nextDate = if ($today -le $currentDate) { $currentDate.AddDays(1) } else { $today }
  $nextDate.ToString('yyyy.MM.dd')
}

$versionUpdated = $currentVersion -ne $nextVersion
if ($versionUpdated) {
  Set-Content -Path $versionPath -Value $nextVersion -Encoding utf8
}

$skillContent = Get-Content $skillPath -Raw
$updatedSkill = [regex]::Replace($skillContent, '(?m)^version:\s*.*\r?\n', '')
$skillUpdated = $updatedSkill -ne $skillContent
if ($skillUpdated) {
  Set-Content -Path $skillPath -Value $updatedSkill -Encoding utf8
}

$readmeContent = Get-Content $readmePath -Raw
$backtick = '`'
$replacement = "Skill version: $backtick$nextVersion$backtick"
$readmeVersionMatch = [regex]::Match($readmeContent, '(?m)^Skill version:\s*`[^`]*`$')
if (-not $readmeVersionMatch.Success) {
  throw "Failed to find README.md Skill version line"
}
$updatedReadme = [regex]::Replace(
  $readmeContent,
  '(?m)^Skill version:\s*`[^`]*`$',
  $replacement
)
$readmeUpdated = $updatedReadme -ne $readmeContent
if ($readmeUpdated) {
  Set-Content -Path $readmePath -Value $updatedReadme -Encoding utf8
}

$updatedFiles = [System.Collections.Generic.List[string]]::new()
if ($versionUpdated) {
  $updatedFiles.Add('VERSION') | Out-Null
}
if ($skillUpdated) {
  $updatedFiles.Add('SKILL.md (removed legacy frontmatter version)') | Out-Null
}
if ($readmeUpdated) {
  $updatedFiles.Add('README.md') | Out-Null
}

if ($updatedFiles.Count -eq 0) {
  Write-Host "No-op: VERSION is already $currentVersion and no legacy version metadata needed cleanup"
  return
}

# Append audit entry
$auditFile = Join-Path $root "docs/human/maintenance/skill-audit.md"
if (Test-Path $auditFile) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $changedFiles = ($updatedFiles -join ', ')
    $auditEntry = "`n---`n`n## $timestamp — bump-version`n`n- **Action:** Version bump`n- **Previous version:** $currentVersion`n- **New version:** $nextVersion`n- **Changed files:** $changedFiles`n"
    Add-Content -Path $auditFile -Value $auditEntry
}

Write-Host "Version bump: $currentVersion -> $nextVersion"
Write-Host "Updated:"
if ($versionUpdated) {
  Write-Host " - $versionPath"
}
if ($skillUpdated) {
  Write-Host " - $skillPath (removed legacy frontmatter version)"
}
if ($readmeUpdated) {
  Write-Host " - $readmePath"
}

