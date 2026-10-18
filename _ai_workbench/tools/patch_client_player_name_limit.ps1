param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

$resolved = Resolve-Path -LiteralPath $Path
$content = [IO.File]::ReadAllText($resolved)
$replacements = @(
  @('6<e.length?S.ins().showTipsByLangId(30031520)', '24<Array.from(e).length?S.ins().showTipsByLangId(30031520)'),
  @('t.name?t.name.slice(0,6):e.playerInfo.name', 't.name?t.name.slice(0,24):e.playerInfo.name')
)

foreach ($pair in $replacements) {
  $needle = $pair[0]
  $replacement = $pair[1]
  $count = ([regex]::Matches($content, [regex]::Escape($needle))).Count
  if ($count -ne 1) {
    throw "Expected exactly one occurrence of '$needle', found $count"
  }
  $content = $content.Replace($needle, $replacement)
}

[IO.File]::WriteAllText($resolved, $content, [Text.UTF8Encoding]::new($false))
Write-Output "patched=$resolved replacements=$($replacements.Count)"
