# Build-Spec: Schul-Worms (Arbeitstitel)

> **Hinweis für Claude Code:** Dieses Dokument ist die vollständige Spezifikation für ein
> browserbasiertes, rundenbasiertes Artillerie-Spiel für den Schulkontext. Setze es möglichst
> autonom um. Halte dich an die *technischen Rahmenbedingungen* (Abschnitt 2) – sie sind nicht
> verhandelbar, weil das Spiel auf GitHub Pages ohne Build-Step laufen muss. Arbeite die
> *Implementierungs-Reihenfolge* (Abschnitt 18) Meilenstein für Meilenstein ab und halte das Spiel
> nach jedem Meilenstein lauffähig. Wo konkrete Zahlen stehen, sind das Startwerte zum Balancing,
> keine Dogmen.

---

## 1. Ziel & Kontext

Ein 2D-Artillerie-Spiel im Stil von *Worms*, das im Schulunterricht (Gymnasium, Sek I) eingesetzt
wird. Schülerinnen und Schüler spielen entweder allein gegen Bots oder im lokalen Netzwerk
gegeneinander. Es wird **nichts installiert** – Zugriff ausschließlich über eine GitHub-Pages-URL,
sowohl am Desktop-PC als auch am Smartphone.

**Gewaltfreiheit ist zwingend.** Es wird nicht gekämpft oder „getötet". Figuren sind Schüler:innen
und Lehrkräfte, die sich mit Gegenständen aus dem Schulalltag bewerfen (Bücher, Laptops,
Präsentationen …). Statt einer Lebensanzeige gibt es einen **Notenbalken**: Wer durch Treffer die
**Note 6** erreicht, scheidet aus („bleibt sitzen" / „fliegt von der Schule") – niemand „stirbt".

---

## 2. Technische Rahmenbedingungen (verbindlich)

- **Reines Static Hosting auf GitHub Pages.** Kein Server, kein Backend, kein serverseitiger Code.
- **Kein Build-Step.** Vanilla HTML/CSS/JavaScript mit nativen **ES-Modulen** (`<script type="module">`).
  Kein npm-Build, kein Bundler, kein Transpiler. Externe Bibliotheken nur per CDN-`<script>`-Tag.
- **Eine zentrale `index.html`** im Repo-Root, daneben nur `.js`, `.css` und Assets.
- **Alle Pfade relativ** (z. B. `./js/main.js`, nicht `/js/main.js`), da die Seite unter
  `https://<user>.github.io/<repo>/` läuft. Absolute Pfade brechen sonst.
- **Mobile + Desktop gleichwertig.** Ein responsives Codebase, Eingabeart wird zur Laufzeit erkannt
  (Pointer Events). Querformat empfohlen; bei Hochformat am Handy ein Hinweis-Overlay.
- **HTTPS** ist durch GitHub Pages gegeben (Voraussetzung für WebRTC) – nicht extra konfigurieren.
- Eine leere Datei **`.nojekyll`** ins Repo-Root legen, damit GitHub Pages nichts wegfiltert.
- Sprachen: **Deutsch, Englisch, Ukrainisch**, umschaltbar.

**Erlaubte externe Abhängigkeit:** PeerJS (für WebRTC), per CDN, Version pinnen, z. B.
`<script src="https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"></script>`.
Ansonsten alles selbst implementieren (Physik, Rendering, Sound, Grafik).

---

## 3. Projektstruktur

```
/
├── index.html
├── .nojekyll
├── styles/
│   └── main.css
├── js/
│   ├── main.js              # Einstieg, App-State, Screen-Routing
│   ├── engine/
│   │   ├── loop.js          # Game-Loop (fixed timestep)
│   │   ├── canvas.js        # Canvas-Setup, Pixel-Scaling, Kamera
│   │   ├── physics.js       # Gravitation, Projektilbahn, Kollision
│   │   ├── terrain.js       # prozedurales, zerstörbares Terrain (Bitmaske)
│   │   └── rng.js           # seedbarer Zufallsgenerator
│   ├── game/
│   │   ├── state.js         # Spielzustand (Spieler, Runde, Wind …)
│   │   ├── turn.js          # Rundenlogik / Zugwechsel
│   │   ├── grades.js        # Notensystem (Punkte ↔ Note, Ausscheiden)
│   │   ├── weapons.js       # datengetriebene Waffendefinitionen
│   │   ├── effects.js       # Explosionen, Rückstoß, anhaltende Effekte
│   │   └── characters.js    # Figuren (Schüler/Lehrer), Bewegung
│   ├── ai/
│   │   └── bot.js           # regelbasierte Gegner-KI (3 Stufen)
│   ├── net/
│   │   ├── peer.js          # PeerJS-Wrapper, Lobby, Verbindung
│   │   └── sync.js          # Host-autoritative Synchronisation
│   ├── ui/
│   │   ├── menu.js          # Hauptmenü, Modusauswahl, Lobby, Einstellungen
│   │   ├── hud.js           # In-Game-HUD (Notenbalken, Wind, Waffe, Timer)
│   │   └── controls.js      # Desktop- + Touch-Steuerung (Pointer Events)
│   ├── render/
│   │   └── sprites.js       # programmatische Pixel-Sprites (siehe Abschnitt 12)
│   └── i18n/
│       ├── i18n.js          # Lade-/Umschalt-Logik
│       ├── de.json
│       ├── en.json
│       └── uk.json
└── assets/
    └── (optional generierte PNGs, falls ComfyUI-Variante – siehe Anhang A)
```

---

## 4. Spielkonzept & -mechanik

- **Rundenbasiert**, ein Spieler pro Zug. Reihenfolge fest, reihum.
- **Eine Figur pro Spieler** (keine Teams).
- Ablauf eines Zugs:
  1. Aktiver Spieler darf sich begrenzt bewegen (Bewegungsbudget / Zug-Timer).
  2. Eine Waffe auswählen, zielen, **einmal** einsetzen.
  3. Projektile/Effekte werden aufgelöst, Schaden/Rückstoß angewendet.
  4. Zug wechselt; **Wind wird neu gewürfelt**.
- **Zug-Timer:** pro Zug z. B. 30 s (konfigurierbar). Läuft er ab, ohne dass gefeuert wurde, endet
  der Zug ohne Aktion.
- **Siegbedingung:** Es gewinnt, wer als Letztes nicht die Note 6 hat. Ist ein optionales
  **Zeit-/Rundenlimit** aktiv und läuft ab, gewinnt die **beste Note** (bei Gleichstand: höchste
  verbleibende Notenpunkte).
- **Herunterfallen vom Schulgelände** (unten/seitlich aus der Welt) = sofort ausgeschieden.

---

## 5. Spielwelt & Terrain

- **Zerstörbares Terrain als Bitmaske.** Das Terrain liegt auf einem Offscreen-Canvas; die
  Kollisionsabfrage prüft den Alpha-Wert eines Pixels (solide = undurchsichtig).
- **Zerstörung:** Bei einer Explosion wird ein Kreis per `globalCompositeOperation = 'destination-out'`
  aus dem Terrain-Canvas gestanzt. Danach prüfen, ob Figuren nun „in der Luft" hängen → fallen lassen.
- **Prozedurale Erzeugung mit Seed** (siehe `rng.js`): Hügelige Oberfläche per aufsummierter
  Sinus-/Noise-Funktion, darunter solides Material, ggf. einzelne schwebende Plattformen. **Wichtig:**
  Im Netzwerkspiel erzeugt der Host einen Seed und schickt ihn an alle Clients, damit alle exakt
  dasselbe Terrain generieren (siehe Abschnitt 11).
- **Map-Themen** (rein optisch, gleiche Mechanik): `schulhof`, `klassenraum`, `turnhalle`. Unterschied
  über Farbpalette, Hintergrund und Deko-Sprites. Start: `schulhof`, weitere danach.
- **Wind:** pro Zug ein Wert in `[-1, +1]`, beeinflusst leichte Projektile horizontal. Im HUD als
  Pfeil + Stärke anzeigen.

---

## 6. Physik

- **Fixed Timestep** für die Simulation (z. B. 60 Hz), Rendering davon entkoppelt.
- **Gravitation** konstant nach unten. Projektile: Startgeschwindigkeit aus Zielwinkel + Stärke,
  pro Frame Gravitation + (gewichteter) Wind addieren.
- **Kollision Projektil ↔ Terrain:** Pixel-Sampling entlang der Flugbahn (Schritte klein genug, um
  kein „Durchtunneln" zu erlauben). Bei Treffer: Explosion auslösen.
- **Rückstoß:** Explosionen schieben Figuren radial weg (Stärke fällt mit Abstand). Figuren können
  durch Rückstoß vom Gelände gestoßen werden.
- **Fallschaden:** ab einer Mindest-Fallhöhe leichte Notenverschlechterung (optional, klein halten).
- **Figuren-Bewegung:** Gehen links/rechts mit Steigungs-Logik (kleine Stufen hochlaufen,
  steile Wände blockieren), Springen mit fester Sprungkraft.

---

## 7. Notensystem (`grades.js`)

- Jede Figur hat intern **Notenpunkte** `0–100`. Start: `100` = **Note 1** (sehr gut).
- **Mapping Punkte → Note:** `note = clamp(1 + (100 - punkte) / 100 * 5, 1, 6)`.
  Also `100 → 1`, `0 → 6`. Für die Anzeige auf eine sinnvolle Auflösung runden (z. B. ganze Note +
  Tendenz `+ / -`, oder eine Nachkommastelle).
- **Schaden** = Abzug von Notenpunkten (Waffenwerte in Abschnitt 8 sind in dieser Skala).
- **Ausscheiden** bei `punkte <= 0` → Note 6. Animation: Figur setzt sich resigniert hin /
  „bleibt sitzen" / verlässt mit Schulranzen das Gelände. **Kein** Gewalt-/Todesmotiv.
- **„Apfel für die Lehrkraft"** (einzige Heilung): `+20` Punkte, gedeckelt bei `100`.
- **Anzeige:** Notenbalken über jeder Figur und im HUD – voll/grün bei Note 1, leerend/rot Richtung
  Note 6, mit Notenzahl.

---

## 8. Waffen (`weapons.js`)

Waffen sind **reine Datenobjekte** in einem Array/Objekt, damit du (Micha) später leicht welche
ergänzen/streichen kannst. Vorgeschlagenes Schema:

```js
{
  id: "buchwurf",
  i18nKey: "weapon.buchwurf",      // Name/Beschreibung kommen aus i18n
  archetype: "lobbed",             // siehe unten
  damage: 28,                      // Notenpunkte im Explosionszentrum
  radius: 42,                      // Explosions-/Krater-Radius in px
  windFactor: 0.3,                 // 0 = windunabhängig, 1 = voll windabhängig
  projectileMass: 1.0,             // beeinflusst Flugbahn
  fuseSeconds: null,               // null = Aufprallzünder, sonst Zeitzünder
  cluster: 0,                      // Anzahl Splitter beim Zerplatzen (0 = keine)
  bounces: 0,                      // Abpraller vor Explosion
  homing: false,                   // zielsuchend
  utility: null,                   // siehe Hilfsmittel
  ammo: Infinity                   // Munition (Infinity = unbegrenzt) – optional Limits setzen
}
```

**Archetypen (Verhalten in der Engine):**
`lobbed` (Bogenwurf), `direct` (Geradeaus, windabhängig), `heavy` (großer Krater, windunabhängig),
`cluster` (zerplatzt in Splitter), `salvo` (mehrere kleine Schüsse hintereinander),
`area` (Flächeneffekt um Eigenfigur), `lingering` (Wolke, wirkt mehrere Runden),
`homing` (zielsuchend), `airstrike` (von oben, senkrechter Streifen), `mine` (platziert, Auslöser bei Berührung),
`utility` (kein Schaden, Spezialeffekt).

**Roster (Startwerte – Balancing später anpassen):**

| Name | id | archetype | Schaden | Radius | windFactor | Besonderheit |
|---|---|---|---|---|---|---|
| Papierflieger | `papierflieger` | direct | 24 | 30 | 1.0 | stark windabhängig |
| Zirkel | `zirkel` | direct | 40 | 18 | 0.2 | präzise, hoher Einzeltreffer |
| Buchwurf | `buchwurf` | lobbed | 28 | 42 | 0.3 | Standardgranate |
| Wasserbombe | `wasserbombe` | lobbed | 22 | 55 | 0.4 | großer Rückstoß |
| Bananenschale | `bananenschale` | cluster | 16 | 35 | 0.3 | `bounces: 2`, `cluster: 4` |
| Laptop-Wurf | `laptop` | heavy | 38 | 65 | 0.0 | sehr schwer, großer Krater |
| Megaphon „RUHE!" | `megaphon` | heavy | 20 | 70 | 0.0 | massiver Rückstoß rundum |
| Schulranzen | `schulranzen` | cluster | 14 | 30 | 0.3 | `cluster: 5` (Bücher) |
| Kreidegewehr | `kreidegewehr` | salvo | 8×5 | 12 | 0.5 | 5 schnelle Schüsse |
| Referat halten | `referat` | area | 26 | 80 | – | Langeweile-Welle um sich |
| Stinkekäse-Brot | `stinkekaese` | lingering | 10/Runde | 50 | 0.2 | Wolke, 2 Runden aktiv |
| Blauer Brief | `blauer_brief` | homing | 30 | 28 | 0.2 | zielsuchend |
| Hausaufgaben-Hagel | `hausaufgaben` | airstrike | 18 | 25 | 0.3 | senkrechter Streifen von oben |
| Reißzwecke | `reisszwecke` | mine | 30 | 35 | 0.0 | platziert, Auslöser bei Berührung |
| Energydrink | `energydrink` | utility | – | – | – | Extra-Bewegung/Sprung diese Runde |
| Springseil | `springseil` | utility | – | – | – | „Ninja-Seil": schwingen/klettern |
| Spickzettel | `spickzettel` | utility | – | – | – | Teleport an anvisierte Stelle |
| Korrekturroller | `tippex` | utility | – | – | – | Terrain wegradieren / eingraben |
| Tisch aufstellen | `tisch` | utility | – | – | – | Plattform platzieren (Brücke/Deckung) |
| Apfel für die Lehrkraft | `apfel` | utility | – | – | – | eigene Note +20 (Heilung, begrenzt) |
| Passen | `passen` | utility | – | – | – | Zug ohne Aktion beenden |

`area`-Waffe (Referat): kein Wurf, sondern Effekt im Umkreis der eigenen Figur (trifft alle in
`radius`, mit Distanzabfall). `lingering` (Stinkekäse): Wolke bleibt liegen und verschlechtert die
Note jeder Figur, die sich am Zugbeginn darin befindet, für eine definierte Rundenzahl.

> **Erweiterbarkeit:** Neue Waffe = neues Datenobjekt + ggf. neuer Archetyp in der Engine + i18n-Strings
> + ein Pixel-Icon in `sprites.js`. Dokumentiere das kurz in einem `WEAPONS.md` im Repo.

---

## 9. Steuerung (`controls.js`)

Einheitlich über die **Pointer Events API** (funktioniert für Maus, Touch und Stift gleich).

**Zielen (beide Plattformen):** Vom eigenen Charakter aus **ziehen** = Winkel + Stärke (wie ein
Katapult/Slingshot: zurückziehen lädt auf, Loslassen feuert). Eine Flugbahn-Vorschau (gepunktet)
während des Ziehens.

**Bewegung:**
- *Desktop:* Pfeiltasten / `A`,`D` = gehen, `W`/Leertaste = springen, Mausrad oder `Q`/`E` = Waffe
  wechseln, `Tab` = Waffenmenü, `Esc` = Pause.
- *Touch:* eingeblendete Buttons (links/rechts/springen) am unteren Rand, Waffen-Button öffnet ein
  Waffenrad.

**Responsiv:** Layout passt sich an Bildschirmgröße an; Touch-Buttons nur einblenden, wenn Touch
erkannt wird (oder zuschaltbar). Bei **Hochformat am Handy** ein Overlay „Bitte Gerät drehen".
Canvas in interner Pixelauflösung rendern und hochskalieren (`image-rendering: pixelated`), damit
der Retro-Look auf allen Größen scharf bleibt.

---

## 10. Bots / KI (`bot.js`)

Regelbasiert, drei Stufen:

- **Leicht:** wählt zufällige (erreichbare) Gegner, grobe Winkel/Stärke mit deutlichem Zufallsfehler,
  ignoriert Wind weitgehend, einfache Waffen.
- **Mittel:** schätzt eine grobe Flugbahn durch Sampling, zielt mit kleinerem Fehler, berücksichtigt
  Wind grob, wählt situativ passende Waffe.
- **Schwer:** berechnet für mehrere Winkel/Stärken die Auftreffpunkte (Simulation der eigenen
  Physik), wählt den besten Treffer inkl. Wind, bevorzugt effektive Waffen, weicht bei niedriger
  eigener Note in Deckung aus.

KI nutzt **dieselben** Bewegungs-/Wurf-Funktionen wie menschliche Spieler (keine Sonderwege),
damit das Verhalten konsistent und nachvollziehbar bleibt.

---

## 11. Netzwerk / Multiplayer (`peer.js`, `sync.js`)

**Getestet & freigegeben:** Im Zielnetz funktionieren STUN nach außen *und* direkte P2P-Verbindung
zwischen zwei Schul-PCs. Online-LAN-Multiplayer ist also fest eingeplant.

**Architektur: Host-autoritative Stern-Topologie über WebRTC (PeerJS).**

- **Lobby:** Ein Spieler klickt „Spiel erstellen" → Host. Er erhält eine **kurze, menschenlesbare
  Raum-ID** (z. B. 4–6 Zeichen, als PeerJS-Custom-ID; bei Kollision neu generieren). Andere wählen
  „Beitreten", geben den Code ein und verbinden sich **nur mit dem Host** (Clients verbinden sich
  nicht untereinander). Lobby zeigt beigetretene Spieler, Host startet die Partie.
- **Autorität:** Der **Host simuliert die gesamte Spielwelt**. Clients sind „dumme" Anzeigen, die
  Zustände/Ereignisse empfangen und rendern.
- **Eingaben:** Ist ein Client am Zug, schickt er nur seine **Aktionen** (Bewegung, Zielwinkel/Stärke,
  Waffe, Feuern) an den Host. Der Host simuliert und **broadcastet das Ergebnis** an alle.
- **Synchronisation ohne Determinismus-Risiko:**
  - Terrain wird **einmalig per Seed** synchronisiert (Host → alle generieren identisch).
  - Terrain-Zerstörung wird als **Ereignis** `{x, y, radius}` gesendet; jeder Client wendet denselben
    Stanz-Vorgang lokal an (kein Übertragen der ganzen Bitmaske).
  - Pro Zug überträgt der Host die relevanten Zustände (Positionen, Notenpunkte, Wind, aktiver
    Spieler) plus die ausgelösten Ereignisse (Explosionen, Effekte).
- **Da rundenbasiert, ist Latenz unkritisch.** Notfalls greift WebRTC auf Relay zurück – für dieses
  Spiel völlig ausreichend.
- **Robustheit:** PeerJS nutzt standardmäßig den kostenlosen öffentlichen Broker und Google-STUN
  (keine Konfiguration nötig). *Optional* in der PeerJS-Config einen kostenlosen TURN-Server
  ergänzen, damit Verbindungen auch in restriktiveren Netzen klappen (für andere Schulen). Falls
  ergänzt: in einer klar markierten Konstante, leicht austauschbar.
- **Verbindungsabbruch:** Fällt ein Client weg, wird seine Figur als ausgeschieden markiert bzw. sein
  Zug übersprungen; das Spiel läuft für die übrigen weiter. Fällt der **Host** weg, sauber beenden mit
  Hinweis (kein Host-Migration nötig).

**Spieler pro Match:** 2–4. Mehrere parallele Runden sind möglich, indem mehrere Hosts mehrere Räume
aufmachen (kein zentrales Matchmaking nötig).

---

## 12. Grafik (`sprites.js`)

**Standardweg: programmatisch erzeugte Pixel-Sprites** – keine externe Pipeline, GitHub-Pages-freundlich,
leicht editierbar.

- Sprites als kleine **Pixel-Raster** definieren: ein 2D-Array aus Palettenindizes + eine begrenzte
  **Retro-Palette** (z. B. 16 Farben). Render-Funktion zeichnet das Raster Pixel für Pixel auf ein
  Canvas; Hochskalierung über `image-rendering: pixelated`.
- **Figuren:** Schüler:innen und Lehrkräfte als kleine Pixel-Charaktere mit Variationen
  (Haar-/Kleidungsfarbe, Brille, Schulranzen) zur Unterscheidung der Spieler. Wenige Animationsframes
  (Stehen, Gehen, Werfen, „resigniert sitzen" beim Ausscheiden).
- **Waffen-Icons:** je Waffe ein kleines Pixel-Icon (für Waffenmenü/-rad).
- **Projektile & Effekte:** einfache Pixel-Sprites (Buch, Papierflieger, Laptop …) + Partikel für
  Explosionen (Kreide-Staub, Wasserspritzer, Papierschnipsel – gewaltfrei, comichaft).
- **Hintergründe:** schlichte Retro-Kulissen je Map-Thema (Schulgebäude, Tafel, Sprossenwand) als
  ferne Ebene mit Parallax.
- **Stil:** klar, freundlich, comichaft-retro – kein Realismus, keine Verletzungen/Blut. Treffer werden
  durch Stolpern, Sternchen, Schweißtropfen, sinkende Note dargestellt.

> **Optionaler ComfyUI-Weg:** Falls reicheres, gerendertes Pixel-Art gewünscht ist, siehe **Anhang A**.
> Die Engine lädt Sprites dann aus `assets/` statt aus dem Code – baue die Render-Schicht so, dass ein
> Wechsel zwischen „Code-Sprites" und „PNG-Sprites" über eine zentrale Konstante möglich ist.

---

## 13. Sound

- **WebAudio API**, alles **synthetisch** erzeugt (keine Audiodateien nötig → bleibt self-contained):
  Oszillatoren für Blips/Klicks, gefiltertes Rauschen für Explosionen/„Platsch", kurze Melodie-Stings
  für Sieg/Ausscheiden.
- Dezente Retro-SFX: Wurf, Aufprall, Explosion, Zugwechsel, Schulglocke beim Rundenstart,
  „Sitzenbleiben" beim Ausscheiden.
- Optional eine einfache Chiptune-Loop (WebAudio-Sequencer). **Mute-Toggle** im Menü/HUD, Lautstärke
  einstellbar.

---

## 14. Internationalisierung (`i18n/`)

- Alle sichtbaren Texte aus **JSON-Wörterbüchern**: `de.json`, `en.json`, `uk.json`. Keine Strings
  hart im Code.
- Sprachumschalter im Hauptmenü; Auswahl in **`localStorage`** speichern (funktioniert auf der echten
  GitHub-Pages-Seite). Fallback-Sprache: Deutsch.
- Schlüssel-Schema z. B. `menu.start`, `weapon.buchwurf.name`, `weapon.buchwurf.desc`, `hud.wind`, …
- **Hinweis:** Die **ukrainischen** Strings kann Claude Code erzeugen, sie sollten aber von einer
  ukrainischsprachigen Person gegengelesen werden. Markiere maschinell erzeugte uk-Strings im JSON
  per Kommentar/Flag, damit sie leicht auffindbar sind.

---

## 15. UI / Screens (`menu.js`, `hud.js`)

- **Hauptmenü:** Einzelspieler (vs. Bots) | Lokales Netzwerk (Erstellen / Beitreten) | Hotseat
  (Pass-and-Play am selben Gerät) | Einstellungen | Sprache.
- **Einstellungen / Partie-Setup:** Spielerzahl (2–4), Hotseat/Bots/Anteil Bots, Bot-Schwierigkeit,
  **Zeit-/Rundenlimit an/aus + Dauer**, Zug-Timer-Länge, Map-Thema, (optional) Waffen-Set/-Filter.
- **Lobby (Netzwerk):** Raum-Code groß anzeigen, Spielerliste, „Start" nur für Host.
- **In-Game-HUD:** aktiver Spieler, Notenbalken aller Spieler, Wind-Anzeige, gewählte Waffe,
  Zug-Timer, Mute/Pause.
- **End-Screen:** Siegerin/Sieger, Abschluss-„Zeugnis" mit den Endnoten aller Spieler (nettes,
  thematisches Detail), „Nochmal" / „Zurück ins Menü".

---

## 16. Spieleinstellungen (vom Spieler einstellbar)

- Spielerzahl 2–4, Mischung Mensch/Bot, Bot-Schwierigkeit.
- **Zeit-/Rundenlimit optional** (an/aus + Wert).
- Zug-Timer-Dauer.
- Map-Thema.
- Sprache, Lautstärke/Mute.
- (Optional) Waffenauswahl ein-/ausschalten für einfachere Runden im Unterricht.

---

## 17. Deployment auf GitHub Pages

1. Repo anlegen, alle Dateien ins **Root** (oder konsequent in `/docs`, dann unten entsprechend wählen).
2. Leere **`.nojekyll`** im Root nicht vergessen.
3. GitHub → **Settings → Pages** → „Deploy from a branch" → Branch `main`, Ordner `/ (root)`.
4. Nach 1–2 Minuten ist die Seite unter `https://<user>.github.io/<repo>/` erreichbar – diese URL
   gibst du den Schüler:innen.
5. **Alle Asset-/Modulpfade relativ** halten (sonst 404 wegen des `/<repo>/`-Unterpfads).
6. In `README.md` kurz dokumentieren: URL, Bedienung, wie man eine Netzwerkpartie startet/beitritt.

---

## 18. Implementierungs-Reihenfolge (Meilensteine)

> Nach **jedem** Meilenstein muss das Spiel lauffähig und im Browser testbar sein.

- **M1 – Grundgerüst:** `index.html`, Canvas mit Pixel-Scaling, Game-Loop, Hauptmenü-Routing.
- **M2 – Welt:** seedbares RNG, prozedurales zerstörbares Terrain (Bitmaske), eine Figur,
  Gravitation/Kollision/Bewegung, Kamera.
- **M3 – Erste Waffe:** Drag-Zielen mit Flugbahn-Vorschau, Buchwurf, Projektilphysik, Explosion +
  Terrain-Zerstörung + Schaden, Notenbalken.
- **M4 – Rundenlogik:** Mehrere Spieler lokal (Hotseat), Zugwechsel, Zug-Timer, Wind, Siegbedingung, HUD.
- **M5 – Waffenarsenal:** komplettes datengetriebenes Roster + Waffenmenü/-rad, alle Archetypen.
- **M6 – Bots:** drei KI-Stufen.
- **M7 – Touch & Responsive:** Pointer-Events-Steuerung, Touch-Buttons/Waffenrad, Orientierungs-Hinweis.
- **M8 – i18n:** de/en/uk, Umschalter, Persistenz.
- **M9 – Netzwerk:** PeerJS-Lobby, Host/Client, Seed- & Ereignis-Sync, Zug-Übergabe, Abbruch-Handling.
- **M10 – Sound & Politur:** WebAudio-SFX, Einstellungen, End-„Zeugnis", GitHub-Pages-Deploy inkl. `.nojekyll`.

---

## 19. Akzeptanzkriterien (Checkliste)

- [ ] Läuft als reine statische Seite ohne Build-Step, eine `index.html` im Root.
- [ ] Alle Pfade relativ; funktioniert unter `…github.io/<repo>/`.
- [ ] Spielbar gegen Bots **und** im lokalen Netz über die GitHub-Pages-URL, ohne Installation.
- [ ] Bedienbar per Maus/Tastatur **und** per Touch; Hochformat-Hinweis am Handy.
- [ ] Vollständig gewaltfrei: Schul-Thema, Notenbalken statt Leben, Ausscheiden = „sitzenbleiben".
- [ ] Zerstörbares Terrain, Wind, rundenbasierte Züge mit Timer.
- [ ] Datengetriebene Waffen (leicht erweiterbar), vollständiges Roster aus Abschnitt 8.
- [ ] Drei Sprachen umschaltbar (de/en/uk), Auswahl bleibt erhalten.
- [ ] Optionales Zeit-/Rundenlimit einstellbar; korrekte Siegbedingung.
- [ ] Netzwerk: Host-autoritativ, Seed-+Ereignis-Sync, sauberes Abbruch-Verhalten.
- [ ] Retro-/Pixel-Optik, programmatisch erzeugt; Sound synthetisch, mutebar.

---

## Anhang A – Optionaler ComfyUI-Grafik-Workflow

Nur falls statt Code-Sprites gerendertes Pixel-Art gewünscht ist. Engine so bauen, dass `sprites.js`
zwischen Code-Sprites und PNGs aus `assets/` umschalten kann (zentrale Konstante).

**Vorgehen:**
1. Sprite-Liste festlegen (Figuren-Posen, Waffen-Icons, Projektile, Effekte, Hintergründe je Thema)
   mit Zielgröße in Pixeln (z. B. Figuren 32×48, Icons 24×24).
2. Pro Sprite in ComfyUI ein **transparentes** PNG erzeugen (Hintergrund entfernen / mit Alpha rendern).
3. Einheitlicher Stil-Prompt, Beispiel:
   - *Positive:* `pixel art, 16-bit retro game sprite, <Motiv>, clean outline, limited palette,
     transparent background, side view, friendly cartoon style, no gore, no weapons`
   - *Negative:* `realistic, 3d, blur, photo, blood, violence, gun, text, watermark`
4. PNGs nach `assets/<kategorie>/<id>.png` ablegen, Dateinamen = Sprite-`id`.
5. Konstante in `sprites.js` auf „PNG-Modus" stellen; Render-Schicht lädt die PNGs.

**Wichtig:** Auch hier konsequent **gewaltfrei** und **schulthematisch** prompten (Gegenstände aus dem
Schulalltag, keine echten Waffen, keine Verletzungsdarstellungen).

---

*Ende der Spezifikation. Bei Unklarheiten sinnvolle Defaults wählen, dokumentieren und weiterbauen.*
