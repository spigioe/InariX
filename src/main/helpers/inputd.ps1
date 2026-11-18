# InariX bemeneti segéd (host oldal): a streamelt kliens bemenetét játssza vissza.
#  - billentyűzet/egér: SendInput (scancode, így a játékok is fogadják)
#  - kontroller: virtuális Xbox 360 kontroller a ViGEmBus driveren keresztül (közvetlen IOCTL, külső DLL nélkül)
# Parancsok (stdin, soronként):
#   MA x y        abszolút egér (0..65535, elsődleges monitor)
#   MR dx dy      relatív egér
#   MB n d        egérgomb n=0 bal,1 közép,2 jobb,3 X1,4 X2 · d=1 le, 0 fel
#   MW dy dx      görgő (dy: függőleges, dx: vízszintes, 120 egység = 1 lépés)
#   K sc ext d    billentyű scancode (hex nélkül, decimális), ext=1 kiterjesztett, d=1 le
#   U cp          Unicode karakter (UTF-16 kódegység) leütése
#   P i btn lt rt lx ly rx ry   kontroller állapot (XUSB formátum)
#   PX i          kontroller leválasztása
#   WINS [mappa]  látható felső szintű ablakok (fizikai pixelben, gyártóval) + hány folyamat fut a mappából
#   COMP mappa    a mappa (és almappái, 2 szint) .exe fájljainak gyártói
#   PING | VIGEM | EXIT
# Kimenet: READY vigem=0|1 · PONG · VIGEM ok|hiba · ERROR ...
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace InariX {
  public static class Input {
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion u; }
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("gdi32.dll")] static extern int D3DKMTSetProcessSchedulingPriorityClass(IntPtr h, int prio);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    // GPU ütemezési prioritás (mint a Sunshine): teljes GPU terhelésnél is kapjon időt a képernyőrögzítés.
    // 4 = HIGH, 5 = REALTIME (ez utóbbihoz rendszergazdai jog kell). Visszatérés: NTSTATUS (0 = siker)
    public static int GpuPriority(int pid, int prio) {
      IntPtr h = OpenProcess(0x0200 | 0x0400, false, pid);
      if (h == IntPtr.Zero) return -1;
      try { return D3DKMTSetProcessSchedulingPriorityClass(h, prio); } finally { CloseHandle(h); }
    }

    static void Send(INPUT i) { SendInput(1, new[] { i }, Marshal.SizeOf(typeof(INPUT))); }
    static INPUT Mouse(int dx, int dy, uint data, uint flags) { var i = new INPUT { type = 0 }; i.u.mi = new MOUSEINPUT { dx = dx, dy = dy, mouseData = data, dwFlags = flags }; return i; }

    public static void MoveAbs(int x, int y) { Send(Mouse(x, y, 0, 0x0001 | 0x8000)); }
    public static void MoveRel(int dx, int dy) { Send(Mouse(dx, dy, 0, 0x0001)); }
    public static void Button(int b, bool down) {
      uint f; uint data = 0;
      switch (b) {
        case 0: f = down ? 0x0002u : 0x0004u; break;
        case 1: f = down ? 0x0020u : 0x0040u; break;
        case 2: f = down ? 0x0008u : 0x0010u; break;
        case 3: f = down ? 0x0080u : 0x0100u; data = 1; break;
        case 4: f = down ? 0x0080u : 0x0100u; data = 2; break;
        default: return;
      }
      Send(Mouse(0, 0, data, f));
    }
    public static void Wheel(int dy, int dx) {
      if (dy != 0) Send(Mouse(0, 0, (uint)dy, 0x0800));
      if (dx != 0) Send(Mouse(0, 0, (uint)dx, 0x1000));
    }
    // Unicode karakter (ékezetes betűk is, billentyűzetkiosztástól függetlenül)
    public static void Unicode(int cp) {
      var d = new INPUT { type = 1 }; d.u.ki = new KEYBDINPUT { wScan = (ushort)cp, dwFlags = 0x0004 };
      var u = new INPUT { type = 1 }; u.u.ki = new KEYBDINPUT { wScan = (ushort)cp, dwFlags = 0x0004 | 0x0002 };
      Send(d); Send(u);
    }
    public static void Key(int scan, bool ext, bool down) {
      var i = new INPUT { type = 1 };
      uint f = 0x0008; // KEYEVENTF_SCANCODE
      if (ext) f |= 0x0001;
      if (!down) f |= 0x0002;
      i.u.ki = new KEYBDINPUT { wScan = (ushort)scan, dwFlags = f };
      Send(i);
    }
  }

  // --- ViGEmBus: virtuális Xbox 360 kontroller (a ViGEmClient IOCTL protokollja alapján) ---
  public static class Vigem {
    static Guid BUS = new Guid("96E42B22-F5E9-42F8-B043-ED0F932F014F");
    const uint IOCTL_PLUGIN = 0x2AA004, IOCTL_UNPLUG = 0x2AA008, IOCTL_CHECK_VERSION = 0x2AA00C, IOCTL_WAIT_READY = 0x2AA010, IOCTL_XUSB_SUBMIT = 0x2AA808;
    // a játék rezgés / LED kérései: függőben marad, amíg a játék új rezgést nem kér (ViGEmClient: vigem_target_x360_register_notification)
    const uint IOCTL_XUSB_NOTIFY = 0x2AE804;
    public static readonly object OutLock = new object();
    static Dictionary<int, System.Threading.Thread> notifiers = new Dictionary<int, System.Threading.Thread>();
    static void StartNotify(int i, uint serial) {
      var th = new System.Threading.Thread(() => {
        int lastL = -1, lastS = -1;
        while (true) {
          uint cur;
          if (!serials.TryGetValue(i, out cur) || cur != serial) return;
          // XUSB_REQUEST_NOTIFICATION { ULONG Size=12; ULONG SerialNo; UCHAR LargeMotor; UCHAR SmallMotor; UCHAR LedNumber; }
          var b = new byte[12];
          BitConverter.GetBytes((uint)12).CopyTo(b, 0);
          BitConverter.GetBytes(serial).CopyTo(b, 4);
          if (!Ioctl(IOCTL_XUSB_NOTIFY, b, 0xFFFFFFFF)) { System.Threading.Thread.Sleep(200); continue; }
          int L = b[8], S = b[9];
          if (L == lastL && S == lastS) continue;
          lastL = L; lastS = S;
          lock (OutLock) { Console.WriteLine("RUMBLE " + i + " " + L + " " + S); Console.Out.Flush(); }
        }
      }) { IsBackground = true };
      notifiers[i] = th;
      th.Start();
    }

    [StructLayout(LayoutKind.Sequential)] struct SP_DEVICE_INTERFACE_DATA { public uint cbSize; public Guid InterfaceClassGuid; public uint Flags; public IntPtr Reserved; }
    [DllImport("setupapi.dll", SetLastError = true)] static extern IntPtr SetupDiGetClassDevs(ref Guid g, IntPtr en, IntPtr hwnd, uint flags);
    [DllImport("setupapi.dll", SetLastError = true)] static extern bool SetupDiEnumDeviceInterfaces(IntPtr set, IntPtr di, ref Guid g, uint idx, ref SP_DEVICE_INTERFACE_DATA d);
    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr set, ref SP_DEVICE_INTERFACE_DATA d, IntPtr detail, uint size, out uint req, IntPtr di);
    [DllImport("setupapi.dll")] static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool DeviceIoControl(SafeFileHandle h, uint code, IntPtr inBuf, int inSize, IntPtr outBuf, int outSize, out int ret, IntPtr ov);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetOverlappedResult(SafeFileHandle h, IntPtr ov, out int ret, bool wait);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateEvent(IntPtr a, bool manual, bool init, string name);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint ms);
    [DllImport("kernel32.dll")] static extern bool CancelIoEx(SafeFileHandle h, IntPtr ov);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

    static SafeFileHandle bus;
    public static bool Debug = false;
    static Dictionary<int, uint> serials = new Dictionary<int, uint>();
    public static string LastError = "";

    static byte[] U32s(params uint[] v) { var b = new byte[v.Length * 4]; for (int i = 0; i < v.Length; i++) BitConverter.GetBytes(v[i]).CopyTo(b, i * 4); return b; }
    public static int LastWin32 = 0;
    // Overlapped (aszinkron) IOCTL időkorláttal – a ViGEmBus egyes kérései függőben maradnak, ezért nem blokkolhatunk
    static bool Ioctl(uint code, byte[] buf, uint timeoutMs = 2000) {
      int ovSize = IntPtr.Size == 8 ? 32 : 20, evOff = IntPtr.Size == 8 ? 24 : 16;
      IntPtr mem = Marshal.AllocHGlobal(buf.Length), ov = Marshal.AllocHGlobal(ovSize);
      IntPtr ev = CreateEvent(IntPtr.Zero, true, false, null);
      try {
        Marshal.Copy(buf, 0, mem, buf.Length);
        for (int k = 0; k < ovSize; k++) Marshal.WriteByte(ov, k, 0);
        Marshal.WriteIntPtr(ov, evOff, ev);
        int ret;
        bool ok = DeviceIoControl(bus, code, mem, buf.Length, mem, buf.Length, out ret, ov);
        if (!ok) {
          int e = Marshal.GetLastWin32Error();
          if (e == 997) { // ERROR_IO_PENDING
            if (WaitForSingleObject(ev, timeoutMs) == 0) {
              ok = GetOverlappedResult(bus, ov, out ret, false);
              if (!ok) LastWin32 = Marshal.GetLastWin32Error();
            } else {
              CancelIoEx(bus, ov);
              GetOverlappedResult(bus, ov, out ret, true); // megvárjuk a megszakítást, csak utána szabadítunk fel
              LastWin32 = 1460; // ERROR_TIMEOUT
            }
          } else LastWin32 = e;
        }
        if (ok) Marshal.Copy(mem, buf, 0, buf.Length);
        return ok;
      } finally { CloseHandle(ev); Marshal.FreeHGlobal(ov); Marshal.FreeHGlobal(mem); }
    }

    public static bool Open() {
      if (bus != null && !bus.IsInvalid) return true;
      IntPtr set = SetupDiGetClassDevs(ref BUS, IntPtr.Zero, IntPtr.Zero, 0x02 | 0x10); // DIGCF_PRESENT | DIGCF_DEVICEINTERFACE
      if (set == new IntPtr(-1)) { LastError = "SetupDi hiba"; return false; }
      try {
        var d = new SP_DEVICE_INTERFACE_DATA(); d.cbSize = (uint)Marshal.SizeOf(typeof(SP_DEVICE_INTERFACE_DATA));
        if (!SetupDiEnumDeviceInterfaces(set, IntPtr.Zero, ref BUS, 0, ref d)) { LastError = "A ViGEmBus driver nincs telepítve"; return false; }
        uint req; SetupDiGetDeviceInterfaceDetail(set, ref d, IntPtr.Zero, 0, out req, IntPtr.Zero);
        IntPtr detail = Marshal.AllocHGlobal((int)req);
        try {
          Marshal.WriteInt32(detail, IntPtr.Size == 8 ? 8 : 6);
          if (!SetupDiGetDeviceInterfaceDetail(set, ref d, detail, req, out req, IntPtr.Zero)) { LastError = "Eszköz útvonal hiba"; return false; }
          string path = Marshal.PtrToStringUni(new IntPtr(detail.ToInt64() + 4));
          bus = CreateFile(path, 0xC0000000, 3, IntPtr.Zero, 3, 0x80 | 0x20000000 | 0x80000000 | 0x40000000, IntPtr.Zero); // + FILE_FLAG_OVERLAPPED
          if (bus.IsInvalid) { LastError = "ViGEmBus megnyitás hiba " + Marshal.GetLastWin32Error(); return false; }
        } finally { Marshal.FreeHGlobal(detail); }
      } finally { SetupDiDestroyDeviceInfoList(set); }
      bool ver = Ioctl(IOCTL_CHECK_VERSION, U32s(8, 1));
      if (!ver) LastError = "Verzió ellenőrzés hiba " + LastWin32;
      if (Debug) { Console.WriteLine("DBG checkversion ok=" + ver + " err=" + LastWin32); Console.Out.Flush(); }
      return true;
    }

    // Kontroller csatlakoztatása (i: kliens oldali index). Visszaadja, sikerült-e.
    public static bool Plug(int i) {
      if (serials.ContainsKey(i)) return true;
      if (!Open()) return false;
      for (uint serial = 1; serial <= 16; serial++) {
        // VIGEM_PLUGIN_TARGET { Size, SerialNo, TargetType(0=X360), VendorId 0x045E, ProductId 0x028E }
        var b = new byte[16];
        BitConverter.GetBytes((uint)16).CopyTo(b, 0);
        BitConverter.GetBytes(serial).CopyTo(b, 4);
        BitConverter.GetBytes((uint)0).CopyTo(b, 8);
        BitConverter.GetBytes((ushort)0x045E).CopyTo(b, 12);
        BitConverter.GetBytes((ushort)0x028E).CopyTo(b, 14);
        bool okp = Ioctl(IOCTL_PLUGIN, b, 3000);
        if (Debug) { Console.WriteLine("DBG plugin serial=" + serial + " ok=" + okp + " err=" + LastWin32); Console.Out.Flush(); }
        if (!okp && LastWin32 == 1460) break; // időtúllépés: nincs értelme a többi sorozatszámnak
        if (okp) {
          if (!Ioctl(IOCTL_WAIT_READY, U32s(8, serial), 5000)) LastError = "WAIT_READY: " + LastWin32;
          serials[i] = serial;
          if (i != 99) StartNotify(i, serial);
          return true;
        }
      }
      LastError = "Nem sikerült virtuális kontrollert csatlakoztatni (Win32 hiba " + LastWin32 + ")";
      return false;
    }

    public static void Report(int i, int buttons, int lt, int rt, int lx, int ly, int rx, int ry) {
      if (!serials.ContainsKey(i) && !Plug(i)) return;
      // XUSB_SUBMIT_REPORT { Size=20, SerialNo, XUSB_REPORT { USHORT wButtons; BYTE lt; BYTE rt; SHORT lx, ly, rx, ry } }
      var b = new byte[20];
      BitConverter.GetBytes((uint)20).CopyTo(b, 0);
      BitConverter.GetBytes(serials[i]).CopyTo(b, 4);
      BitConverter.GetBytes((ushort)buttons).CopyTo(b, 8);
      b[10] = (byte)Math.Max(0, Math.Min(255, lt));
      b[11] = (byte)Math.Max(0, Math.Min(255, rt));
      BitConverter.GetBytes((short)Clamp(lx)).CopyTo(b, 12);
      BitConverter.GetBytes((short)Clamp(ly)).CopyTo(b, 14);
      BitConverter.GetBytes((short)Clamp(rx)).CopyTo(b, 16);
      BitConverter.GetBytes((short)Clamp(ry)).CopyTo(b, 18);
      Ioctl(IOCTL_XUSB_SUBMIT, b);
    }
    static int Clamp(int v) { return Math.Max(-32768, Math.Min(32767, v)); }

    public static void Unplug(int i) {
      uint serial;
      if (!serials.TryGetValue(i, out serial)) return;
      serials.Remove(i); // a rezgésfigyelő szál ebből látja, hogy ki kell lépnie
      notifiers.Remove(i);
      Ioctl(IOCTL_UNPLUG, U32s(8, serial));
    }
    public static void UnplugAll() { foreach (var i in new List<int>(serials.Keys)) Unplug(i); }
  }

  // Ablakok felmérése a játék-stream maszkolásához (melyik ablakot küldjük a kliensnek)
  public static class Wins {
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int l, t, r, b; }
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out int pid);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, System.Text.StringBuilder sb, ref int size);
    static Dictionary<int, string> exeCache = new Dictionary<int, string>();
    static string Exe(int pid) {
      string e;
      if (exeCache.TryGetValue(pid, out e)) return e;
      e = "";
      IntPtr h = OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
      if (h != IntPtr.Zero) { var sb = new System.Text.StringBuilder(1024); int n = 1024; if (QueryFullProcessImageName(h, 0, sb, ref n)) e = sb.ToString(); CloseHandle(h); }
      if (exeCache.Count > 4000) exeCache.Clear();
      exeCache[pid] = e;
      return e;
    }
    static Dictionary<string, string> compCache = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    public static string Company(string exe) {
      if (string.IsNullOrEmpty(exe)) return "";
      string c;
      if (compCache.TryGetValue(exe, out c)) return c;
      c = "";
      try { var vi = System.Diagnostics.FileVersionInfo.GetVersionInfo(exe); c = (vi.CompanyName ?? "").Trim(); } catch { }
      c = c.Replace("|", " ").Replace("\t", " ");
      compCache[exe] = c;
      return c;
    }
    public static string Companies(string dir) {
      var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
      try {
        var stack = new Stack<KeyValuePair<string, int>>();
        stack.Push(new KeyValuePair<string, int>(dir, 0));
        int n = 0;
        while (stack.Count > 0 && n < 80) {
          var cur = stack.Pop();
          foreach (var f in System.IO.Directory.GetFiles(cur.Key, "*.exe")) { n++; var c = Company(f); if (c.Length > 1) set.Add(c); }
          if (cur.Value < 2) foreach (var d in System.IO.Directory.GetDirectories(cur.Key)) stack.Push(new KeyValuePair<string, int>(d, cur.Value + 1));
        }
      } catch { }
      return "COMP " + string.Join("|", set);
    }
    public static string Run(string dir) {
      var sb = new System.Text.StringBuilder();
      sb.Append("WINS ").Append(GetSystemMetrics(0)).Append(' ').Append(GetSystemMetrics(1)).Append(' ').Append(GetForegroundWindow().ToInt64());
      int inDir = 0;
      if (!string.IsNullOrEmpty(dir)) {
        string d = dir.TrimEnd('\\') + "\\";
        foreach (var p in System.Diagnostics.Process.GetProcesses()) {
          try { string x = Exe(p.Id); if (x.StartsWith(d, StringComparison.OrdinalIgnoreCase)) inDir++; } catch { }
        }
      }
      sb.Append(' ').Append(inDir).Append('|');
      EnumWindows((h, l) => {
        if (!IsWindowVisible(h) || IsIconic(h)) return true;
        int ex = GetWindowLong(h, -20);
        if ((ex & 0x80) != 0) return true; // WS_EX_TOOLWINDOW
        if ((ex & 0x20) != 0) return true; // WS_EX_TRANSPARENT: átkattintható / átlátszó réteg (pl. indító splash)
        int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
        RECT r; if (!GetWindowRect(h, out r)) return true;
        if (r.r - r.l < 120 || r.b - r.t < 80) return true;
        int pid; GetWindowThreadProcessId(h, out pid);
        int style = GetWindowLong(h, -16);
        int flags = ((style & 0x00C00000) == 0x00C00000 ? 1 : 0) | ((ex & 0x8) != 0 ? 2 : 0); // 1: keretes (címsor), 2: mindig felül
        string exe = Exe(pid);
        sb.Append(h.ToInt64()).Append('\t').Append(pid).Append('\t').Append(r.l).Append('\t').Append(r.t).Append('\t').Append(r.r).Append('\t').Append(r.b).Append('\t').Append(flags).Append('\t').Append(exe).Append('\t').Append(Company(exe)).Append('|');
        return true;
      }, IntPtr.Zero);
      return sb.ToString();
    }
  }

  public static class Daemon {
    public static void Run() {
      Wins.SetProcessDPIAware(); // a GetWindowRect fizikai pixelt adjon (a rögzített kép is fizikai felbontású)
      bool vigem = Vigem.Open();
      Console.WriteLine("READY vigem=" + (vigem ? 1 : 0) + (vigem ? "" : " " + Vigem.LastError.Replace(' ', '_')));
      Console.Out.Flush();
      string line;
      while ((line = Console.In.ReadLine()) != null) {
        try {
          var p = line.Trim().Split(' ');
          switch (p[0]) {
            case "MA": Input.MoveAbs(int.Parse(p[1]), int.Parse(p[2])); break;
            case "MR": Input.MoveRel(int.Parse(p[1]), int.Parse(p[2])); break;
            case "MB": Input.Button(int.Parse(p[1]), p[2] == "1"); break;
            case "MW": Input.Wheel(int.Parse(p[1]), int.Parse(p[2])); break;
            case "K": Input.Key(int.Parse(p[1]), p[2] == "1", p[3] == "1"); break;
            case "U": Input.Unicode(int.Parse(p[1])); break;
            case "P": Vigem.Report(int.Parse(p[1]), int.Parse(p[2]), int.Parse(p[3]), int.Parse(p[4]), int.Parse(p[5]), int.Parse(p[6]), int.Parse(p[7]), int.Parse(p[8])); break;
            case "PX": Vigem.Unplug(int.Parse(p[1])); break;
            case "PING": lock (Vigem.OutLock) { Console.WriteLine("PONG"); Console.Out.Flush(); } break;
            case "GP": { int r = Input.GpuPriority(int.Parse(p[1]), int.Parse(p[2])); if (r != 0 && p[2] == "5") r = Input.GpuPriority(int.Parse(p[1]), 4); Console.WriteLine("GP " + p[1] + " " + r); Console.Out.Flush(); break; }
            case "DEBUG": Vigem.Debug = true; break;
            case "COMP": { string r = Wins.Companies(line.Substring(4).Trim()); lock (Vigem.OutLock) { Console.WriteLine(r); Console.Out.Flush(); } break; }
            case "WINS": { string r = Wins.Run(line.Length > 5 ? line.Substring(5).Trim() : ""); lock (Vigem.OutLock) { Console.WriteLine(r); Console.Out.Flush(); } break; }
            case "VIGEM": Console.WriteLine("VIGEM " + (Vigem.Plug(99) ? "ok" : "hiba " + Vigem.LastError)); Vigem.Unplug(99); Console.Out.Flush(); break;
            case "EXIT": Vigem.UnplugAll(); return;
          }
        } catch (Exception ex) { Console.WriteLine("ERROR " + ex.Message.Replace("\n", " ")); Console.Out.Flush(); }
      }
      Vigem.UnplugAll();
    }
  }
}
'@
[InariX.Daemon]::Run()
