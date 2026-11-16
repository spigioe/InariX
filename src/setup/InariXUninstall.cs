// InariX eltávolító (InariX-Uninstall.exe) – a telepítési mappában, és a Windows „Telepített alkalmazások” listájából is indítható.
// 1. megerősítés (opcionálisan a beállítások és adatok törlése is)
// 2. saját magát az ideiglenes mappába másolja és onnan fut tovább (így a telepítési mappa törölhető)
// 3. rendszerbeállítások visszaállítása (InariX.exe --cleanup: fedél, zárolás, automatikus indítás),
//    folyamatok leállítása, fájlok, parancsikonok, registry bejegyzések törlése, igény szerint az adatoké is
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

static class Uninstall {
  static readonly Color BG = Color.FromArgb(14, 15, 20), PANEL = Color.FromArgb(24, 26, 34), RED = Color.FromArgb(255, 90, 90), TEXT = Color.FromArgb(244, 244, 245), MUTED = Color.FromArgb(161, 161, 170);
  const string APP = "InariX";
  static string DataDir { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), APP); } }

  [STAThread]
  static int Main(string[] args) {
    Application.EnableVisualStyles();
    string runDir = null; bool delData = false, silent = false;
    for (int i = 0; i < args.Length; i++) {
      if (args[i] == "--run" && i + 1 < args.Length) runDir = args[i + 1];
      if (args[i] == "--data") delData = true;
      if (args[i] == "--silent") silent = true;
    }
    // csendes mód: InariX-Uninstall.exe --run <mappa> --silent [--data]  (az ideiglenes mappából futtatva)
    if (silent && runDir != null) { try { Run(runDir, delData, null); return 0; } catch (Exception e) { Console.Error.WriteLine(e.Message); return 1; } }
    if (runDir == null) {
      // 1. megerősítés
      var dir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
      bool data;
      if (!Confirm(out data)) return 0;
      var tmp = Path.Combine(Path.GetTempPath(), "InariX-Uninstall-" + Guid.NewGuid().ToString("N").Substring(0, 8) + ".exe");
      File.Copy(Application.ExecutablePath, tmp, true);
      Process.Start(new ProcessStartInfo(tmp, "--run \"" + dir + "\"" + (data ? " --data" : "")) { UseShellExecute = false });
      return 0;
    }
    // 2-3. eltávolítás az ideiglenes mappából
    string error = null;
    var status = new Status();
    var worker = new Thread(() => {
      try { Run(runDir, delData, status); } catch (Exception e) { error = e.Message; }
      status.Invoke((Action)(() => {
        status.Hide();
        Message(error == null ? "✓  InariX eltávolítva" : "✕  Az eltávolítás nem teljes",
          error == null ? "Az InariX eltávolítása befejeződött." + (delData ? "\nA beállítások és adatok is törölve." : "\nA beállítások megmaradtak: " + DataDir) : error, error == null);
        status.Close();
      }));
    }) { IsBackground = true };
    status.Shown += (s, e) => worker.Start();
    Application.Run(status);
    SelfDelete();
    return error == null ? 0 : 1;
  }

  static void Run(string dir, bool delData, Status st) {
    if (st == null) st = Status.Null;
    var exe = Path.Combine(dir, APP + ".exe");
    // rendszerbeállítások visszaállítása (fedél művelet, zárolás, automatikus indítás, parancsikonok)
    if (File.Exists(exe)) {
      st.Set("Rendszerbeállítások visszaállítása…");
      try { var p = Process.Start(new ProcessStartInfo(exe, "--cleanup") { UseShellExecute = false }); p.WaitForExit(20000); } catch { }
    }
    st.Set("InariX leállítása…");
    var full = Path.GetFullPath(dir).TrimEnd('\\') + "\\";
    for (int round = 0; round < 3; round++) {
      foreach (var pr in Process.GetProcesses()) {
        try { if (pr.MainModule.FileName.StartsWith(full, StringComparison.OrdinalIgnoreCase)) { pr.Kill(); pr.WaitForExit(3000); } } catch { }
      }
      Thread.Sleep(400);
    }
    st.Set("Fájlok törlése…");
    for (int i = 0; i < 20 && Directory.Exists(dir); i++) { try { Directory.Delete(dir, true); } catch { Thread.Sleep(500); } }
    if (Directory.Exists(dir)) throw new Exception("A telepítési mappa nem törölhető teljesen: " + dir);
    st.Set("Parancsikonok és bejegyzések törlése…");
    foreach (var lnk in new[] {
      Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), APP + ".lnk"),
      Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), APP + ".lnk") }) {
      try { if (File.Exists(lnk)) File.Delete(lnk); } catch { }
    }
    // automatikus indítás: minden bejegyzés, ami a telepítési mappára mutat
    using (var run = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true)) {
      if (run != null) foreach (var n in run.GetValueNames()) { var v = Convert.ToString(run.GetValue(n)); if (v.IndexOf(full, StringComparison.OrdinalIgnoreCase) >= 0 || v.IndexOf(full.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase) >= 0) run.DeleteValue(n, false); }
    }
    try { Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\" + APP, false); } catch { }
    if (delData) {
      st.Set("Beállítások és adatok törlése…");
      for (int i = 0; i < 10 && Directory.Exists(DataDir); i++) { try { Directory.Delete(DataDir, true); } catch { Thread.Sleep(500); } }
    }
  }

  static bool Confirm(out bool delData) {
    var f = Dialog("InariX eltávolítása", "Az InariX és a parancsikonjai törlődnek, a módosított rendszerbeállítások (fedél, zárolás, automatikus indítás) visszaállnak.");
    var cb = new CheckBox { Text = "A beállítások és adatok törlése is (fiókok, kitűzések, statisztikák)", ForeColor = TEXT, Font = new Font("Segoe UI", 9.5f), AutoSize = false, Location = new Point(28, 118), Size = new Size(420, 24), FlatStyle = FlatStyle.Flat };
    var ok = Btn("Eltávolítás", RED, new Point(328, 168)); var cancel = Btn("Mégse", Color.FromArgb(55, 58, 70), new Point(196, 168));
    ok.DialogResult = DialogResult.OK; cancel.DialogResult = DialogResult.Cancel;
    f.Controls.AddRange(new Control[] { cb, ok, cancel });
    f.AcceptButton = ok; f.CancelButton = cancel;
    var r = f.ShowDialog();
    delData = cb.Checked;
    return r == DialogResult.OK;
  }

  static void Message(string title, string body, bool ok) {
    var f = Dialog(title, body, ok);
    var b = Btn("OK", RED, new Point(328, 168)); b.DialogResult = DialogResult.OK;
    f.Controls.Add(b); f.AcceptButton = b;
    f.ShowDialog();
  }

  static Form Dialog(string title, string body, bool ok = true) {
    var f = new Form { Text = "InariX", FormBorderStyle = FormBorderStyle.None, StartPosition = FormStartPosition.CenterScreen, BackColor = PANEL, Size = new Size(476, 226), TopMost = true };
    f.Controls.Add(new Panel { Dock = DockStyle.Top, Height = 5, BackColor = ok ? RED : Color.FromArgb(220, 38, 38) });
    f.Controls.Add(new Label { Text = title, ForeColor = TEXT, Font = new Font("Segoe UI Semibold", 14f), AutoSize = false, Location = new Point(28, 24), Size = new Size(420, 32) });
    f.Controls.Add(new Label { Text = body, ForeColor = MUTED, Font = new Font("Segoe UI", 9.5f), AutoSize = false, Location = new Point(28, 62), Size = new Size(420, 54) });
    return f;
  }
  static Button Btn(string t, Color c, Point p) {
    var b = new Button { Text = t, ForeColor = Color.White, BackColor = c, FlatStyle = FlatStyle.Flat, Font = new Font("Segoe UI Semibold", 10f), Size = new Size(120, 36), Location = p };
    b.FlatAppearance.BorderSize = 0;
    return b;
  }

  // az ideiglenes példány a kilépés után törli magát
  static void SelfDelete() {
    try { Process.Start(new ProcessStartInfo("cmd.exe", "/c ping 127.0.0.1 -n 3 > nul & del \"" + Application.ExecutablePath + "\"") { CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden, UseShellExecute = false }); } catch { }
  }

  class Status : Form {
    readonly Label label;
    public Status() {
      Text = "InariX eltávolítása"; FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.CenterScreen; BackColor = BG; Size = new Size(420, 120); TopMost = true;
      Controls.Add(new Label { Text = "InariX eltávolítása", ForeColor = TEXT, Font = new Font("Segoe UI Semibold", 13f), AutoSize = false, Location = new Point(24, 18), Size = new Size(372, 28) });
      label = new Label { Text = "Előkészítés…", ForeColor = MUTED, Font = new Font("Segoe UI", 10f), AutoSize = false, Location = new Point(24, 50), Size = new Size(372, 22) };
      Controls.Add(label);
      Controls.Add(new ProgressBar { Style = ProgressBarStyle.Marquee, MarqueeAnimationSpeed = 25, Location = new Point(24, 82), Size = new Size(372, 8) });
    }
    public static readonly Status Null = new Status();
    public void Set(string t) { if (this == Null) return; try { Invoke((Action)(() => label.Text = t)); } catch { } }
  }
}
