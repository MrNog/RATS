# Builds gallery.json from the files in images/<category>/  (script lives in scripts/)
# Run:  powershell -ExecutionPolicy Bypass -File scripts\build-gallery.ps1   (or double-click scripts\build-gallery.bat)
#
# - Scans images/classes, images/commissions, images/banners, images/lore, images/wallpaper, images/icons
# - Also scans images/profile-bg/<main>/<toon>.png recursively (the text-free profile hero banners),
#   titled by toon name; the _class/ generic-fallback folder is skipped.
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

# --- toon -> main alias map, for auto-tagging "people" (who's in the art) ---------------------------
# Source 1: profile-bg/<main>/<toon>.png folders — every toon in a <main>/ folder belongs to <main>.
#   This captures all LOCKED alts automatically (the sheets embed the same paths), so new alts just
#   need their banner dropped in the right folder.
# Source 2: NICKS — commission/file spellings that differ from the in-game toon name (few, explicit).
# Result: $alias[<lowercased simplified name>] = <main>. Used to fill "people" from a filename.
function Simplify([string]$s) { ($s -replace "[^a-zA-Z0-9]", "").ToLower() }
$alias = @{}
$pbgScan = Join-Path $imagesRoot "profile-bg"
if (Test-Path $pbgScan) {
  Get-ChildItem -Path $pbgScan -Directory | Where-Object { $_.Name -ne "_class" } | ForEach-Object {
    $main = $_.Name
    $alias[(Simplify $main)] = $main
    Get-ChildItem -Path $_.FullName -File | Where-Object { $exts -contains $_.Extension.ToLower() } | ForEach-Object {
      $alias[(Simplify ([System.IO.Path]::GetFileNameWithoutExtension($_.Name)))] = $main
    }
  }
}
# hand-kept nicks: commission/file spellings -> the in-game toon (which the map above resolves to a main)
$NICKS = @{ "bimbo" = "mojo"; "nutella" = "nutelaa"; "nutela" = "nutelaa" }
foreach ($k in $NICKS.Keys) { $alias[(Simplify $k)] = if ($alias.ContainsKey((Simplify $NICKS[$k]))) { $alias[(Simplify $NICKS[$k])] } else { $NICKS[$k] } }

# Resolve the leading name of a filename to a main via $alias (e.g. "Okanor 1" -> okanor,
# "Foug 1" -> foug, "Bimbo 2" -> mojo). Returns "" when the name isn't a known rat.
function Resolve-People([string]$file) {
  $base = Get-CleanName $file                    # "Okanor 1" / "Warchiefs 3"
  $lead = ($base -split '\s+')[0]                # first word = the character name
  $key = Simplify $lead
  if ($alias.ContainsKey($key)) { return $alias[$key] }
  return ""
}

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
      # "people" = who's in the art. A hand-written tag ALWAYS wins. Otherwise we ONLY auto-tag when the
      # filename's leading name is a known rat (single-character art like "Okanor 1" / "Bimbo 2"). Group
      # shots (a filename that isn't a rat name, e.g. "Warchiefs 3") get NO auto-tag — the pipeline can't
      # see who's actually in a group image, so those must be tagged by hand. Raid banners have no people.
      if ($prev -and $prev.people) { $item.people = $prev.people }
      elseif ($cat -ne "banners") { $p = Resolve-People $_.Name; if ($p) { $item.people = $p } }
      if ($cat -eq "banners") { $item.wide = $true }
      [void]$out.Add([pscustomobject]$item)
      if (-not $prev) { Write-Host "  + new: $rel  ->  $($item.title)" -ForegroundColor Green }
    }
}

# profile-bg is nested one folder per main (images/profile-bg/<main>/<toon>.png) and text-free,
# so scan it recursively as its own category. Skip the _class/ generic-fallback banners.
$pbgDir = Join-Path $imagesRoot "profile-bg"
if (Test-Path $pbgDir) {
  Get-ChildItem -Path $pbgDir -File -Recurse |
    Where-Object { $exts -contains $_.Extension.ToLower() -and $_.Directory.Name -ne "_class" } |
    Sort-Object Name |
    ForEach-Object {
      $rel = "images/profile-bg/$($_.Directory.Name)/$($_.Name)"
      $count++
      $prev = $existing[$rel]
      $item = [ordered]@{
        cat     = "profile-bg"
        file    = $rel
        title   = ConvertTo-TitleCase (Get-CleanName $_.Name)
        caption = if ($prev -and $prev.caption) { $prev.caption } else { "" }
        date    = if ($prev -and $prev.date) { $prev.date } else { $_.LastWriteTime.ToString("yyyy-MM") }
      }
      if ($prev -and $prev.people) { $item.people = $prev.people }
      else { $p = Resolve-People $_.Name; if ($p) { $item.people = $p } }
      $item.wide = $true  # 4:1 ultra-wide art -> full-row like banners
      [void]$out.Add([pscustomobject]$item)
      if (-not $prev) { Write-Host "  + new: $rel  ->  $($item.title)" -ForegroundColor Green }
    }
}

$json = if ($out.Count) { ConvertTo-Json $out -Depth 5 } else { "[]" }
Set-Content -Path $jsonPath -Value $json -Encoding UTF8

Write-Host "`nWrote $($out.Count) item(s) to gallery.json ($count file(s) scanned)." -ForegroundColor Cyan
