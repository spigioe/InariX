// InariX telepítő (InariX-Setup-<verzió>.exe) – a programcsomagot beágyazva tartalmazza (payload.zip erőforrás).
// Felhasználói telepítés (rendszergazdai jog nélkül) a %LOCALAPPDATA%\Programs\InariX mappába:
//  - választható mappa és asztali parancsikon
//  - ha van korábbi adat: tiszta telepítés (beállítások és adatok törlése) vagy megtartás
//  - Start menü parancsikon, bejegyzés a „Telepített alkalmazások” listába (eltávolító: InariX-Uninstall.exe)
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

static class Setup {
  static readonly Color BG = Color.FromArgb(14, 15, 20), PANEL = Color.FromArgb(24, 26, 34), FIELD = Color.FromArgb(36, 39, 50), RED = Color.FromArgb(255, 90, 90), TEXT = Color.FromArgb(244, 244, 245), MUTED = Color.FromArgb(161, 161, 170);
  const string APP = "InariX";
  static string DataDir { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), APP); } }

  [STAThread]
  // Csendes mód: InariX-Setup.exe --silent [--dir <mappa>] [--clean] [--no-desktop]
  static int Main(string[] args) {
    Application.EnableVisualStyles();
    if (args.Contains("--silent")) {
      var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", APP);
      for (int i = 0; i < args.Length - 1; i++) if (args[i] == "--dir") dir = args[i + 1];
      try { new SetupForm().InstallSilent(dir, args.Contains("--clean"), !args.Contains("--no-desktop")); return 0; }
      catch (Exception e) { Console.Error.WriteLine(e.Message); return 1; }
    }
    Application.Run(new SetupForm());
    return 0;
  }

  static Stream Payload() { return Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"); }

  static string ReadVersion() {
    try {
      using (var z = new ZipArchive(Payload(), ZipArchiveMode.Read)) {
        var e = z.Entries.FirstOrDefault(x => x.FullName.EndsWith("build.json", StringComparison.OrdinalIgnoreCase) && x.FullName.Count(c => c == '/') <= 1);
        if (e == null) return "";
        using (var r = new StreamReader(e.Open())) { var s = r.ReadToEnd(); var i = s.IndexOf("\"version\""); if (i < 0) return ""; var a = s.IndexOf('"', s.IndexOf(':', i) + 1); var b = s.IndexOf('"', a + 1); return s.Substring(a + 1, b - a - 1); }
      }
    } catch { return ""; }
  }

  class SetupForm : Form {
    readonly TextBox path; readonly CheckBox desktop, launch; readonly RadioButton clean, keep; readonly Button go, cancel, browse;
    readonly ProgressBar bar; readonly Label status; readonly string version;
    public SetupForm() {
      version = ReadVersion();
      Text = "InariX telepítő"; FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.CenterScreen; BackColor = PANEL; Size = new Size(560, 400);
      try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
      Controls.Add(new Panel { Dock = DockStyle.Top, Height = 5, BackColor = RED });
      Controls.Add(new Label { Text = "InariX telepítése", ForeColor = TEXT, Font = new Font("Segoe UI Semibold", 18f), AutoSize = false, Location = new Point(32, 26), Size = new Size(490, 40) });
      Controls.Add(new Label { Text = "Verzió: " + (version == "" ? "?" : version), ForeColor = MUTED, Font = new Font("Segoe UI", 9.5f), AutoSize = false, Location = new Point(34, 66), Size = new Size(490, 20) });

      Controls.Add(new Label { Text = "Telepítési mappa", ForeColor = MUTED, Font = new Font("Segoe UI", 9f), AutoSize = false, Location = new Point(34, 100), Size = new Size(490, 18) });
      path = new TextBox { Text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", APP), BackColor = FIELD, ForeColor = TEXT, BorderStyle = BorderStyle.FixedSingle, Font = new Font("Segoe UI", 10f), Location = new Point(34, 120), Size = new Size(380, 26) };
      browse = Btn("Tallózás…", Color.FromArgb(55, 58, 70), new Point(424, 118), new Size(102, 30));
      browse.Click += (s, e) => { using (var d = new FolderBrowserDialog { SelectedPath = path.Text }) if (d.ShowDialog(this) == DialogResult.OK) path.Text = Path.Combine(d.SelectedPath, APP); };
      desktop = Chk("Parancsikon az asztalon", new Point(34, 160), true);

      var hasData = Directory.Exists(DataDir);
      clean = new RadioButton { Text = "Tiszta telepítés – a korábbi beállítások és adatok törlése", ForeColor = TEXT, Font = new Font("Segoe UI", 9.5f), AutoSize = false, Location = new Point(34, 214), Size = new Size(490, 22), Checked = true, Visible = hasData };
      keep = new RadioButton { Text = "Korábbi beállítások megtartása (fiókok, kitűzések, statisztikák)", ForeColor = TEXT, Font = new Font("Segoe UI", 9.5f), AutoSize = false, Location = new Point(34, 238), Size = new Size(490, 22), Visible = hasData };
      if (hasData) Controls.Add(new Label { Text = "Korábbi InariX adatokat találtam ezen a gépen:", ForeColor = MUTED, Font = new Font("Segoe UI", 9f), AutoSize = false, Location = new Point(34, 192), Size = new Size(490, 18) });

      bar = new ProgressBar { Location = new Point(34, 280), Size = new Size(492, 8), Visible = false };
      status = new Label { Text = "", ForeColor = MUTED, Font = new Font("Segoe UI", 9.5f), AutoSize = false, Location = new Point(34, 294), Size = new Size(492, 22) };
      launch = Chk("Az InariX indítása most", new Point(34, 300), true); launch.Visible = false;

      go = Btn("Telepítés", RED, new Point(406, 336), new Size(120, 38));
      cancel = Btn("Mégse", Color.FromArgb(55, 58, 70), new Point(274, 336), new Size(120, 38));
      cancel.Click += (s, e) => Close();
      go.Click += (s, e) => { if (go.Text == "Befejezés") { Finish(); return; } Start(); };
      Controls.AddRange(new Control[] { path, browse, desktop, clean, keep, bar, status, launch, go, cancel });
      AcceptButton = go;
      // ablak mozgatása egérrel (keret nélküli ablak)
      MouseDown += (s, e) => { if (e.Button == MouseButtons.Left) { Capture = false; var m = Message.Create(Handle, 0xA1, new IntPtr(2), IntPtr.Zero); WndProc(ref m); } };
    }

    CheckBox Chk(string t, Point p, bool on) { var c = new CheckBox { Text = t, ForeColor = TEXT, Font = new Font("Segoe UI", 9.5f), AutoSize = false, Location = p, Size = new Size(490, 22), Checked = on }; return c; }
    static Button Btn(string t, Color c, Point p, Size s) { var b = new Button { Text = t, ForeColor = Color.White, BackColor = c, FlatStyle = FlatStyle.Flat, Font = new Font("Segoe UI Semibold", 10f), Size = s, Location = p }; b.FlatAppearance.BorderSize = 0; return b; }
    bool silent;
    void Set(string t, int pct) { if (silent) return; BeginInvoke((Action)(() => { status.Text = t; if (pct >= 0) bar.Value = Math.Min(100, pct); })); }
    public void InstallSilent(string dir, bool wipe, bool desk) { silent = true; target = dir; Install(dir, wipe, desk); }

    string target;
    void Start() {
      target = path.Text.Trim();
      if (target.Length < 4) { MessageBox.Show(this, "Adj meg egy telepítési mappát.", "InariX"); return; }
      bool wipe = clean.Visible && clean.Checked, desk = desktop.Checked;
      foreach (Control c in new Control[] { path, browse, desktop, clean, keep }) c.Enabled = false;
      go.Enabled = false; cancel.Enabled = false; bar.Visible = true;
      new Thread(() => {
        string err = null;
        try { Install(target, wipe, desk); } catch (Exception e) { err = e.Message; }
        BeginInvoke((Action)(() => {
          if (err != null) {
            status.ForeColor = Color.FromArgb(252, 165, 165); status.Text = "Hiba: " + err;
            cancel.Text = "Bezárás"; cancel.Enabled = true; return;
          }
          bar.Visible = false; status.Text = ""; launch.Visible = true;
          go.Text = "Befejezés"; go.Enabled = true;
          Controls.Add(new Label { Text = "✓  Az InariX telepítve: " + target, ForeColor = TEXT, Font = new Font("Segoe UI Semibold", 10f), AutoSize = false, Location = new Point(34, 272), Size = new Size(492, 22) });
        }));
      }) { IsBackground = true }.Start();
    }

    void Install(string dir, bool wipe, bool desk) {
      Set("InariX leállítása…", 2);
      var full = Path.GetFullPath(dir).TrimEnd('\\') + "\\";
      foreach (var pr in Process.GetProcesses()) {
        try { if (pr.MainModule.FileName.StartsWith(full, StringComparison.OrdinalIgnoreCase)) { pr.Kill(); pr.WaitForExit(4000); } } catch { }
      }
      if (wipe) {
        Set("Korábbi beállítások és adatok törlése…", 5);
        for (int i = 0; i < 10 && Directory.Exists(DataDir); i++) { try { Directory.Delete(DataDir, true); } catch { Thread.Sleep(500); } }
      }
      if (Directory.Exists(dir)) {
        Set("Régi programfájlok törlése…", 8);
        for (int i = 0; i < 20; i++) { try { Directory.Delete(dir, true); break; } catch { if (i == 19) throw new Exception("A telepítési mappa használatban van – zárd be az InariX-et."); Thread.Sleep(500); } }
      }
      Directory.CreateDirectory(dir);
      using (var z = new ZipArchive(Payload(), ZipArchiveMode.Read)) {
        var exe = z.Entries.FirstOrDefault(x => x.Name.Equals(APP + ".exe", StringComparison.OrdinalIgnoreCase));
        if (exe == null) throw new Exception("Sérült telepítő: hiányzik az " + APP + ".exe");
        var prefix = exe.FullName.Substring(0, exe.FullName.Length - exe.Name.Length);
        var files = z.Entries.Where(x => x.FullName.StartsWith(prefix) && x.Name.Length > 0).ToList();
        for (int i = 0; i < files.Count; i++) {
          var dst = Path.Combine(dir, files[i].FullName.Substring(prefix.Length).Replace('/', '\\'));
          Directory.CreateDirectory(Path.GetDirectoryName(dst));
          files[i].ExtractToFile(dst, true);
          if (i % 20 == 0) Set("Fájlok másolása… " + (i + 1) + " / " + files.Count, 10 + (int)(85.0 * i / files.Count));
        }
      }
      Set("Parancsikonok és bejegyzések…", 97);
      var target = Path.Combine(dir, APP + ".exe");
      Shortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), APP + ".lnk"), target, dir);
      var deskLnk = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), APP + ".lnk");
      if (desk) Shortcut(deskLnk, target, dir); else if (File.Exists(deskLnk)) File.Delete(deskLnk);
      using (var k = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\" + APP)) {
        k.SetValue("DisplayName", APP);
        k.SetValue("DisplayVersion", version);
        k.SetValue("Publisher", APP);
        k.SetValue("DisplayIcon", target);
        k.SetValue("InstallLocation", dir);
        k.SetValue("UninstallString", "\"" + Path.Combine(dir, "InariX-Uninstall.exe") + "\"");
        k.SetValue("NoModify", 1, RegistryValueKind.DWord);
        k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        try { k.SetValue("EstimatedSize", (int)(new DirectoryInfo(dir).GetFiles("*", SearchOption.AllDirectories).Sum(f => f.Length) / 1024), RegistryValueKind.DWord); } catch { }
      }
      Set("Kész", 100);
    }

    static void Shortcut(string lnk, string target, string dir) {
      var t = Type.GetTypeFromProgID("WScript.Shell");
      var shell = Activator.CreateInstance(t);
      var sc = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { lnk });
      var st = sc.GetType();
      st.InvokeMember("TargetPath", BindingFlags.SetProperty, null, sc, new object[] { target });
      st.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, sc, new object[] { dir });
      st.InvokeMember("IconLocation", BindingFlags.SetProperty, null, sc, new object[] { target + ",0" });
      st.InvokeMember("Description", BindingFlags.SetProperty, null, sc, new object[] { "InariX konzol" });
      st.InvokeMember("Save", BindingFlags.InvokeMethod, null, sc, null);
    }

    void Finish() {
      if (launch.Checked) { try { Process.Start(new ProcessStartInfo(Path.Combine(target, APP + ".exe")) { WorkingDirectory = target }); } catch { } }
      Close();
    }
  }
}
