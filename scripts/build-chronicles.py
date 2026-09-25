"""Build public/lore/chronicles.json from the chronicles in docs/art/chronicles/.

Each chronicle .md carries its Discord post in the first ``` block under a
"## Discord post" heading; that block is the tale shown on the site. The title
is the file's H1 without " — RATS Chronicle", the date is when the file was
first committed (the day the tale was written), and the art is set in ART below.

Run after adding or editing a chronicle:
    python scripts/build-chronicles.py
Tales posted from the officer Lore tool do NOT need this: they go to the
Firebase `lore` node and the page merges both.
"""
import json
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs", "art", "chronicles")
OUT = os.path.join(ROOT, "public", "lore", "chronicles.json")

# chronicle file -> art (repo path). A chronicle with no entry shows without art.
ART = {
    "valanyr": "images/lore/Val'anyr.png",
    "grunho-and-the-red-tide": "images/lore/Grunho Charge.png",
    "grunho-the-five-day-exile": "images/warchiefs/Grunho Banned.png",
    "foug-three-deaths": "images/lore/foug dk reroll.png",
    "ninjacaldas-turning": "images/lore/ninja shama reroll.png",
    "trial-of-the-crusader": "images/banners/ToC 25.png",
    "heroic-toc-first-kill": "images/banners/ToGC 25.png",
    "togc-10-tribute-to-insanity": "images/banners/ToC 10.png",
    "lich-king-10-kill": "images/lore/Kingslayers alt.png",
}


# Discord pings in the posts -> the raider they ping (a ping means nothing on the site).
MENTIONS = {
    "1295762889730297917": "Grunho",
    "1420088227813130360": "Ninjacaldas",
    "323497935210020866": "Okanor",
    "170571891784810498": "Rellik",
    "146677218280603648": "Kobee",
    "357676115260866561": "Onetreeheals",
    "295517084417261578": "Shmurda",
    "363487377357799436": "Lecoque",
    "284762766944894996": "Tchilly",
    "671395320550129680": "Cryptwall",
    "358687313183768597": "Yahmom",
}

# More art inside a tale, beyond the hero image. "after" is a phrase from the paragraph the picture
# follows; without it (or when the phrase is not found) the picture goes at the end of the tale.
EXTRA_ART = {
    "lich-king-10-kill": [
        {"src": "images/lore/Kingslayers Rite.png", "after": "old rite of the Sewer",
         "caption": "The old rite of the Sewer — sat, stood, sat, stood. With great respect. Mostly."},
    ],
}

# A special tale: pinned to the top of the page as the featured one whatever its date, with a label
# on its badge and, optionally, a roll of the raiders it belongs to (their mains, shown with their
# profile banners at the end of the tale). The roll replaces the post's own line of names.
SPECIAL = {
    "lich-king-10-kill": {
        "label": "Kingslayer",
        "roll": ["Grunho", "Okanor", "Rellik", "Kobee", "Onetreeheals",
                 "Shmurda", "Lecoque", "Tchilly", "Cryptwall", "Yahmom"],
        "rollTitle": "The Kingslayers",
        "rollSub": "Carved into the ice forever — ten rats, one throne.",
    },
}


def for_site(body):
    """The Discord post as the site shows it: pings named, and the lines that were only
    wrapped to keep the .md readable joined back into their paragraph."""
    body = re.sub(r"<@!?(\d+)>", lambda m: MENTIONS.get(m.group(1), ""), body)
    # A Discord masked link ("[the Kingslayers](<url>)") points readers at this very page; on the site
    # it keeps only its words.
    body = re.sub(r"\[([^\]]+)\]\(<?https?://[^)>\s]+>?\)", r"\1", body)
    paras = []
    for para in re.split(r"\n\s*\n", body):
        out = []
        for line in para.split("\n"):
            # a long line followed by more text was wrapped, not broken on purpose
            if out and len(out[-1]) >= 60 and not out[-1].startswith("#") and not line.startswith(("#", ">", "-")):
                out[-1] = out[-1].rstrip() + " " + line.strip()
            else:
                out.append(line)
        paras.append("\n".join(out))
    return "\n\n".join(paras)


def first_commit_date(path):
    try:
        out = subprocess.run(
            ["git", "log", "--diff-filter=A", "--follow", "--format=%as", "--", path],
            cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
        return out[-1] if out else ""
    except Exception:
        return ""


def parse(path):
    text = open(path, encoding="utf-8").read()
    h1 = re.search(r"^#\s+(.+)$", text, re.M)
    title = re.sub(r"\s+—\s+RATS Chronicle\s*$", "", h1.group(1)).strip() if h1 else os.path.basename(path)
    sec = re.search(r"^##\s+Discord post.*?$", text, re.M)
    if not sec:
        return None
    block = re.search(r"```[a-z]*\n(.*?)\n```", text[sec.end():], re.S)
    if not block:
        return None
    return title, block.group(1).strip()


def main():
    tales = []
    for name in sorted(os.listdir(SRC)):
        if not name.endswith(".md"):
            continue
        slug = name[:-3]
        got = parse(os.path.join(SRC, name))
        if not got:
            print("skipped (no Discord post block):", name)
            continue
        title, body = got
        tale = {
            "id": slug,
            "title": title,
            "body": for_site(body),
            "image": ART.get(slug, ""),
            "date": first_commit_date(os.path.join("docs", "art", "chronicles", name)),
        }
        if slug in EXTRA_ART:
            tale["images"] = EXTRA_ART[slug]
        if slug in SPECIAL:
            tale["special"] = SPECIAL[slug]
        tales.append(tale)
    tales.sort(key=lambda t: (bool(t.get("special")), t["date"]), reverse=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(tales, f, ensure_ascii=False, indent=1)
    print("wrote", len(tales), "chronicles ->", os.path.relpath(OUT, ROOT))


if __name__ == "__main__":
    main()
