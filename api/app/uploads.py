"""Product photo storage: validating, re-encoding, saving, and deleting uploaded images.

Uploads are never stored as sent. Each one is decoded, rotated upright, shrunk, and
re-encoded as WebP under a random name, which means:
- the file type is what the bytes really are, not what the client claimed (no SVG, no
  HTML or script renamed to .png),
- camera metadata such as GPS location is dropped,
- every photo is a reasonable size, and a new upload gets a new URL so browsers and
  nginx can cache the old ones forever.
"""

import io
import re
import uuid
from pathlib import Path

from flask import current_app
from PIL import Image, ImageOps, UnidentifiedImageError

from .errors import ApiError

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 40_000_000  # decoded size, so a tiny file can't expand into gigabytes of memory
MAX_SIDE = 1600
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}

URL_PREFIX = "/api/uploads/"
NAME_PATTERN = re.compile(r"[0-9a-f]{32}\.webp")


def upload_dir() -> Path:
    return Path(current_app.config["UPLOAD_DIR"])


def encode_image(data: bytes) -> bytes:
    """Validates an uploaded image and returns it re-encoded as WebP. Raises a 422 for anything else."""
    try:
        with Image.open(io.BytesIO(data)) as img:
            if img.format not in ALLOWED_FORMATS:
                raise ApiError(422, "Upload a JPEG, PNG, or WebP image")
            if img.width * img.height > MAX_PIXELS:
                raise ApiError(422, "That image is too large. Use one under 40 megapixels.")
            img = ImageOps.exif_transpose(img)  # honour the camera's rotation before the metadata is dropped
            img.thumbnail((MAX_SIDE, MAX_SIDE))
            has_alpha = "A" in img.getbands() or "transparency" in img.info
            img = img.convert("RGBA" if has_alpha else "RGB")
            out = io.BytesIO()
            img.save(out, "WEBP", quality=82)
            return out.getvalue()
    except ApiError:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        raise ApiError(422, "That file isn't a readable image")


def save_image(encoded: bytes) -> str:
    """Writes the image and returns the URL it is served from."""
    directory = upload_dir()
    directory.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.webp"
    # Write then rename, so a half-written file is never served.
    tmp = directory / f"{name}.tmp"
    tmp.write_bytes(encoded)
    tmp.replace(directory / name)
    return URL_PREFIX + name


def remove_upload(url: str | None) -> None:
    """Deletes the file behind an upload URL. Anything that isn't one of ours (an external
    URL, or a crafted path) is ignored, so this can only ever delete files we created."""
    if not url or not url.startswith(URL_PREFIX):
        return
    name = url[len(URL_PREFIX) :]
    if NAME_PATTERN.fullmatch(name):
        (upload_dir() / name).unlink(missing_ok=True)
