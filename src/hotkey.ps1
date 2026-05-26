param(
  [int]$Mod1 = 2,
  [int]$Mod2 = 4,
  [int]$Key = 0x52
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class HotkeyForm : Form {
  private int _id;
  public Action Toggled { get; set; }

  public HotkeyForm(int id) {
    _id = id;
    WindowState = FormWindowState.Minimized;
    ShowInTaskbar = false;
    FormBorderStyle = FormBorderStyle.None;
    Load += delegate { Visible = false; ShowIcon = false; };
  }

  protected override void WndProc(ref Message m) {
    if (m.Msg == 0x0312 && (int)m.WParam == _id) {
      var handler = Toggled;
      if (handler != null) handler();
    }
    base.WndProc(ref m);
  }
}

public static class Win32 {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
}
"@ -ReferencedAssemblies "System.Windows.Forms" -ErrorAction Stop

$modMask = $Mod1 -bor $Mod2
$hotkeyId = 9001

$form = New-Object HotkeyForm($hotkeyId)
$form.Toggled = { [System.Console]::WriteLine("TOGGLE") }
$form.Show()

$ok = [Win32]::RegisterHotKey($form.Handle, $hotkeyId, $modMask, $Key)
if (-not $ok) {
  Console.Error.WriteLine("Failed to register hotkey (might be in use by another app)")
  return
}

[System.Windows.Forms.Application]::Run($form)
