# InariX

**Verzió: 0.9.13-alpha**

Konzolos felület Windows laptopra. A játékok egy erősebb gaming PC-n futnak, és a képük a laptopra streamelődik. Ha a gaming PC nem elérhető, a laptopon telepített játékok helyben is indíthatók.

- **Kontrollerrel irányítható, teljes képernyős konzol felület**, boot animációval
- **Külső kijelző bedugásakor automatikusan konzol módba vált**: csak a külső kijelző marad bekapcsolva, és a lecsukott fedél nem altatja el a gépet
- **Saját beépített stream** a helyi hálózaton (Sunshine és Moonlight nélkül), hardveres H.264 / HEVC kódolással
- **Egy közös könyvtár**: Steam, Epic, GOG, Microsoft Store, Ubisoft és egyedi játékok, több gépről, a fiókok nem telepített játékaival együtt
- **Játékon belüli overlay** a kontroller Guide gombjára (helyben és streamben is)
- **Frissítés a GitHub-kiadásokból**, saját frissítéskezelővel

A teljes funkciólista: [FEATURES.md](FEATURES.md).

## Telepítés

1. Töltsd le a legfrissebb kiadásból az **`InariX-Setup-<verzió>.exe`** fájlt: [Releases](https://github.com/spigioe/InariX/releases).
2. Futtasd. Rendszergazdai jog nem kell.
3. A telepítőben megadhatod:
   - a telepítési mappát (alapból `%LOCALAPPDATA%\Programs\InariX`),
   - hogy kérsz-e asztali parancsikont,
   - és ha a gépen korábbi InariX adatot talál, hogy **tiszta telepítést** kérsz (a korábbi beállítások és adatok törlésével) vagy **megtartod** a korábbi beállításokat.
4. A végén az InariX azonnal indítható.

**Első indítás:** teljes képernyős varázsló vezet végig a beállításon (kontrollerrel is):
1. A gép szerepe: Laptop, Gaming PC, vagy mindkettő.
2. Gaming PC esetén: Host mód és PIN, tűzfal, kontroller driver, rendszergazdai mód.
3. Laptop esetén: a gaming PC megkeresése és párosítása, valamint a konzol mód (Mindig kész, PIN dokkoláskor).
4. Téma kiválasztása, végül opcionálisan a játékfiókok csatlakoztatása.

A varázsló később is elindítható: Beállítások → Rendszer → Első beállítás varázsló.

A telepítő Start menü parancsikont hoz létre, és felveszi az InariX-et a Windows **Telepített alkalmazások** listájára.

Mindkét gépre (gaming PC és laptop) ugyanez a telepítő kell. Ha nincs telepítő, a kiadásban lévő `InariX-win32-x64.zip` is használható: csomagold ki, és futtasd a `Telepites.cmd`-t.

Csendes telepítés (szkriptekhez): `InariX-Setup-<verzió>.exe --silent [--dir <mappa>] [--clean] [--no-desktop]`

### Gaming PC (ahol a játékok futnak)
- A varázslóban válaszd a **Gaming PC** lehetőséget. Ez bekapcsolja a Host módot, megmutatja a **PIN**-t, és létrehozza a tűzfalszabályt (rendszergazdai jóváhagyást kér).
- **Kontrollerhez** a **ViGEmBus** driver kell ([letöltés](https://github.com/nefarius/ViGEmBus/releases)). Nélküle a billentyűzet és az egér működik.
- **Admin jogot kérő játékokhoz (UAC):** Beállítások → Gaming PC → **Rendszergazdai mód**. Egyszeri jóváhagyás után az InariX rendszergazdaként indul (az „InariX Host” ütemezett feladattal).
- Opcionális: Wake-on-LAN (a BIOS-ban és a hálózati kártya tulajdonságainál engedélyezd).
- Alternatíva: önálló host agent Node.js-sel (`npm run agent`), Electron app nélkül.

### Laptop
- A varázslóban válaszd a **Laptop** lehetőséget. Megkeresi a gaming PC-t a hálózaton, és elkéri a PIN-jét.
- Dugd be a külső kijelzőt, és indul a konzol.

Ha valami nem működik: **Beállítások → Rendszer → Diagnosztika**.

### Frissítés
Az InariX indításkor és 5 percenként (ha nincs stream) megnézi a GitHub-repó legfrissebb kiadását; az alpha kiadásokat is figyeli. Ha a GitHub nem érhető el, a gaming PC helyi frissítő szerverét próbálja (`npm run update-server`).

1. Ha van új verzió, értesítést kapsz. **Beállítások → Rendszer → Frissítés elérhető → Telepítés**.
2. A letöltést egy ablak mutatja folyamatjelzővel. A végén az InariX ellenőrzi a csomag SHA-256 ellenőrzőösszegét.
3. Jóváhagyást kér: „Újraindítod a programot a frissítés telepítéséhez?”
4. Igen esetén elindítja az **`InariX-Updater.exe`** frissítéskezelőt. Megvárja, hogy fusson, és named pipe-on átadja neki a „mehet” üzenetet.
5. A kezelő leállítja az InariX-et, telepíti a frissítést, és egy ablakban jelzi, sikerült-e. Az **OK** gombra elindítja az InariX-et, majd bezárul.

A beállítások (`%APPDATA%\InariX`) frissítéskor megmaradnak. A frissítéskezelő naplója: `%TEMP%\InariX-update.log`.

### Eltávolítás
Windows **Beállítások → Alkalmazások → Telepített alkalmazások → InariX → Eltávolítás**, vagy a telepítési mappában az **`InariX-Uninstall.exe`**.

Az eltávolító:
- visszaállítja a rendszerbeállításokat, amiket az InariX módosított (fedélművelet, zárolás, automatikus indítás, Game Bar),
- leállítja a programot,
- törli a programfájlokat, a parancsikonokat és a Windows-bejegyzéseket,
- kérésre a **beállításokat és adatokat** is törli (`%APPDATA%\InariX`: fiókok, kitűzések, statisztikák).

## Kezdőképernyő
- **Konzolos elrendezés:**
  - Fent a legutóbbi és futó játékok sora; **a kijelölt csempe mindig nagyobb**, a sor végén a **Játékaim és alkalmazásaim**.
  - Alatta gyorscsempék: Áruház, Böngésző, **Asztal** (a gaming PC asztala, kontrolleres egérrel), Gépek, **Zene**, Véletlen játék, Beállítások.
  - Lejjebb hírek és akciók, kitűzött játékok, ismerősök, ajánlások („Régóta nem játszottál vele”, „Félbehagyott”, „Még ki sem próbáltad”), csoportok és gépenkénti sorok.
- **Rögzített címsor:** a kijelölt játék neve és adatai (játékidő, utolsó játék, achievementek) fent maradnak. Alatta a görgetett tartalom fokozatosan elmosódik; a sorok szélén is elmosódik a tartalom, ha oldalra görgetsz.
- **Élő háttér:** a kijelölt Steam-játék előzetese néhány másodperc után a háttérben indul (Beállítások → Megjelenés). Ha a konzol el van rejtve, megáll.
- **Felső sáv:** időjárás (a várost a beállításokban adod meg) és dátum.
- **Gyors beállítások** (Guide gomb): hangerő, fényerő, hálózat, akkumulátor, kontroller-akkumulátor, éjszakai mód, alvásidőzítő, zene.
- **Kitűzött játékok és csoportok** sorrendje a sorban LB/RB-vel állítható. A csoportoknak ikon és szín adható.
- **Játékaim oldal:** bal oldalt kategóriák (összes, telepítve, teljes könyvtár, platformok, gépek, gyűjtemények), jobb oldalt rács lusta betöltéssel. LB/RB a kategóriák között lapoz.
- **Témakezelő:** beépített (Xbox, PS5 stílusú) és saját témák.

## Beépített stream
- **Gaming PC:** rögzíti a képernyőt és a rendszerhangot, a videót **hardveresen** kódolja. A kodek automatikusan választódik: AV1, HEVC vagy H.264, a leghatékonyabb, amit mindkét gép hardveresen tud. A hang Opus. A rögzítés magas CPU- és GPU-prioritást kap, így teljes GPU-terhelésnél is folyamatos.
- **Laptop:** hardveres dekódolás és azonnali kirajzolás. A billentyűzet, az egér és a kontroller (virtuális Xbox kontroller, több is) visszamegy a gaming PC-re. Opcionálisan a mikrofon is (a gaming PC-n VB-CABLE kell hozzá).
- **Átvitel:** saját UDP protokoll (47802-es port).
  - A hibajavító adatok (FEC) aránya a csomagvesztéshez és a késéshez igazodik.
  - A hiányzó csomagokat célzottan újrakéri; a várakozási idő a mért késéshez igazodik.
  - A bitráta zárt szabályozással a célon marad, akkor is, ha a kódoló túllőne.
- **Szabályozó:** torlódáskor előbb a bitráta csökken, az fps csak utána (legalább 30). A hálózat javulása után gyorsan visszaáll. Késést, alacsony fps-t vagy kockavesztést a stream sarkában jelzés mutat.
- **Napló:** másodpercenkénti statisztika mindkét gépen: `%APPDATA%\InariX\stream-stats.log`.
- **Stream menü:** Select+Start 1 másodpercig nyomva tartva. Benne: Folytatás, Vissza az InariX-be, Kilépés a játékból, egér/kontroller mód, statisztika. Billentyűzettel: Ctrl+Alt+Shift+Q kilépés, Ctrl+Alt+Shift+S statisztika.
- **Asztal stream:** a kontroller egérként működik.
  - Bal kar: egér, jobb kar: görgetés.
  - A: bal klikk, B: jobb klikk, X: gépelés, Y: Enter.
  - LB: Esc, RB: Windows gomb.
  - Ha a gaming PC-n játék indul, a kontroller magától a játéké lesz.
- **Játékonkénti beállítások** (adatlap → ⋯ → Játék beállításai): felbontás, kontroller vagy egér mód, indítási paraméterek.
- **Távoli elérés VPN-nel** (Tailscale, ZeroTier, WireGuard): lépésről lépésre a Beállítások → Gaming PC → „Távoli elérés VPN-nel” alatt. Az ébresztés másik bekapcsolt gépen át is működik.
- A **Moonlight + Sunshine** motor továbbra is választható: Beállítások → Streaming → Stream motor.

## Játékon belüli overlay
A kontroller **Guide (Xbox) gombjára** a gaming PC-n futó játék fölött InariX-menü nyílik: vissza a játékba, kezdőképernyő, kilépés a játékból, hangerő, **teljesítménykijelző** (CPU, RAM, GPU-terhelés és -hőmérséklet). Amíg az InariX fut, a Windows Game Bar nem foglalja le a Guide gombot (kilépéskor visszaáll). Keret nélküli ablakos módban működik; kizárólagos teljes képernyős játék fölé nem rajzolható.

## Fiókok és könyvtár szinkron
Beállítások → **Fiókok és könyvtár**: Steam, Epic Games, GOG, Microsoft Store (Xbox) és Ubisoft Connect fiók csatlakoztatása.
- A bejelentkezés a beépített böngészőben történik.
- A **Microsoft** fiók konzolos kóddal csatlakozik (microsoft.com/link).
- **Epic** és **GOG** az asztali böngészőben is beléptethető, kód beillesztésével.
- A fiókok **nem telepített játékai** is megjelennek a könyvtárban, telepítés gombbal.
- A **gaming PC-n** csatlakoztatott fiókot a laptop is látja; a tokenek a gaming PC-n maradnak.
- A jelszót az InariX nem tárolja, csak a platform hozzáférési tokenjét, titkosítva (`accounts.dat`).

## Böngésző
Kontrollerrel vezérelhető beépített böngésző.
- **Az oldalon:**
  - Bal kar: kurzor, A: kattintás, jobb kar: görgetés.
  - X: gépelés, Y: címsor.
  - B: vissza, LB/RB: előző/következő oldal.
  - Select: eszköztár, Start: menü.
- **Teljes képernyőből** B, Esc vagy Select+Start lép ki.
- **Billentyűzettel:** F6 vagy Ctrl+L: címsor, Alt+←/→: vissza/előre, Shift+Esc: eszköztár.
- **Nem játszható le:** DRM-védett szolgáltatások (Netflix, Spotify, Disney+).

## Kijelző és fedél
| Helyzet | Mi történik |
|---|---|
| Külső kijelzőt csatlakoztatsz | A fedélművelet „Semmit” lesz, a Windows csak a külső kijelzőt használja, és boot animációval elindul a konzol |
| Lecsukod a fedelet külső kijelzővel | A gép ébren marad |
| Kihúzod a kijelzőt | A fedélművelet visszaáll az eredetire; lecsukott fedélnél a gép alszik |
| Lecsukott fedéllel dugod be a kijelzőt | **Mindig kész módban** azonnal indul a konzol |

**PIN / jelszó dokkoláskor** (Beállítások → Kijelző és energia): *Dokkolva nem kér* (ajánlott), *Amíg az InariX fut, nem kér*, vagy *Soha nem kér*. Egy már zárolt képernyőt egyik mód sem old fel.

## Irányítás
| Kontroller | Billentyűzet | Funkció |
|---|---|---|
| A | Enter | Kiválasztás / játék |
| B | Esc, Backspace | Vissza; a kezdőképernyőn kilépés menü |
| X | X | Adatlap |
| Y | Y, F5 | Keresés |
| LB / RB | Q / E | Kitűzések sorrendje, Játékaim kategóriák |
| Start (≡) | M | Menü (futó játékon: Folytatás / Kilépés a játékból) |
| Guide | G, Home | Gyors beállítások; játék közben overlay |

## Hibaelhárítás
- **A laptop nem találja a gaming PC-t:** fut-e rajta az InariX Host módban? Lefutott a „Tűzfal engedélyezése”? Kézzel IP-vel is hozzáadható (Gépek → Kézi hozzáadás).
- **Napló:** Beállítások → Rendszer → Napló. Hibanapló: `%APPDATA%\InariX\error.log`. Stream: `%APPDATA%\InariX\stream-stats.log`. Frissítés: `%TEMP%\InariX-update.log`.
- **A beállítások helye:** `%APPDATA%\InariX\config.json`.

## Fejlesztés
```
npm install
npm start              # indítás fejlesztői módban
npm run boot           # indítás boot animációval
npm test               # öntesztek (agent, hálózat, könyvtár, UDP stream, fedél/kijelző, zárolás)
npm run agent          # önálló host agent (Node.js)
npm run package        # frissítéskezelő, ikonok, exe, eltávolító, zip, telepítő: dist/InariX-Setup-<verzió>.exe, dist/InariX-win32-x64.zip, dist/update-manifest.json
npm run release        # kiadás feltöltése a GitHubra (gh CLI kell: gh auth login)
npm run update-server  # helyi frissítő szerver a hálózaton (tartalék a GitHub mellett)
```

**Kiadás menete:**
1. Emeld a verziót a `package.json`-ban (pl. `0.8.1-alpha`).
2. Commitold és pushold a változásokat.
3. Futtasd az `npm run package`, majd az `npm run release` parancsot.

Ha a verzió nem változik, a kiadás fájljai lecserélődnek, és a kliensek a build-azonosító alapján ismerik fel az újat.

**Szerkezet:**
- `src/core`: felderítés, indítás, agent, hálózat, UDP videó
- `src/main`: Electron fő folyamat, kijelző és fedél, fiókok, overlay, natív segédek (`helpers/*.ps1`)
- `src/renderer`: konzolos felület
- `src/stream`: stream rögzítés és szabályozás
- `src/overlay`: játékon belüli overlay
- `src/updater`: frissítéskezelő (C#, a Windows beépített .NET-jével fordul)
- `src/setup`: telepítő és eltávolító (C#; a telepítő a programcsomagot beágyazva tartalmazza)
