# InariX rendszerfigyelo: fedel allapot, kulso kijelzo, kijelzo topologia, alvas.
# Kimenet (stdout, soronkent):  READY | LID open|closed | DISPLAY ext=N int=N extActive=N intActive=N
# Bemenet (stdin, soronkent):   QUERY | TOPO internal|external|clone|extend | SLEEP | MONITOROFF | EXIT
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace InariX {
  // --- Core Audio: rendszer hangerő ---
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int NotImpl1();
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
  }
  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr p);
    int UnregisterControlChangeNotify(IntPtr p);
    int GetChannelCount(out int c);
    int SetMasterVolumeLevel(float db, ref Guid ctx);
    int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
    int GetMasterVolumeLevel(out float db);
    int GetMasterVolumeLevelScalar(out float level);
    int SetChannelVolumeLevel(uint ch, float db, ref Guid ctx);
    int SetChannelVolumeLevelScalar(uint ch, float level, ref Guid ctx);
    int GetChannelVolumeLevel(uint ch, out float db);
    int GetChannelVolumeLevelScalar(uint ch, out float level);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }
  static class Audio {
    static IAudioEndpointVolume Ep() {
      var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
      IMMDevice dev; en.GetDefaultAudioEndpoint(0, 1, out dev);
      Guid iid = typeof(IAudioEndpointVolume).GUID; object o;
      dev.Activate(ref iid, 23, IntPtr.Zero, out o);
      return (IAudioEndpointVolume)o;
    }
    public static string Get() { var e = Ep(); float v; bool m; e.GetMasterVolumeLevelScalar(out v); e.GetMute(out m); return "VOL " + (int)Math.Round(v * 100) + " " + (m ? 1 : 0); }
    public static void Set(int pct) { Guid g = Guid.Empty; var e = Ep(); e.SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, pct)) / 100f, ref g); if (pct > 0) e.SetMute(false, ref g); }
    public static void Mute(bool m) { Guid g = Guid.Empty; Ep().SetMute(m, ref g); }
  }

  public class SysWatch : Form {
    [DllImport("user32.dll")] static extern IntPtr RegisterPowerSettingNotification(IntPtr h, ref Guid g, int flags);
    [DllImport("user32.dll")] static extern int GetDisplayConfigBufferSizes(uint flags, out uint np, out uint nm);
    [DllImport("user32.dll")] static extern int QueryDisplayConfig(uint flags, ref uint np, IntPtr paths, ref uint nm, IntPtr modes, IntPtr topo);
    [DllImport("user32.dll")] static extern int SetDisplayConfig(uint np, IntPtr paths, uint nm, IntPtr modes, uint flags);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, int msg, IntPtr w, IntPtr l);
    [DllImport("powrprof.dll")] static extern bool SetSuspendState(bool hibernate, bool force, bool disableWake);

    static Guid LID = new Guid("BA3E0F4D-B817-4094-A2D1-D56379E6A0F3");
    string last = "";
    System.Windows.Forms.Timer poll, debounce;

    public static void Run() {
      var f = new SysWatch();
      IntPtr h = f.Handle;
      var t = new Thread(() => {
        string line;
        while ((line = Console.In.ReadLine()) != null) {
          string l = line.Trim();
          try { f.BeginInvoke(new Action(() => f.Command(l))); } catch { }
          if (l == "EXIT") break;
        }
        try { f.BeginInvoke(new Action(() => Application.Exit())); } catch { }
      });
      t.IsBackground = true;
      t.Start();
      Application.Run(f);
    }

    public SysWatch() {
      ShowInTaskbar = false;
      FormBorderStyle = FormBorderStyle.None;
      Opacity = 0;
      poll = new System.Windows.Forms.Timer { Interval = 3000 };
      poll.Tick += (s, e) => Emit(false);
      debounce = new System.Windows.Forms.Timer { Interval = 900 };
      debounce.Tick += (s, e) => { debounce.Stop(); Emit(false); };
    }

    protected override void SetVisibleCore(bool v) { base.SetVisibleCore(false); }

    protected override void OnHandleCreated(EventArgs e) {
      base.OnHandleCreated(e);
      RegisterPowerSettingNotification(Handle, ref LID, 0);
      Out("READY");
      Emit(true);
      poll.Start();
    }

    static void Out(string s) { Console.WriteLine(s); Console.Out.Flush(); }

    void Emit(bool force) {
      string d = QueryDisplays();
      if (force || d != last) { last = d; Out(d); }
    }

    static bool IsInternal(uint tech) { return tech == 6 || tech == 11 || tech == 13 || tech == 0x80000000; }

    public static string QueryDisplays() {
      for (int attempt = 0; attempt < 3; attempt++) {
        uint np, nm;
        if (GetDisplayConfigBufferSizes(1, out np, out nm) != 0) return "DISPLAY error";
        IntPtr p = Marshal.AllocHGlobal((int)(np * 72 + 72)), m = Marshal.AllocHGlobal((int)(nm * 64 + 64));
        try {
          int r = QueryDisplayConfig(1, ref np, p, ref nm, m, IntPtr.Zero);
          if (r == 122) continue;
          if (r != 0) return "DISPLAY error";
          var ext = new HashSet<string>(); var intl = new HashSet<string>();
          var extA = new HashSet<string>(); var intA = new HashSet<string>();
          for (int i = 0; i < np; i++) {
            int b = i * 72;
            uint lo = (uint)Marshal.ReadInt32(p, b + 20);
            int hi = Marshal.ReadInt32(p, b + 24);
            uint id = (uint)Marshal.ReadInt32(p, b + 28);
            uint tech = (uint)Marshal.ReadInt32(p, b + 36);
            int avail = Marshal.ReadInt32(p, b + 60);
            uint flags = (uint)Marshal.ReadInt32(p, b + 68);
            if (avail == 0) continue;
            string key = lo + ":" + hi + ":" + id;
            bool active = (flags & 1) != 0;
            if (IsInternal(tech)) { intl.Add(key); if (active) intA.Add(key); }
            else { ext.Add(key); if (active) extA.Add(key); }
          }
          return "DISPLAY ext=" + ext.Count + " int=" + intl.Count + " extActive=" + extA.Count + " intActive=" + intA.Count;
        } finally { Marshal.FreeHGlobal(p); Marshal.FreeHGlobal(m); }
      }
      return "DISPLAY error";
    }

    void Command(string c) {
      try {
        if (c == "QUERY") Emit(true);
        else if (c.StartsWith("TOPO ")) {
          uint t = 0;
          switch (c.Substring(5)) { case "internal": t = 1; break; case "clone": t = 2; break; case "extend": t = 4; break; case "external": t = 8; break; }
          if (t != 0) { int r = SetDisplayConfig(0, IntPtr.Zero, 0, IntPtr.Zero, t | 0x80); Out("TOPO " + c.Substring(5) + " " + r); }
          debounce.Stop(); debounce.Start();
        }
        else if (c == "SLEEP") { Out("SLEEPING"); if (!SetSuspendState(false, false, false)) MonitorOff(); }
        else if (c == "MONITOROFF") MonitorOff();
        else if (c == "VOLGET") Out(Audio.Get());
        else if (c.StartsWith("VOLSET ")) { Audio.Set(int.Parse(c.Substring(7))); Out(Audio.Get()); }
        else if (c.StartsWith("VOLMUTE ")) { Audio.Mute(c.Substring(8) == "1"); Out(Audio.Get()); }
      } catch (Exception ex) { Out("ERROR " + ex.Message.Replace("\n", " ")); }
    }

    static void MonitorOff() { PostMessage((IntPtr)0xFFFF, 0x0112, (IntPtr)0xF170, (IntPtr)2); }

    protected override void WndProc(ref Message m) {
      if (m.Msg == 0x218 && m.WParam.ToInt64() == 0x8013) {
        Guid g = (Guid)Marshal.PtrToStructure(m.LParam, typeof(Guid));
        if (g == LID) Out("LID " + (Marshal.ReadInt32(m.LParam, 20) == 0 ? "closed" : "open"));
      } else if (m.Msg == 0x7E || m.Msg == 0x219) {
        debounce.Stop(); debounce.Start();
      }
      base.WndProc(ref m);
    }
  }
}
'@
[InariX.SysWatch]::Run()
