---
description: RATS guild Discord — full structure, decisions & conventions for editing/managing the server
argument-hint: <what you want to do> e.g. "new guild-services post", "edit the rules", "onboarding question", "announcement"
---

You are helping manage the **RATS** World of Warcraft guild Discord (Warmane Onyxia, Horde, WotLK 3.3.5a).
This skill holds the full agreed structure and decisions so you have complete context. Use it to
produce/edit Discord content that fits what's already set up. For guild **voice/copy**, use the `/rats` skill.

The user's request: `$ARGUMENTS`

---

## Server identity
- **<RATS>** · Warmane Onyxia · Horde · casual PvE + PvP.
- Server members are **PT-speaking**, but channels/posts are written in **English** (recruitment messages: English only).
- Voice: filthy-rat / cheese / sewer (see `/rats`). Affectionate banter, never mean. **Never** the word "colleagues".

## Ranks & roles (WoW guild ranks = Discord roles)
Progression: **🐀 Sewer Rat → ⚔️ Raider Rat → 💀 Warchief's Fangs → 👑 Warchief Rat** (+ 🎲 Pug Rat).
- 🐀 **Sewer Rat** — new member, **on trial (~2 weeks, don't state the exact time publicly)**, **no raid-signup priority**. Show up + perform → promoted.
- ⚔️ **Raider Rat** — passed trial; proven raider with **signup priority**.
- 💀 **Warchief's Fangs** — earned, **invite-only** elite ("the rats who refuse to die").
- 👑 **Warchief Rat** — officers.
- 🎲 **Pug Rat** — not in the guild, raids with us only (limited access).
- Role order top→bottom: Warchief Rat → Warchief's Fangs → Raider Rat → 🤖 Bots → Sewer Rat → Pug Rat → @everyone.

## Onboarding flow (KEEP IT SIMPLE — 2 gates only)
1. In-game invite → share the Discord link.
2. Discord **application** ("Answer questions to join"): armory link + experience/availability + ✅ agree to rules → **officer approves**. (← rules accepted HERE; this is the vetting gate.)
3. Discord **native Onboarding** pre-join question **"What do you want to do?"** (single, required): **⚔️ Raid → Sewer Rat** · **🎲 Pug → Pug Rat**. The role unlocks the private channels.
- **Carl-bot is NOT a rules/role gate** (removed). Rules = application; role = onboarding question. Don't re-add reaction-role gating in #start-here.
- Post-join questions (optional, vanity): raid role (Tank/Healer/Melee/Ranged), Language (🇵🇹/🇬🇧 → @PT/@EN), Class.

## Channel structure
**Public (visible to everyone / read-only):**
- `🐀┃start-here` — Guild Rules + how-it-works, **read-only**, also the Server-Guide Resource Page "Guild Rules". NOT a gate.
- `📢┃announcements` — read-only, bot/officers.
- `🐀┃introduction` — members post a short intro (the one public channel they write in).
- `welcome` — bot auto-greeting only.

**Private / role-gated (the actual content — opens with the role):**
- RAID: `raid-wed`, `raid-mon`, `raid-logs`, `🗺️┃raid-strats` (forum), `raid-absence`
- SERVICES: `🧀┃guild-services` (forum)
- SEWERS: `general`, `general-PT`, `irl-non-pixel`, `general-pug`
- VOICE: General PT, General, Raid (PTT), Raid, Arena, AFK

> **RESOURCES category removed from Discord** — the old `📖┃guides-n-macros` and `addons-n-weakauras`
> (incl. the "🚨 MANDATORY — Guild Addon Pack") channels were **deleted and moved to the guild hub site**
> (`public/addons/` = addons · WeakAuras · patch; guides/macros live on the hub too). In Discord, point
> people to the hub link instead of a resources channel — don't re-create those channels.

## Server Guide (Discord native onboarding screen)
- **Welcome Sign**: greets each member; supports `[@username]` for a per-member mention.
- **New Member To-Do** (Discord REQUIRES min 3; each needs an **@everyone-viewable** channel — so only the public ones work):
  1. 📜 Read the rules → `#start-here` (complete on visit)
  2. 👋 Introduce yourself + set nickname to in-game name → `#introduction` (complete on message)
  3. 📢 Catch the latest → `#announcements` (visit)
- **Resource Pages**: only public **read-only** channels (Guild Rules → start-here). Private channels **can't** be tasks/resources — the role handles access.

## Bots (nicknames)
- `🤖 Sewer Keeper` = **Carl-bot** — welcome message in #welcome with `{user}` mention. (No longer the gate.)
- `🤖 Raid Helper` = signups + drops Discord Events w/ countdown. Tell users `/usersettings timezone set`.
- `🤖 WoW Rat` = **Wowhead bot** — run `/setup` → **Wrath Classic** DB (closest to 3.3.5a). `/tooltip <item>`. Custom LotK items won't be found.

## Rules (in #start-here, read-only; also in the application)
1. ⚔️ **RAIDS** — Wed & Mon, **8PM ST**. Signup, on time, know the fight.
2. 🎒 **PREPARED** — RCLootCouncil + DBM. Flask / food / enchants.
3. 💰 **LOOT** — Guild: loot council (BiS prio, not strict MS>OS). Pugs: roll MS>OS.
4. 🤝 **CONDUCT** — Respect, no scam/harassment. Listen to calls. Reliability > parse.
5. 🔥 **ATTITUDE** — Fun AND progress. Respect everyone's time. Break = bench/removal.

## guild-services (🧀┃guild-services Forum Channel)
- **Tags per profession:** Alchemy ✨Enchanting 🧵Tailoring 🛡️Leatherworking 💎Jewelcrafting 🔧Engineering 🧪... + Blacksmithing.
- **Officers create posts** (1 per profession). **Members comment to request**; `@ping the crafter ONLY if OFFLINE` (so they see it next login). Requests can be plain text; `/tooltip` optional.
- **Mats:** requester brings them, crafters only craft. ⭐ **BiS weapon enchant on BiS gear → guild covers half** (Abyss Crystals). **Main character + main spec only.**
- **Links:** use Wowhead **`spell=`** (shows crafted item **+ reagents/mats** — key since mats are on the requester). ALWAYS give the post text in a **code block** so the raw `[name](url)` markdown is copyable.
- **Crafters roster:** JC = Okanata/Jc/Kobe · Engineering = Okanata/Jc · Enchanting = Kobe/Ardil (+ alts Grunho/Jc/Okanata; they have ALL enchants) · Leatherworking = Ardil · Tailoring = Nutela · Alchemy = Grunho (Elixir Master) + Jc (Potion Master) · Blacksmithing = (add name).
- **JC tokens:** ToC brings new gem cuts (cost daily Jeweler tokens, 3 tokens = 1 pattern). Members comment the cuts they want → officers tally the most-requested and split which patterns to buy (no dupes / wasted tokens).

## Discord formatting gotchas (IMPORTANT)
- Headers: `#` big, `##` medium, `###` small. **Channel topic does NOT render headers** — use a pinned message for fancy formatting.
- **Channel mentions** are only clickable if typed with `#` and picked live in Discord; a pasted `#name` is plain text. Tell the user to re-link `#` after pasting.
- **No colored text** in normal messages (only `ansi` code blocks, not clickable) and **no inline hover tooltips**. For item tooltips use the **WoW Rat bot** embed or markdown links.
- When the post has **links**, deliver it **inside a ``` code block** so the `[text](url)` survives copy-paste. For plain text (no links) the user prefers it NOT in a code block.
- Server-Guide welcome uses `[@username]`; Carl welcome uses `{user}`.

## Discord Broadcast (Warmane management panel)
- The guild management web panel has a **webhook** field → point it at an officer channel. Keep the webhook URL **secret** (anyone with it can post). Create it via the target channel → Integrations → Webhooks.

---

Now do what the user asked (`$ARGUMENTS`), staying consistent with everything above. If the request is
guild-voice copy (welcome/hype/rules flavor), lean on the `/rats` voice. Ask only if a decision genuinely
isn't covered here.
