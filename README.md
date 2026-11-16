# InariX

Konzolos felület Windows laptopra. A játékok egy erősebb gaming PC-n futnak, a képük a laptopra streamelődik (Sunshine + Moonlight). Ha a gaming PC nem elérhető, a laptopon telepített játékok helyben is indíthatók.

- Kontrollerrel irányítható, teljes képernyős konzol UI, boot animációval
- **Külső kijelző bedugásakor automatikusan konzol módba vált**: csak a külső kijelző marad bekapcsolva, a lecsukott fedél nem altatja el a gépet
- Egy közös könyvtár: Steam, Epic, GOG, Ubisoft és egyedi játékok, több gépről
- Ha a gaming PC offline, a játékai **áthúzott felhővel** jelennek meg; kattintásra az adatlap nyílik (Felébresztés és játék gombbal)
- Áruház, telepítés tetszőleges gépre, gyorsmenü, témakezelő és még sok minden: lásd [FEATURES.md](FEATURES.md)

## Beépített stream (Sunshine és Moonlight nélkül)
Alapértelmezésben a InariX **saját streamet** használ LAN-on, külső program nélkül:
- **Gaming PC:** a InariX Host módban rögzíti a képernyőt és a rendszerhangot. A videót **hardveresen** kódolja (H.264 High, NVENC / AMF / QuickSync, WebCodecs realtime mód); a hang Opus WebRTC sávon megy.
- **Laptop:** hardveres dekódolás, azonnali kirajzolás jitter buffer nélkül. A billentyűzet (scancode), az egér (abszolút, vagy rögzítve relatív a játékokhoz) és a kontroller visszamegy.
- **Kontroller:** virtuális Xbox 360 kontroller a gaming PC-n. Ehhez a **ViGEmBus** driver kell ([letöltés](https://github.com/nefarius/ViGEmBus/releases)); a Sunshine telepítője is felrakja. Nélküle a billentyűzet és az egér működik.
- **Vissza a laptop InariXébe stream közben** (a játék a gépen fut tovább):
  - kontroller: **Select + Start 1 mp-ig** → stream menü (Folytatás / Vissza a InariXbe / Statisztika / Egér rögzítése) · Select+Start+LB+RB: azonnali kilépés
  - egér: a **képernyő tetejére** húzva megjelenik a „☰ Menü / ⏏ Vissza a InariXbe” sáv
  - billentyűzet: *Ctrl+Alt+Shift+Q* kilépés · *Ctrl+Alt+Shift+M* egér rögzítése · *Ctrl+Alt+Shift+S* statisztika
- **Változó képfrissítés (30–60 fps):** a host fél másodpercenként méri a hálózati puffert és a laptop visszajelzését (késve érkező kockák, dekóder sor). Torlódáskor előbb az fps-t csökkenti 10-esével, **legfeljebb 30-ig**; ha 30 fps-nél is torlódik, a képminőséget (bitrátát) csökkenti, de a 30 fps megmarad. Ha a hálózat 2 mp-ig rendben van, előbb a minőséget, aztán az fps-t állítja vissza. Eldobott kocka csak kódolás előtt keletkezik, így nem kell utána kulcskocka.
- **Mért teljesítmény (GTX 1660 Super, helyi teszt):** 1080p 57–58 fps, RTT ~1 ms, eldobott kocka 0, NVENC terhelés 25–28%.
- **Kipróbálás egy gépen:** Beállítások → Streaming → *Stream teszt ezen a gépen*. A saját képernyőt streameli egy előnézeti ablakba.
- **Átvitel:** a videó saját UDP protokollon megy (47802-es port). 8 csomagonként XOR paritás (FEC) jár, így egy elveszett csomag azonnal javítható; a többi hiányzót célzottan újrakéri (NACK); egy kocka legfeljebb 50 ms-ot várhat, utána kulcskockát kér. Így egy Wi-Fi-s csomagvesztés nem tartja fel az egész streamet (ez okozta korábban a szaggatást). Mért: 5% mesterséges vesztésnél is minden kocka hibátlanul megérkezett.
- **Futó játék:** a könyvtár tetején „▶ Most fut” sor jelenik meg. Az **A** gomb újraindítás nélkül csatlakozik vissza. A **≡ (Start)** gomb a futó játékon menüt nyit: Folytatás / **Kilépés a játékból**, ami a játék mappájából futó összes folyamatot leállítja a gaming PC-n. A stream menüből és az adatlapról is elérhető. A Ctrl+Alt+Shift+Q és a „Vissza a InariXbe” a játékot futva hagyja.
- **Admin jogot kérő játékok (UAC):** a gaming PC-n Beállítások → Host mód → **Rendszergazdai mód**. Egyszeri jóváhagyás után a InariX host rendszergazdaként indul (ütemezett feladattal, kérdés nélkül), így az általa indított programok nem kérnek UAC-ot. Ami mégis kér (például Steamen át), annak az ablaka a normál asztalra kerül, látszik a streamben, és a laptopról jóváhagyható. Kikapcsolva, illetve az eltávolító futtatásakor minden visszaáll.
- **Korlátok:** csak LAN-on működik (nincs NAT átjárás). A zárolási képernyőt nem lehet rögzíteni, és rendszergazdai mód nélkül az UAC ablakot sem. Exkluzív teljes képernyős játékoknál a keret nélküli ablakos mód ajánlott.
- A **Moonlight + Sunshine** motor továbbra is választható: Beállítások → Streaming → Stream motor.

## Telepítés

Mindkét gépen ugyanaz a csomag kell: `InariX-win32-x64.zip`. Csomagold ki, és futtasd a **`Telepites.cmd`**-t (rendszergazdai jog nem kell). Az app a `%LOCALAPPDATA%\Programs\InariX` mappába kerül, parancsikon az asztalra és a Start menübe, és a Windows-zal együtt indul a háttérben. Első indításkor egy **varázsló** végigvezet a beállításon.

### 1. Gaming PC (ahol a játékok futnak)
1. Telepítsd a [Sunshine](https://github.com/LizardByte/Sunshine/releases)-t, és állíts be felhasználót a webes felületén (`https://localhost:47990`).
2. Telepítsd a InariXet, és a varázslóban válaszd a **Gaming PC** lehetőséget. A varázsló:
   - bekapcsolja a Host módot, és megmutatja a **PIN**-t,
   - létrehozza a tűzfal szabályt (rendszergazdai jóváhagyást kér),
   - opcionálisan elkéri a Sunshine felhasználónevét és jelszavát. Ezzel a laptop **gombnyomásra, PIN gépelés nélkül párosít**.
3. Opcionális: Wake-on-LAN-hoz engedélyezd a BIOS-ban és a hálózati kártya tulajdonságainál.

Alternatíva: ha a gaming PC-n nem akarsz Electron appot futtatni, elég a Node.js és az `npm run agent` parancs (önálló host agent).

### 2. Laptop
1. Telepítsd a InariXet, és a varázslóban válaszd a **Laptop** lehetőséget. A varázsló:
   - feltelepíti a Moonlightot (winget),
   - megkeresi a gaming PC-t a hálózaton, és elkéri a PIN-jét,
   - párosítja a Moonlightot. Ez automatikus, ha a gaming PC-n meg van adva a Sunshine jelszó; különben egy 4 jegyű PIN-t mutat, amit a Sunshine felületén kell beírni,
   - felajánlja a Mindig kész módot.
2. Kész. Dugd be a külső kijelzőt, és indul a konzol.

Ha valami nem működik: **Beállítások → Diagnosztika** (vagy a gyorsmenüben). Végigellenőrzi a natív segédet, a kijelzőket, a fedél beállítást, az autostartot, a Moonlightot, a hálózatot, a gépeket, a Sunshine-t és a tűzfalat.

### Frissítés a hálózaton
1. **Ezen (a fejlesztő / forrás) gépen:** `npm run package`, majd `npm run update-server`. Kiírja a gép IP-jét és a PIN-t (ez a InariX host PIN-je, ha be van állítva).
2. **A laptopon:** a telepítési mappában (`%LOCALAPPDATA%\Programs\InariX`) futtasd a `Frissites.cmd`-t, első alkalommal az IP-vel: `Frissites.cmd 192.168.1.20`. A PIN-t a InariX beállításaiból veszi (ha a gép hozzá van adva), különben megkérdezi. Az IP-t megjegyzi.
3. A szkript összeveti a buildszámot, letölti a csomagot, ellenőrzi a SHA-256 hash-t, leállítja a InariXet, kicseréli a fájlokat, majd újraindítja. A beállítások (`%APPDATA%\InariX`) megmaradnak. Újratelepítés ugyanarra a buildre: `-Force`.

Tűzfal: a forrás gépen a Node.js-nek engedélyezni kell a bejövő kapcsolatot a 47810-es porton (első indításkor a Windows rákérdez).

### Eltávolítás
A telepítési mappában futtasd az `Eltavolitas.cmd`-t. Visszaállítja az eredeti fedél beállítást, kiveszi az appot az automatikus indításból, és törli a parancsikonokat és az appot. A beállítások törlése opcionális.

## Kijelző és fedél
| Helyzet | Mi történik |
|---|---|
| Külső kijelzőt csatlakoztatsz | A fedél művelet „Semmit” lesz, a Windows csak a külső kijelzőt használja, és boot animációval elindul a konzol |
| Lecsukod a fedelet külső kijelzővel | A gép ébren marad, a kép a külső kijelzőn marad |
| Kihúzod a kijelzőt | A fedél művelet visszaáll az eredetire. Ha a fedél le van csukva, a gép alszik |
| Lecsukott fedéllel dugod be a kijelzőt | Ha a gép ébren van (**Mindig kész mód**), azonnal indul a konzol. Alvó gépet a HDMI bedugása általában nem ébreszt fel: ilyenkor egy billentyű vagy a bekapcsoló gomb kell, utána magától indul |

**PIN / jelszó dokkoláskor** (Beállítások → Kijelző és fedél → PIN / jelszó kérése):
- *Dokkolva nem kér (ajánlott):* amíg külső kijelző van csatlakoztatva, vagy Mindig kész módban van a gép, a Windows nem zárol, így a kijelző bedugásakor egyből a konzol jelenik meg. Kihúzás után a PIN újra véd.
- *Amíg a InariX fut, nem kér:* a háttérben (tálcán) futás alatt sem zárol; kilépéskor, leállításkor és újraindításkor visszaáll az eredeti beállítás.
- *Soha nem kér:* a laptop sosem zárol (útközben is, kilépés után is). Kényelmes, de kevésbé biztonságos.
- Egy **már zárolt** képernyőt egyik mód sem old fel, erre a Windows biztonsági okból nem ad lehetőséget. Gépindításkori automatikus bejelentkezéshez lásd a beállítások között az „Automatikus bejelentkezés gépindításkor” útmutatót (Sysinternals Autologon). Céges házirend felülírhatja ezeket; a Diagnosztika jelzi.

A **Mindig kész mód** (Beállítások → Kijelző és fedél) lecsukott fedéllel is ébren tartja a laptopot a beállított ideig (alapból csak töltőn). Kilépéskor az app mindig visszaállítja az eredeti fedél beállítást.

## Irányítás
| Kontroller | Billentyűzet | Funkció |
|---|---|---|
| A | Enter | Kiválasztás / játék |
| B | Esc, Backspace | Vissza |
| X | X | Adatlap |
| Y | Y, F5 | Keresés / kedvenc / kívánságlista |
| LB / RB | Q / E, Tab | Fülváltás |
| Start / Guide | M, G, Home | Gyorsmenü |
| B a kezdőképernyőn | Esc | Kilépés menü (asztalra, kilépés, alvás, kijelentkezés, újraindítás, leállítás); a felső sáv ⏻ gombja is ezt nyitja |
| Select | F | Szűrők (könyvtárban) |

### Kezdőképernyő és Játékaim
A kezdőképernyő konzolos elrendezésű: fent a legutóbbi és futó játékok (az első nagy csempe), a sor végén a **Játékaim és alkalmazásaim**; alatta gyorscsempék (Áruház, Böngésző, **Asztal** – a gaming PC asztala kontrolleres egérrel –, Gépek, Véletlen játék, Beállítások), lejjebb a kitűzött játékok, gyűjtemények, gépenkénti és telepíthető sorok. A téma (színek, betű, háttér) a témakezelőből jön. B: vissza a kezdőképernyőre bármelyik oldalról.

A **Játékaim** oldalon bal oldalt kategóriák (összes, telepítve, teljes könyvtár, most fut, kitűzött, platformok, gépek, gyűjtemények), jobb oldalt rács; LB/RB a kategóriák között lapoz. Nagy könyvtárnál a rács csak a látható részt rajzolja ki (lusta betöltés).

### Kontroller egérként (asztal stream)
Asztal streamnél a kontroller egérként működik (a stream menüben – Select+Start nyomva tartva – átkapcsolható játék módba): bal kar = egér, jobb kar = görgetés, A = bal klikk, B = jobb klikk, bal kar lenyomás = középső gomb, X = gépelés képernyő-billentyűzettel (ékezetekkel), Y = Enter, LB = Esc, RB = Windows gomb, LT = Backspace, D-pad = nyilak.

### Fiókok és könyvtár szinkron
Beállítások → **Fiókok és könyvtár**: Steam, Epic Games, GOG, Microsoft Store (Xbox) és Ubisoft Connect fiók csatlakoztatása. A bejelentkezés a beépített böngészőben történik (kontrollerrel is), a sikeres belépés után a InariX magától visszalép, és letölti a játéklistát (6 óránként frissül, kézzel is szinkronizálható). A nem telepített játékok is megjelennek a könyvtárban telepítés gombbal. A könyvtár tetején platform szerint és telepítési állapot szerint lehet szűrni. A jelszót a InariX nem tárolja, csak a platform hozzáférési tokenjét, titkosítva (`accounts.dat`). A Microsoft fiók konzolos kóddal csatlakozik (microsoft.com/link), Epic és GOG az asztali böngészőben is beléptethető (kód beillesztésével) – a Google/Facebook gombos belépést a szolgáltatók beágyazott böngészőben gyakran tiltják.

Ha a fiókot a **gaming PC-n (host)** csatlakoztatod, a laptop is bejelentkezettként látja: a host összes játéka – a fiókjai nem telepített játékai is – megjelenik a laptop könyvtárában, és a laptopról is indítható szinkron a hoston. A tokenek a hoston maradnak, a hálózaton csak a játéklista megy át (PIN-nel védve). Ha a host nem elérhető, az utoljára látott lista marad meg.

### Böngésző (Böngésző fül)
Eszköztáron a megszokott navigáció; Y = cím / keresés, X vagy lefelé az eszköztárról = **oldal vezérlése**. Oldal módban:

| Kontroller | Funkció |
|---|---|
| Bal kar / bal kar lenyomás | Kurzor / kurzor elrejtése |
| A | Kattintás (nyomva tartva húzás) |
| Jobb kar / jobb kar lenyomás | Görgetés / Enter |
| D-pad, LT / RT | Nyilak, Page Up / Page Down |
| X | Gépelés a fókuszált mezőbe (képernyő-billentyűzet) |
| Y | Címsor |
| B | Vissza az előző oldalra (ha nincs, az eszköztárra) |
| LB / RB | Előző / következő oldal |
| Select | Vissza az eszköztárra |
| Start | Böngésző menü (könyvjelző, nagyítás, teljes nézet, kezdőlap, előzmények, letöltések, beállítások) |

Billentyűzettel: F6 vagy Ctrl+L = címsor, Alt+←/→ = vissza/előre, F5 = újratöltés, Shift+Esc = vissza az eszköztárra. A letöltések a Windows Letöltések mappájába kerülnek. DRM-védett szolgáltatások (Netflix, Spotify, Disney+) nem játszhatók le.

Stream közben a Moonlight kilépő kombinációja: Select+Start+LB+RB (vagy Ctrl+Alt+Shift+Q).

## Hibaelhárítás
- **A laptop nem találja a gaming PC-t**: fut-e rajta a InariX Host móddal? Lefutott a „Tűzfal engedélyezése”? Ugyanazon a hálózaton vannak? Kézzel IP-vel is hozzáadható.
- **A stream nem indul**: párosítva van a Moonlight? Fut a Sunshine? (A Gépek fül jelzi, ha nem.)
- **Napló**: Beállítások → Napló. Hibanapló: `%APPDATA%\InariX\error.log`.
- A beállítások helye: `%APPDATA%\InariX\config.json`.

## Fejlesztés
```
npm install
npm start          # indítás fejlesztői módban
npm run boot       # indítás boot animációval
npm test           # öntesztek (agent, hálózat, könyvtár, Sunshine API, fedél/kijelző automatika szimulációval)
npm run agent      # önálló host agent (Node.js)
npm run package    # exe + telepítő szkriptek + zip: dist/InariX-win32-x64(.zip)
```
Szerkezet: `src/core` (felderítés, indítás, agent, hálózat), `src/main` (Electron fő folyamat, kijelző/fedél kezelés, natív segéd: `helpers/syswatch.ps1`), `src/renderer` (konzolos UI).
