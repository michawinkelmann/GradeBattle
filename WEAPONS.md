# Waffen erweitern

Die komplette Waffenliste steht datengetrieben in `js/game/weapons.js`. Eine neue Waffe besteht aus
vier Bausteinen:

1. **Eintrag in `WEAPONS`** (`js/game/weapons.js`).
2. **I18n-Strings** für Name und Beschreibung in `js/i18n/de.json`, `en.json`, `uk.json` unter dem
   Key `weapon.<id>.name` und `weapon.<id>.desc`.
3. **Pixel-Icon** (24×24) in `js/render/sprites.js` → Funktion `weaponIcon(id)`.
4. **(Optional)** Projektil-Sprite in `js/render/sprites.js` → Funktion `projectileGrid(type)`,
   wenn das Projektil eine eigene Optik braucht.

## Schema einer Waffe

```js
{
  id: 'meine_waffe',           // eindeutig, klein, snake_case
  archetype: 'lobbed',         // siehe unten
  projectile: 'book',           // Sprite-Key aus projectileGrid()
  damage: 28,                   // Notenpunkte im Explosionszentrum
  radius: 42,                   // Wirkungsradius in Pixeln
  windFactor: 0.3,              // 0 = ignoriert Wind, 1 = voll dem Wind ausgesetzt
  projectileMass: 1.0,
  fuseSeconds: null,            // null = Aufprallzünder
  gravityScale: 1,              // 1 = Standardgravitation
  cluster: 0,                   // Anzahl Splitter beim Zerplatzen
  bounces: 0,                   // Abpraller vor Explosion
  knockback: 200,               // Rückstoßstärke
  homing: false,                // zielsuchend
  utility: null                 // für utility-Archetyp: 'heal' | 'teleport' | …
}
```

## Archetypen (Verhalten in der Engine)

| Archetyp     | Beschreibung |
|--------------|-------------|
| `direct`     | flacher Wurf, oft windabhängig (Papierflieger) |
| `lobbed`     | Bogenwurf (Standardgranate Buchwurf) |
| `heavy`      | großer Krater, windunabhängig (Laptop) |
| `cluster`    | zerplatzt in mehrere Splitter (Schulranzen) |
| `salvo`      | mehrere kleine Schüsse hintereinander (Kreidegewehr) |
| `area`       | Effekt um die eigene Figur (Referat halten) |
| `lingering`  | Wolke, schadet mehrere Runden lang (Stinkekäse) |
| `homing`     | zielsuchend (Blauer Brief) |
| `airstrike`  | senkrechter Streifen von oben (Hausaufgaben-Hagel) |
| `mine`       | platziert, löst bei Berührung aus (Reißzwecke) |
| `utility`    | kein Schaden, Sondereffekt (Apfel, Spickzettel, Tisch, …) |

Bei `utility` definiert das Feld `utility` den konkreten Effekt:
`heal`, `extraMove`, `teleport`, `eraseTerrain`, `placePlatform`, `rope`, `pass`.

## Beispiel: „Tafelwischer"

```js
// 1) js/game/weapons.js
{
  id: 'tafelwischer',
  archetype: 'lobbed',
  projectile: 'book',
  damage: 22,
  radius: 38,
  windFactor: 0.2,
  projectileMass: 1.1
}

// 2) js/i18n/de.json
"weapon.tafelwischer.name": "Tafelwischer",
"weapon.tafelwischer.desc": "Verschmierter Wurf",
// (analog en/uk)

// 3) js/render/sprites.js  (weaponIcon-Map ergänzen)
tafelwischer: [
  '________________________',
  // ... 24×24 Grid ...
]
```

Die Waffe taucht dann automatisch im Waffenrad auf und ist auswählbar.

## Tipps

- **Balancing:** Die Werte in `weapons.js` sind Startwerte – fühl dich frei sie zu drehen.
- **Bot-Auswahl:** In `js/ai/bot.js` legt `PREFERRED_WEAPONS` fest, welche Waffen welche Bot-Stufe
  einsetzt. Neue Waffen ggf. dort einsortieren.
- **Sprite-Palette:** Die Farben-Keys (z. B. `R`, `r`, `Y`, `B`, `b`, `K`, `W`, `N`) stehen in
  `PALETTE` in `js/render/sprites.js`. Eigene Farben dort hinzufügen.
