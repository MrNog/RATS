# Builds gallery.json from the files in images/<category>/  (script lives in scripts/)
# Run:  powershell -ExecutionPolicy Bypass -File scripts\build-gallery.ps1   (or double-click scripts\build-gallery.bat)
#
# - Scans images/classes, images/commissions, images/banners, images/lore
# - Titles are auto-generated from the filename, per category:
#     banners      "ICC 10"      -> "Icecrown Citadel (10-man)"
#     commissions  "Bimbo 2"     -> "Bimbo #2"
#     classes/lore "death knight"-> "Death Knight"
# - Your hand-written caption (and date) is preserved across rebuilds.
# - Banners default to wide (full-row).

$ErrorActionPreference = "Stop"
# script lives in scripts/, so the repo root is its parent directory
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$jsonPath = Join-Path $root "gallery.json"

$cats = "classes", "commissions", "lore", "warchief-fangs", "warchiefs", "banners", "wallpaper", "icons"
$exts = ".png", ".jpg", ".jpeg", ".gif", ".webp"

# WotLK raid abbreviations -> full names (lowercase keys)
$raidMap = @{
  "icc" = "Icecrown Citadel"; "toc" = "Trial of the Crusader"; "togc" = "Trial of the Grand Crusader";
  "ulduar" = "Ulduar"; "uld" = "Ulduar"; "naxx" = "Naxxramas"; "naxxramas" = "Naxxramas";
  "os" = "Obsidian Sanctum"; "eoe" = "Eye of Eternity"; "voa" = "Vault of Archavon";
  "ony" = "Onyxia's Lair"; "onyxia" = "Onyxia's Lair"; "rs" = "Ruby Sanctum"; "ruby" = "Ruby Sanctum"
}

function Get-CleanName([string]$file) {
  $n = [System.IO.Path]::GetFileNameWithoutExtension($file) -replace "[-_]+", " "
  ($n -replace "\s+", " ").Trim()
}
function ConvertTo-TitleCase([string]$s) {
  ($s -split "\s+" | Where-Object { $_ } | ForEach-Object { $_.Substring(0, 1).ToUpper() + $_.Substring(1) }) -join " "
}
function Get-Title([string]$cat, [string]$file) {
  $base = Get-CleanName $file
  switch ($cat) {
    "banners" {
      # peel off an optional trailing raid size (10 / 25)
      if ($base -match '^(.*?)\s*([0-9]{1,2})\s*$') { $raid = $matches[1].Trim(); $size = $matches[2] }
      else { $raid = $base; $size = $null }
      $key = $raid.ToLower()
      $full = if ($raidMap.ContainsKey($key)) { $raidMap[$key] } else { ConvertTo-TitleCase $raid }
      if ($size) { return "$full ($size-man)" } else { return $full }
    }
    { $_ -in "commissions", "warchief-fangs", "warchiefs" } {
      # character art with numbered variants: "Bimbo 2" -> "Bimbo #2"
      if ($base -match '^(.*?)\s*([0-9]{1,2})\s*$') { return ((ConvertTo-TitleCase $matches[1].Trim()) + " #" + $matches[2]) }
      return ConvertTo-TitleCase $base
    }
    default { return ConvertTo-TitleCase $base }
  }
}

# Load existing entries (keyed by file) to preserve hand-written caption/date
$existing = @{}
if (Test-Path $jsonPath) {
  try {
    foreach ($e in (Get-Content $jsonPath -Raw | ConvertFrom-Json)) { if ($e.file) { $existing[$e.file] = $e } }
  } catch { Write-Warning "Couldn't parse existing gallery.json - rebuilding from scratch." }
}

$out = New-Object System.Collections.ArrayList
$count = 0
$imagesRoot = Join-Path $root "images"

foreach ($cat in $cats) {
  $dir = Join-Path $imagesRoot $cat
  if (-not (Test-Path $dir)) { continue }

  Get-ChildItem -Path $dir -File |
    Where-Object { $exts -contains $_.Extension.ToLower() } |
    Sort-Object Name |
    ForEach-Object {
      $rel = "images/$cat/$($_.Name)"
      $count++
      $prev = $existing[$rel]

      $item = [ordered]@{
        cat     = $cat
        file    = $rel
        title   = Get-Title $cat $_.Name
        caption = if ($prev -and $prev.caption) { $prev.caption } else { "" }
        date    = if ($prev -and $prev.date) { $prev.date } else { $_.LastWriteTime.ToString("yyyy-MM") }
      }
      if ($cat -eq "banners") { $item.wide = $true }
      [void]$out.Add([pscustomobject]$item)
      if (-not $prev) { Write-Host "  + new: $rel  ->  $($item.title)" -ForegroundColor Green }
    }
}

$json = if ($out.Count) { ConvertTo-Json $out -Depth 5 } else { "[]" }
Set-Content -Path $jsonPath -Value $json -Encoding UTF8

Write-Host "`nWrote $($out.Count) item(s) to gallery.json ($count file(s) scanned)." -ForegroundColor Cyan
