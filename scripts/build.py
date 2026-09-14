#!/usr/bin/env python3
import re
import sys
from datetime import datetime
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "content" / "posts"
OUT_DIR = ROOT / "posts"
INDEX_FILE = ROOT / "index.html"
TEMPLATE_FILE = ROOT / "templates" / "post.html"

START_MARKER = "<!-- posts:start -->"
END_MARKER = "<!-- posts:end -->"


def slugify(name: str) -> str:
    name = name.lower()
    name = re.sub(r"[^a-z0-9]+", "-", name)
    return name.strip("-")


def parse_frontmatter(text: str):
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.DOTALL)
    if not match:
        return {}, text
    raw_meta, body = match.group(1), match.group(2)
    meta = {}
    for line in raw_meta.splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            meta[key.strip()] = value.strip()
    return meta, body


def main():
    OUT_DIR.mkdir(exist_ok=True)
    for old in OUT_DIR.glob("*.html"):
        old.unlink()

    template = TEMPLATE_FILE.read_text(encoding="utf-8")

    posts = []
    for md_file in sorted(SRC_DIR.glob("*.md")):
        if md_file.stem.lower() == "readme":
            continue
        text = md_file.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(text)
        title = meta.get("title", md_file.stem)
        date = meta.get("date", datetime.today().strftime("%Y-%m-%d"))
        slug = slugify(meta.get("slug", md_file.stem))
        html_body = markdown.markdown(body, extensions=["fenced_code", "tables"])

        page = template.replace("__TITLE__", title).replace("__DATE__", date).replace("__BODY__", html_body)
        (OUT_DIR / f"{slug}.html").write_text(page, encoding="utf-8")

        posts.append((date, title, slug))

    posts.sort(key=lambda p: p[0], reverse=True)

    if posts:
        listing = "\n".join(
            f'<div class="post">\n'
            f'<a href="posts/{slug}.html"><h3>{title}</h3></a>\n'
            f'<time>{date}</time>\n'
            f"</div>"
            for date, title, slug in posts
        )
    else:
        listing = '<p class="muted">nessun articolo, per ora.</p>'

    index_html = INDEX_FILE.read_text(encoding="utf-8")
    pattern = re.compile(re.escape(START_MARKER) + r".*?" + re.escape(END_MARKER), re.DOTALL)
    if not pattern.search(index_html):
        print("marker posts:start/posts:end non trovati in index.html", file=sys.stderr)
        sys.exit(1)
    index_html = pattern.sub(f"{START_MARKER}\n{listing}\n{END_MARKER}", index_html)
    INDEX_FILE.write_text(index_html, encoding="utf-8")


if __name__ == "__main__":
    main()
