/* RATS — Fun & Shame quips. EDIT THIS FILE to change the joke lines on the Fun & Shame tab.
   No coding needed — just edit the text between the quotes. Rules:
     • Keep the surrounding quotes "  " and the commas.
     • {b} is replaced by the (short) boss name — e.g. "on {b}?" → "on Kolo?".
     • {n} is the player name (only used where noted).
     • Emojis are fine. Keep them PG-13 and rat/cheese/Horde flavour (no real insults).
     • Each list can have as many lines as you want; one is picked per player+boss (stable, no flicker).
   After editing, just reload the page — no build step.

   NOTE: only `ghost` is live right now. `bossDeath` (Cliff Diver) and `scenic` (Scenic route) are PARKED —
   those two cards are disabled until the wow-logs API exposes a `deaths` field (a low parse can be a
   mid-fight death, not lack of skill, and we can't tell them apart yet). Kept here ready to re-enable. */
window.RATS_QUIPS = {
  // 💀 [PARKED] CLIFF DIVER — an absurdly low parse (<500 DPS) = almost always a mechanic death.
  // The line depends on the BOSS. Add/remove bosses freely; "$default" covers any boss not listed.
  bossDeath: {
    "Kologarn": [
      "charged off the edge? 🪂",
      "Heroic Leap → Heroic Yeet 🫡",
      "found out there's no back wall 🕳️",
      "gravity: 1, you: 0 🪂",
    ],
    "Thorim": [
      "fell off the arena? 🌩️",
      "yeeted into the crowd 🏟️",
      "met the edge, not the boss ⚡",
    ],
    "Mimiron": [
      "hugged a bomb 💥",
      "stood in the fire (all of it) 🔥",
      "found the rocket the hard way 🚀",
    ],
    "Flame Leviathan": [
      "ran over by our own vehicle 🚗",
      "forgot to hop in a chopper 🛞",
    ],
    "XT-002 Deconstructor": [
      "ate a Tympanic Tantrum 💢",
      "hugged a Light Bomb 💡",
    ],
    "Hodir": [
      "froze solid 🧊",
      "stood outside the toasty fire ❄️",
      "flash-frozen mid-cast 🥶",
    ],
    "Freya": [
      "hugged a Ground Tremor 🌱",
      "lasered by a Sunbeam ☀️",
    ],
    "General Vezax": [
      "ran dry, then ran out of life 💙",
      "stood in the Saronite vapor ☠️",
    ],
    "Yogg-Saron": [
      "went insane and walked into a cloud 🧠",
      "stared too long at the tentacles 👁️",
    ],
    "Auriaya": [
      "pounced by a Sanctum Sentry 🐈",
      "feared off a ledge 😱",
    ],
    "Ignis the Furnace Master": [
      "slag-potted 🫕",
      "took a Flame Jet nap 🔥",
    ],
    "Razorscale": [
      "fried by a Flame Breath 🐉",
      "stood in the Fuse Armor 💣",
    ],
    "Assembly of Iron": [
      "Rune of Death'd ⚡",
      "overloaded on Lightning Whirl 🔩",
    ],
    "Algalon the Observer": [
      "swallowed by a Black Hole 🕳️",
      "erased by Big Bang 💫",
    ],
    // fallback for any boss without its own list above
    "$default": [
      "died before the first cast on {b} ⚰️",
      "blinked and missed {b} 💨",
      "took the dirt nap on {b} 🪦",
      "showed up, then left {b} early 👋",
    ],
  },

  // 🐢 [PARKED] SCENIC ROUTE — the lowest LEGIT parse (alive, just slow). {b} = boss.
  scenic: [
    "admiring the view on {b}? 🏞️",
    "on {b} — auto-attack enjoyer 🐌",
    "were you afk on {b}? ☕",
    "rotation? on {b}? never heard of it 🎻",
  ],

  // 💤 RAID GHOST — showed up to the fewest kills.
  ghost: [
    "where'd you go? 👻",
    "the raid missed you 🫥",
    "logged on to log off 💤",
    "cheese break? 🧀",
  ],
};
