<#
Usage:
  pwsh scripts/maintenance/skill-maintenance.ps1
  pwsh scripts/maintenance/skill-maintenance.ps1 -AutoFix
  pwsh scripts/maintenance/skill-maintenance.ps1 -AutoFix -Version 2026.03.12
#>
[CmdletBinding()]
param(
  [switch]$AutoFix,
  [string]$Version
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$versionPath = Join-Path $root 'VERSION'
$skillPath = Join-Path $root 'SKILL.md'
$readmePath = Join-Path $root 'README.md'
$docsIndexPath = Join-Path $root 'docs\index.md'
$maintainerGuidePath = Join-Path $root 'docs\human\maintainer-guide.md'
$auditPath = Join-Path $root 'docs\human\maintenance\skill-audit.md'
$agentDir = Join-Path $root 'docs\agent'
$maintenanceDir = Join-Path $root 'scripts\maintenance'
$artifactPath = Join-Path $agentDir 'skill-artifacts.md'
$greenfieldPath = Join-Path $agentDir 'skill-greenfield.md'
$retrofitPath = Join-Path $agentDir 'skill-retrofit.md'
$executionPath = Join-Path $agentDir 'skill-execution.md'
$projectConfigsPath = Join-Path $agentDir 'project-configs.md'
$harnessCliPath = Join-Path $agentDir 'harness-cli.md'
$bumpScript = Join-Path $maintenanceDir 'bump-version.ps1'

$problems = [System.Collections.Generic.List[string]]::new()
$notes = [System.Collections.Generic.List[string]]::new()

function Add-Fail {
  param([string]$Message)
  $problems.Add($Message) | Out-Null
}

function Add-Pass {
  param([string]$Message)
  $notes.Add($Message) | Out-Null
}

function Ensure-Contains {
  param(
    [string]$Path,
    [string[]]$Patterns
  )

  $name = [IO.Path]::GetFileName($Path)
  if (-not (Test-Path $Path)) {
    Add-Fail "$name missing"
    return
  }

  $content = Get-Content $Path -Raw
  foreach ($pattern in $Patterns) {
    if ($content.Contains($pattern)) {
      Add-Pass "$name contains '$pattern'"
    } else {
      Add-Fail "$name missing '$pattern'"
    }
  }
}

function Count-Pattern {
  param(
    [string[]]$Files,
    [string]$Pattern
  )

  $hits = 0
  foreach ($file in $Files) {
    $hits += (Select-String -Path $file -Pattern $Pattern -SimpleMatch | Measure-Object).Count
  }
  return $hits
}

function Ensure-VersionSync {
  param([string]$TargetVersion)

  & $bumpScript -Version $TargetVersion | Out-Null
}

foreach ($path in @(
  $versionPath,
  $skillPath,
  $readmePath,
  $docsIndexPath,
  $maintainerGuidePath,
  $auditPath,
  $artifactPath,
  $greenfieldPath,
  $retrofitPath,
  $executionPath,
  $projectConfigsPath,
  $harnessCliPath,
  $bumpScript
)) {
  if (Test-Path $path) {
    Add-Pass "Exists: $([IO.Path]::GetFileName($path))"
  } else {
    Add-Fail "Missing required path: $path"
  }
}

$version = if (Test-Path $versionPath) { (Get-Content $versionPath -Raw).Trim() } else { '' }
if (-not [regex]::IsMatch($version, '^\d{4}\.\d{2}\.\d{2}$')) {
  Add-Fail "VERSION format invalid: '$version'"
}

if ($Version) {
  if (-not [regex]::IsMatch($Version, '^\d{4}\.\d{2}\.\d{2}$')) {
    throw "Version parameter has invalid format: $Version"
  }
  if ($Version -ne $version) {
    Ensure-VersionSync $Version
    $version = (Get-Content $versionPath -Raw).Trim()
    Add-Pass "Synced VERSION via bump-version.ps1"
  }
}

$skillContent = if (Test-Path $skillPath) { Get-Content $skillPath -Raw } else { '' }
$readmeContent = if (Test-Path $readmePath) { Get-Content $readmePath -Raw } else { '' }

if ($skillContent -match '(?m)^version:\s*\S+\s*$') {
  if ($AutoFix) {
    Ensure-VersionSync $version
    $skillContent = Get-Content $skillPath -Raw
    $readmeContent = Get-Content $readmePath -Raw
    Add-Pass 'Removed legacy SKILL.md version field via bump-version.ps1'
  } else {
    Add-Fail 'SKILL.md contains a legacy frontmatter version field'
  }
} else {
  Add-Pass 'SKILL.md has no legacy frontmatter version field'
}

$readmeVersionMatch = [regex]::Match($readmeContent, '(?m)^Skill version:\s*`([^`]+)`\s*$')
if (-not $readmeVersionMatch.Success) {
  Add-Fail 'README.md Skill version line missing'
} elseif ($readmeVersionMatch.Groups[1].Value -ne $version) {
  if ($AutoFix) {
    Ensure-VersionSync $version
    $readmeContent = Get-Content $readmePath -Raw
    Add-Pass 'Synced README.md version from VERSION'
  } else {
    Add-Fail "README.md version mismatch: README.md=$($readmeVersionMatch.Groups[1].Value), VERSION=$version"
  }
} else {
  Add-Pass 'README.md version matches VERSION'
}

Ensure-Contains -Path $docsIndexPath -Patterns @(
  'human/maintainer-guide.md',
  'agent/',
  'scripts/maintenance/'
)

Ensure-Contains -Path $maintainerGuidePath -Patterns @(
  '../index.md',
  '../../SKILL.md',
  '../../scripts/maintenance/'
)

Ensure-Contains -Path $readmePath -Patterns @(
  'docs/index.md',
  'docs/agent/',
  'docs/product/',
  'scripts/maintenance/check-commit-msg.ts'
)

Ensure-Contains -Path $skillPath -Patterns @(
  'docs/index.md',
  'docs/agent/skill-greenfield.md',
  'docs/agent/skill-retrofit.md',
  'docs/product/frontend-design.md',
  'Cross-Agent Continuation',
  'Closed-Loop Rule'
)

Ensure-Contains -Path $artifactPath -Patterns @(
  'Closed-loop execution rule',
  'docs/index.md',
  'docs/product/frontend-design.md',
  'docs/agent/agent-workflows.md',
  'scripts/maintenance/check-commit-msg.ts'
)

Ensure-Contains -Path $greenfieldPath -Patterns @(
  'docs/index.md',
  'docs/product/design.md',
  'docs/agent/agent-workflows.md',
  'docs/agent/api-guide.md'
)

Ensure-Contains -Path $retrofitPath -Patterns @(
  'docs/index.md',
  'docs/product/design-preview.html',
  'scripts/maintenance/check-commit-msg.ts'
)

Ensure-Contains -Path $executionPath -Patterns @(
  'docs/index.md',
  'docs/product/design-preview.html',
  'GitBook writing workflow',
  'Closed-Loop Checklist'
)

Ensure-Contains -Path $projectConfigsPath -Patterns @(
  'scripts/maintenance/check-commit-msg.ts'
)

Ensure-Contains -Path $harnessCliPath -Patterns @(
  'scripts/maintenance/check-commit-msg.ts'
)

$agentReferenceFiles = @(
  'eslint-configs.md',
  'execution-advanced.md',
  'execution-runtime.md',
  'gitignore-templates.md',
  'harness-cli.md',
  'harness-native.md',
  'project-configs.md',
  'replay-protocol.md',
  'scaffold-templates.md',
  'skill-artifacts.md',
  'skill-auth.md',
  'skill-desktop.md',
  'skill-execution.md',
  'skill-greenfield.md',
  'skill-mobile.md',
  'skill-retrofit.md'
)
foreach ($file in $agentReferenceFiles) {
  $path = Join-Path $agentDir $file
  if (Test-Path $path) {
    Add-Pass "Agent reference present: $file"
  } else {
    Add-Fail "Agent reference missing: $file"
  }
}

if (Test-Path $maintenanceDir) {
  Add-Pass 'scripts/maintenance directory exists'
} else {
  Add-Fail 'scripts/maintenance directory missing'
}

$allTextFiles = Get-ChildItem -Path $root -Recurse -File | Where-Object {
  $_.Extension -in '.md', '.ps1'
} | Where-Object {
  $_.FullName -notin @($auditPath, $PSCommandPath)
} | Select-Object -ExpandProperty FullName

$stalePatterns = @(
  'references/',
  'references\',
  'scripts/check-commit-msg.ts',
  'docs/frontend-design.md',
  'docs/design.md',
  'docs/design-preview.html',
  'docs/release.md',
  'scripts/skill-maintenance.ps1',
  'scripts/bump-version.ps1'
)

foreach ($pattern in $stalePatterns) {
  $count = Count-Pattern -Files $allTextFiles -Pattern $pattern
  if ($count -eq 0) {
    Add-Pass "No stale '$pattern' references remain"
  } else {
    Add-Fail "Found $count stale '$pattern' references"
  }
}

Write-Host "`nHarness Engineer CLI maintenance check`n"
foreach ($note in $notes) {
  Write-Host "[PASS] $note"
}

if ($problems.Count -gt 0) {
  Write-Host "`n[FAIL] Maintenance issues detected:`n"
  foreach ($problem in $problems) {
    Write-Host " - $problem"
  }
  exit 1
}

Write-Host "`nAll maintenance checks passed."
