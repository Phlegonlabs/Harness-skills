param(
  [string]$SkillRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$RunRoot = (Join-Path (Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path "tmp") ("harness-e2e-" + (Get-Date -Format "yyyyMMdd-HHmmss")))
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

$RunRoot = [System.IO.Path]::GetFullPath($RunRoot)
if (Test-Path $RunRoot) {
  throw "Run root already exists: $RunRoot"
}

$CasesRoot = Join-Path $RunRoot "cases"
$ReportsRoot = Join-Path $RunRoot "reports"
$SummaryPath = Join-Path $ReportsRoot "summary.md"

New-Item -ItemType Directory -Path $CasesRoot | Out-Null
New-Item -ItemType Directory -Path $ReportsRoot | Out-Null

$Cases = @(
  @{ Id = "01-web-app"; Types = @("web-app"); Display = "Detailed Web App"; ProjectName = "detailed-web-app"; AiProvider = "openai"; TeamSize = "solo"; IsGreenfield = "true"; DesignStyle = "professional"; DesignReference = "Linear"; Concept = "A web control plane for operator workflows."; Problem = "Teams lack a repeatable project execution loop."; Goal = "Ship a usable Harness-enabled web baseline." },
  @{ Id = "02-ios-app"; Types = @("ios-app"); Display = "Detailed iOS App"; ProjectName = "detailed-ios-app"; AiProvider = "none"; TeamSize = "small"; IsGreenfield = "true"; DesignStyle = "soft-friendly"; DesignReference = "Apple Fitness"; Concept = "A mobile-first execution shell."; Problem = "Operators need a portable workflow cockpit."; Goal = "Validate the iOS-oriented scaffold path." },
  @{ Id = "03-cli"; Types = @("cli"); Display = "Detailed CLI"; ProjectName = "detailed-cli"; AiProvider = "none"; TeamSize = "solo"; IsGreenfield = "true"; Concept = "A CLI for managing Harness execution state."; Problem = "Terminal-heavy teams need a reproducible project loop."; Goal = "Validate the non-UI runtime path." },
  @{ Id = "04-agent"; Types = @("agent"); Display = "Detailed Agent"; ProjectName = "detailed-agent"; AiProvider = "both"; TeamSize = "small"; IsGreenfield = "true"; Concept = "An agent project with explicit state transitions."; Problem = "Agent workflows drift without explicit gates."; Goal = "Validate agent-specific metadata and runtime flow." },
  @{ Id = "05-desktop"; Types = @("desktop"); Display = "Detailed Desktop"; ProjectName = "detailed-desktop"; AiProvider = "anthropic"; TeamSize = "small"; IsGreenfield = "true"; DesignStyle = "clean-minimal"; DesignReference = "Notion Calendar"; Concept = "A desktop operator shell."; Problem = "Teams want local tooling with repo-aware execution."; Goal = "Validate desktop UI scaffold behavior." },
  @{ Id = "06-monorepo"; Types = @("monorepo"); Display = "Detailed Monorepo"; ProjectName = "detailed-monorepo"; AiProvider = "vercel-ai-sdk"; TeamSize = "large"; IsGreenfield = "false"; Concept = "A multi-package execution baseline."; Problem = "Cross-app teams need shared docs and state."; Goal = "Validate monorepo metadata persistence." },
  @{ Id = "07-combo"; Types = @("web-app", "agent", "cli"); Display = "Detailed Combo"; ProjectName = "detailed-combo"; AiProvider = "both"; TeamSize = "large"; IsGreenfield = "true"; DesignStyle = "bold-expressive"; DesignReference = "Stripe Dashboard"; Concept = "A combined web, agent, and CLI workspace."; Problem = "Mixed surfaces often drift without one execution contract."; Goal = "Validate multi-type parsing and UI detection." },
  @{ Id = "08-android"; Types = @("android-app"); Display = "Detailed Android"; ProjectName = "detailed-android"; AiProvider = "none"; TeamSize = "solo"; IsGreenfield = "true"; DesignStyle = "clean-minimal"; DesignReference = "Google Keep"; Concept = "A native Android task manager."; Problem = "Android scaffold path lacks E2E coverage."; Goal = "Validate android-app type detection and UI project flags." },
  @{ Id = "09-api"; Types = @("api"); Display = "Detailed API"; ProjectName = "detailed-api"; AiProvider = "none"; TeamSize = "small"; IsGreenfield = "true"; Concept = "A REST API for workflow orchestration."; Problem = "Backend-only projects need validated non-UI scaffold paths."; Goal = "Validate API type scaffold with no UI flags set." },
  @{ Id = "10-cross-platform"; Types = @("mobile-cross-platform"); Display = "Detailed Cross-Platform"; ProjectName = "detailed-cross-platform"; AiProvider = "none"; TeamSize = "small"; IsGreenfield = "true"; DesignStyle = "dark-modern"; DesignReference = "Spotify"; Concept = "A cross-platform mobile app built with Expo."; Problem = "Cross-platform mobile projects need validated UI scaffold paths."; Goal = "Validate mobile-cross-platform type detection and UI flags." }
)

$SmokeResults = New-Object System.Collections.Generic.List[object]
$CommandResults = New-Object System.Collections.Generic.List[object]
$DeepResults = New-Object System.Collections.Generic.List[object]

function Invoke-Step {
  param(
    [string]$CaseId,
    [string]$StepName,
    [string]$WorkingDir,
    [string]$Exe,
    [string[]]$Arguments,
    [switch]$ExpectFailure
  )

  $logPath = Join-Path $ReportsRoot ("{0}-{1}.log" -f $CaseId, $StepName)
  $stdoutPath = [System.IO.Path]::GetTempFileName()
  $stderrPath = [System.IO.Path]::GetTempFileName()
  $argumentList = @($Arguments | Where-Object { $null -ne $_ -and "$_".Length -gt 0 })
  try {
    if ($argumentList.Count -gt 0) {
      $process = Start-Process `
        -FilePath $Exe `
        -ArgumentList $argumentList `
        -WorkingDirectory $WorkingDir `
        -NoNewWindow `
        -Wait `
        -PassThru `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath
    } else {
      $process = Start-Process `
        -FilePath $Exe `
        -WorkingDirectory $WorkingDir `
        -NoNewWindow `
        -Wait `
        -PassThru `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath
    }

    $stdout = ""
    if (Test-Path $stdoutPath) {
      $stdout = [string](Get-Content $stdoutPath -Raw)
    }

    $stderr = ""
    if (Test-Path $stderrPath) {
      $stderr = [string](Get-Content $stderrPath -Raw)
    }
    $stdoutText = [string]$stdout
    $stderrText = [string]$stderr
    if ($null -eq $stdoutText) { $stdoutText = "" }
    if ($null -eq $stderrText) { $stderrText = "" }

    $output = ($stdoutText.TrimEnd(), $stderrText.TrimEnd() | Where-Object { $_ }) -join "`n"
    $exitCode = $process.ExitCode
  } finally {
    Remove-Item $stdoutPath, $stderrPath -ErrorAction SilentlyContinue
  }

  Set-Content -Path $logPath -Value $output
  $ok = if ($ExpectFailure) { $exitCode -ne 0 } else { $exitCode -eq 0 }

  [pscustomobject]@{
    Step = $StepName
    Ok = $ok
    ExitCode = $exitCode
    Output = $output.Trim()
    Log = $logPath
  }
}

function Add-CommandResult {
  param(
    [string]$CaseId,
    [string]$Type,
    [string]$StepName,
    [string]$Expectation,
    [object]$Step
  )

  $CommandResults.Add([pscustomobject]@{
    CaseId = $CaseId
    Type = $Type
    Step = $StepName
    Expectation = $Expectation
    Passed = $Step.Ok
    ExitCode = $Step.ExitCode
    Output = $Step.Output
    Log = $Step.Log
  }) | Out-Null
}

function Add-DeepResult {
  param(
    [string]$CaseId,
    [string]$Scenario,
    [string]$Expected,
    [object]$Step
  )

  $DeepResults.Add([pscustomobject]@{
    CaseId = $CaseId
    Scenario = $Scenario
    Expected = $Expected
    Passed = $Step.Ok
    ExitCode = $Step.ExitCode
    Output = $Step.Output
    Log = $Step.Log
  }) | Out-Null
}

function Copy-TrackedHarnessFixture {
  param(
    [string]$SourceDir,
    [string]$DestinationDir
  )

  if (Test-Path $DestinationDir) {
    throw "Destination already exists: $DestinationDir"
  }

  New-Item -ItemType Directory -Path $DestinationDir | Out-Null
  robocopy $SourceDir $DestinationDir /E `
    /XD .git .harness .claude .codex node_modules agents skills docs\ai docs\progress `
    /XF AGENTS.md CLAUDE.md SKILLS.md .env.local docs\PROGRESS.md `
    /NJH /NJS /NFL /NDL | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "robocopy failed with exit code $LASTEXITCODE"
  }
}

function Test-ScaffoldContract {
  param(
    [string]$CaseId,
    [string]$CaseDir,
    [string[]]$Types
  )

  $workspaceMap = @{
    "web-app" = "web"
    "ios-app" = "ios"
    "android-app" = "android"
    "api" = "api"
    "mobile-cross-platform" = "mobile"
    "cli" = "cli"
    "agent" = "agent"
    "desktop" = "desktop"
  }
  $workspaceApps = @(
    $Types |
      Where-Object { $_ -ne "monorepo" } |
      ForEach-Object { $workspaceMap[$_] } |
      Where-Object { $_ } |
      Select-Object -Unique
  )
  if ($workspaceApps.Count -eq 0) {
    $workspaceApps = @("core")
  }

  $logPath = Join-Path $ReportsRoot ("{0}-contract.log" -f $CaseId)
  $requiredPaths = @(
    "apps",
    "packages",
    "packages/shared/package.json",
    "packages/shared/README.md",
    ".env.local",
    "bunfig.toml",
    ".github/workflows/ci.yml",
    ".github/workflows/release.yml",
    ".harness/types.ts",
    ".harness/init.ts",
    ".harness/advance.ts",
    ".harness/state.ts",
    ".harness/validate.ts",
    ".harness/orchestrator.ts",
    ".harness/orchestrate.ts",
    ".harness/stage.ts",
    ".harness/add-surface.ts",
    ".harness/audit.ts",
    ".harness/api-add.ts",
    ".harness/compact.ts",
    ".harness/merge-milestone.ts",
    ".harness/resume.ts",
    ".harness/learn.ts",
    ".harness/metrics.ts",
    ".harness/entropy-scan.ts",
    ".harness/scope-change.ts",
    ".harness/sync-docs.ts",
    ".harness/sync-skills.ts",
    ".dependency-cruiser.cjs",
    ".claude/settings.local.json",
    "agents/project-discovery.md",
    "agents/market-research.md",
    "agents/tech-stack-advisor.md",
    "agents/prd-architect.md",
    "agents/scaffold-generator.md",
    "agents/frontend-designer.md",
    "agents/execution-engine.md",
    "agents/execution-engine/01-preflight.md",
    "agents/execution-engine/02-task-loop.md",
    "agents/execution-engine/03-spike-workflow.md",
    "agents/execution-engine/04-stack-scaffolds.md",
    "agents/execution-engine/05-debug-and-learning.md",
    "agents/execution-engine/06-observability.md",
    "agents/design-reviewer.md",
    "agents/code-reviewer.md",
    "agents/harness-validator.md",
    "agents/orchestrator.md",
    "agents/context-compactor.md",
    "agents/entropy-scanner.md",
    "agents/fast-path-bootstrap.md",
    ".codex/config.toml",
    ".codex/rules/guardian.rules",
    "scripts/harness-local/restore.ts",
    "scripts/harness-local/manifest.json"
  )
  foreach ($workspace in $workspaceApps) {
    $requiredPaths += "apps/$workspace/package.json"
    $requiredPaths += "apps/$workspace/README.md"
  }
  if ($Types -contains "agent") {
    $requiredPaths += "SKILLS.md"
    $requiredPaths += "skills/api-wrapper/SKILL.md"
    $requiredPaths += "packages/shared/api/README.md"
  }
  $missingPaths = $requiredPaths | Where-Object { -not (Test-Path (Join-Path $CaseDir $_)) }

  $pkg = Get-Content (Join-Path $CaseDir "package.json") -Raw | ConvertFrom-Json
  $requiredScripts = @(
    "check:deps",
    "harness:init",
    "harness:init:prd",
    "harness:advance",
    "harness:stage",
    "harness:add-surface",
    "harness:state",
    "harness:env",
    "harness:validate",
    "harness:validate:phase",
    "harness:validate:task",
    "harness:validate:milestone",
    "harness:guardian",
    "harness:sync-backlog",
    "harness:autoflow",
    "harness:audit",
    "harness:hooks:install",
    "harness:sync-docs",
    "harness:sync-skills",
    "harness:api:add",
    "harness:resume",
    "harness:learn",
    "harness:metrics",
    "harness:entropy-scan",
    "harness:scope-change",
    "harness:orchestrator",
    "harness:orchestrate",
    "harness:merge-milestone",
    "harness:compact",
    "harness:compact:milestone",
    "harness:compact:status"
  )
  $scriptNames = @($pkg.scripts.PSObject.Properties.Name)
  $missingScripts = $requiredScripts | Where-Object { $scriptNames -notcontains $_ }
  $workspaces = @($pkg.workspaces)
  $missingWorkspaces = @("apps/*", "packages/*") | Where-Object { $workspaces -notcontains $_ }

  $lines = @(
    "Required paths:"
    ($requiredPaths | ForEach-Object { "- $_" })
    ""
    "Required scripts:"
    ($requiredScripts | ForEach-Object { "- $_" })
    ""
    "Required workspaces:"
    "- apps/*"
    "- packages/*"
    ""
  )

  if ($missingPaths.Count -eq 0 -and $missingScripts.Count -eq 0 -and $missingWorkspaces.Count -eq 0) {
    $lines += "Contract check passed."
  } else {
    if ($missingPaths.Count -gt 0) {
      $lines += "Missing paths:"
      $lines += ($missingPaths | ForEach-Object { "- $_" })
      $lines += ""
    }
    if ($missingScripts.Count -gt 0) {
      $lines += "Missing scripts:"
      $lines += ($missingScripts | ForEach-Object { "- $_" })
      $lines += ""
    }
    if ($missingWorkspaces.Count -gt 0) {
      $lines += "Missing workspaces:"
      $lines += ($missingWorkspaces | ForEach-Object { "- $_" })
    }
  }

  Set-Content -Path $logPath -Value ($lines -join "`n")

  [pscustomobject]@{
    Step = "contract"
    Ok = ($missingPaths.Count -eq 0 -and $missingScripts.Count -eq 0 -and $missingWorkspaces.Count -eq 0)
    ExitCode = if ($missingPaths.Count -eq 0 -and $missingScripts.Count -eq 0 -and $missingWorkspaces.Count -eq 0) { 0 } else { 1 }
    Output = ($lines -join "`n")
    Log = $logPath
  }
}

function Invoke-StatePatch {
  param(
    [string]$CaseId,
    [string]$CaseDir,
    [string]$StepName,
    [hashtable]$Patch
  )

  $json = $Patch | ConvertTo-Json -Depth 20 -Compress
  $patchPath = Join-Path $CaseDir (".harness\{0}.json" -f ($StepName -replace "[^a-zA-Z0-9_-]", "-"))
  Set-Content -Path $patchPath -Value $json
  try {
    Invoke-Step -CaseId $CaseId -StepName $StepName -WorkingDir $CaseDir -Exe "bun" -Arguments @(".harness/state.ts", "--patchFile", $patchPath)
  } finally {
    Remove-Item $patchPath -ErrorAction SilentlyContinue
  }
}

function Get-HeadCommit {
  param([string]$WorkingDir)

  Push-Location $WorkingDir
  try {
    $output = (& git rev-parse HEAD 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $output) {
      throw "Unable to resolve HEAD commit."
    }
    return $output
  } finally {
    Pop-Location
  }
}

function Get-StepJson {
  param([object]$Step)

  if ($null -eq $Step -or [string]::IsNullOrWhiteSpace($Step.Output)) {
    return $null
  }

  try {
    if ($PSVersionTable.PSVersion.Major -ge 6) {
      return $Step.Output | ConvertFrom-Json -Depth 20
    }

    return $Step.Output | ConvertFrom-Json
  } catch {
    $raw = [string]$Step.Output
    $start = $raw.IndexOf("{")
    $end = $raw.LastIndexOf("}")
    if ($start -lt 0 -or $end -le $start) {
      return $null
    }

    $candidate = $raw.Substring($start, ($end - $start + 1))
    try {
      if ($PSVersionTable.PSVersion.Major -ge 6) {
        return $candidate | ConvertFrom-Json -Depth 20
      }

      return $candidate | ConvertFrom-Json
    } catch {
      return $null
    }
  }
}

function Get-JsonFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return $null
  }

  try {
    return Get-Content $Path -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Test-NoRefMatches {
  param(
    [array]$Refs,
    [string]$Pattern
  )

  return (@($Refs | Where-Object { $_ -like $Pattern })).Count -eq 0
}

function Test-SelectivePacket {
  param(
    [object]$Packet,
    [string[]]$RequiredRefs = @(),
    [string[]]$ForbiddenExact = @(),
    [string[]]$ForbiddenPatterns = @()
  )

  if ($null -eq $Packet) {
    return $false
  }

  $allRefs = @($Packet.requiredRefs) + @($Packet.optionalRefs)
  foreach ($ref in $RequiredRefs) {
    if (@($Packet.requiredRefs) -notcontains $ref -and $allRefs -notcontains $ref) {
      return $false
    }
  }

  foreach ($ref in $ForbiddenExact) {
    if ($allRefs -contains $ref) {
      return $false
    }
  }

  foreach ($pattern in $ForbiddenPatterns) {
    if (-not (Test-NoRefMatches -Refs $allRefs -Pattern $pattern)) {
      return $false
    }
  }

  return $true
}

function Test-PacketDispatch {
  param(
    [object]$Step,
    [string]$ExpectedAgentId,
    [string[]]$RequiredRefs = @(),
    [string[]]$ForbiddenExact = @(),
    [string[]]$ForbiddenPatterns = @()
  )

  if ($null -eq $Step) {
    return [pscustomobject]@{
      Ok = $false
      Reason = "missing step result"
      Packet = $null
    }
  }

  if (-not $Step.Ok) {
    return [pscustomobject]@{
      Ok = $false
      Reason = "packet command failed"
      Packet = $null
    }
  }

  $packet = Get-StepJson -Step $Step
  if ($null -eq $packet) {
    return [pscustomobject]@{
      Ok = $false
      Reason = "packet output was not valid JSON"
      Packet = $null
    }
  }

  if ($ExpectedAgentId -and $packet.agentId -ne $ExpectedAgentId) {
    return [pscustomobject]@{
      Ok = $false
      Reason = "expected agentId '$ExpectedAgentId' but received '$($packet.agentId)'"
      Packet = $packet
    }
  }

  $allRefs = @($packet.requiredRefs) + @($packet.optionalRefs)
  $missingRefs = @()
  foreach ($ref in $RequiredRefs) {
    if (@($packet.requiredRefs) -notcontains $ref -and $allRefs -notcontains $ref) {
      $missingRefs += $ref
    }
  }
  if ($missingRefs.Count -gt 0) {
    return [pscustomobject]@{
      Ok = $false
      Reason = "missing refs: $($missingRefs -join ', ')"
      Packet = $packet
    }
  }

  $presentForbiddenExact = @()
  foreach ($ref in $ForbiddenExact) {
    if ($allRefs -contains $ref) {
      $presentForbiddenExact += $ref
    }
  }
  if ($presentForbiddenExact.Count -gt 0) {
    return [pscustomobject]@{
      Ok = $false
      Reason = "unexpected refs: $($presentForbiddenExact -join ', ')"
      Packet = $packet
    }
  }

  $presentForbiddenPatterns = @()
  foreach ($pattern in $ForbiddenPatterns) {
    $hits = @($allRefs | Where-Object { $_ -like $pattern })
    if ($hits.Count -gt 0) {
      $presentForbiddenPatterns += ($hits | ForEach-Object { "$_ (matched $pattern)" })
    }
  }
  if ($presentForbiddenPatterns.Count -gt 0) {
    return [pscustomobject]@{
      Ok = $false
      Reason = "unexpected pattern matches: $($presentForbiddenPatterns -join ', ')"
      Packet = $packet
    }
  }

  return [pscustomobject]@{
    Ok = $true
    Reason = ""
    Packet = $packet
  }
}

function New-CheckedStep {
  param(
    [object]$Step,
    [bool]$Ok,
    [string]$Reason = ""
  )

  $output = $Step.Output
  if (-not [string]::IsNullOrWhiteSpace($Reason)) {
    $output = ($Step.Output.TrimEnd(), "", "Assertion: $Reason" | Where-Object { $_ -ne $null }) -join "`n"
  }

  return [pscustomobject]@{
    Step = $Step.Step
    Ok = $Ok
    ExitCode = $Step.ExitCode
    Output = $output
    Log = $Step.Log
  }
}

function New-Checklist {
  @{
    prdDodMet = $false
    typecheckPassed = $false
    lintPassed = $false
    formatPassed = $false
    testsPassed = $false
    buildPassed = $false
    fileSizeOk = $false
    noForbiddenPatterns = $false
    atomicCommitDone = $false
    progressUpdated = $false
  }
}

function New-Task {
  param(
    [string]$Id,
    [string]$Name,
    [bool]$IsUi,
    [int]$RetryCount = 0,
    [string]$Status = "IN_PROGRESS"
  )

  @{
    id = $Id
    name = $Name
    type = "TASK"
    status = $Status
    prdRef = "PRD#F900"
    milestoneId = "M1"
    dod = @("Mock DoD")
    isUI = $IsUi
    affectedFiles = @("src/app")
    retryCount = $RetryCount
    checklist = New-Checklist
  }
}

function New-Milestone {
  param(
    [string]$Name,
    [array]$Tasks,
    [string]$Status = "IN_PROGRESS"
  )

  @{
    id = "M1"
    name = $Name
    branch = "milestone/m1-mock"
    worktreePath = "../mock-m1"
    status = $Status
    tasks = $Tasks
  }
}

foreach ($case in $Cases) {
  $caseDir = Join-Path $CasesRoot $case.Id
  if (Test-Path $caseDir) {
    throw "Case directory already exists: $caseDir"
  }
  New-Item -ItemType Directory -Path $caseDir | Out-Null

  $typeArgs = if ($case.Types.Count -gt 1) { @("--types=$($case.Types -join ',')") } else { @("--type=$($case.Types[0])") }
  $setupArgs = @(
    (Join-Path $SkillRoot "scripts\harness-setup.ts"),
    "--name=$($case.ProjectName)",
    "--displayName=$($case.Display)",
    "--concept=$($case.Concept)",
    "--problem=$($case.Problem)",
    "--goal=$($case.Goal)",
    "--aiProvider=$($case.AiProvider)",
    "--teamSize=$($case.TeamSize)",
    "--isGreenfield=$($case.IsGreenfield)",
    "--skipGithub=true"
  ) + $typeArgs

  if ($case.ContainsKey("DesignStyle")) {
    $setupArgs += "--designStyle=$($case.DesignStyle)"
  }
  if ($case.ContainsKey("DesignReference")) {
    $setupArgs += "--designReference=$($case.DesignReference)"
  }

  $setupStep = Invoke-Step -CaseId $case.Id -StepName "setup" -WorkingDir $caseDir -Exe "bun" -Arguments $setupArgs
  Add-CommandResult -CaseId $case.Id -Type ($case.Types -join ",") -StepName "setup" -Expectation "pass" -Step $setupStep

  $steps = @($setupStep)
  if ($setupStep.Ok) {
    $contractStep = Test-ScaffoldContract -CaseId $case.Id -CaseDir $caseDir -Types $case.Types
    $steps += $contractStep
    Add-CommandResult -CaseId $case.Id -Type ($case.Types -join ",") -StepName "contract" -Expectation "pass" -Step $contractStep
  }

  if (($steps | Where-Object { -not $_.Ok }).Count -eq 0) {
    foreach ($commandSpec in @(
      @{ Step = "install"; Expect = "pass"; Exe = "bun"; Args = @("install") },
      @{ Step = "hooks-install"; Expect = "pass"; Exe = "bun"; Args = @("run", "harness:hooks:install") },
      @{ Step = "env"; Expect = "pass"; Exe = "bun"; Args = @("harness:env") },
      @{ Step = "init-base"; Expect = "pass"; Exe = "bun"; Args = @(".harness/init.ts") },
      @{ Step = "init-from-prd"; Expect = "expected-fail"; Exe = "bun"; Args = @(".harness/init.ts", "--from-prd"); ExpectFailure = $true },
      @{ Step = "deps"; Expect = "pass"; Exe = "bun"; Args = @("run", "check:deps") },
      @{ Step = "typecheck"; Expect = "pass"; Exe = "bun"; Args = @("run", "typecheck") },
      @{ Step = "lint"; Expect = "pass"; Exe = "bun"; Args = @("run", "lint") },
      @{ Step = "test"; Expect = "pass"; Exe = "bun"; Args = @("test") },
      @{ Step = "build"; Expect = "pass"; Exe = "bun"; Args = @("run", "build") },
      @{ Step = "guardian"; Expect = "pass"; Exe = "bun"; Args = @("harness:validate", "--guardian") },
      @{ Step = "validate-executing"; Expect = "expected-fail"; Exe = "bun"; Args = @("harness:validate", "--phase", "EXECUTING"); ExpectFailure = $true },
      @{ Step = "validate-task"; Expect = "expected-fail"; Exe = "bun"; Args = @("harness:validate", "--task", "T001"); ExpectFailure = $true },
      @{ Step = "validate-milestone"; Expect = "expected-fail"; Exe = "bun"; Args = @("harness:validate", "--milestone", "M1"); ExpectFailure = $true },
      @{ Step = "validate-full"; Expect = "expected-fail"; Exe = "bun"; Args = @("harness:validate"); ExpectFailure = $true },
      @{ Step = "orch-status"; Expect = "pass"; Exe = "bun"; Args = @(".harness/orchestrator.ts", "--status") },
      @{ Step = "orch-next"; Expect = "pass"; Exe = "bun"; Args = @(".harness/orchestrator.ts", "--next") },
      @{ Step = "orch-launch-json"; Expect = "pass"; Exe = "bun"; Args = @(".harness/orchestrate.ts", "--json") },
      @{ Step = "orch-default"; Expect = "pass"; Exe = "bun"; Args = @(".harness/orchestrator.ts") }
      )) {
      $step = Invoke-Step -CaseId $case.Id -StepName $commandSpec.Step -WorkingDir $caseDir -Exe $commandSpec.Exe -Arguments $commandSpec.Args -ExpectFailure:([bool]$commandSpec.ExpectFailure)
      if ($commandSpec.Step -eq "orch-launch-json") {
        $launchJson = Get-StepJson -Step $step
        $launchCycle = if ($launchJson) { $launchJson.cycle } else { $null }
        $step.Ok = $step.Ok `
          -and ($null -ne $launchCycle) `
          -and ($launchCycle.protocolVersion -eq "1.0") `
          -and (@($launchCycle.launches).Count -ge 1)
      }
      if ($commandSpec.Step -eq "orch-default") {
        $step.Ok = $step.Ok -and
          $step.Output.Contains("Harness Orchestrator") -and
          $step.Output.Contains("Agent: PRD Architect Agent") -and
          $step.Output.Contains("Validation Gate: bun harness:validate --phase SCAFFOLD")
      }
      $steps += $step
      Add-CommandResult -CaseId $case.Id -Type ($case.Types -join ",") -StepName $commandSpec.Step -Expectation $commandSpec.Expect -Step $step
    }
  }

  $smokePassed = ($steps | Where-Object { -not $_.Ok }).Count -eq 0
  $nextOutput = ($steps | Where-Object { $_.Step -eq "orch-next" } | Select-Object -First 1).Output
  $SmokeResults.Add([pscustomobject]@{
    CaseId = $case.Id
    Type = ($case.Types -join ",")
    SmokePassed = $smokePassed
    NextAction = $nextOutput
    Notes = if ($smokePassed) { "Fresh matrix passed" } else { "See logs" }
  }) | Out-Null
}

$CliDir = Join-Path $CasesRoot "03-cli"
$WebDir = Join-Path $CasesRoot "01-web-app"
$IosDir = Join-Path $CasesRoot "02-ios-app"
$AgentDir = Join-Path $CasesRoot "04-agent"
$MonorepoDir = Join-Path $CasesRoot "06-monorepo"
$ComboDir = Join-Path $CasesRoot "07-combo"
$CliSmoke = $SmokeResults | Where-Object { $_.CaseId -eq "03-cli" } | Select-Object -First 1
$WebSmoke = $SmokeResults | Where-Object { $_.CaseId -eq "01-web-app" } | Select-Object -First 1
$IosSmoke = $SmokeResults | Where-Object { $_.CaseId -eq "02-ios-app" } | Select-Object -First 1
$AgentSmoke = $SmokeResults | Where-Object { $_.CaseId -eq "04-agent" } | Select-Object -First 1
$MonorepoSmoke = $SmokeResults | Where-Object { $_.CaseId -eq "06-monorepo" } | Select-Object -First 1
$ComboSmoke = $SmokeResults | Where-Object { $_.CaseId -eq "07-combo" } | Select-Object -First 1

if ((Test-Path $CliDir) -and $CliSmoke -and $CliSmoke.SmokePassed) {
  $nonUiMilestone = New-Milestone -Name "CLI Flow" -Tasks @((New-Task -Id "T701" -Name "CLI Task" -IsUi $false))
  $retryMilestone = New-Milestone -Name "CLI Flow" -Tasks @((New-Task -Id "T702" -Name "Retry CLI Task" -IsUi $false -RetryCount 3))
  $doneMilestone = New-Milestone -Name "Done Flow" -Tasks @((New-Task -Id "T703" -Name "Done CLI Task" -IsUi $false -Status "DONE")) -Status "COMPLETE"

  foreach ($phaseCase in @(
    @{ Name = "discovery"; Expected = "Discovery outputs are ready."; ExpectFailure = $true; Patch = @{ phase = "DISCOVERY"; projectInfo = @{ name = "detailed-cli"; displayName = "Detailed CLI"; concept = "Mock concept"; problem = "Mock problem"; goal = "Mock goal"; types = @("cli"); aiProvider = "none"; teamSize = "solo"; isGreenfield = $true } } },
    @{ Name = "market-research"; Expected = "Market Research outputs are ready."; ExpectFailure = $true; Patch = @{ phase = "MARKET_RESEARCH"; marketResearch = @{ summary = "Mock summary"; competitors = @("Comp A"); techTrends = @("Trend") } } },
    @{ Name = "tech-stack"; Expected = "tech-stack-advisor"; Patch = @{ phase = "TECH_STACK"; marketResearch = @{ summary = "Mock summary"; competitors = @("Comp A"); techTrends = @("Trend") }; techStack = @{ confirmed = $false; decisions = @(@{ layer = "runtime"; choice = "Bun"; rejectedOptions = @("npm"); reason = "Fast loop"; adrFile = "docs/adr/ADR-001-initial-tech-stack.md"; confirmedAt = "2026-03-13T00:00:00.000Z" }) } } },
    @{ Name = "prd-arch"; Expected = "prd-architect"; Patch = @{ phase = "PRD_ARCH"; techStack = @{ confirmed = $true; decisions = @(@{ layer = "runtime"; choice = "Bun"; rejectedOptions = @("npm"); reason = "Fast loop"; adrFile = "docs/adr/ADR-001-initial-tech-stack.md"; confirmedAt = "2026-03-13T00:00:00.000Z" }) } } },
    @{ Name = "scaffold"; Expected = "prd-architect"; Patch = @{ phase = "SCAFFOLD" } },
    @{ Name = "executing"; Expected = "execution-engine"; Patch = @{ phase = "EXECUTING"; execution = @{ currentMilestone = "M1"; currentTask = "T701"; currentWorktree = "../mock-m1"; milestones = @($nonUiMilestone); allMilestonesComplete = $false } } },
    @{ Name = "executing-retry"; Expected = "Recovery steps:"; ExpectFailure = $true; Patch = @{ phase = "EXECUTING"; execution = @{ currentMilestone = "M1"; currentTask = "T702"; currentWorktree = "../mock-m1"; milestones = @($retryMilestone); allMilestonesComplete = $false } } },
    @{ Name = "validating"; Expected = "harness-validator"; Patch = @{ phase = "VALIDATING"; execution = @{ currentMilestone = "M1"; currentTask = "T703"; currentWorktree = "../mock-m1"; milestones = @($doneMilestone); allMilestonesComplete = $true } } },
    @{ Name = "complete"; Expected = "context-compactor"; Patch = @{ phase = "COMPLETE"; docs = @{ readme = @{ isFinal = $true } }; techStack = @{ confirmed = $true } } }
  )) {
    $patchStep = Invoke-StatePatch -CaseId "03-cli" -CaseDir $CliDir -StepName ("patch-{0}" -f $phaseCase.Name) -Patch $phaseCase.Patch
    Add-DeepResult -CaseId "03-cli" -Scenario ("patch {0}" -f $phaseCase.Name) -Expected "patch ok" -Step $patchStep
    $nextStep = Invoke-Step -CaseId "03-cli" -StepName ("deep-{0}" -f $phaseCase.Name) -WorkingDir $CliDir -Exe "bun" -Arguments @(".harness/orchestrator.ts", "--next") -ExpectFailure:([bool]$phaseCase.ExpectFailure)
    $nextStep.Ok = $nextStep.Ok -and $nextStep.Output.Contains($phaseCase.Expected)
    Add-DeepResult -CaseId "03-cli" -Scenario $phaseCase.Name -Expected $phaseCase.Expected -Step $nextStep
  }

  $cliPacketPatch = Invoke-StatePatch -CaseId "03-cli" -CaseDir $CliDir -StepName "patch-cli-packet" -Patch @{
    phase = "EXECUTING"
    execution = @{
      currentMilestone = "M1"
      currentTask = "T701"
      currentWorktree = "../mock-m1"
      milestones = @($nonUiMilestone)
      allMilestonesComplete = $false
    }
  }
  Add-DeepResult -CaseId "03-cli" -Scenario "patch cli packet" -Expected "patch ok" -Step $cliPacketPatch

  $cliPacketStep = Invoke-Step -CaseId "03-cli" -StepName "packet-cli-execution" -WorkingDir $CliDir -Exe "bun" -Arguments @(".harness/orchestrator.ts", "--packet-json")
  $cliPacketCheckResult = Test-PacketDispatch -Step $cliPacketStep -ExpectedAgentId "execution-engine" -RequiredRefs @(
    "agents/execution-engine.md",
    "agents/execution-engine/01-preflight.md",
    "agents/execution-engine/02-task-loop.md",
    ".harness/state.json"
  ) -ForbiddenExact @("docs/progress/", "AGENTS.md", "CLAUDE.md") -ForbiddenPatterns @(
    "docs/design/*",
    "docs/public/*",
    "docs/gitbook/*",
    "docs/adr/*"
  )
  $cliPacketCheck = New-CheckedStep -Step $cliPacketStep -Ok ([bool]$cliPacketCheckResult.Ok) -Reason $cliPacketCheckResult.Reason
  Add-DeepResult -CaseId "03-cli" -Scenario "cli packet stays selective" -Expected "execution packet excludes unrelated docs" -Step $cliPacketCheck

  $launcherMilestone = New-Milestone -Name "Parallel Launcher Flow" -Tasks @((New-Task -Id "T704" -Name "Parallel CLI Task" -IsUi $false -Status "PENDING")) -Status "PENDING"
  $launcherPatch = Invoke-StatePatch -CaseId "03-cli" -CaseDir $CliDir -StepName "patch-launcher-cycle" -Patch @{
    phase = "EXECUTING"
    projectInfo = @{
      concurrency = @{
        maxParallelTasks = 2
        maxParallelMilestones = 1
        enableInterMilestone = $false
      }
    }
    execution = @{
      currentMilestone = ""
      currentTask = ""
      currentWorktree = ""
      milestones = @($launcherMilestone)
      activeAgents = @()
      allMilestonesComplete = $false
    }
  }
  Add-DeepResult -CaseId "03-cli" -Scenario "patch launcher cycle" -Expected "patch ok" -Step $launcherPatch

  $launchPrepareStep = Invoke-Step -CaseId "03-cli" -StepName "launcher-prepare" -WorkingDir $CliDir -Exe "bun" -Arguments @(".harness/orchestrate.ts", "--parallel", "--json")
  $launchPrepareOutput = [string]$launchPrepareStep.Output
  $launchIdMatch = [regex]::Match($launchPrepareOutput, '"launchId"\s*:\s*"([^"]+)"')
  $latestLaunchPath = Join-Path $CliDir ".harness\launches\latest.json"
  $launchId = if ($launchIdMatch.Success) { $launchIdMatch.Groups[1].Value } else { "" }
  $launcherPrepareState = Get-JsonFile -Path (Join-Path $CliDir ".harness\state.json")
  $launchPrepareStep.Ok = $launchPrepareStep.Ok `
    -and $launchPrepareOutput.Contains('"mode": "parallel"') `
    -and $launchPrepareOutput.Contains('"kind": "task-agent"') `
    -and $launchPrepareOutput.Contains('"status": "reserved"') `
    -and (-not [string]::IsNullOrWhiteSpace($launchId)) `
    -and (Test-Path $latestLaunchPath) `
    -and $launchPrepareOutput.Contains($launchId) `
    -and ($null -ne $launcherPrepareState) `
    -and (@($launcherPrepareState.execution.activeAgents).Count -eq 1) `
    -and (@($launcherPrepareState.execution.activeAgents)[0].launchId -eq $launchId)
  Add-DeepResult -CaseId "03-cli" -Scenario "launcher prepare cycle" -Expected "reserve launch cycle and persist latest.json" -Step $launchPrepareStep

  $confirmHandle = "smoke-handle-T704"
  $launchConfirmStep = Invoke-Step -CaseId "03-cli" -StepName "launcher-confirm" -WorkingDir $CliDir -Exe "powershell" -Arguments @(
    "-NoProfile",
    "-Command",
    "& bun .harness/orchestrate.ts --confirm '$launchId' --handle '$confirmHandle' --json"
  )
  $launchConfirmJson = Get-StepJson -Step $launchConfirmStep
  $launcherConfirmState = Get-JsonFile -Path (Join-Path $CliDir ".harness\state.json")
  $launchConfirmStep.Ok = $launchConfirmStep.Ok `
    -and ($null -ne $launchConfirmJson) `
    -and ($launchConfirmJson.launch.status -eq "running") `
    -and ($null -ne $launcherConfirmState) `
    -and (@($launcherConfirmState.execution.activeAgents).Count -eq 1) `
    -and (@($launcherConfirmState.execution.activeAgents)[0].runtimeHandle -eq $confirmHandle) `
    -and (@($launcherConfirmState.execution.activeAgents)[0].status -eq "running") `
    -and ($launcherConfirmState.execution.currentTask -eq "T704") `
    -and (@(@($launcherConfirmState.execution.milestones)[0].tasks)[0].status -eq "IN_PROGRESS")
  Add-DeepResult -CaseId "03-cli" -Scenario "launcher confirm cycle" -Expected "confirm handle and move reservation to running" -Step $launchConfirmStep

  $launchReleaseStep = Invoke-Step -CaseId "03-cli" -StepName "launcher-release" -WorkingDir $CliDir -Exe "powershell" -Arguments @(
    "-NoProfile",
    "-Command",
    "& bun .harness/orchestrate.ts --release '$launchId' --json"
  )
  $launchReleaseJson = Get-StepJson -Step $launchReleaseStep
  $launcherReleaseState = Get-JsonFile -Path (Join-Path $CliDir ".harness\state.json")
  $latestReleasedJson = Get-JsonFile -Path $latestLaunchPath
  $launchReleaseStep.Ok = $launchReleaseStep.Ok `
    -and ($null -ne $launchReleaseJson) `
    -and ($launchReleaseJson.launch.status -eq "released") `
    -and ($null -ne $launcherReleaseState) `
    -and (@($launcherReleaseState.execution.activeAgents).Count -eq 0) `
    -and ($null -ne $latestReleasedJson) `
    -and (@($latestReleasedJson.launches)[0].status -eq "released")
  Add-DeepResult -CaseId "03-cli" -Scenario "launcher release cycle" -Expected "release reservation and persist released status" -Step $launchReleaseStep

  $launcherCleanupPatch = Invoke-StatePatch -CaseId "03-cli" -CaseDir $CliDir -StepName "patch-launcher-cleanup" -Patch @{
    execution = @{
      activeAgents = @()
      currentMilestone = ""
      currentTask = ""
      currentWorktree = ""
    }
  }
  Add-DeepResult -CaseId "03-cli" -Scenario "patch launcher cleanup" -Expected "patch ok" -Step $launcherCleanupPatch

  $validatorPacketPatch = Invoke-StatePatch -CaseId "03-cli" -CaseDir $CliDir -StepName "patch-validator-packet" -Patch @{
    phase = "VALIDATING"
    execution = @{
      currentMilestone = "M1"
      currentTask = "T703"
      currentWorktree = "../mock-m1"
      milestones = @($doneMilestone)
      allMilestonesComplete = $true
    }
  }
  Add-DeepResult -CaseId "03-cli" -Scenario "patch validator packet" -Expected "patch ok" -Step $validatorPacketPatch

  $validatorPacketStep = Invoke-Step -CaseId "03-cli" -StepName "packet-validator" -WorkingDir $CliDir -Exe "bun" -Arguments @(".harness/orchestrator.ts", "--packet-json")
  $validatorPacketCheckResult = Test-PacketDispatch -Step $validatorPacketStep -ExpectedAgentId "harness-validator" -RequiredRefs @("docs/PROGRESS.md") -ForbiddenExact @("docs/progress/") -ForbiddenPatterns @(
    "docs/public/*",
    "docs/gitbook/*",
    "docs/adr/*"
  )
  $validatorPacketCheck = New-CheckedStep -Step $validatorPacketStep -Ok ([bool]$validatorPacketCheckResult.Ok) -Reason $validatorPacketCheckResult.Reason
  Add-DeepResult -CaseId "03-cli" -Scenario "validator packet stays selective" -Expected "validator packet uses progress index only" -Step $validatorPacketCheck

  $completePacketPatch = Invoke-StatePatch -CaseId "03-cli" -CaseDir $CliDir -StepName "patch-complete-packet" -Patch @{
    phase = "COMPLETE"
    docs = @{ readme = @{ isFinal = $true } }
    techStack = @{ confirmed = $true }
  }
  Add-DeepResult -CaseId "03-cli" -Scenario "patch complete packet" -Expected "patch ok" -Step $completePacketPatch

  $completePacketStep = Invoke-Step -CaseId "03-cli" -StepName "packet-complete" -WorkingDir $CliDir -Exe "bun" -Arguments @(".harness/orchestrator.ts", "--packet-json")
  $completePacketCheckResult = Test-PacketDispatch -Step $completePacketStep -ExpectedAgentId "context-compactor" -RequiredRefs @("docs/PROGRESS.md") -ForbiddenExact @("docs/progress/") -ForbiddenPatterns @("docs/public/*")
  $completePacketCheck = New-CheckedStep -Step $completePacketStep -Ok ([bool]$completePacketCheckResult.Ok) -Reason $completePacketCheckResult.Reason
  Add-DeepResult -CaseId "03-cli" -Scenario "context compactor packet stays selective" -Expected "complete packet avoids directory scans" -Step $completePacketCheck

  foreach ($advanceCase in @(
    @{ Name = "advance-discovery"; Expected = "MARKET_RESEARCH"; NextAgent = "Market Research outputs are ready."; NextExpectFailure = $true; Patch = @{ phase = "DISCOVERY"; projectInfo = @{ name = "detailed-cli"; displayName = "Detailed CLI"; concept = "Mock concept"; problem = "Mock problem"; goal = "Mock goal"; types = @("cli"); aiProvider = "none"; teamSize = "solo"; isGreenfield = $true } } },
    @{ Name = "advance-market-research"; Expected = "TECH_STACK"; NextAgent = "Tech Stack outputs are ready."; NextExpectFailure = $true; Patch = @{ phase = "MARKET_RESEARCH"; projectInfo = @{ name = "detailed-cli"; displayName = "Detailed CLI"; concept = "Mock concept"; problem = "Mock problem"; goal = "Mock goal"; types = @("cli"); aiProvider = "none"; teamSize = "solo"; isGreenfield = $true }; marketResearch = @{ summary = "Mock summary"; competitors = @("Comp A"); techTrends = @("Trend") } } },
    @{ Name = "advance-tech-stack"; Expected = "PRD_ARCH"; NextAgent = "prd-architect"; Patch = @{ phase = "TECH_STACK"; projectInfo = @{ name = "detailed-cli"; displayName = "Detailed CLI"; concept = "Mock concept"; problem = "Mock problem"; goal = "Mock goal"; types = @("cli"); aiProvider = "none"; teamSize = "solo"; isGreenfield = $true }; marketResearch = @{ summary = "Mock summary"; competitors = @("Comp A"); techTrends = @("Trend") }; techStack = @{ confirmed = $true; decisions = @(@{ layer = "runtime"; choice = "Bun"; rejectedOptions = @("npm"); reason = "Fast loop"; adrFile = "docs/adr/ADR-001-initial-tech-stack.md"; confirmedAt = "2026-03-13T00:00:00.000Z" }) } } },
    @{ Name = "advance-prd-arch"; Expected = "stock scaffold feature"; NextAgent = "prd-architect"; ExpectFailure = $true; Patch = @{ phase = "PRD_ARCH"; techStack = @{ confirmed = $true; decisions = @(@{ layer = "runtime"; choice = "Bun"; rejectedOptions = @("npm"); reason = "Fast loop"; adrFile = "docs/adr/ADR-001-initial-tech-stack.md"; confirmedAt = "2026-03-13T00:00:00.000Z" }) } } },
    @{ Name = "advance-scaffold"; Expected = "stock scaffold feature"; NextAgent = "prd-architect"; ExpectFailure = $true; Patch = @{ phase = "SCAFFOLD" } },
    @{ Name = "advance-validating"; Expected = "git worktree list only shows main / master"; NextAgent = "harness-validator"; ExpectFailure = $true; Patch = @{ phase = "VALIDATING"; execution = @{ currentMilestone = "M1"; currentTask = ""; currentWorktree = ""; milestones = @($doneMilestone); allMilestonesComplete = $true }; docs = @{ readme = @{ isFinal = $true } }; techStack = @{ confirmed = $true } } }
  )) {
    $patchStep = Invoke-StatePatch -CaseId "03-cli" -CaseDir $CliDir -StepName ("patch-{0}" -f $advanceCase.Name) -Patch $advanceCase.Patch
    Add-DeepResult -CaseId "03-cli" -Scenario ("patch {0}" -f $advanceCase.Name) -Expected "patch ok" -Step $patchStep

    $advanceStep = Invoke-Step -CaseId "03-cli" -StepName $advanceCase.Name -WorkingDir $CliDir -Exe "bun" -Arguments @("run", "harness:advance") -ExpectFailure:([bool]$advanceCase.ExpectFailure)
    if ($advanceCase.ExpectFailure) {
      $advanceStep.Ok = $advanceStep.Ok -and $advanceStep.Output.Contains($advanceCase.Expected)
    } else {
      $advanceStep.Ok = $advanceStep.Ok -and $advanceStep.Output.Contains("phase advanced:") -and $advanceStep.Output.Contains($advanceCase.Expected)
    }
    Add-DeepResult -CaseId "03-cli" -Scenario $advanceCase.Name -Expected $advanceCase.Expected -Step $advanceStep

    $nextStep = Invoke-Step -CaseId "03-cli" -StepName ("post-{0}" -f $advanceCase.Name) -WorkingDir $CliDir -Exe "bun" -Arguments @(".harness/orchestrator.ts", "--next") -ExpectFailure:([bool]$advanceCase.NextExpectFailure)
    $nextStep.Ok = $nextStep.Ok -and $nextStep.Output.Contains($advanceCase.NextAgent)
    Add-DeepResult -CaseId "03-cli" -Scenario ("post {0}" -f $advanceCase.Name) -Expected $advanceCase.NextAgent -Step $nextStep
  }

  $resetBacklogStep = Invoke-Step -CaseId "03-cli" -StepName "happy-reset-backlog" -WorkingDir $CliDir -Exe "bun" -Arguments @(".harness/init.ts", "--from-prd") -ExpectFailure
  $resetBacklogStep.Ok = $resetBacklogStep.Ok -and $resetBacklogStep.Output.Contains("stock scaffold feature")
  Add-DeepResult -CaseId "03-cli" -Scenario "happy path reset backlog is blocked until PRD is real" -Expected "stock scaffold feature" -Step $resetBacklogStep

  Get-ChildItem -Path (Join-Path $CliDir "docs\prd") -Filter *.md -ErrorAction SilentlyContinue | Remove-Item -Force
  Get-ChildItem -Path (Join-Path $CliDir "docs\architecture") -Filter *.md -ErrorAction SilentlyContinue | Remove-Item -Force

  Set-Content -Path (Join-Path $CliDir "docs\PRD.md") -Value @'
> **Version**: v1.1

## Product Stage V1: Initial Delivery [ACTIVE]

### Milestone 1: Foundation

#### F001: Ship CLI foundation
- [ ] Complete the CLI foundation path
'@

  Set-Content -Path (Join-Path $CliDir "docs\ARCHITECTURE.md") -Value @'
> **Version**: v1.1

## System Overview

CLI-first Harness execution baseline.

## Dependency Direction

types -> config -> lib -> services -> app
'@

  $realBacklogStep = Invoke-Step -CaseId "03-cli" -StepName "happy-reset-backlog-real" -WorkingDir $CliDir -Exe "bun" -Arguments @(".harness/init.ts", "--from-prd")
  $realBacklogState = Get-JsonFile -Path (Join-Path $CliDir ".harness\state.json")
  $realBacklogStep.Ok = $realBacklogStep.Ok `
    -and ($null -ne $realBacklogState) `
    -and ($realBacklogState.execution.currentMilestone -eq "M1") `
    -and ($realBacklogState.execution.currentTask -eq "T001")
  Add-DeepResult -CaseId "03-cli" -Scenario "happy path reset backlog after real planning docs" -Expected "T001 materialized from real PRD" -Step $realBacklogStep

  $happyBacklogReady = $realBacklogStep.Ok

  if ($happyBacklogReady) {
    $gitInitStep = Invoke-Step -CaseId "03-cli" -StepName "happy-git-init" -WorkingDir $CliDir -Exe "git" -Arguments @("init", "-b", "main")
    Add-DeepResult -CaseId "03-cli" -Scenario "happy path git init" -Expected "nested git repo ready" -Step $gitInitStep

    [void](Invoke-Step -CaseId "03-cli" -StepName "happy-git-encoding-commit" -WorkingDir $CliDir -Exe "git" -Arguments @("config", "i18n.commitEncoding", "utf-8"))
    [void](Invoke-Step -CaseId "03-cli" -StepName "happy-git-encoding-log" -WorkingDir $CliDir -Exe "git" -Arguments @("config", "i18n.logOutputEncoding", "utf-8"))
    $gitUserName = Invoke-Step -CaseId "03-cli" -StepName "happy-git-user" -WorkingDir $CliDir -Exe "git" -Arguments @("config", "user.name", "Harness Test")
    Add-DeepResult -CaseId "03-cli" -Scenario "happy path git user" -Expected "git config ok" -Step $gitUserName

    $gitUserEmail = Invoke-Step -CaseId "03-cli" -StepName "happy-git-email" -WorkingDir $CliDir -Exe "git" -Arguments @("config", "user.email", "harness@example.com")
    Add-DeepResult -CaseId "03-cli" -Scenario "happy path git email" -Expected "git config ok" -Step $gitUserEmail

    $gitBootstrapAdd = Invoke-Step -CaseId "03-cli" -StepName "happy-bootstrap-add" -WorkingDir $CliDir -Exe "git" -Arguments @("add", ".")
    Add-DeepResult -CaseId "03-cli" -Scenario "happy path bootstrap add" -Expected "git add ok" -Step $gitBootstrapAdd

    $gitBootstrapCommit = Invoke-Step -CaseId "03-cli" -StepName "happy-bootstrap-commit" -WorkingDir $CliDir -Exe "powershell" -Arguments @(
      "-NoProfile",
      "-Command",
      "git commit -m 'chore: bootstrap'"
    )
    Add-DeepResult -CaseId "03-cli" -Scenario "happy path bootstrap commit" -Expected "bootstrap commit" -Step $gitBootstrapCommit

    $branchStep = Invoke-Step -CaseId "03-cli" -StepName "happy-branch" -WorkingDir $CliDir -Exe "git" -Arguments @("checkout", "-b", "milestone/m1-foundation")
    Add-DeepResult -CaseId "03-cli" -Scenario "happy path branch" -Expected "milestone branch" -Step $branchStep

    if ($branchStep.Ok) {
      Add-Content -Path (Join-Path $CliDir "docs\prd\01-overview.md") -Value "`n- Happy path branch commit."
    }

    $gitTaskAdd = Invoke-Step -CaseId "03-cli" -StepName "happy-task-add" -WorkingDir $CliDir -Exe "git" -Arguments @("add", ".")
    Add-DeepResult -CaseId "03-cli" -Scenario "happy path task add" -Expected "git add ok" -Step $gitTaskAdd

    $happyCommitMessagePath = Join-Path $CliDir "happy-commit-message.txt"
    [System.IO.File]::WriteAllText(
      $happyCommitMessagePath,
      "feat: complete T001 PRD#F001`n`nCode Review: ✅`n",
      (New-Object System.Text.UTF8Encoding($false))
    )
    $gitCommitStep = Invoke-Step -CaseId "03-cli" -StepName "happy-commit" -WorkingDir $CliDir -Exe "git" -Arguments @("commit", "-F", $happyCommitMessagePath)
    Remove-Item $happyCommitMessagePath -ErrorAction SilentlyContinue
    Add-DeepResult -CaseId "03-cli" -Scenario "happy path git commit" -Expected "task commit" -Step $gitCommitStep

    if ($gitCommitStep.Ok) {
      $headCommit = Get-HeadCommit -WorkingDir $CliDir
      [void](Invoke-Step -CaseId "03-cli" -StepName "happy-prevalidate-task" -WorkingDir $CliDir -Exe "bun" -Arguments @("harness:validate", "--task", "T001") -ExpectFailure)
      $completeTaskStep = Invoke-Step -CaseId "03-cli" -StepName "happy-complete-task" -WorkingDir $CliDir -Exe "bun" -Arguments @(".harness/init.ts", "--complete-task", "T001", "--commit", $headCommit)
      $snapshotPath = Join-Path $CliDir "docs\progress\CONTEXT_SNAPSHOT.md"
      $completeTaskStep.Ok = $completeTaskStep.Ok `
        -and (Test-Path $snapshotPath) `
        -and ([string](Get-Content $snapshotPath -Raw)).Contains("> Mode: task")
      Add-DeepResult -CaseId "03-cli" -Scenario "happy path completeTask()" -Expected "Task T001 marked DONE" -Step $completeTaskStep

      $validateTaskPass = Invoke-Step -CaseId "03-cli" -StepName "happy-validate-task" -WorkingDir $CliDir -Exe "bun" -Arguments @("harness:validate", "--task", "T001")
      Add-DeepResult -CaseId "03-cli" -Scenario "happy path validate task" -Expected "validate task pass" -Step $validateTaskPass

      $validateMilestonePass = Invoke-Step -CaseId "03-cli" -StepName "happy-validate-milestone" -WorkingDir $CliDir -Exe "bun" -Arguments @("harness:validate", "--milestone", "M1")
      Add-DeepResult -CaseId "03-cli" -Scenario "happy path validate milestone" -Expected "validate milestone pass" -Step $validateMilestonePass

      $stashStep = Invoke-Step -CaseId "03-cli" -StepName "happy-stash" -WorkingDir $CliDir -Exe "git" -Arguments @("stash", "push", "-u", "-m", "harness-happy")
      Add-DeepResult -CaseId "03-cli" -Scenario "happy path stash" -Expected "stash working tree" -Step $stashStep

      $returnMainStep = Invoke-Step -CaseId "03-cli" -StepName "happy-return-main" -WorkingDir $CliDir -Exe "git" -Arguments @("checkout", "main")
      Add-DeepResult -CaseId "03-cli" -Scenario "happy path return main" -Expected "return to main" -Step $returnMainStep

      if ($returnMainStep.Ok) {
        $finalReadyPatch = Invoke-StatePatch -CaseId "03-cli" -CaseDir $CliDir -StepName "patch-happy-final-ready" -Patch @{
          phase = "VALIDATING"
          execution = @{
            currentMilestone = ""
            currentTask = ""
            currentWorktree = ""
            milestones = @(@{
              id = "M1"
              name = "Foundation"
              branch = "milestone/m1-foundation"
              worktreePath = "../detailed-cli-m1"
              status = "COMPLETE"
              tasks = @(@{
                id = "T001"
                name = "Harness 基礎骨架"
                type = "TASK"
                status = "DONE"
                prdRef = "PRD#F001"
                milestoneId = "M1"
                dod = @("完成基礎專案初始化")
                isUI = $false
                affectedFiles = @("src/types", "src/config", "src/lib", "src/services", "tests")
                retryCount = 0
                commitHash = $headCommit
              })
            })
            allMilestonesComplete = $true
          }
          docs = @{ readme = @{ isFinal = $true } }
          techStack = @{ confirmed = $true }
        }
        Add-DeepResult -CaseId "03-cli" -Scenario "patch happy final ready" -Expected "patch ok" -Step $finalReadyPatch

        $advanceCompleteStep = Invoke-Step -CaseId "03-cli" -StepName "happy-advance-complete" -WorkingDir $CliDir -Exe "bun" -Arguments @("run", "harness:advance")
        $advanceCompleteStep.Ok = $advanceCompleteStep.Ok -and $advanceCompleteStep.Output.Contains("COMPLETE")
        Add-DeepResult -CaseId "03-cli" -Scenario "happy path advance complete" -Expected "COMPLETE" -Step $advanceCompleteStep

        $validateCompletePass = Invoke-Step -CaseId "03-cli" -StepName "happy-validate-complete" -WorkingDir $CliDir -Exe "bun" -Arguments @("harness:validate", "--phase", "COMPLETE")
        Add-DeepResult -CaseId "03-cli" -Scenario "happy path validate complete" -Expected "validate complete pass" -Step $validateCompletePass

        $autoflowCompletePass = Invoke-Step -CaseId "03-cli" -StepName "happy-autoflow-complete" -WorkingDir $CliDir -Exe "bun" -Arguments @("run", "harness:autoflow")
        $autoflowCompletePass.Ok = $autoflowCompletePass.Ok `
          -and (Test-Path $snapshotPath) `
          -and ([string](Get-Content $snapshotPath -Raw)).Contains("> Mode: task")
        Add-DeepResult -CaseId "03-cli" -Scenario "happy path autoflow complete compact" -Expected "complete autoflow writes final compact snapshot" -Step $autoflowCompletePass

        $compactStatusPass = Invoke-Step -CaseId "03-cli" -StepName "happy-compact-status" -WorkingDir $CliDir -Exe "bun" -Arguments @("run", "harness:compact:status")
        Add-DeepResult -CaseId "03-cli" -Scenario "happy path compact status" -Expected "compact status pass" -Step $compactStatusPass

        $scopeChangePayloadPath = Join-Path $CliDir "scope-change-request.json"
        $scopeChangePayload = @{
          description = "Post-release remediation"
          source = "user-request"
          priority = "urgent"
          targetMilestoneId = "M1"
          proposedTasks = @(
            @{
              name = "Patch post-release regression"
              dod = @("Close the regression", "Update the remediation note")
              isUI = $false
              affectedFiles = @("src/lib", "tests/unit")
              dependsOn = @("T001")
            }
          )
        } | ConvertTo-Json -Depth 10 -Compress
        [System.IO.File]::WriteAllText(
          $scopeChangePayloadPath,
          $scopeChangePayload,
          (New-Object System.Text.UTF8Encoding($false))
        )

        $scopeQueueStep = Invoke-Step -CaseId "03-cli" -StepName "happy-scope-queue" -WorkingDir $CliDir -Exe "cmd" -Arguments @(
          "/c",
          "type `"$scopeChangePayloadPath`" | bun .harness/scope-change.ts --from-stdin"
        )
        $queuedState = Get-JsonFile -Path (Join-Path $CliDir ".harness\state.json")
        $scopeQueueStep.Ok = $scopeQueueStep.Ok `
          -and $scopeQueueStep.Output.Contains("Scope change queued") `
          -and ($null -ne $queuedState) `
          -and (@($queuedState.execution.pendingScopeChanges).Count -eq 1)
        Add-DeepResult -CaseId "03-cli" -Scenario "happy path scope change queue" -Expected "pending scope change is recorded" -Step $scopeQueueStep

        $scopePreviewStep = Invoke-Step -CaseId "03-cli" -StepName "happy-scope-preview" -WorkingDir $CliDir -Exe "bun" -Arguments @("run", "harness:scope-change", "--preview")
        $scopePreviewStep.Ok = $scopePreviewStep.Ok `
          -and $scopePreviewStep.Output.Contains("New Milestone: M2") `
          -and $scopePreviewStep.Output.Contains("T002: Patch post-release regression")
        Add-DeepResult -CaseId "03-cli" -Scenario "happy path scope change preview" -Expected "preview shows new milestone and task" -Step $scopePreviewStep

        $scopeApplyStep = Invoke-Step -CaseId "03-cli" -StepName "happy-scope-apply" -WorkingDir $CliDir -Exe "bun" -Arguments @("run", "harness:scope-change", "--apply")
        $scopeAppliedState = Get-JsonFile -Path (Join-Path $CliDir ".harness\state.json")
        $progressPath = Join-Path $CliDir "docs\PROGRESS.md"
        $progressContent = if (Test-Path $progressPath) { [string](Get-Content $progressPath -Raw) } else { "" }
        $scopeApplyStep.Ok = $scopeApplyStep.Ok `
          -and $scopeApplyStep.Output.Contains("+1 milestone(s), +1 task(s)") `
          -and ($null -ne $scopeAppliedState) `
          -and ($scopeAppliedState.phase -eq "EXECUTING") `
          -and ($scopeAppliedState.execution.currentMilestone -eq "M2") `
          -and ($scopeAppliedState.execution.currentTask -eq "T002") `
          -and (@($scopeAppliedState.execution.pendingScopeChanges).Count -eq 0) `
          -and $progressContent.Contains("M2") `
          -and $progressContent.Contains("T002")
        Add-DeepResult -CaseId "03-cli" -Scenario "happy path scope change apply" -Expected "execution reopens with new milestone and progress sync" -Step $scopeApplyStep

        $scopeNextStep = Invoke-Step -CaseId "03-cli" -StepName "happy-scope-next" -WorkingDir $CliDir -Exe "bun" -Arguments @(".harness/orchestrator.ts", "--next")
        $scopeNextStep.Ok = $scopeNextStep.Ok -and $scopeNextStep.Output.Contains("execution-engine")
        Add-DeepResult -CaseId "03-cli" -Scenario "happy path scope change resumes dispatch" -Expected "execution-engine" -Step $scopeNextStep

        Remove-Item $scopeChangePayloadPath -ErrorAction SilentlyContinue
      }
    }
  }
}

if ((Test-Path $WebDir) -and $WebSmoke -and $WebSmoke.SmokePassed) {
  $uiMilestone = New-Milestone -Name "UI Flow" -Tasks @((New-Task -Id "T801" -Name "Profile Screen" -IsUi $true))
  $retryUiMilestone = New-Milestone -Name "UI Flow" -Tasks @((New-Task -Id "T802" -Name "Retry UI Screen" -IsUi $true -RetryCount 3))

  $uiPatch = Invoke-StatePatch -CaseId "01-web-app" -CaseDir $WebDir -StepName "patch-ui-base" -Patch @{
    phase = "EXECUTING"
    execution = @{
      currentMilestone = "M1"
      currentTask = "T801"
      currentWorktree = "../mock-m1"
      milestones = @($uiMilestone)
      allMilestonesComplete = $false
    }
  }
  Add-DeepResult -CaseId "01-web-app" -Scenario "patch ui base" -Expected "patch ok" -Step $uiPatch

  $uiSpecPath = Join-Path $WebDir "docs\design\m1-ui-spec.md"
  if (Test-Path $uiSpecPath) {
    Remove-Item $uiSpecPath -Force
  }

  $designerStep = Invoke-Step -CaseId "01-web-app" -StepName "deep-ui-needs-spec" -WorkingDir $WebDir -Exe "bun" -Arguments @(".harness/orchestrator.ts", "--next")
  $designerStep.Ok = $designerStep.Ok -and $designerStep.Output.Contains("frontend-designer")
  Add-DeepResult -CaseId "01-web-app" -Scenario "ui needs milestone spec" -Expected "frontend-designer" -Step $designerStep

  $designerPacketStep = Invoke-Step -CaseId "01-web-app" -StepName "packet-ui-designer" -WorkingDir $WebDir -Exe "bun" -Arguments @(".harness/orchestrator.ts", "--packet-json")
  $designerPacketCheckResult = Test-PacketDispatch -Step $designerPacketStep -ExpectedAgentId "frontend-designer" -RequiredRefs @(
    "agents/frontend-designer.md",
    ".harness/state.json",
    "docs/prd/02-users-and-design.md",
    "docs/prd/03-requirements.md",
    "docs/architecture/01-system-overview.md"
  ) -ForbiddenExact @("AGENTS.md", "CLAUDE.md", "docs/progress/") -ForbiddenPatterns @(
    "docs/public/*",
    "docs/gitbook/*",
    "docs/adr/*"
  )
  $designerPacketCheck = New-CheckedStep -Step $designerPacketStep -Ok ([bool]$designerPacketCheckResult.Ok) -Reason $designerPacketCheckResult.Reason
  Add-DeepResult -CaseId "01-web-app" -Scenario "frontend designer packet stays selective" -Expected "designer packet excludes compatibility docs" -Step $designerPacketCheck

  Set-Content -Path $uiSpecPath -Value "# Mock UI Spec`n`nGenerated for detailed coverage."

  $executionStep = Invoke-Step -CaseId "01-web-app" -StepName "deep-ui-execution" -WorkingDir $WebDir -Exe "bun" -Arguments @(".harness/orchestrator.ts", "--next")
  $executionStep.Ok = $executionStep.Ok -and $executionStep.Output.Contains("execution-engine")
  Add-DeepResult -CaseId "01-web-app" -Scenario "ui milestone spec present" -Expected "execution-engine" -Step $executionStep

  $uiPacketStep = Invoke-Step -CaseId "01-web-app" -StepName "packet-ui-execution" -WorkingDir $WebDir -Exe "bun" -Arguments @(".harness/orchestrator.ts", "--packet-json")
  $uiPacketCheckResult = Test-PacketDispatch -Step $uiPacketStep -ExpectedAgentId "execution-engine" -RequiredRefs @(
    "agents/execution-engine.md",
    ".harness/state.json",
    "agents/execution-engine/01-preflight.md",
    "agents/execution-engine/02-task-loop.md",
    "docs/design/DESIGN_SYSTEM.md",
    "docs/design/m1-ui-spec.md"
  ) -ForbiddenExact @("docs/progress/") -ForbiddenPatterns @(
    "docs/public/*",
    "docs/gitbook/*",
    "docs/adr/*"
  )
  $uiPacketCheck = New-CheckedStep -Step $uiPacketStep -Ok ([bool]$uiPacketCheckResult.Ok) -Reason $uiPacketCheckResult.Reason
  Add-DeepResult -CaseId "01-web-app" -Scenario "ui execution packet stays selective" -Expected "ui packet includes only current design docs" -Step $uiPacketCheck

  $reviewStep = Invoke-Step -CaseId "01-web-app" -StepName "deep-ui-review" -WorkingDir $WebDir -Exe "bun" -Arguments @(".harness/orchestrator.ts", "--review")
  $reviewStep.Ok = $reviewStep.Ok -and $reviewStep.Output.Contains("Design Reviewer Agent")
  Add-DeepResult -CaseId "01-web-app" -Scenario "ui design review" -Expected "Design Reviewer Agent" -Step $reviewStep

  $retryPatch = Invoke-StatePatch -CaseId "01-web-app" -CaseDir $WebDir -StepName "patch-ui-retry" -Patch @{
    execution = @{
      currentMilestone = "M1"
      currentTask = "T802"
      currentWorktree = "../mock-m1"
      milestones = @($retryUiMilestone)
      allMilestonesComplete = $false
    }
  }
  Add-DeepResult -CaseId "01-web-app" -Scenario "patch ui retry" -Expected "patch ok" -Step $retryPatch

  $reviewRetryStep = Invoke-Step -CaseId "01-web-app" -StepName "deep-ui-review-retry" -WorkingDir $WebDir -Exe "bun" -Arguments @(".harness/orchestrator.ts", "--review") -ExpectFailure
  $reviewRetryStep.Ok = $reviewRetryStep.Ok -and $reviewRetryStep.Output.Contains("Recovery steps:")
  Add-DeepResult -CaseId "01-web-app" -Scenario "ui design review retry cutoff" -Expected "Recovery steps:" -Step $reviewRetryStep

  $nextRetryStep = Invoke-Step -CaseId "01-web-app" -StepName "deep-ui-next-retry" -WorkingDir $WebDir -Exe "bun" -Arguments @(".harness/orchestrator.ts", "--next") -ExpectFailure
  $nextRetryStep.Ok = $nextRetryStep.Ok -and $nextRetryStep.Output.Contains("Recovery steps:")
  Add-DeepResult -CaseId "01-web-app" -Scenario "ui next retry cutoff" -Expected "Recovery steps:" -Step $nextRetryStep

  $addAgentStep = Invoke-Step -CaseId "01-web-app" -StepName "surface-add-agent" -WorkingDir $WebDir -Exe "bun" -Arguments @("run", "harness:add-surface", "--type", "agent")
  $addAgentStep.Ok = $addAgentStep.Ok -and (Test-Path (Join-Path $WebDir "apps\agent\package.json")) -and (Test-Path (Join-Path $WebDir "SKILLS.md")) -and (Test-Path (Join-Path $WebDir "skills\api-wrapper\SKILL.md"))
  Add-DeepResult -CaseId "01-web-app" -Scenario "add agent surface from web app" -Expected "apps/agent + skills scaffold" -Step $addAgentStep
}

if ((Test-Path $IosDir) -and $IosSmoke -and $IosSmoke.SmokePassed) {
  $addCliStep = Invoke-Step -CaseId "02-ios-app" -StepName "surface-add-cli" -WorkingDir $IosDir -Exe "bun" -Arguments @("run", "harness:add-surface", "--type", "cli")
  $addCliStep.Ok = $addCliStep.Ok -and (Test-Path (Join-Path $IosDir "apps\cli\package.json"))
  Add-DeepResult -CaseId "02-ios-app" -Scenario "add cli surface from ios app" -Expected "apps/cli" -Step $addCliStep

  $syncDocsStep = Invoke-Step -CaseId "02-ios-app" -StepName "ios-sync-docs" -WorkingDir $IosDir -Exe "bun" -Arguments @("run", "harness:sync-docs")
  $syncDocsStep.Ok = $syncDocsStep.Ok -and (Get-Content (Join-Path $IosDir "docs\public\tech-stack.md") -Raw).Contains("CLI")
  Add-DeepResult -CaseId "02-ios-app" -Scenario "sync docs after surface expansion" -Expected "docs/public updated" -Step $syncDocsStep
}

if ((Test-Path $AgentDir) -and $AgentSmoke -and $AgentSmoke.SmokePassed) {
  $apiAddStep = Invoke-Step -CaseId "04-agent" -StepName "agent-api-add" -WorkingDir $AgentDir -Exe "bun" -Arguments @("run", "harness:api:add", "--name", "internal-core")
  $apiAddStep.Ok = $apiAddStep.Ok -and (Test-Path (Join-Path $AgentDir "packages\shared\api\internal-core\index.ts"))
  Add-DeepResult -CaseId "04-agent" -Scenario "agent api add" -Expected "packages/shared/api/internal-core" -Step $apiAddStep

  $syncSkillsStep = Invoke-Step -CaseId "04-agent" -StepName "agent-sync-skills" -WorkingDir $AgentDir -Exe "bun" -Arguments @("run", "harness:sync-skills")
  $syncSkillsStep.Ok = $syncSkillsStep.Ok -and (Get-Content (Join-Path $AgentDir "SKILLS.md") -Raw).Contains("internal-core")
  Add-DeepResult -CaseId "04-agent" -Scenario "agent sync skills" -Expected "SKILLS.md updated" -Step $syncSkillsStep
}

if ((Test-Path $MonorepoDir) -and $MonorepoSmoke -and $MonorepoSmoke.SmokePassed) {
  $addDesktopStep = Invoke-Step -CaseId "06-monorepo" -StepName "monorepo-add-desktop" -WorkingDir $MonorepoDir -Exe "bun" -Arguments @("run", "harness:add-surface", "--type", "desktop")
  $addDesktopStep.Ok = $addDesktopStep.Ok -and (Test-Path (Join-Path $MonorepoDir "apps\desktop\package.json"))
  Add-DeepResult -CaseId "06-monorepo" -Scenario "add desktop surface to monorepo" -Expected "apps/desktop" -Step $addDesktopStep

  $addDesktopRetryStep = Invoke-Step -CaseId "06-monorepo" -StepName "monorepo-add-desktop-retry" -WorkingDir $MonorepoDir -Exe "bun" -Arguments @("run", "harness:add-surface", "--type", "desktop")
  $stateJson = Get-Content (Join-Path $MonorepoDir ".harness\state.json") -Raw | ConvertFrom-Json
  $desktopCount = @($stateJson.projectInfo.types | Where-Object { $_ -eq "desktop" }).Count
  $addDesktopRetryStep.Ok = $addDesktopRetryStep.Ok -and ($desktopCount -eq 1)
  Add-DeepResult -CaseId "06-monorepo" -Scenario "repeat desktop surface add is idempotent" -Expected "desktop surface count stays 1" -Step $addDesktopRetryStep
}

if ((Test-Path $ComboDir) -and $ComboSmoke -and $ComboSmoke.SmokePassed) {
  $auditStep = Invoke-Step -CaseId "07-combo" -StepName "combo-audit" -WorkingDir $ComboDir -Exe "bun" -Arguments @("run", "harness:audit") -ExpectFailure
  $auditStep.Ok = $auditStep.Ok -and (Test-Path (Join-Path $ComboDir ".harness\reports\audit-latest.md"))
  Add-DeepResult -CaseId "07-combo" -Scenario "combo audit" -Expected "audit report generated" -Step $auditStep
}

if ((Test-Path $WebDir) -and $WebSmoke -and $WebSmoke.SmokePassed) {
  $cloneDir = Join-Path $RunRoot "clone-recovery-web"
  Copy-TrackedHarnessFixture -SourceDir $WebDir -DestinationDir $cloneDir

  $cloneGitInit = Invoke-Step -CaseId "10-recovery" -StepName "clone-git-init" -WorkingDir $cloneDir -Exe "git" -Arguments @("init", "-b", "main")
  Add-DeepResult -CaseId "10-recovery" -Scenario "clone recovery git init" -Expected "git init ok" -Step $cloneGitInit

  $cloneInstall = Invoke-Step -CaseId "10-recovery" -StepName "clone-install" -WorkingDir $cloneDir -Exe "bun" -Arguments @("install")
  Add-DeepResult -CaseId "10-recovery" -Scenario "clone recovery install" -Expected "bun install ok" -Step $cloneInstall

  $cloneHooks = Invoke-Step -CaseId "10-recovery" -StepName "clone-hooks-install" -WorkingDir $cloneDir -Exe "bun" -Arguments @("run", "harness:hooks:install")
  $cloneClaudePath = Join-Path $cloneDir ".claude\settings.local.json"
  $cloneCodexPath = Join-Path $cloneDir ".codex\config.toml"
  $cloneClaudeRaw = if (Test-Path $cloneClaudePath) { [string](Get-Content $cloneClaudePath -Raw) } else { "" }
  try {
    $cloneClaudeJson = if ($cloneClaudeRaw) { $cloneClaudeRaw | ConvertFrom-Json } else { $null }
  } catch {
    $cloneClaudeJson = $null
  }
  $cloneHooks.Ok = $cloneHooks.Ok `
    -and (Test-Path (Join-Path $cloneDir "AGENTS.md")) `
    -and (Test-Path (Join-Path $cloneDir "CLAUDE.md")) `
    -and (Test-Path (Join-Path $cloneDir ".harness\state.json")) `
    -and (Test-Path (Join-Path $cloneDir "agents\project-discovery.md")) `
    -and (Test-Path (Join-Path $cloneDir "docs\ai\01-operating-principles.md")) `
    -and (Test-Path (Join-Path $cloneDir "docs\PROGRESS.md")) `
    -and ($null -ne $cloneClaudeJson) `
    -and $cloneClaudeRaw.Contains("--claude pre-write") `
    -and $cloneClaudeRaw.Contains("--claude pre-bash") `
    -and $cloneClaudeRaw.Contains("--claude post-write") `
    -and $cloneClaudeRaw.Contains("--claude stop") `
    -and (-not $cloneClaudeRaw.Contains("--hook pre-write")) `
    -and (Test-Path $cloneCodexPath) `
    -and ([string](Get-Content $cloneCodexPath -Raw)).Contains('notify = ["bun .harness/runtime/hooks/check-guardian.ts --codex"]') `
    -and (Test-Path (Join-Path $cloneDir ".env.local"))
  Add-DeepResult -CaseId "10-recovery" -Scenario "clone recovery restore locals" -Expected "local harness files restored" -Step $cloneHooks

  $cloneValidate = Invoke-Step -CaseId "10-recovery" -StepName "clone-validate-executing" -WorkingDir $cloneDir -Exe "bun" -Arguments @("harness:validate", "--phase", "EXECUTING")
  Add-DeepResult -CaseId "10-recovery" -Scenario "clone recovery phase gate" -Expected "EXECUTING gate passes after restore" -Step $cloneValidate
}

if ((Test-Path $CliDir) -and $CliSmoke -and $CliSmoke.SmokePassed) {
  $autoPatch = Invoke-StatePatch -CaseId "03-cli" -CaseDir $CliDir -StepName "patch-autoflow-scaffold" -Patch @{
    phase = "SCAFFOLD"
    execution = @{
      activeAgents = @()
      currentMilestone = ""
      currentTask = ""
      currentWorktree = ""
    }
  }
  Add-DeepResult -CaseId "03-cli" -Scenario "patch autoflow scaffold" -Expected "patch ok" -Step $autoPatch

  $autoflowStep = Invoke-Step -CaseId "03-cli" -StepName "autoflow-happy" -WorkingDir $CliDir -Exe "bun" -Arguments @("run", "harness:autoflow")
  $autoflowStep.Ok = $autoflowStep.Ok -and $autoflowStep.Output.Contains("Next agent: execution-engine")
  Add-DeepResult -CaseId "03-cli" -Scenario "autoflow happy path" -Expected "stop at execution-engine after scaffold handoff" -Step $autoflowStep
}

$hydrateDir = Join-Path $RunRoot "hydrate-existing-repo"
New-Item -ItemType Directory -Path (Join-Path $hydrateDir "docs") -Force | Out-Null
Set-Content -Path (Join-Path $hydrateDir "package.json") -Value @'
{
  "name": "existing-hydrate-repo",
  "description": "Existing repository used to validate local harness hydration."
}
'@
Set-Content -Path (Join-Path $hydrateDir "README.md") -Value @'
# Existing Hydrate Repo

A pre-existing repo with baseline docs.
'@
Set-Content -Path (Join-Path $hydrateDir "docs\PRD.md") -Value @'
# PRD - Existing Hydrate Repo

Existing product requirements.
'@
Set-Content -Path (Join-Path $hydrateDir "docs\ARCHITECTURE.md") -Value @'
# Architecture - Existing Hydrate Repo

Existing architecture notes.
'@

$hydrateSetup = Invoke-Step -CaseId "08-hydrate" -StepName "hydrate-setup" -WorkingDir $hydrateDir -Exe "bun" -Arguments @(
  (Join-Path $SkillRoot "scripts\harness-setup.ts"),
  "--skipGithub=true",
  "--isGreenfield=false"
)
$hydrateStatePath = Join-Path $hydrateDir ".harness\state.json"
$hydrateState = if (Test-Path $hydrateStatePath) { Get-Content $hydrateStatePath -Raw | ConvertFrom-Json } else { $null }
$hydrateSetup.Ok = $hydrateSetup.Ok -and ($null -ne $hydrateState) -and ($hydrateState.projectInfo.name -eq "existing-hydrate-repo")
Add-DeepResult -CaseId "08-hydrate" -Scenario "hydrate existing repo from docs" -Expected "existing repo metadata inferred" -Step $hydrateSetup

$hydrateMissingDocsDir = Join-Path $RunRoot "hydrate-missing-docs"
New-Item -ItemType Directory -Path (Join-Path $hydrateMissingDocsDir "src") -Force | Out-Null
Set-Content -Path (Join-Path $hydrateMissingDocsDir "package.json") -Value @'
{
  "name": "missing-docs-repo",
  "description": "Existing repo without PRD or architecture docs.",
  "dependencies": {
    "next": "15.0.0",
    "react": "19.0.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build"
  }
}
'@
Set-Content -Path (Join-Path $hydrateMissingDocsDir "README.md") -Value @'
# Missing Docs Repo

An existing repo without PRD or architecture docs.
'@
Set-Content -Path (Join-Path $hydrateMissingDocsDir "src\index.ts") -Value "export const boot = () => 'ok';"

$hydrateMissingDocs = Invoke-Step -CaseId "09-hydrate-missing" -StepName "hydrate-missing-docs" -WorkingDir $hydrateMissingDocsDir -Exe "bun" -Arguments @(
  (Join-Path $SkillRoot "scripts\harness-setup.ts"),
  "--skipGithub=true",
  "--isGreenfield=false"
)
$missingPrdPath = Join-Path $hydrateMissingDocsDir "docs\prd\01-overview.md"
$missingArchPath = Join-Path $hydrateMissingDocsDir "docs\architecture\01-system-overview.md"
$hydrateMissingDocs.Ok = $hydrateMissingDocs.Ok `
  -and (Test-Path $missingPrdPath) `
  -and (Test-Path $missingArchPath) `
  -and (Get-Content $missingPrdPath -Raw).Contains("Existing repo without PRD or architecture docs.") `
  -and (Get-Content $missingArchPath -Raw).Contains("next")
Add-DeepResult -CaseId "09-hydrate-missing" -Scenario "hydrate existing repo without docs" -Expected "generate inferred PRD and architecture" -Step $hydrateMissingDocs

$summary = New-Object System.Collections.Generic.List[string]
$summary.Add("# Harness E2E Summary") | Out-Null
$summary.Add("") | Out-Null
$line = "Run root: $RunRoot"
$summary.Add($line) | Out-Null
$summary.Add("") | Out-Null
$summary.Add("## Smoke Matrix") | Out-Null
$summary.Add("") | Out-Null
$summary.Add("| Case | Type | Smoke | Next Action | Notes |") | Out-Null
$summary.Add("| --- | --- | --- | --- | --- |") | Out-Null
foreach ($row in $SmokeResults) {
  $smokeLabel = if ($row.SmokePassed) { "PASS" } else { "FAIL" }
  $nextAction = $row.NextAction -replace "`r?`n", "<br>"
  $line = "| {0} | {1} | {2} | {3} | {4} |" -f $row.CaseId, $row.Type, $smokeLabel, $nextAction, $row.Notes
  $summary.Add($line) | Out-Null
}

$summary.Add("") | Out-Null
$summary.Add("## Command Matrix") | Out-Null
$summary.Add("") | Out-Null
$summary.Add("| Case | Type | Step | Expectation | Result | Exit |") | Out-Null
$summary.Add("| --- | --- | --- | --- | --- | --- |") | Out-Null
foreach ($row in $CommandResults) {
  $resultLabel = if ($row.Passed) { "PASS" } else { "FAIL" }
  $line = "| {0} | {1} | {2} | {3} | {4} | {5} |" -f $row.CaseId, $row.Type, $row.Step, $row.Expectation, $resultLabel, $row.ExitCode
  $summary.Add($line) | Out-Null
}

if ($DeepResults.Count -gt 0) {
  $summary.Add("") | Out-Null
  $summary.Add("## Deep Orchestrator Coverage") | Out-Null
  $summary.Add("") | Out-Null
  $summary.Add("| Case | Scenario | Expected | Result | Exit |") | Out-Null
  $summary.Add("| --- | --- | --- | --- | --- |") | Out-Null
  foreach ($row in $DeepResults) {
    $deepLabel = if ($row.Passed) { "PASS" } else { "FAIL" }
    $line = "| {0} | {1} | {2} | {3} | {4} |" -f $row.CaseId, $row.Scenario, $row.Expected, $deepLabel, $row.ExitCode
    $summary.Add($line) | Out-Null
  }
}

$summary.Add("") | Out-Null
$summary.Add("## Retained Artifacts") | Out-Null
$summary.Add("") | Out-Null
$line = "Cases root: $CasesRoot"
$summary.Add($line) | Out-Null
$line = "Reports root: " + $ReportsRoot
$summary.Add($line) | Out-Null

Set-Content -Path $SummaryPath -Value ($summary -join "`n")
Write-Host "Summary written to $SummaryPath"
