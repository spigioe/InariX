// InariX frissítéskezelő (InariX-Updater.exe)
// Folyamat:
//  1. az InariX elindítja (ideiglenes mappából, hogy a telepítési mappát szabadon felülírhassa): --pipe <név>
//  2. egy named pipe-on várakozik; az InariX csatlakozik (így tudja, hogy fut), majd elküldi:
//       GO|<zip útvonal>|<telepítési mappa>|<exe neve>|<InariX pid>|<új verzió>
//  3. visszaigazol (OK), leállítja az InariX-et, kicsomagolja és telepíti a frissítést
//  4. siker esetén magától újraindítja az InariX-et (az InariX maga jelzi az új verziót);
//     hiba esetén ablakban jelzi, és az OK gombra indítja újra az InariX-et
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.IO.Pipes;
using System.Linq;
using System.Threading;
using System.Windows.Forms;

static class Updater {
  static readonly Color BG = Color.FromArgb(14, 15, 20), PANEL = Color.FromArgb(24, 26, 34), RED = Color.FromArgb(255, 90, 90), TEXT = Color.FromArgb(244, 244, 245), MUTED = Color.FromArgb(161, 161, 170);
  static string logFile = Path.Combine(Path.GetTempPath(), "InariX-update.log");
  static void Log(string m) { try { File.AppendAllText(logFile, DateTime.Now.ToString("HH:mm:ss") + " " + m + Environment.NewLine); } catch { } }

  [STAThread]
  static int Main(string[] args) {
    Application.EnableVisualStyles();
    string pipe = null;
    for (int i = 0; i < args.Length - 1; i++) if (args[i] == "--pipe") pipe = args[i + 1];
    if (string.IsNullOrEmpty(pipe)) { Result(false, "Az InariX frissítő csak az InariX-ből indítható.", null, null); return 2; }
    Log("indul, pipe=" + pipe);

    var status = new StatusForm();
    string zip = null, target = null, exe = null, build = null; int pid = 0; bool ok = false; string error = null;
    var worker = new Thread(() => {
      try {
        // 2. várakozás az InariX üzenetére
        using (var server = new NamedPipeServerStream(pipe, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous)) {
          var wait = server.BeginWaitForConnection(null, null);
          if (!wait.AsyncWaitHandle.WaitOne(TimeSpan.FromSeconds(60))) throw new Exception("Az InariX nem jelentkezett (időtúllépés).");
          server.EndWaitForConnection(wait);
          var reader = new StreamReader(server); var writer = new StreamWriter(server) { AutoFlush = true };
          var line = reader.ReadLine() ?? "";
          var p = line.Split('|');
          if (p.Length < 6 || p[0] != "GO") throw new Exception("Érvénytelen üzenet az InariX-től.");
          zip = p[1]; target = p[2]; exe = p[3]; pid = int.Parse(p[4]); build = p[5];
          writer.WriteLine("OK");
          Log("GO: " + build + " → " + target);
        }
        // 3. InariX leállítása
        status.Set("InariX leállítása…");
        StopInariX(pid, target);
        // kicsomagolás
        status.Set("Frissítés kicsomagolása…");
        var tmp = Path.Combine(Path.GetTempPath(), "InariX-update-" + Guid.NewGuid().ToString("N"));
        ZipFile.ExtractToDirectory(zip, tmp);
        var src = Directory.GetFiles(tmp, exe, SearchOption.AllDirectories).Select(Path.GetDirectoryName).FirstOrDefault();
        if (src == null) throw new Exception("A csomagban nincs " + exe);
        // telepítés
        status.Set("Fájlok frissítése…");
        Install(src, target);
        try { Directory.Delete(tmp, true); } catch { }
        try { File.Delete(zip); } catch { }
        ok = true;
        Log("kész");
      } catch (Exception e) { error = e.Message; Log("HIBA: " + e); }
      // 4. siker: azonnali újraindítás, nincs mit leokézni
      if (ok) {
        status.Set("Kész – az InariX újraindul…");
        Launch(target, exe);
        Thread.Sleep(900);
        try { status.Invoke((Action)(() => status.Close())); } catch { }
        return;
      }
      // hiba: eredmény ablak – az állapotablak üzenetkezelőjén belül, modálisan; az OK után minden bezárul
      var msg = ok ? "Az InariX frissítése sikerült." + (build != null ? "\nÚj verzió: " + build : "") : "A frissítés nem sikerült:\n" + error + "\n\nRészletek: " + logFile;
      status.Invoke((Action)(() => { status.Hide(); Result(ok, msg, target, exe); status.Close(); }));
    }) { IsBackground = true };
    status.Shown += (s, e) => worker.Start();
    Application.Run(status);
    return ok ? 0 : 1;
  }

  static void StopInariX(int pid, string target) {
    try { var pr = Process.GetProcessById(pid); pr.Kill(); pr.WaitForExit(8000); } catch { }
    // a maradék InariX folyamatok (GPU, renderer, segédek) a telepítési mappából
    var full = Path.GetFullPath(target).TrimEnd('\\') + "\\";
    for (int round = 0; round < 3; round++) {
      foreach (var pr in Process.GetProcesses()) {
        try { var f = pr.MainModule.FileName; if (f.StartsWith(full, StringComparison.OrdinalIgnoreCase)) { pr.Kill(); pr.WaitForExit(3000); } } catch { }
      }
      Thread.Sleep(500);
    }
  }

  static void Install(string src, string target) {
    var files = Directory.GetFiles(src, "*", SearchOption.AllDirectories);
    var keep = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
    foreach (var f in files) {
      var rel = f.Substring(src.Length).TrimStart('\\');
      keep.Add(rel);
      var dst = Path.Combine(target, rel);
      Directory.CreateDirectory(Path.GetDirectoryName(dst));
      for (int i = 0; ; i++) {
        try { File.Copy(f, dst, true); break; }
        catch (IOException) { if (i >= 20) throw; Thread.Sleep(500); }
        catch (UnauthorizedAccessException) { if (i >= 20) throw; Thread.Sleep(500); }
      }
    }
    // a régi verzió már nem használt fájljai
    foreach (var f in Directory.GetFiles(target, "*", SearchOption.AllDirectories)) {
      var rel = f.Substring(target.TrimEnd('\\').Length).TrimStart('\\');
      if (!keep.Contains(rel)) { try { File.Delete(f); } catch { } }
    }
  }

  static void Launch(string target, string exe) {
    try { if (target != null && exe != null) { var p = Path.Combine(target, exe); if (File.Exists(p)) Process.Start(new ProcessStartInfo(p) { WorkingDirectory = target }); Log("InariX újraindítva"); } } catch (Exception ex) { Log("indítás: " + ex.Message); }
  }

  static void Result(bool ok, string msg, string target, string exe) {
    var f = new Form { Text = "InariX frissítés", FormBorderStyle = FormBorderStyle.None, StartPosition = FormStartPosition.CenterScreen, BackColor = PANEL, Size = new Size(460, 230), TopMost = true, ShowInTaskbar = true };
    var bar = new Panel { Dock = DockStyle.Top, Height = 5, BackColor = ok ? RED : Color.FromArgb(220, 38, 38) };
    var title = new Label { Text = ok ? "✓  Frissítés kész" : "✕  A frissítés nem sikerült", ForeColor = TEXT, Font = new Font("Segoe UI Semibold", 15f), AutoSize = false, Location = new Point(28, 26), Size = new Size(404, 34) };
    var body = new Label { Text = msg, ForeColor = MUTED, Font = new Font("Segoe UI", 10f), AutoSize = false, Location = new Point(28, 66), Size = new Size(404, 96) };
    var btn = new Button { Text = "OK", ForeColor = Color.White, BackColor = RED, FlatStyle = FlatStyle.Flat, Font = new Font("Segoe UI Semibold", 10.5f), Size = new Size(120, 38), Location = new Point(312, 172) };
    btn.FlatAppearance.BorderSize = 0;
    btn.Click += (s, e) => {
      // OK: előbb elindítjuk az InariX-et, utána bezárul a frissítő
      Launch(target, exe);
      f.Close();
    };
    f.Controls.AddRange(new Control[] { bar, title, body, btn });
    f.AcceptButton = btn;
    f.ShowDialog();
  }

  // Kis állapotablak a telepítés közben
  class StatusForm : Form {
    readonly Label label;
    public StatusForm() {
      Text = "InariX frissítés"; FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.CenterScreen; BackColor = BG; Size = new Size(420, 120); TopMost = true;
      var title = new Label { Text = "InariX frissítése", ForeColor = TEXT, Font = new Font("Segoe UI Semibold", 13f), AutoSize = false, Location = new Point(24, 18), Size = new Size(372, 28) };
      label = new Label { Text = "Várakozás az InariX-re…", ForeColor = MUTED, Font = new Font("Segoe UI", 10f), AutoSize = false, Location = new Point(24, 50), Size = new Size(372, 22) };
      var pb = new ProgressBar { Style = ProgressBarStyle.Marquee, MarqueeAnimationSpeed = 25, Location = new Point(24, 82), Size = new Size(372, 8) };
      Controls.AddRange(new Control[] { title, label, pb });
    }
    public void Set(string t) { try { Invoke((Action)(() => label.Text = t)); } catch { } }
  }
}
