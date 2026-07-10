#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Build and push freemoviesuggestion Docker image to Docker Hub.
.DESCRIPTION
  Creates a multi-arch build (linux/amd64, linux/arm64) and pushes
  to ajaysin/freemoviesuggestion:latest.
.PARAMETER NoPush
  If set, only builds locally without pushing.
.PARAMETER Tag
  Additional tag to apply (e.g., "1.0.0"). "latest" is always applied.
.EXAMPLE
  ./scripts/docker-publish.ps1
  ./scripts/docker-publish.ps1 -Tag 1.0.0
  ./scripts/docker-publish.ps1 -NoPush
#>

param(
  [switch]$NoPush,
  [string]$Tag
)

$ErrorActionPreference = "Stop"
$Repo = "ajaysin/freemoviesuggestion"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# Check Docker Hub login by attempting re-auth with stored credentials
Write-Host "Checking Docker Hub login..." -ForegroundColor Cyan
$loginOutput = docker login 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not logged into Docker Hub. Run 'docker login' first." -ForegroundColor Red
  exit 1
}
Write-Host "Docker Hub: authenticated" -ForegroundColor Green

# Build tags
$tags = @("${Repo}:latest")
if ($Tag) {
  $tags += "${Repo}:$Tag"
}
$tagArgs = $tags | ForEach-Object { "-t", $_ }

if ($NoPush) {
  # Local build — use default builder, current architecture
  Write-Host "Building for local architecture..." -ForegroundColor Cyan
  Write-Host "Tags: $($tags -join ', ')" -ForegroundColor Yellow
  docker build @tagArgs .
} else {
  # Multi-arch push — use buildx with docker-container driver
  Write-Host "Setting up buildx for multi-arch..." -ForegroundColor Cyan
  docker buildx create --name multiarch --driver docker-container --bootstrap --use 2>$null
  docker buildx ls

  Write-Host "Building for linux/amd64, linux/arm64 ..." -ForegroundColor Cyan
  Write-Host "Tags: $($tags -join ', ')" -ForegroundColor Yellow
  docker buildx build `
    --platform linux/amd64,linux/arm64 `
    --push `
    @tagArgs `
    .
}

if ($LASTEXITCODE -eq 0) {
  Write-Host "Done!" -ForegroundColor Green
  if ($NoPush) {
    Write-Host "Image built locally. Push with: docker push $($tags[0])" -ForegroundColor Yellow
  } else {
    Write-Host "Published: $($tags -join ', ')" -ForegroundColor Green
  }
} else {
  Write-Host "Build failed." -ForegroundColor Red
  exit 1
}
