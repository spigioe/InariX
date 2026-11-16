# InariX Guide gomb figyelő: az XInput rejtett XInputGetStateEx (#100) függvénye a Guide (Xbox) gombot is jelenti.
# Minden kontrollert (a stream virtuális kontrollereit is) 40 ms-onként lekérdez; lenyomáskor "GUIDE <index>" sort ír.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class GuideWatch {
  [StructLayout(LayoutKind.Sequential)] public struct XS { public uint packet; public ushort buttons; public byte lt, rt; public short lx, ly, rx, ry; }
  [DllImport("xinput1_4.dll", EntryPoint = "#100")] static extern int GetStateEx(int idx, out XS s);
  public static int Poll() {
    int mask = 0;
    for (int i = 0; i < 4; i++) { XS s; if (GetStateEx(i, out s) == 0 && (s.buttons & 0x0400) != 0) mask |= 1 << i; }
    return mask;
  }
}
"@
[Console]::Out.WriteLine('READY'); [Console]::Out.Flush()
$prev = 0
while ($true) {
  $m = [GuideWatch]::Poll()
  for ($i = 0; $i -lt 4; $i++) { if (($m -band (1 -shl $i)) -and -not ($prev -band (1 -shl $i))) { [Console]::Out.WriteLine("GUIDE $i"); [Console]::Out.Flush() } }
  $prev = $m
  Start-Sleep -Milliseconds 40
}
