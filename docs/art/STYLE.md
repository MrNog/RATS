# 🐀 RATS — Art Style & Formats

The **single source of truth** for the guild's hero art. Locked style tokens + the "Do NOT include"
clause + a template per format. Character looks live in [`characters/`](characters/) — one file per rat,
**grouped one folder per main** (`characters/<main>/<name>.md`; a main's alts share its folder, e.g.
`okanor/okanata.md`), recalled by name so the same rat renders consistently across every format.

> **How a request works:** commission → save/read the rat's sheet at `characters/<main>/<name>.md` (find it
> with a recursive search `characters/**/<name>.md`) → pick the **format** below → fill the character's look +
> the format's scene into the template. New rat = new sheet (copy `characters/_TEMPLATE.md` into the main's
> folder; a new main gets its own folder).

> **Logo tip:** ChatGPT **recreates** the RATS logo / Horde insignia from text — it won't copy your PNG.
> For a pixel-perfect logo, generate the art first, then paste the `RATS` PNG bottom-right in an editor.

## ⭐ The ONE rule: lock the STYLE, freely vary EVERYTHING else

Only the **locked style tokens** below (art style, rat subjects, brush font + colours, `—⧖—` divider, RATS
watermark, dark-souls Horde mood, CLEAN render) stay fixed — that's what makes every piece feel like RATS.

**Everything else must be fresh and DIFFERENT every single time:** pose · stance · camera angle · framing ·
the subject's position in the frame · lighting direction · environment/scenery · weather · time of day ·
mood beats · composition. **Never repeat a pose or scene you've used before** (especially don't default
casters to "floating" or reuse the same ambient across cards).

The **pose banks and per-format scenes below are INSPIRATION to riff on and rotate — not a fixed menu to
pick one item from.** Invent new poses/scenes in the same spirit; the lists exist so you have range and
know what fits each archetype, not so you cycle the same 8 options. If in doubt, do something you haven't
done yet. (The only exceptions: a **character sheet's** locked look/signature carries across that rat's
images, and Rellik's reserved ruined-battlefield scene.)

---

## 🎨 Locked style tokens (apply to EVERY prompt)

- **Art style line:** "World of Warcraft cinematic concept art, dark-souls Horde style, painterly
  brushwork, ultra-detailed, subtle film-grain texture overlay."
- **Subjects:** anthropomorphic rats — dark fur, prominent whiskers, sharp fierce eyes, clawed hands,
  partially visible tail. Battle-worn black-and-gold Horde plate unless the character sheet says otherwise.
- **Title font** (only on formats that carry text): rough hand-painted **brush-stroke lettering**, thick
  uneven strokes, visible bristle texture + grunge torn edges.
  - Officers / normal cards: **sandy tan-gold `#C8A96E`**.
  - Fangs (grim/elite): **deep blood-red**, grey tagline below.
- **Horde divider:** small Horde insignia flanked by short lines: `—⧖—`.
- **Guild logo:** BOTTOM-RIGHT, small like a signature watermark — "RATS" in sandy tan-gold brush
  lettering immediately followed by the black-and-gold Horde insignia, faint glow, never competing.
- **Mood:** dark, honorable but fierce. Dark/desaturated environment so characters read clearly.
- **Tone — masculine, grim, battle-hardened (ALWAYS):** these are **warrior rats who raid** — rugged,
  tough, war-worn. Heavy battle-scarred armor, hard fierce expressions, grim resolve. **No cute, no pretty,
  no soft/dainty, no "gay" styling.** Palettes stay **dark and manly** — charcoal, iron, blood-red, bronze,
  gold; avoid pastels / pink / cutesy bright colours. **Even healers look tough:** a Holy Paladin reads like
  a **dark-knight who wields the Light** — battered heavy plate, stern face, the holy gold as harsh radiant
  power, NOT a soft angelic look. Same for priests/druids — hardened, never delicate.
- **Build — lean & muscular, NOT fat:** athletic, wiry, powerful — a **slim, muscular, agile** raider's
  physique. Strong and battle-ready; never chubby, overweight or bulky-gut.
- **CLEAN RENDER (ALWAYS):** clear air — NO floating dust motes, NO ember particles, NO speckled glowing
  dots, NO heavy haze. Razor-sharp focus on the rat's face and hands; faces big and readable; correct
  head-to-body proportion; don't oversize the subject; smooth light, no blown-out bloom.
- **ANATOMY & GEAR CORRECTNESS (ALWAYS — models get this wrong):** the rat must be **anatomically correct
  and consistent** — **exactly ONE tail**, ONE head, two arms, two legs, two eyes, five-ish fingers per hand;
  no extra/duplicated limbs, tails or weapons. **State the weapon(s) explicitly and count them**, name which
  hand holds what, and add **"NO extra weapons, ONLY the weapons listed."** A **two-handed weapon is gripped
  with BOTH hands** (or slung/planted) — never a spare dagger/second weapon added. **One item per hand** — a
  shield and a weapon go on **different** hands, never stacked in the same hand. When you fill a prompt from a
  character sheet, carry ONLY that rat's listed gear — don't invent extras.
- **BODY PHYSICS & PLAUSIBLE POSE (ALWAYS — models over-rotate joints):** the pose must obey real anatomy and
  physics. **Joints bend only the way they can** — no over-rotated or hyper-extended shoulders/elbows/wrists,
  no arm twisted behind itself, no limb bending the wrong way. The **head sits naturally on the neck and
  shoulders** (correct neck length, no floating/detached or over-tilted head, no broken neck angle). Shoulders,
  spine and hips stay **consistent and connected**; weight is balanced and believable. State the pose so every
  limb reads clearly and could actually be held.

### The "Do NOT include" clause (paste at the end of every prompt)

> Do NOT include: two tails or any extra tail, extra or duplicated limbs/arms/heads, extra or duplicated
> weapons, a weapon and shield in the SAME hand, a two-handed weapon held one-handed with a spare weapon,
> malformed/fused hands, wrong finger count; over-rotated / hyper-extended / broken joints, arms bending the
> wrong way or twisted behind the body, a detached / floating / over-tilted head, a broken or too-long neck,
> impossible or unbalanced poses; cute / pretty / soft / dainty styling, pastel or pink colours,
> chubby / fat / overweight build, angelic soft healers, floating dust/ember particles, speckled noise, heavy
> haze, oversized/indistinct subject, modern clothing, human faces, Alliance symbols, excessive bloom that
> hides the characters, plain white background. *(For no-text formats also add: any lettering, title, name,
> watermark or logo.)*

### Content-safety (so the generator doesn't refuse — combat/lore art)

NO gore, blood, injury, corpses, or killing/violence words. Enemies are **dark armored silhouettes /
shapes** (or mechanical Titan-forged constructs); never bodies. Frame combat as a **defiant stand /
advance / weapons raised / surging forth**, not slaying. Show aftermath via **abandoned gear, fallen
banners, fading class-glows** — never the dead.

---

## 🧩 Pose banks — BY ARCHETYPE (inspiration to riff on & rotate, NOT a pick-one menu)

These give you **range per archetype** so poses fit the class and stay varied — riff on them or invent new
ones in the same spirit; **don't just cycle the same entries.** A caster charging like a warrior, or a
warrior "floating", reads wrong; reusing "floating/flowing" for every caster makes them all identical. Stay
within the rat's **archetype**, then describe the (ideally fresh) pose in 2–3 concrete sentences — camera +
what each limb/weapon is doing.

**⚡ Casters** (Mage · Warlock · Shadow/Holy Priest · Elemental Shaman) — spell delivery, not just "floating":
- **Overhead conjure** — both arms raised, a forming orb/rune-circle above the palms, face lit from above.
- **Two-hand channel** — staff/orb gripped in both hands, energy spiralling up the shaft, wide braced stance.
- **One-hand bolt** — turned 3/4, one arm thrust forward mid-cast, the other drawn back, robe snapping.
- **Kneeling ritual** — down on one knee over a glowing sigil on the ground, hands spread, upward light.
- **Rune-storm hover** — feet just off the ground, orbiting rune shards, robe flaring down (use sparingly — the "floating" default; don't repeat it card to card).
- **Grimoire cast** (Warlock) — open floating tome in one hand, fel/void flame licking off the other.
- **Backlit silhouette cast** — near back-to-camera, arms wide, the spell blooming in front so the rat is rimlit.

**⚔️ Melee DPS** (Fury Warrior · Ret Paladin · Enhancement Shaman · DK · Feral Druid):
- **Mid-stride charge** — caught mid-step lunging forward, weapon thrust ahead, cloak motion-blur.
- **Overhead cleave wind-up** — weapon raised high two-handed, torqued for a downward swing, low camera.
- **Ground-slam recoil** — just after striking the ground, shockwave rings, crouched from the impact.
- **Dual-wield cross** (Enh/DK) — both weapons swept out to the sides, energy trailing each edge.
- **Feral lunge** (Druid) — mid-leap, claws extended, half-shifted to spirit-cat/bear.

**🛡️ Tanks** (Prot Warrior/Paladin, Blood DK, Guardian):
- **Shield brace** — shield up and forward, braced behind it, weapon low and ready — an immovable wall.
- **Wide guard stance** — feet planted wide, shield out, chin up, commanding — holds the center.
- **Taunt roar** — shield struck with the weapon, head back mid-shout, drawing all eyes.
- **Seated throne pose** — seated on rubble/throne, weapon across the knees, shield resting — the lord at rest.

**🏹 Ranged phys** (Hunter · Marksman):
- **Full draw** — bowstring drawn to the cheek, glowing arrow nocked, one eye sighting down it.
- **Kneel + aim** — down on one knee for a steadied long shot, companion tense beside.
- **Companion command** — arm outflung directing a lunging beast, bow in the other hand.
- **Over-shoulder track** — turning to loose behind, torso twisted, quiver visible.

**🗡️ Stealth** (Rogue · shadow-leaning):
- **Rooftop crouch** — perched low on a ledge/gargoyle, daggers reversed-grip, mid-stalk.
- **Emerge-from-shadow** — half the body dissolving into smoke/shadow, one blade catching light.
- **Back-turned reveal** — seen from behind, head turned over the shoulder, blades hidden low.
- **Ambush drop** — mid-descent from above, daggers leading, cloak spread.

**Universal (any class), for portraits/hero shots:** low-angle dominance · power surge (energy erupting
from the chest) · triumphant stand (weapon grounded, gazing out).

**Combat compositions** (no violence words; dark shapeless silhouettes = "enemies"): spell beam right ·
shockwave burst · triumphant stand over a fallen unnamed form · Horde charge (swarm of allied rats) ·
mid-stride overhead · back-to-camera unleash.

**Class glow palette** (crowd/army scenes): Priests holy-gold / shadow-purple · Mages arcane-violet &
frost-blue · Paladins gold · Druids emerald · Warlocks fel-green (small demon silhouettes) · Rogues
shadow + daggers · Death Knights bone-white/black plate, frost-blue runes, green eyes, runeblades ·
Shamans blue-white lightning, stone totems, storm maces · Hunters earthy brown-green + companion ·
Warriors heavy plate, battle-worn.

**Ranks (for who's in a scene):** **Warchiefs** = the officers/leaders (the named roster). **Fangs** =
recognised veteran raiders — unless a Fang is also a Warchief, render them as a **simple warrior rat**
(dark plate, greatsword/axe/shield), not a distinct hero. Everyone else = the class-army.

---

## 📐 Formats

Each format = the character's locked look (from their sheet) + this scene/framing.

### A — Character / commission card (21:9) — *the main commission*
The signature solo hero card. One rat, heroic pose, no combat. **Name** brush-stroke TOP-CENTER directly
above the rat, **subtitle** below, `—⧖—` divider, RATS watermark bottom-right. Full standing figure in the
central third — face big and readable, headroom + floor, **don't oversize**. Use the character's locked
card pose + ambient. `/rat-art card` also outputs a matching **combat** variant (same rat, action scene).

### B — Profile banner / hero strip (4:1, NO text)
The backdrop **behind** a raider's profile hero banner (`public/profile/`). Only these are FIXED — everything
else (pose, which side he faces, bust vs 3/4 vs action, weapon position, scene) must **vary per rat** (apply
the ONE rule — don't clone `grunho.png`'s framing onto everyone):
1. **NO text/title/watermark/logo/insignia** — the page renders all text.
2. **Left ~third stays dark / low-detail** negative space (name/spec/quip overlay there); the rat sits in the
   **right portion** of the strip. (He can face either way and be a bust OR a dynamic upper-body action crop.)
3. **Class colour is the dominant glow** so the art tints to match the player (Warrior bronze `#C69B6D`, etc.).
4. CLEAN render.
> **Vary it:** give each rat a distinct pose, angle, weapon read and environment — a caster mid-cast, a hunter
> drawing, a rogue emerging from shadow, a paladin's radiant strike. Do NOT default to "bust turned toward
> center, weapon over the shoulder" (that's Grunho's — reserve it for him).
> Wiring: save as `images/profile-bg/<main>/<name>.png` (grouped one folder per main, same as the character
> sheets — a main's alts share its folder, e.g. `okanor/okanata.png`; a main with no art of its own still
> owns the folder). The profile page builds the path from the toon's main and cascades `<main>/<alt>.png` →
> `<main>/<main>.png` → generated banner. The hero shows it whole, CSS fades the left for text.

### C — Profile Discord icon (1:1, NO text) — *NEW*
A square **avatar** — head-and-shoulders **face crop** of the rat, readable at small sizes. Centered face,
strong single rim light, simple dark backdrop (one class-colour glow), no busy props. NO text/logo. Export
large (e.g. 1024×1024); it will be downscaled to a Discord avatar, so keep the face dominant and high-contrast.

### D — iPhone wallpaper (9:19.5 tall portrait) — *NEW*
A **vertical** phone wallpaper. Full or 3/4 figure composed for portrait: subject lower-center, dramatic
environment rising above. **Keep the TOP ~20% and the very bottom simpler/darker** so the clock, notifications
and home-bar stay readable. One dominant key light, class-colour accent. Optional small `—⧖—` + tiny RATS
watermark low-center, or fully text-free — ask which. Export tall (e.g. 1179×2556).

### E — Lore moment (single hero, 21:9 · army/battle 16:9, NO text)
Story art for the chronicles. "NO text, NO title, NO watermark, NO logo — pure illustration only." Single
rat hero (or 2–4), dramatic focal action, epic environment. Apply the **content-safety** rules above.
Done examples: Okanor **reforging Val'anyr** in Ulduar's titan forge; Okanor over the fallen Yogg-Saron as
the fragments blaze into the mace. *(Val'anyr lore: 30 Fragments from Ulduar bosses → Reforged Hammer →
carried into the Yogg-Saron fight → the released titanic energy restores the legendary healer mace.)*

### F — Raid banner (Raid-Helper header, 16:9) — *reference: `images/banners/ICC 10.png`*
The **locked look** (matches ICC 10). The **instance itself is the frame**; a lone rat hero walks into it.

- **Format:** cinematic **16:9** (wide, ~1728×960), NOT 3:1.
- **Title (this format DOES carry text):** the **raid name** in big brush-stroke **gold `#C8A96E`** across the
  **TOP CENTER**, one or two lines, thick uneven bristle strokes. Directly below, the **size/difficulty** as a
  smaller wide-spaced caps subtitle (e.g. `10 MAN`, `25 HEROIC`). Keep the mid-upper area dark so text reads.
- **Hero:** **one OR a few rats** (default one; a small group of 2–4 if asked), **back-to-camera, centered**,
  silhouetted and walking **into** the raid — battle-worn dark Horde plate, cloaks, glowing class weapons
  (axe/blade/staff). Small in frame vs the architecture; they're the figures, the instance is the star.
  For a group: keep them **clustered center in a loose wedge** (a lead rat slightly ahead), still small — do
  NOT spread them across the width or block the flanking gates. Use named rats' locked looks if asked.
- **Frame = the instance:** the raid's iconic entrance **flanks both sides** (ICC = two towering rune-lit
  skull gate-arches left & right), the signature landmark visible through the center gap (ICC = the frozen
  citadel spire), weather in the air (ICC = falling snow).
- **Light & palette:** one cold dominant key light from the center depth (ICC = pale blue citadel glow),
  deep shadow on the flanking architecture, rune accents. Swap palette per raid (Ulduar = titan-bronze/blue,
  ToC = sand/gold arena, Naxx = necro-green, etc.).
- **Logo:** `RATS` + Horde insignia gold, **bottom-right**.
- CLEAN render — no dust/ember/haze/bloom.

```
Digital fantasy illustration, cinematic 16:9 widescreen, World of Warcraft cinematic concept art, dark-souls Horde style, painterly, grim and epic.

Scene: the great entrance of [RAID/INSTANCE] framing the shot — [ICONIC ARCHITECTURE flanking BOTH left and right, e.g. two towering ice gate-arches carved with glowing blue runes and skull motifs], with [THE SIGNATURE LANDMARK, e.g. the frozen citadel spire] visible far through the center gap. [WEATHER, e.g. falling snow] in the cold air. Wet stone floor leading in.

Hero: [one anthropomorphic rat champion — OR a tight cluster of 2–4 rats in a loose wedge, one slightly ahead] — dark fur, battle-worn dark [CLASS] Horde plate, tattered cloak(s) — seen from BEHIND, centered, standing/walking INTO the scene, holding [WEAPON(S) with a faint class-colour glow] low at the side. Kept fairly small against the huge architecture — the instance is the star. Full back silhouette(s), rim-lit by the light ahead, clustered center so the flanking gates stay clear.

Composition: the TOP CENTER and mid-upper area are dark, open negative space for a title. Symmetrical frame, deep one-point perspective drawing the eye to the center landmark.

Light & palette: one cold dominant key light from the center depth ([e.g. pale blue citadel glow]) rim-lighting the rat, deep shadow on the flanking architecture, [RUNE/ACCENT colour] glows. Very dark, desaturated, moody.

Visual identity: large brush-stroke title "[RAID NAME]" across the TOP CENTER in sandy tan-gold (#C8A96E), thick uneven grunge bristle strokes; directly below, a smaller wide-spaced caps subtitle "[SIZE/DIFFICULTY, e.g. 10 MAN]". Small "RATS" + black-and-gold Horde insignia watermark BOTTOM-RIGHT, faint gold glow.

Render quality: CLEAN and crisp — clear air, NO floating dust motes, NO ember particles, NO speckled glowing dots, NO heavy haze, NO bloom. Sharp focus.

Do NOT include: two tails or extra tail, extra/duplicated limbs or weapons, weapon+shield in the same hand, malformed hands, modern clothing, human faces, Alliance symbols, excessive bloom, plain white background, title pushed to a side, rats facing the camera, figures spread across the width or blocking the side gates.
```

### G — Warchiefs / Officers line-up (21:9)
Heroic low-angle line-up, ~6 rats in a slight arc, **Grunho tallest/center**, weapons grounded, Horde
banner billowing behind one side. Brush title `WARCHIEFS` (or `OFFICERS`) top-center, RATS logo
bottom-right. Roster: Foug, Kobe, Okanor, **Grunho (center)**, Rellik, Ardil before a burning blood-red
battlefield ridge. Swap roster/title as needed.

### H — Fangs throne-army (the grim epic, 16:9)
The full guild war-portrait: **Grunho enthroned** center on frozen-throne steps; **first rank** = the named
officers (readable, from their sheets); **second rank** = elite **warrior Fangs** (dark plate, two-handers,
shields — simple warrior rats); **lower tiers/wings** = the class-army by glow colour. Title `WARCHIEF'S
FANGS` blood-red brush top-center; subtitle grey caps `YOU WERE NOT INVITED. YOU WERE CHOSEN.`; crowned
rat-skull crest above; `—⧖—` below; RATS watermark bottom-right. Frozen Icecrown-style citadel at night.

### I — Ceremony / promotion (21:9)
Interior Horde war-tent or ruined hall, braziers, hanging Horde banners. A kneeling raider rat being
bestowed a fang-shaped blade/medallion by **Grunho**, officers in a respectful half-circle, warm gold
light beam on the chosen one. Title `THE FANGS` top-center, RATS logo bottom-right.

---

## 🧱 Reusable prompt block (fill the [BRACKETS])

For text-carrying cards (A/G). Strip the "Visual identity" line + add "NO lettering/logo" for no-text
formats (B/C/D/E).

```
Digital fantasy illustration, cinematic [RATIO] ([PIXELS]), World of Warcraft cinematic concept art, dark-souls Horde style.

Subject & pose: [CHARACTER — from characters/<main>/<name>.md: rat look, armor] — a lean, muscular warrior rat with EXACTLY ONE tail, one head, two arms — wielding [WEAPON(S): count + which hand, equipped/held not propped; a two-hander is held in BOTH hands]. NO extra weapons, ONLY the weapon(s) listed; shield (if any) on the OTHER hand, never stacked with the weapon. In [POSE]. Positioned as a full standing figure in the central third: face large, clear and readable, correct head-to-body proportion, NOT oversized — leave headroom and floor.

Setting: [AMBIENT — the character's per-format scene]. (Rellik's ruined-battlefield scene is reserved for Rellik only.)

Render quality: CLEAN and crisp — clear air, NO floating dust motes, NO ember particles, NO speckled glowing dots, NO heavy haze. Anatomically correct: one tail, no extra/duplicated limbs or weapons, hands well-formed. Sharp focus on face and hands, smooth light.

Visual identity: brush-stroke name "[NAME]" centered across the TOP CENTER directly above the rat, sandy tan-gold (#C8A96E), grunge bristle texture; below, wide-spaced subtitle "[TITLE]"; below that a small Horde insignia flanked by short gold lines —⧖—. Small "RATS" + Horde insignia watermark BOTTOM-RIGHT, faint glow.

Color palette & lighting: [PALETTE + KEY LIGHT — from the character sheet]. High contrast so the rat reads clearly.

Art style: World of Warcraft cinematic concept art, painterly brushwork, ultra-detailed, razor-sharp focus on the rat's face and hands, strictly [RATIO].

Do NOT include: two tails or extra tail, extra/duplicated limbs or weapons, weapon+shield in the same hand, malformed hands, floating dust/ember particles, speckled noise, heavy haze, oversized rat, small/indistinct head, name on the side, modern clothing, human faces, Alliance symbols, excessive bloom, plain white background.
```
