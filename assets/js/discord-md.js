// Discord-flavoured markdown, shared by the officer Lore poster (officer/lore/) and the public
// chronicles page (public/lore/). One emoji table and one renderer, so a tale reads the same on
// the site as it did in Discord.
window.RatsMD = (function () {
  // Discord webhooks DON'T convert :shortcodes: -- the poster turns them into real emoji before
  // sending, and the site does the same when it shows a tale.
  const EMOJI = {
    crossed_swords: "⚔️",
    bow_and_arrow: "🏹",
    shield: "🛡️",
    dagger: "🗡️",
    axe: "🪓",
    hammer: "🔨",
    hammer_and_pick: "⚒️",
    wrench: "🔧",
    gear: "⚙️",
    skull: "💀",
    skull_and_crossbones: "☠️",
    crown: "👑",
    trophy: "🏆",
    medal: "🏅",
    military_medal: "🎖️",
    first_place: "🥇",
    second_place: "🥈",
    third_place: "🥉",
    fire: "🔥",
    boom: "💥",
    zap: "⚡",
    star: "⭐",
    star2: "🌟",
    sparkles: "✨",
    dizzy: "💫",
    comet: "☄️",
    snowflake: "❄️",
    dragon: "🐉",
    gem: "💎",
    ring: "💍",
    moneybag: "💰",
    dollar: "💵",
    100: "💯",
    muscle: "💪",
    dart: "🎯",
    game_die: "🎲",
    video_game: "🎮",
    heart: "❤️",
    broken_heart: "💔",
    green_heart: "💚",
    blue_heart: "💙",
    purple_heart: "💜",
    yellow_heart: "💛",
    orange_heart: "🧡",
    black_heart: "🖤",
    white_heart: "🤍",
    sparkling_heart: "💖",
    two_hearts: "💕",
    heartpulse: "💗",
    rat: "🐀",
    mouse: "🐭",
    cheese: "🧀",
    beer: "🍺",
    beers: "🍻",
    tada: "🎉",
    confetti_ball: "🎊",
    partying_face: "🥳",
    sob: "😭",
    joy: "😂",
    sunglasses: "😎",
    smiling_imp: "😈",
    imp: "👿",
    ghost: "👻",
    eyes: "👀",
    rage: "😡",
    angry: "😠",
    triumph: "😤",
    sweat_drops: "💦",
    point_right: "👉",
    point_left: "👈",
    point_up: "👆",
    point_down: "👇",
    ok_hand: "👌",
    thumbsup: "👍",
    "+1": "👍",
    thumbsdown: "👎",
    "-1": "👎",
    clap: "👏",
    pray: "🙏",
    raised_hands: "🙌",
    wave: "👋",
    fist: "👊",
    punch: "👊",
    hourglass: "⌛",
    hourglass_flowing_sand: "⏳",
    alarm_clock: "⏰",
    lock: "🔒",
    unlock: "🔓",
    key: "🔑",
    scroll: "📜",
    crossed_flags: "🎌",
    checkered_flag: "🏁",
    heavy_check_mark: "✔️",
    white_check_mark: "✅",
    x: "❌",
    warning: "⚠️",
    exclamation: "❗",
    question: "❓",
    rotating_light: "🚨",
    no_entry: "⛔",
    no_entry_sign: "🚫",
    sun: "☀️",
    sunny: "☀️",
    full_moon: "🌕",
    crescent_moon: "🌙",
    new_moon: "🌑",
    milky_way: "🌌",
    rainbow: "🌈",
  };

  // :name: -> emoji (skips custom emoji like <:name:123>, which is followed by digits)
  function emojify(s) {
    return String(s).replace(/:([a-z0-9_+\-]{2,}):(?!\d)/g, (m, n) => EMOJI[n] || m);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  }

  // inline marks, on text that is already escaped
  function inline(h) {
    return h
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+?)\*/g, "$1<em>$2</em>")
      .replace(/__(.+?)__/g, "<u>$1</u>");
  }

  // A whole tale -> HTML blocks: # headings, > quotes, paragraphs split on blank lines, single
  // newlines kept as line breaks. Discord pings mean nothing on the site, so they are dropped.
  function render(md) {
    const text = emojify(String(md || ""))
      .replace(/<@[&!]?\d+>/g, "")
      .replace(/@(everyone|here)\b/g, "")
      .replace(/\*\*[ \t]*\*\*/g, "") // bold left empty by a dropped ping (same line only)
      .trim();
    return text
      .split(/\n\s*\n/)
      .map((block) => {
        const b = block.trim();
        if (!b) return "";
        const h = b.match(/^(#{1,3})\s+(.*)$/);
        if (h && !b.includes("\n")) {
          const n = h[1].length + 1;
          return `<h${n}>${inline(esc(h[2]))}</h${n}>`;
        }
        if (b.split("\n").every((l) => /^>\s?/.test(l))) {
          return "<blockquote>" + inline(esc(b.replace(/^>\s?/gm, ""))).replace(/\n/g, "<br>") + "</blockquote>";
        }
        return "<p>" + inline(esc(b)).replace(/\n/g, "<br>") + "</p>";
      })
      .join("");
  }

  return { EMOJI, emojify, esc, inline, render };
})();
