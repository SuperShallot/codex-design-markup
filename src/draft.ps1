$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.Encoding]::UTF8
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
Add-Type -Namespace CanvasMarkup -Name Native -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern uint GetClipboardSequenceNumber();
'@

$app = Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1
if (!$app) { '{"ready":false}'; exit }
$clipboard = [Windows.Forms.Clipboard]
$keyboard = [Windows.Forms.SendKeys]
$automation = [Windows.Automation.AutomationElement]
$valuePattern = [Windows.Automation.ValuePattern]::Pattern
$edit = [Windows.Automation.PropertyCondition]::new(
    $automation::ControlTypeProperty, [Windows.Automation.ControlType]::Edit)
$button = [Windows.Automation.PropertyCondition]::new(
    $automation::ControlTypeProperty, [Windows.Automation.ControlType]::Button)

function Test-CodexEditor($element) {
    if (!$element -or $element.Current.ClassName -notmatch '(?:^|\s)ProseMirror(?:\s|$)') { return $false }
    $process = Get-Process -Id $element.Current.ProcessId -ErrorAction SilentlyContinue
    return $process.Path -and $process.Path.StartsWith($app.InstallLocation + '\app\', [StringComparison]::OrdinalIgnoreCase)
}

function Get-EditorText($element) {
    $pattern = $null
    if ($element.TryGetCurrentPattern($valuePattern, [ref]$pattern)) {
        $content = $pattern.Current.Value.Trim()
        if ($content -ne $element.Current.Name) { return $content }
    }
}

# Keep an existing draft intact and only paste into the editor opened by this link.
foreach ($window in (Get-Process ChatGPT -ErrorAction SilentlyContinue)) {
    if ($window.MainWindowHandle -eq [IntPtr]::Zero) { continue }
    $root = $automation::FromHandle($window.MainWindowHandle)
    foreach ($field in $root.FindAll([Windows.Automation.TreeScope]::Descendants, $edit)) {
        if ((Test-CodexEditor $field) -and (Get-EditorText $field) -and (Get-EditorText $field) -ne $request.marker) {
            '{"ready":false,"existingDraft":true}'; exit
        }
    }
}

Start-Process -WindowStyle Hidden -FilePath $request.url
$deadline = [DateTime]::UtcNow.AddSeconds(8)
do {
    Start-Sleep -Milliseconds 180
    $focused = $automation::FocusedElement
    if ((Test-CodexEditor $focused) -and (Get-EditorText $focused) -eq $request.marker) { break }
    $focused = $null
} while ([DateTime]::UtcNow -lt $deadline)
if (!$focused) { '{"ready":false}'; exit }

$original = $clipboard::GetDataObject()
$sequence = [CanvasMarkup.Native]::GetClipboardSequenceNumber()
$ready = $false
try {
    $current = $automation::FocusedElement
    if (!$current -or !$focused.Equals($current) -or (Get-EditorText $current) -ne $request.marker) {
        '{"ready":false}'; exit
    }
    $clipboard::SetText($request.text, [Windows.Forms.TextDataFormat]::UnicodeText)
    $sequence = [CanvasMarkup.Native]::GetClipboardSequenceNumber()
    $keyboard::SendWait('^a^v')
    $deadline = [DateTime]::UtcNow.AddSeconds(3)
    $expected = $request.text.Trim().Replace("`r`n", "`n")
    do {
        Start-Sleep -Milliseconds 140
        $current = $automation::FocusedElement
        if (!$current -or !$focused.Equals($current)) { break }
        $actual = Get-EditorText $current
        if ($actual -and $actual.Replace("`r`n", "`n") -eq $expected) { $ready = $true; break }
    } while ([DateTime]::UtcNow -lt $deadline)

    if (!$ready) { '{"ready":false}'; exit }
    if ([CanvasMarkup.Native]::GetClipboardSequenceNumber() -ne $sequence) {
        '{"ready":true,"pastedImages":false}'; exit
    }
    $paths = [Collections.Specialized.StringCollection]::new()
    foreach ($path in $request.files) { [void]$paths.Add($path) }
    $clipboard::SetFileDropList($paths)
    $sequence = [CanvasMarkup.Native]::GetClipboardSequenceNumber()
    if (!$focused.Equals($automation::FocusedElement)) { '{"ready":true,"pastedImages":false}'; exit }
    $keyboard::SendWait('^v')
    $window = Get-Process -Id $focused.Current.ProcessId
    $root = $automation::FromHandle($window.MainWindowHandle)
    $names = @($request.files | ForEach-Object { [IO.Path]::GetFileName($_) })
    $deadline = [DateTime]::UtcNow.AddSeconds(3)
    do {
        Start-Sleep -Milliseconds 180
        $labels = @($root.FindAll([Windows.Automation.TreeScope]::Descendants, $button) |
            ForEach-Object { $_.Current.Name })
        $missing = @($names | Where-Object { $_ -notin $labels })
        if (!$missing.Count) { '{"ready":true,"pastedImages":true}'; exit }
    } while ([DateTime]::UtcNow -lt $deadline)
    '{"ready":true,"pastedImages":false}'
} finally {
    if ([CanvasMarkup.Native]::GetClipboardSequenceNumber() -eq $sequence) {
        if ($original) { $clipboard::SetDataObject($original, $true) }
        else { $clipboard::Clear() }
    }
}
