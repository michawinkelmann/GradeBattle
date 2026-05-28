# GradeBattle

Ein browserbasiertes, rundenbasiertes Artillerie-Spiel im Schulkontext – im Stil von *Worms*, aber gewaltfrei.
Statt einer Lebensanzeige gibt es einen **Notenbalken**: Wer die **Note 6** erreicht, scheidet aus
(„bleibt sitzen" / „fliegt von der Schule") – niemand „stirbt". Geworfen wird mit Gegenständen aus
dem Schulalltag (Buchwurf, Wasserbombe, Schulranzen, …).

## Spielen

Die Seite läuft komplett als statische GitHub-Pages-Anwendung – **keine Installation, kein Build**.
Sobald das Repository auf GitHub Pages deployed ist, ist das Spiel unter
`https://<user>.github.io/<repo>/` erreichbar (Desktop oder Smartphone).

### Modi

- **Einzelspieler (vs. Bots)** – 1–3 Gegner als Bot.
- **Hotseat** – 2–4 Spieler:innen am selben Gerät, abwechselnd.
- **Spiel erstellen (Netzwerk)** – Host bekommt einen kurzen Raum-Code; bis zu 3 weitere Spieler:innen
  verbinden sich darüber (lokales Netzwerk / Internet, ohne Server).
- **Spiel beitreten** – Raum-Code eingeben und mitspielen.

### Steuerung

- **Zielen:** Vom eigenen Charakter aus ziehen wie ein Katapult – Richtung + Stärke. Loslassen feuert.
  Eine gepunktete Flugbahn-Vorschau zeigt den voraussichtlichen Verlauf.
- **Bewegen (Desktop):** Pfeiltasten / `A` `D`. Springen mit `W` oder Leertaste.
- **Bewegen (Touch):** eingeblendete Buttons am unteren Rand.
- **Waffen wechseln:** Mausrad, `Q`/`E` oder Button „Waffen" (Touch).
- **Pause:** `Esc` oder Pause-Button im HUD.

## Deployment auf GitHub Pages

1. Repository auf GitHub anlegen, alle Dateien ins **Repo-Root**.
2. Sicherstellen, dass `.nojekyll` im Root existiert (verhindert, dass Jekyll Dateien filtert).
3. In GitHub: **Settings → Pages → Source = `main` Branch, Folder = `/ (root)`**.
4. Nach 1–2 Minuten ist `https://<user>.github.io/<repo>/` aktiv.

Alle Pfade im Code sind relativ, daher funktioniert das Spiel auch unter Unterpfaden.

## Technik

- **Reines Vanilla-JS** mit nativen ES-Modulen (`<script type="module">`).
- **Eine externe Abhängigkeit:** PeerJS per CDN (für WebRTC im Netzwerkmodus).
- Pixel-Art-Sprites werden im Code prozedural erzeugt (`js/render/sprites.js`).
- Sound via WebAudio – synthetisch, keine Audiodateien.
- I18n: Deutsch (Fallback), Englisch, Ukrainisch (UK ist maschinell vorübersetzt – siehe Hinweis in
  `js/i18n/uk.json`).

## Sprachen

Die Sprache wird im Hauptmenü unten umgeschaltet (DE / EN / UK) und im `localStorage` gespeichert.

Die ukrainischen Strings sind maschinell übersetzt und sollten von einer ukrainischsprachigen Person
gegengelesen werden. Der Hinweis steht oben in `js/i18n/uk.json`.

## Lizenz / Nutzung

Frei verwendbar im Schulkontext.
