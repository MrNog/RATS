# Okanvil — default class rats (Ranking card, no portrait)

The art Okanvil shows on a raider's **Ranking card** when they have no portrait in Okanvil-Art: one
generic rat per class. Ships inside Okanvil as `Media/Ranking/_<class>.blp`.

These **replace the old plain class backdrops** (abstract glow, no rat) in the addon only. The site's
profile fallback (`images/profile-bg/_class/`) stays plain on purpose. See its README.

## Rules for all 10

- **2:1, 2048×1024, NO text.** No name, title, watermark, logo or insignia.
- **A generic rat, not a raider.** Helmet, hood or shadow keeps the face anonymous enough that nobody
  mistakes it for a guild member's portrait, but the eyes and snout still read.
- **The rat stands at about 62% across** (a little right of centre), whole from the head to the knees.
  The card crops to a narrow upright window around that point, so **nothing important at the far left
  or the far right**.
- **Bottom quarter calm and darker:** the card puts the rank and the name on a dark band there.
- **Class colour is the main glow**, so the card tints to the class at a glance.
- Locked style, tone, build and anatomy from [`../STYLE.md`](../STYLE.md). Each class has its own
  build and face, and its own pose and scene. Don't reuse one across classes.

**Saving:** put each PNG in `images/okanvil/class-rats/<slug>.png` (slugs: `deathknight`, `druid`,
`hunter`, `mage`, `paladin`, `priest`, `rogue`, `shaman`, `warlock`, `warrior`). They then get converted
to 1024×512 BLP DXT5 with `wow-addons/Okanvil/scripts/png2blp_dxt5.py` (Pillow 11.2+) into
`Okanvil/Media/Ranking/_<slug>.blp`, and WoW needs a full restart.

---

## Death Knight

```
Digital fantasy illustration, cinematic 2:1 ultra-wide (2048x1024), World of Warcraft cinematic concept art, dark-souls Horde style, painterly brushwork, ultra-detailed, subtle film-grain texture overlay. NO text, NO lettering, NO title, NO watermark, NO logo, NO insignia.

Subject & pose: a generic anonymous death knight rat — heavy plate build, thick neck and shoulders, broad blunt muzzle, frost-pale fur, cold glowing blue eyes under a horned saronite helm that shadows the brow; dark fur, prominent whiskers, clawed hands, EXACTLY ONE tail. Black-and-bone Horde plate etched with faint frost-blue runes. He grips ONE runeblade in BOTH hands, point planted in the frozen ground in front of him, leaning on it, head lowered, looking up at the viewer. NO extra weapons, ONLY the one runeblade. Standing figure from the head to the knees, placed about 62% across the frame, face large and readable, headroom above.

Setting: a frozen Icecrown rampart at night, ice-crusted black stone, a cold blue moon behind, the far left of the frame falling into deep shadow. The bottom quarter is calm dark frozen ground.

Render quality: CLEAN and crisp — clear air, NO floating dust motes, NO ember particles, NO speckled glowing dots, NO heavy haze. Anatomically correct, joints natural, head sitting naturally on the neck.

Color palette & lighting: dominant crimson-red #C41E3A rim light and runic glow against frost blue and black; high contrast so the rat reads clearly.

Do NOT include: any lettering, title, name, watermark or logo; two tails or any extra tail, extra or duplicated limbs/arms/heads, extra or duplicated weapons, malformed/fused hands, wrong finger count; over-rotated or broken joints, a detached or over-tilted head; cute / pretty / soft / dainty styling, pastel or pink colours, chubby / fat build, floating dust/ember particles, speckled noise, heavy haze, oversized/indistinct subject, modern clothing, human faces, Alliance symbols, excessive bloom, plain white background.
```

## Druid

```
Digital fantasy illustration, cinematic 2:1 ultra-wide (2048x1024), World of Warcraft cinematic concept art, dark-souls Horde style, painterly brushwork, ultra-detailed, subtle film-grain texture overlay. NO text, NO lettering, NO title, NO watermark, NO logo, NO insignia.

Subject & pose: a generic anonymous druid rat — lean and wiry, medium pointed snout, grey-streaked fur, a hood of dark leather and woven bark with small antlers growing through it, eyes glinting amber from the shadow of the hood; prominent whiskers, clawed hands, EXACTLY ONE tail. Rugged leather and bark armour with bone fetishes. He crouches on one knee on a mossy root, ONE gnarled staff held upright in his left hand, his right claw pressed flat to the earth where faint emerald light spreads through the roots. NO extra weapons, ONLY the one staff. Figure from the head to the knees, placed about 62% across the frame, face large and readable.

Setting: an ancient dark forest at dusk, huge twisted trunks, a cold mist low between them (thin, not haze), the far left fading into deep shadow. The bottom quarter is calm dark roots and moss.

Render quality: CLEAN and crisp — clear air, NO floating dust motes, NO ember particles, NO speckled glowing dots, NO heavy haze. Anatomically correct, joints natural, head sitting naturally on the neck.

Color palette & lighting: dominant druid orange #FF7C0A as warm rim light and lantern-like glow in the bark, with deep forest greens and browns; high contrast.

Do NOT include: any lettering, title, name, watermark or logo; two tails or any extra tail, extra or duplicated limbs/arms/heads, extra or duplicated weapons, malformed/fused hands, wrong finger count; over-rotated or broken joints, a detached or over-tilted head; cute / pretty / soft / dainty styling, pastel or pink colours, chubby / fat build, floating dust/ember particles, speckled noise, heavy haze, oversized/indistinct subject, modern clothing, human faces, Alliance symbols, excessive bloom, plain white background.
```

## Hunter

```
Digital fantasy illustration, cinematic 2:1 ultra-wide (2048x1024), World of Warcraft cinematic concept art, dark-souls Horde style, painterly brushwork, ultra-detailed, subtle film-grain texture overlay. NO text, NO lettering, NO title, NO watermark, NO logo, NO insignia.

Subject & pose: a generic anonymous hunter rat — wiry, medium pointed snout, a ragged hood and a cloth wrap over the lower muzzle so only the sharp eyes show; dark fur, prominent whiskers, clawed hands, EXACTLY ONE tail. Worn mail and leather, a quiver on the back. He kneels on one knee on a rocky ledge, ONE longbow at full draw, the string drawn to his cheek with his right hand, the bow held in his left, an arrow nocked and aimed off to the right of the frame. NO extra weapons, ONLY the one bow and the one nocked arrow. Figure from the head to the knees, placed about 62% across the frame, face large and readable.

Setting: a windswept Storm Peaks ridge at dawn, snowy peaks far behind, a hawk silhouette in the sky, the far left in deep shadow. The bottom quarter is calm dark rock.

Render quality: CLEAN and crisp — clear air, NO floating dust motes, NO ember particles, NO speckled glowing dots, NO heavy haze. Anatomically correct, joints natural, head sitting naturally on the neck.

Color palette & lighting: dominant hunter green #AAD372 as the dawn rim light along the bow and fur, with earthy browns and cold greys; high contrast.

Do NOT include: any lettering, title, name, watermark or logo; two tails or any extra tail, extra or duplicated limbs/arms/heads, extra or duplicated weapons, malformed/fused hands, wrong finger count; over-rotated or broken joints, a detached or over-tilted head; cute / pretty / soft / dainty styling, pastel or pink colours, chubby / fat build, floating dust/ember particles, speckled noise, heavy haze, oversized/indistinct subject, modern clothing, human faces, Alliance symbols, excessive bloom, plain white background.
```

## Mage

```
Digital fantasy illustration, cinematic 2:1 ultra-wide (2048x1024), World of Warcraft cinematic concept art, dark-souls Horde style, painterly brushwork, ultra-detailed, subtle film-grain texture overlay. NO text, NO lettering, NO title, NO watermark, NO logo, NO insignia.

Subject & pose: a generic anonymous mage rat — slight gaunt build, narrow skull, fine tapering snout, hollow cheeks, a deep cowl casting the upper face in shadow with two pale blue eyes glowing inside; dark fur, prominent whiskers, clawed hands, EXACTLY ONE tail. Dark violet and black robes with tarnished silver trim. Turned three-quarters, his right arm thrust forward mid-cast with a sharp frost-and-arcane rune circle forming in front of the palm, his left hand drawn back holding ONE short wand. NO extra weapons, ONLY the one wand. Figure from the head to the knees, placed about 62% across the frame, face large and readable.

Setting: a ruined Dalaran-style library at night, tall cracked arched windows, a cold moon, floating books frozen still on the right (few, crisp), the far left in deep shadow. The bottom quarter is calm dark flagstone.

Render quality: CLEAN and crisp — clear air, NO floating dust motes, NO ember particles, NO speckled glowing dots, NO heavy haze. Anatomically correct, joints natural, head sitting naturally on the neck.

Color palette & lighting: dominant mage cyan #3FC7EB from the rune circle lighting the face and robes from the front, deep violet shadows; high contrast.

Do NOT include: any lettering, title, name, watermark or logo; two tails or any extra tail, extra or duplicated limbs/arms/heads, extra or duplicated weapons, malformed/fused hands, wrong finger count; over-rotated or broken joints, a detached or over-tilted head; cute / pretty / soft / dainty styling, pastel or pink colours, chubby / fat build, floating dust/ember particles, speckled noise, heavy haze, oversized/indistinct subject, modern clothing, human faces, Alliance symbols, excessive bloom, plain white background.
```

## Paladin

```
Digital fantasy illustration, cinematic 2:1 ultra-wide (2048x1024), World of Warcraft cinematic concept art, dark-souls Horde style, painterly brushwork, ultra-detailed, subtle film-grain texture overlay. NO text, NO lettering, NO title, NO watermark, NO logo, NO insignia.

Subject & pose: a generic anonymous paladin rat — a dark knight who wields the Light, heavy plate build, broad blunt muzzle, strong jaw, a closed great-helm with a T-shaped visor so only the glowing eyes show; dark fur at the neck, prominent whiskers through the visor, clawed hands, EXACTLY ONE tail. Battered black-and-gold Horde plate, a torn crimson tabard. He stands square, ONE heavy war-hammer held head-down in his right hand, ONE kite shield with a sun emblem on his left arm, the Light rising off the hammer's head as harsh golden radiance. Hammer and shield on different hands. NO extra weapons, ONLY the one hammer and the one shield. Figure from the head to the knees, placed about 62% across the frame, face large and readable.

Setting: a ruined cathedral nave at dusk, broken pillars, a shaft of hard light from a shattered rose window behind, the far left in deep shadow. The bottom quarter is calm dark rubble.

Render quality: CLEAN and crisp — clear air, NO floating dust motes, NO ember particles, NO speckled glowing dots, NO heavy haze. Anatomically correct, joints natural, head sitting naturally on the neck.

Color palette & lighting: dark iron and gold, the class tint #F58CBA kept to a deep rose-crimson in the tabard and the rim of the light (never pastel pink); harsh golden key light; high contrast.

Do NOT include: any lettering, title, name, watermark or logo; two tails or any extra tail, extra or duplicated limbs/arms/heads, extra or duplicated weapons, a weapon and shield in the SAME hand, malformed/fused hands, wrong finger count; over-rotated or broken joints, a detached or over-tilted head; cute / pretty / soft / dainty styling, pastel or pink colours, angelic soft healer look, chubby / fat build, floating dust/ember particles, speckled noise, heavy haze, oversized/indistinct subject, modern clothing, human faces, Alliance symbols, excessive bloom, plain white background.
```

## Priest

```
Digital fantasy illustration, cinematic 2:1 ultra-wide (2048x1024), World of Warcraft cinematic concept art, dark-souls Horde style, painterly brushwork, ultra-detailed, subtle film-grain texture overlay. NO text, NO lettering, NO title, NO watermark, NO logo, NO insignia.

Subject & pose: a generic anonymous priest rat — slight and gaunt, narrow skull, fine snout, stern hard face, a heavy grey hood with a ragged edge shadowing the eyes; dark fur, prominent whiskers, clawed hands, EXACTLY ONE tail. Layered dark cloth vestments with bone and silver clasps, prayer beads at the belt. He stands with his head bowed, ONE iron-banded holy book held open in his left hand, his right hand raised palm-up where a hard white-and-shadow flame burns. NO weapons, ONLY the book. Figure from the head to the knees, placed about 62% across the frame, face large and readable.

Setting: a crypt chapel at night lit only by his flame, carved pillars, a cracked altar behind, the far left in deep shadow. The bottom quarter is calm dark stone.

Render quality: CLEAN and crisp — clear air, NO floating dust motes, NO ember particles, NO speckled glowing dots, NO heavy haze. Anatomically correct, joints natural, head sitting naturally on the neck.

Color palette & lighting: dominant priest white #E6E6E6 as a cold hard light from the flame, with a shadow-purple undertone in the dark; high contrast.

Do NOT include: any lettering, title, name, watermark or logo; two tails or any extra tail, extra or duplicated limbs/arms/heads, extra or duplicated weapons, malformed/fused hands, wrong finger count; over-rotated or broken joints, a detached or over-tilted head; cute / pretty / soft / dainty styling, pastel or pink colours, angelic soft healer look, chubby / fat build, floating dust/ember particles, speckled noise, heavy haze, oversized/indistinct subject, modern clothing, human faces, Alliance symbols, excessive bloom, plain white background.
```

## Rogue

```
Digital fantasy illustration, cinematic 2:1 ultra-wide (2048x1024), World of Warcraft cinematic concept art, dark-souls Horde style, painterly brushwork, ultra-detailed, subtle film-grain texture overlay. NO text, NO lettering, NO title, NO watermark, NO logo, NO insignia.

Subject & pose: a generic anonymous rogue rat — wiry and sharp, a short notched snout, a black hood and a mask over the lower muzzle, only narrowed yellow eyes showing; dark fur, prominent whiskers, clawed hands, EXACTLY ONE tail. Black leather armour with buckled straps. He crouches low on a rooftop ledge, ONE dagger in each hand in reverse grip, the left hand braced on the ledge, the right blade catching the light; half of his cloak dissolving into shadow. NO extra weapons, ONLY the two daggers. Figure from the head to the knees, placed about 62% across the frame, face large and readable.

Setting: the rooftops of a dark Undercity-style city at night, chimneys and spires, a sickly moon, the far left in deep shadow. The bottom quarter is calm dark slate roof.

Render quality: CLEAN and crisp — clear air, NO floating dust motes, NO ember particles, NO speckled glowing dots, NO heavy haze. Anatomically correct, joints natural, head sitting naturally on the neck.

Color palette & lighting: dominant rogue yellow #FFF569 kept to a dirty gold glint on the blades and the eyes, against black and cold blue; high contrast.

Do NOT include: any lettering, title, name, watermark or logo; two tails or any extra tail, extra or duplicated limbs/arms/heads, extra or duplicated weapons, malformed/fused hands, wrong finger count; over-rotated or broken joints, a detached or over-tilted head; cute / pretty / soft / dainty styling, pastel or pink colours, chubby / fat build, floating dust/ember particles, speckled noise, heavy haze, oversized/indistinct subject, modern clothing, human faces, Alliance symbols, excessive bloom, plain white background.
```

## Shaman

```
Digital fantasy illustration, cinematic 2:1 ultra-wide (2048x1024), World of Warcraft cinematic concept art, dark-souls Horde style, painterly brushwork, ultra-detailed, subtle film-grain texture overlay. NO text, NO lettering, NO title, NO watermark, NO logo, NO insignia.

Subject & pose: a generic anonymous shaman rat — old and lean, grey-muzzled, one torn ear, a wolf-pelt hood whose skull shades the eyes; dark fur, prominent whiskers, clawed hands, EXACTLY ONE tail. Mail and hide armour hung with bone and stone charms. He stands braced in the wind, ONE stone-headed mace raised overhead in his right hand with blue-white lightning crawling down its haft, his left hand open toward ONE carved stone totem planted beside him. NO extra weapons, ONLY the one mace and the one totem. Figure from the head to the knees, placed about 62% across the frame, face large and readable.

Setting: a stormy cliff top over a dark sea, heavy clouds lit from inside by lightning, the far left in deep shadow. The bottom quarter is calm dark wet rock.

Render quality: CLEAN and crisp — clear air, NO floating dust motes, NO ember particles, NO speckled glowing dots, NO heavy haze. Anatomically correct, joints natural, head sitting naturally on the neck.

Color palette & lighting: dominant shaman blue #0070DD from the lightning lighting the face and pelt, with storm greys and wet stone; high contrast.

Do NOT include: any lettering, title, name, watermark or logo; two tails or any extra tail, extra or duplicated limbs/arms/heads, extra or duplicated weapons, malformed/fused hands, wrong finger count; over-rotated or broken joints, a detached or over-tilted head; cute / pretty / soft / dainty styling, pastel or pink colours, chubby / fat build, floating dust/ember particles, speckled noise, heavy haze, oversized/indistinct subject, modern clothing, human faces, Alliance symbols, excessive bloom, plain white background.
```

## Warlock

```
Digital fantasy illustration, cinematic 2:1 ultra-wide (2048x1024), World of Warcraft cinematic concept art, dark-souls Horde style, painterly brushwork, ultra-detailed, subtle film-grain texture overlay. NO text, NO lettering, NO title, NO watermark, NO logo, NO insignia.

Subject & pose: a generic anonymous warlock rat — gaunt and angular, long thin snout, hollow cheeks, a spiked dark hood over the head, eyes burning violet in its shadow; dark fur, prominent whiskers, clawed hands, EXACTLY ONE tail. Black and deep-purple robes with bone spikes on the shoulders. He kneels over a glowing summoning circle carved into the floor, ONE open grimoire floating before him at chest height, both hands spread over the circle as violet fel flame rises from it. NO weapons, ONLY the grimoire. Figure from the head to the knees, placed about 62% across the frame, face large and readable.

Setting: a sunken ritual chamber, black stone and chains, a small horned shadow silhouette half-formed in the flame behind him, the far left in deep shadow. The bottom quarter is calm dark floor beyond the circle's glow.

Render quality: CLEAN and crisp — clear air, NO floating dust motes, NO ember particles, NO speckled glowing dots, NO heavy haze. Anatomically correct, joints natural, head sitting naturally on the neck.

Color palette & lighting: dominant warlock violet #8788EE from the circle lighting the face from below, with a sickly fel-green edge; high contrast.

Do NOT include: any lettering, title, name, watermark or logo; two tails or any extra tail, extra or duplicated limbs/arms/heads, extra or duplicated weapons, malformed/fused hands, wrong finger count; over-rotated or broken joints, a detached or over-tilted head; cute / pretty / soft / dainty styling, pastel or pink colours, chubby / fat build, floating dust/ember particles, speckled noise, heavy haze, oversized/indistinct subject, modern clothing, human faces, Alliance symbols, excessive bloom, plain white background.
```

## Warrior

```
Digital fantasy illustration, cinematic 2:1 ultra-wide (2048x1024), World of Warcraft cinematic concept art, dark-souls Horde style, painterly brushwork, ultra-detailed, subtle film-grain texture overlay. NO text, NO lettering, NO title, NO watermark, NO logo, NO insignia.

Subject & pose: a generic anonymous warrior rat — heavy plate build, thick neck, broad blunt scarred muzzle, a dented open-faced helm with a nose guard, hard fierce eyes; dark fur, prominent whiskers, clawed hands, EXACTLY ONE tail. Battle-worn black-and-gold Horde plate, a torn red cloak. Low camera, he stands over a broken barricade with ONE two-handed great-axe gripped in BOTH hands, resting across his shoulders, chin up, gazing past the viewer. NO extra weapons, ONLY the one great-axe. Figure from the head to the knees, placed about 62% across the frame, face large and readable.

Setting: a burning siege gate at dusk seen from outside, fallen Horde banners on the ground, smoke kept thin and far back, the far left in deep shadow. The bottom quarter is calm dark churned earth.

Render quality: CLEAN and crisp — clear air, NO floating dust motes, NO ember particles, NO speckled glowing dots, NO heavy haze. Anatomically correct, joints natural, head sitting naturally on the neck.

Color palette & lighting: dominant warrior bronze #C69B6D as the firelight rim on plate and fur, with iron greys and blood-red cloth; high contrast.

Do NOT include: any lettering, title, name, watermark or logo; two tails or any extra tail, extra or duplicated limbs/arms/heads, extra or duplicated weapons, a two-handed weapon held one-handed, malformed/fused hands, wrong finger count; over-rotated or broken joints, a detached or over-tilted head; cute / pretty / soft / dainty styling, pastel or pink colours, chubby / fat build, floating dust/ember particles, speckled noise, heavy haze, oversized/indistinct subject, modern clothing, human faces, Alliance symbols, excessive bloom, plain white background.
```
