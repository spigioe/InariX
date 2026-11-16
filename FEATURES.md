# InariX – funkciólista

Végigvettem a nagy játékáruházak és konzolok funkcióit: Steam / Steam Big Picture, Xbox, PlayStation, Nintendo Switch, Epic Games, GOG Galaxy és Playnite. Mindegyiknél jelölöm, mi a helyzete a InariXben.

✅ kész · 🟡 részben / korlátozottan · ❌ nem került be (indoklással)

## Könyvtár
| Funkció | Honnan | Állapot |
|---|---|---|
| Egységes könyvtár több launcherből (Steam, Epic, GOG, Ubisoft, egyedi .exe) | GOG Galaxy, Playnite | ✅ |
| Több gép játékai egy helyen, gépenkénti sorok | Xbox Play Anywhere, Steam Remote Play | ✅ |
| Offline gép játékai áthúzott felhővel, kattintásra adatlap | Xbox Cloud | ✅ |
| Helyi indítás, ha a stream gép nem elérhető | Steam | ✅ |
| Folytatás (legutóbb játszott) sor | Xbox, PS5, Switch | ✅ |
| Kedvencek | Steam, Switch | ✅ |
| Saját gyűjtemények | Steam, Xbox csoportok, PS5 Game Lists | ✅ |
| Elrejtés / megjelenítés | Steam, Playnite | ✅ |
| Szűrés: áruház, elérhetőség, telepítés helye | Steam, Playnite | ✅ |
| Rendezés: legutóbb, név, játékidő | mind | ✅ |
| Keresés a könyvtárban | mind | ✅ |
| Teljes könyvtár: megvásárolt, nem telepített játékok | Xbox, PS5, Steam | ✅ Steam Web API kulccsal, Epic a legendaryvel |
| Letöltések / frissítések folyamatjelzővel | Steam, Xbox, PS5 | ✅ Steam (appmanifest alapján) |
| Borító és háttérkép automatikusan, nem Steames játékokhoz is | Playnite, GOG Galaxy | ✅ Steam keresés alapján |
| Saját borító (SteamGridDB) | Playnite | ❌ külön API kulcs kellene, kis haszon |
| Véletlen játék választó | Playnite, Steam | ✅ |

## Adatlap
| Funkció | Honnan | Állapot |
|---|---|---|
| Leírás, műfaj, fejlesztő, kiadó, megjelenés, Metacritic | Steam, PS5 | ✅ |
| Képernyőképek | mind | ✅ |
| Felhasználói értékelés összesítő | Steam | ✅ |
| Hírek / patch notes | Steam, Xbox | ✅ (Steam hírek) |
| Achievementek / trófeák állapota | Steam, Xbox, PS | ✅ Steam Web API kulccsal |
| Játékidő, indítások száma, utolsó játék | mind | ✅ |
| Forrás kiválasztása (stream / helyi), alapértelmezett forrás | – | ✅ |
| Felébresztés és játék (Wake-on-LAN) | Steam Link | ✅ |
| Fájlok ellenőrzése, eltávolítás, áruház oldal, mappa megnyitása | Steam, Xbox | ✅ |
| Kontroller támogatás jelzése | Steam | ✅ |
| Indítási paraméterek játékonként | Steam | ❌ a launcherben kezelhető; ritka igény |

## Áruház
| Funkció | Honnan | Állapot |
|---|---|---|
| Kiemelt, toplista, újdonságok, akciók sorok | Steam, PS Store, eShop | ✅ |
| Keresés | mind | ✅ |
| Termékoldal: ár, leírás, képek, értékelés | mind | ✅ |
| Kívánságlista | mind | ✅ (InariXen belül) |
| Telepítés tetszőleges gépre (cél gép választása) | Xbox távoli telepítés, PS App | ✅ |
| Vásárlás a konzolon belül | mind | 🟡 a Steam vásárlási oldala nyílik meg (fizetést nem kezelünk) |

## Könyvtár szinkron (fiókok)
| Funkció | Honnan | Állapot |
|---|---|---|
| Steam fiók: összes saját játék (nem telepített is) | Steam, Playnite | ✅ bejelentkezés a beépített böngészőben vagy Web API kulcs |
| Epic Games fiók: teljes könyvtár borítókkal | Heroic, Playnite | ✅ |
| GOG fiók: minden megvásárolt játék | GOG Galaxy, Heroic | ✅ |
| Microsoft Store / Xbox: játszott PC játékok + telepített Store játékok felismerése | Xbox app, Playnite | ✅ (a fiók a játszott címeket adja; a Game Pass katalógus nem) |
| Ubisoft Connect fiók: megvásárolt játékok | GOG Galaxy integráció | ✅ |
| Platform szűrő sáv a könyvtár tetején + telepített / nem telepített szűrő | Xbox, PS5, Steam | ✅ |
| Telepítés nem telepített játékra bármelyik gépen (a platform kliense nyílik meg) | Xbox távoli telepítés | ✅ |
| Tokenek titkosítva (Windows DPAPI), jelszót nem tárolunk | — | ✅ |

## Böngésző
| Funkció | Honnan | Állapot |
|---|---|---|
| Beépített böngésző saját fülön | Xbox Edge, PS5 (rejtett), Steam Big Picture | ✅ |
| Kontrolleres kurzor (bal kar), görgetés (jobb kar), kattintás (A) | Xbox Edge, Steam Big Picture | ✅ |
| Képernyő-billentyűzet a weboldal mezőibe (X) | mind | ✅ |
| Címsor: webcím vagy keresés (Google / DuckDuckGo / Bing) | mind | ✅ |
| Könyvjelzők, előzmények, gyorslinkek kezdőlapon | mind | ✅ |
| Nagyítás, teljes nézet, HTML5 teljes képernyős videó | mind | ✅ |
| Letöltések a Letöltések mappába | Steam Big Picture | ✅ (megnyitni nem lehet, csak mappában megmutatni) |
| Elkülönített munkamenet, sütik törlése | mind | ✅ |
| DRM-es videó (Netflix, Spotify, Disney+) | Xbox, PS5 | ❌ Widevine licenc nélkül nem lehetséges |
| Több fül egyszerre | Xbox Edge | ❌ konzolon ritkán használt; a felugrók ugyanabban a nézetben nyílnak |

## Rendszer / konzol élmény
| Funkció | Honnan | Állapot |
|---|---|---|
| Boot animáció, konzolos UI kontrollerrel | mind | ✅ |
| Automatikus konzol mód külső kijelző csatlakoztatásakor | Switch dokkolás | ✅ |
| Lecsukott fedél, Mindig kész mód | Switch alvás | ✅ |
| Gyorsmenü (Guide gomb): hangerő, hálózat, akku, gépek, energia | Xbox Guide, PS Control Center, Switch Quick Settings | ✅ |
| Hangerő és némítás kontrollerről | mind | ✅ |
| Wi-Fi jelerősség, figyelmeztetés stream előtt | Steam Link | ✅ |
| Gépek késleltetése (ping) | Steam Link | ✅ |
| Energia: alvás / újraindítás / leállítás (laptop és gaming PC is) | mind | ✅ |
| Gaming PC automatikus altatása stream után | Steam Link | ✅ |
| Értesítések előzménye | Xbox, PS5 | ✅ |
| Képernyővédő | Xbox, PS | ✅ |
| Képernyő-billentyűzet magyar ékezetekkel | mind | ✅ |
| Kontroller rezgés visszajelzés | Switch, PS5 | ✅ |
| Kontroller teszt | Steam, Xbox | ✅ |
| Színtémák, UI méret, csökkentett mozgás | Xbox, PS5 | ✅ |
| **Témakezelő**: 12 beépített téma, saját téma szerkesztő élő előnézettel (színek, háttér típusa és sötétítése, saját háttérkép, lekerekítés, betűtípus, álló/fekvő csempék, ragyogás), export/import JSON-ba | Xbox dinamikus hátterek, PS4 témák, Playnite témák | ✅ |
| Statisztika (játékidő toplista) | Steam Replay, PS Wrap-Up | ✅ |
| **Beépített stream** Sunshine/Moonlight nélkül (hardveres H.264, Opus hang, billentyűzet/egér/kontroller) | Steam Remote Play, Xbox Remote Play | ✅ LAN |
| Virtuális Xbox kontroller a hoston (ViGEmBus) | Steam Remote Play, Sunshine | ✅ |
| Stream statisztika overlay (fps, bitráta, RTT, kodek) | Steam Link, Moonlight | ✅ |
| Hálózati frissítő (fejlesztő gép → laptop) | – | ✅ |
| Gépek automatikus felderítése a hálózaton | Steam Link, Moonlight | ✅ |
| Automatikus párosítás PIN gépelés nélkül (Sunshine API) | Steam Link | ✅ |
| Első indítás varázsló | Xbox, PS5, Switch beüzemelés | ✅ |
| Diagnosztika / rendszerellenőrzés | Xbox hálózati teszt, Steam Link | ✅ |
| Telepítő és eltávolító | – | ✅ |
| Videó kodek, HDR, teljesítmény overlay a streamhez | Steam Link, Moonlight | ✅ |
| Stream minőség presetek | Steam Link, Moonlight | ✅ |
| Lemezterület kijelzése gépenként | Xbox, PS5 | ✅ |
| Alacsony akkumulátor figyelmeztetés | Switch, Steam Deck | ✅ |

## Kihagyott funkciók és okuk
| Funkció | Ok |
|---|---|
| Barátlista, chat, party, hangcsevegés | Platformonként zárt API és saját fiókrendszer kellene hozzá; a Steam/Discord overlay a streamben elérhető |
| Felhőmentések | A launcherek maguk kezelik (Steam Cloud stb.) |
| Több felhasználói profil | Laptopos egyszemélyes használat; a Windows fiókok erre valók |
| Szülői felügyelet, játékidő-limit | Windows Family Safety jobban kezeli |
| Képernyőfelvétel, klipek | Windows Game Bar (Win+Alt+PrtSc) és a Sunshine/Moonlight ezt már tudja |
| Saját fizetés, vásárlás | Biztonsági és jogi okból csak a hivatalos áruház oldalát nyitjuk meg |
| Xbox / PS Store telepítés | Nincs nyilvános API |
