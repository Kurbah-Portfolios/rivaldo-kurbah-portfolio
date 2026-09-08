#!/usr/bin/env python3
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BODY = os.environ.get("ISSUE_BODY", "")
KIND = os.environ.get("CONTENT_KIND", "").strip().lower()
ISSUE_NUMBER = os.environ.get("ISSUE_NUMBER", "0")
MAX_IMAGE_BYTES = 12 * 1024 * 1024


def parse_sections(body: str) -> dict[str, str]:
    sections = {}
    pattern = re.compile(r"^###\s+(.+?)\s*$\n\n(.*?)(?=\n###\s+|\Z)", re.M | re.S)
    for heading, value in pattern.findall(body):
        cleaned = value.strip()
        if cleaned in {"_No response_", "No response"}:
            cleaned = ""
        sections[heading.strip()] = cleaned
    return sections


def first_url(value: str) -> str:
    match = re.search(r"https://[^\s)<>]+", value or "")
    return match.group(0).rstrip(".,") if match else ""


def clean_url(value: str) -> str:
    url = first_url(value) if value else ""
    if not url:
        return ""
    parsed = urllib.parse.urlparse(url)
    return url if parsed.scheme == "https" and parsed.netloc else ""


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return slug[:70] or "portfolio-item"


def image_extension(url: str, content_type: str) -> str:
    ctype = (content_type or "").split(";", 1)[0].strip().lower()
    by_type = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "image/svg+xml": ".svg",
    }
    if ctype in by_type:
        return by_type[ctype]
    suffix = Path(urllib.parse.urlparse(url).path).suffix.lower()
    return suffix if suffix in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"} else ".jpg"


def download_image(url: str, destination_dir: Path, base_name: str) -> str:
    if not url:
        raise ValueError("No HTTPS image URL was found in the image field.")
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "Rivaldo-Kurbah-Portfolio-Publisher/1.0"},
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        content_type = response.headers.get("Content-Type", "")
        data = response.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError("Image is larger than the 12 MB publishing limit.")
    if content_type and not content_type.lower().startswith("image/"):
        raise ValueError(f"Attachment did not return an image content type: {content_type}")
    destination_dir.mkdir(parents=True, exist_ok=True)
    ext = image_extension(url, content_type)
    filename = f"{base_name}{ext}"
    path = destination_dir / filename
    path.write_bytes(data)
    return path.relative_to(ROOT).as_posix()


def load_items(path: Path) -> list:
    if not path.exists():
        return []
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list):
        raise ValueError(f"{path} must contain a JSON array.")
    return value


def save_items(path: Path, items: list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def publish_certificate(sections: dict[str, str]) -> None:
    heading = sections.get("Heading", "").strip()
    program = sections.get("Certificate / program name", "").strip()
    if not heading or not program:
        raise ValueError("Heading and Certificate / program name are required.")
    image_url = clean_url(sections.get("Certificate image", ""))
    created = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    item_id = f"{datetime.now(timezone.utc):%Y%m%d}-{slugify(heading)}-{ISSUE_NUMBER}"
    image_path = download_image(
        image_url,
        ROOT / "images" / "certificates" / "managed",
        item_id,
    )
    data_path = ROOT / "data" / "certificates-managed.json"
    items = load_items(data_path)
    items.insert(0, {
        "id": item_id,
        "heading": heading,
        "program": program,
        "description": sections.get("Description", "").strip(),
        "image": image_path,
        "verify_url": clean_url(sections.get("Certificate / verification URL", "")),
        "learn_url": clean_url(sections.get("Want to Know More URL", "")),
        "category": sections.get("Category", "Other").strip() or "Other",
        "created_at": created,
    })
    save_items(data_path, items)
    print(f"Published certificate: {heading} — {program}")


def publish_faith(sections: dict[str, str]) -> None:
    item_type = sections.get("Item type", "").strip()
    title = sections.get("Title", "").strip()
    if not item_type or not title:
        raise ValueError("Item type and Title are required.")
    image_url = clean_url(sections.get("Image", ""))
    created = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    item_id = f"{datetime.now(timezone.utc):%Y%m%d}-{slugify(title)}-{ISSUE_NUMBER}"
    image_path = download_image(
        image_url,
        ROOT / "images" / "faith-ministry" / "managed",
        item_id,
    )
    data_path = ROOT / "data" / "faith-managed.json"
    items = load_items(data_path)
    items.insert(0, {
        "id": item_id,
        "type": item_type,
        "title": title,
        "description": sections.get("Description", "").strip(),
        "image": image_path,
        "link": clean_url(sections.get("Certificate / project URL", "")),
        "link_label": sections.get("Link label", "").strip(),
        "created_at": created,
    })
    save_items(data_path, items)
    print(f"Published faith/ministry item: {title}")


def main() -> int:
    sections = parse_sections(BODY)
    if KIND == "certificate":
        publish_certificate(sections)
    elif KIND == "faith":
        publish_faith(sections)
    else:
        raise ValueError(f"Unsupported content kind: {KIND!r}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Publishing failed: {exc}", file=sys.stderr)
        raise
