# InariX kontroller-híd külső alkalmazásokhoz (Netflix / HBO Max az Edge-ben):
# az Xbox kontroller (XInput) állapotát egér- és billentyűleütésekké alakítja (SendInput).
#   bal kar: egér · jobb kar: görgetés · A: kattintás (nyomva tartva húzás) · B: vissza (böngésző)
#   X: szóköz (lejátszás / szünet) · Y: Windows érintőbillentyűzet · bal kar nyomás: F (teljes képernyő)
#   D-pad: nyilak · LB/RB: Shift+Tab / Tab
#   Start: Enter · View: Esc · LT / RT: lassú egér (finom célzás)
#   Guide, vagy View+Start együtt: kilépés → „QUIT” a kimeneten
# Bemenet (stdin): EXIT
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace InariX {
  [ComImport, Guid("37c994e7-432b-4834-a2f7-dce1f13b834b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ITipInvocation { void Toggle(IntPtr hwnd); }

  public static class PadBridge {
    [DllImport("user32.dll")] static extern IntPtr GetDesktopWindow();
    // a Windows érintőbillentyűzet ki/be (gépeléshez: e-mail, jelszó, keresés)
    static void ToggleKeyboard() {
      try {
        if (System.Diagnostics.Process.GetProcessesByName("TabTip").Length == 0) {
          var exe = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonProgramFiles), @"microsoft shared\ink\TabTip.exe");
          System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(exe) { UseShellExecute = true });
          Thread.Sleep(600);
        }
        var t = (ITipInvocation)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("4ce576fa-83dc-4F88-951c-9d0782b4e376")));
        t.Toggle(GetDesktopWindow());
      } catch (Exception e) { Console.Out.WriteLine("ERR kbd " + e.Message); Console.Out.Flush(); }
    }
    [StructLayout(LayoutKind.Sequential)] struct XGAMEPAD { public ushort wButtons; public byte bLeftTrigger; public byte bRightTrigger; public short sThumbLX; public short sThumbLY; public short sThumbRX; public short sThumbRY; }
    [StructLayout(LayoutKind.Sequential)] struct XSTATE { public uint dwPacketNumber; public XGAMEPAD Gamepad; }
    [DllImport("xinput1_4.dll", EntryPoint = "#100")] static extern uint XInputGetStateEx(uint i, out XSTATE s);
    [DllImport("xinput1_4.dll", EntryPoint = "XInputGetState")] static extern uint XInputGetState(uint i, out XSTATE s);

    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion u; }
    [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] inputs, int size);

    static void Send(INPUT i) { SendInput(1, new[] { i }, Marshal.SizeOf(typeof(INPUT))); }
    static void Mouse(int dx, int dy, uint flags, uint data) { var i = new INPUT { type = 0 }; i.u.mi = new MOUSEINPUT { dx = dx, dy = dy, dwFlags = flags, mouseData = data }; Send(i); }
    static readonly ushort[] EXT = { 0x25, 0x26, 0x27, 0x28, 0x2D, 0x2E, 0x24, 0x23, 0x21, 0x22, 0xA6 };
    static void Key(ushort vk, bool down) {
      var i = new INPUT { type = 1 };
      uint f = down ? 0u : 2u; // KEYEVENTF_KEYUP
      if (Array.IndexOf(EXT, vk) >= 0) f |= 1; // KEYEVENTF_EXTENDEDKEY
      i.u.ki = new KEYBDINPUT { wVk = vk, dwFlags = f };
      Send(i);
    }
    static void Tap(ushort vk) { Key(vk, true); Key(vk, false); }

    public static volatile bool Quit = false;
    public static volatile bool Stop = false;
    const ushort LS = 0x40, UP = 0x1, DOWN = 0x2, LEFT = 0x4, RIGHT = 0x8, START = 0x10, BACK = 0x20, LB = 0x100, RB = 0x200, GUIDE = 0x400, A = 0x1000, B = 0x2000, X = 0x4000, Y = 0x8000;

    static double Axis(short v) { double d = v / 32767.0, dz = 0.24; if (Math.Abs(d) < dz) return 0; return Math.Sign(d) * (Math.Abs(d) - dz) / (1 - dz); }

    public static void Start() { var t = new Thread(Run); t.IsBackground = true; t.SetApartmentState(ApartmentState.STA); t.Start(); }
    public static void Run() {
      ushort prev = 0; bool ex = true;
      double ax = 0, ay = 0, sy = 0, sx = 0;
      long[] rep = new long[16]; // D-pad ismétlés
      var sw = System.Diagnostics.Stopwatch.StartNew();
      while (!Stop) {
        Thread.Sleep(8);
        XSTATE st = new XSTATE(); bool got = false;
        for (uint i = 0; i < 4 && !got; i++) {
          uint r;
          try { r = ex ? XInputGetStateEx(i, out st) : XInputGetState(i, out st); } catch { ex = false; r = XInputGetState(i, out st); }
          if (r == 0) got = true;
        }
        if (!got) { prev = 0; continue; }
        var g = st.Gamepad; ushort b = g.wButtons; ushort pressed = (ushort)(b & ~prev), released = (ushort)(prev & ~b);
        long now = sw.ElapsedMilliseconds;

        if ((pressed & GUIDE) != 0 || ((b & BACK) != 0 && (b & START) != 0 && ((pressed & (BACK | START)) != 0))) { Quit = true; Console.Out.WriteLine("QUIT"); Console.Out.Flush(); prev = b; continue; }

        // egér: bal kar (gyorsuló), a ravaszok lassítanak
        double slow = 1 - Math.Max(g.bLeftTrigger, g.bRightTrigger) / 255.0 * 0.75;
        double lx = Axis(g.sThumbLX), ly = -Axis(g.sThumbLY);
        double sp = 26 * slow;
        ax += lx * Math.Abs(lx) * sp; ay += ly * Math.Abs(ly) * sp;
        int mx = (int)ax, my = (int)ay;
        if (mx != 0 || my != 0) { Mouse(mx, my, 0x0001, 0); ax -= mx; ay -= my; }
        // görgetés: jobb kar
        double ry = Axis(g.sThumbRY), rx = Axis(g.sThumbRX);
        sy += ry * Math.Abs(ry) * 34; sx += rx * Math.Abs(rx) * 34;
        if (Math.Abs(sy) >= 1) { Mouse(0, 0, 0x0800, (uint)(int)sy); sy -= (int)sy; }
        if (Math.Abs(sx) >= 1) { Mouse(0, 0, 0x01000, (uint)(int)sx); sx -= (int)sx; }

        // A: bal egérgomb (nyomva tartva húzás)
        if ((pressed & A) != 0) Mouse(0, 0, 0x0002, 0);
        if ((released & A) != 0) Mouse(0, 0, 0x0004, 0);
        if ((pressed & B) != 0) Tap(0xA6);            // VK_BROWSER_BACK
        if ((pressed & X) != 0) Tap(0x20);            // szóköz
        if ((pressed & Y) != 0) ToggleKeyboard();
        if ((pressed & LS) != 0) Tap(0x46);           // F
        if ((pressed & START) != 0 && (b & BACK) == 0) Tap(0x0D);  // Enter
        if ((released & BACK) != 0 && (prev & START) == 0) Tap(0x1B); // Esc (felengedéskor, hogy a View+Start ne küldje)
        if ((pressed & RB) != 0) Tap(0x09);
        if ((pressed & LB) != 0) { Key(0x10, true); Tap(0x09); Key(0x10, false); }
        // D-pad: nyilak, nyomva tartva ismétel
        ushort[] dirs = { UP, DOWN, LEFT, RIGHT }; ushort[] vks = { 0x26, 0x28, 0x25, 0x27 };
        for (int k = 0; k < 4; k++) {
          if ((pressed & dirs[k]) != 0) { Tap(vks[k]); rep[k] = now + 420; }
          else if ((b & dirs[k]) != 0 && now >= rep[k]) { Tap(vks[k]); rep[k] = now + 90; }
        }
        prev = b;
      }
    }
  }
}
'@

[InariX.PadBridge]::Start()
[Console]::Out.WriteLine('READY')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line -or $line -eq 'EXIT') { break }
}
[InariX.PadBridge]::Stop = $true
