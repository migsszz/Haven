"""Product photo upload: validation, re-encoding, replacement, removal, and serving."""

import io
from pathlib import Path

import pytest
from PIL import Image

PRODUCT = "yoga-mat"


def make_image(fmt="PNG", size=(40, 30), color=(200, 30, 30), **save_args) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, fmt, **save_args)
    return out.getvalue()


def upload(client, headers, product_id, data, filename="photo.png"):
    return client.post(
        f"/api/admin/products/{product_id}/image",
        headers=headers,
        data={"file": (io.BytesIO(data), filename)},
        content_type="multipart/form-data",
    )


@pytest.fixture
def product_id(client):
    return client.get(f"/api/products/{PRODUCT}").json["id"]


def stored_files(app):
    return sorted(p.name for p in Path(app.config["UPLOAD_DIR"]).glob("*") if p.is_file())


@pytest.fixture(autouse=True)
def clean_uploads(app):
    for p in Path(app.config["UPLOAD_DIR"]).glob("*"):
        p.unlink()


def test_upload_is_stored_as_webp_and_served(app, client, admin, product_id):
    res = upload(client, admin, product_id, make_image())

    assert res.status_code == 200, res.json
    url = res.json["imageUrl"]
    assert url.startswith("/api/uploads/") and url.endswith(".webp")
    assert client.get(f"/api/products/{PRODUCT}").json["imageUrl"] == url

    served = client.get(url)
    assert served.status_code == 200
    assert served.mimetype == "image/webp"
    assert "immutable" in served.headers["Cache-Control"]
    assert served.headers["X-Content-Type-Options"] == "nosniff"
    assert Image.open(io.BytesIO(served.data)).format == "WEBP"


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
def test_accepts_jpeg_png_and_webp(client, admin, product_id, fmt):
    assert upload(client, admin, product_id, make_image(fmt)).status_code == 200


def test_large_photos_are_shrunk_and_small_ones_left_alone(client, admin, product_id):
    big = upload(client, admin, product_id, make_image(size=(3200, 1600))).json["imageUrl"]
    assert max(Image.open(io.BytesIO(client.get(big).data)).size) == 1600

    small = upload(client, admin, product_id, make_image(size=(120, 80))).json["imageUrl"]
    assert Image.open(io.BytesIO(client.get(small).data)).size == (120, 80)


def test_camera_rotation_is_applied_and_metadata_is_dropped(client, admin, product_id):
    exif = Image.Exif()
    exif[0x0112] = 6  # "rotate 90 degrees"
    exif[0x010F] = "SecretCameraMaker"
    url = upload(client, admin, product_id, make_image("JPEG", size=(60, 20), exif=exif)).json["imageUrl"]

    stored = Image.open(io.BytesIO(client.get(url).data))
    assert stored.size == (20, 60)  # turned upright
    assert b"SecretCameraMaker" not in client.get(url).data


def test_transparency_is_kept(client, admin, product_id):
    out = io.BytesIO()
    Image.new("RGBA", (10, 10), (0, 0, 0, 0)).save(out, "PNG")
    url = upload(client, admin, product_id, out.getvalue()).json["imageUrl"]
    assert Image.open(io.BytesIO(client.get(url).data)).mode == "RGBA"


def test_replacing_a_photo_deletes_the_old_file(app, client, admin, product_id):
    first = upload(client, admin, product_id, make_image()).json["imageUrl"]
    second = upload(client, admin, product_id, make_image(color=(0, 0, 200))).json["imageUrl"]

    assert first != second
    assert stored_files(app) == [second.rsplit("/", 1)[1]]
    assert client.get(first).status_code == 404


def test_removing_a_photo(app, client, admin, product_id):
    upload(client, admin, product_id, make_image())

    res = client.delete(f"/api/admin/products/{product_id}/image", headers=admin)

    assert res.status_code == 200 and res.json["imageUrl"] is None
    assert stored_files(app) == []


def test_changing_the_image_url_by_hand_also_cleans_up(app, client, admin, product_id):
    upload(client, admin, product_id, make_image())

    client.patch(f"/api/admin/products/{product_id}", headers=admin, json={"imageUrl": "https://example.com/mat.jpg"})

    assert stored_files(app) == []
    assert client.get(f"/api/products/{PRODUCT}").json["imageUrl"] == "https://example.com/mat.jpg"


def test_saving_other_fields_keeps_the_photo(app, client, admin, product_id):
    url = upload(client, admin, product_id, make_image()).json["imageUrl"]
    client.patch(f"/api/admin/products/{product_id}", headers=admin, json={"stock": 3})
    assert stored_files(app) == [url.rsplit("/", 1)[1]]


def test_only_our_own_files_are_ever_deleted(app, client, admin, product_id, tmp_path):
    victim = Path(app.config["UPLOAD_DIR"]).parent / "victim.txt"
    victim.write_text("keep me")
    client.patch(f"/api/admin/products/{product_id}", headers=admin, json={"imageUrl": "/api/uploads/../victim.txt"})
    client.patch(f"/api/admin/products/{product_id}", headers=admin, json={"imageUrl": None})
    assert victim.read_text() == "keep me"


def test_only_admins_can_upload_or_remove(client, shopper, product_id):
    assert upload(client, shopper, product_id, make_image()).status_code == 403
    assert upload(client, {}, product_id, make_image()).status_code == 401
    assert client.delete(f"/api/admin/products/{product_id}/image", headers=shopper).status_code == 403


@pytest.mark.parametrize(
    "data, filename",
    [
        (b"just some text", "notes.png"),
        (b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "evil.svg"),
        (b"<html><script>alert(1)</script></html>", "page.png"),
        (b"\x89PNG\r\n\x1a\n" + b"junk" * 50, "truncated.png"),  # right header, not an image
        (b"GIF89a" + b"\x00" * 40, "anim.gif"),
        (b"", "empty.png"),
    ],
)
def test_rejects_files_that_are_not_real_images(app, client, admin, product_id, data, filename):
    res = upload(client, admin, product_id, data, filename)
    assert res.status_code == 422
    assert stored_files(app) == []


def test_a_real_gif_is_rejected_by_format(client, admin, product_id):
    res = upload(client, admin, product_id, make_image("GIF"), "a.gif")
    assert res.status_code == 422
    assert "JPEG, PNG, or WebP" in res.json["error"]


def test_rejects_oversized_uploads(app, client, admin, product_id):
    res = upload(client, admin, product_id, b"\x00" * (5 * 1024 * 1024 + 1))
    assert res.status_code == 413
    assert stored_files(app) == []


def test_rejects_images_with_too_many_pixels(client, admin, product_id, monkeypatch):
    monkeypatch.setattr("app.uploads.MAX_PIXELS", 100)
    assert upload(client, admin, product_id, make_image(size=(20, 20))).status_code == 422


def test_missing_file_and_unknown_product(app, client, admin, product_id):
    assert client.post(f"/api/admin/products/{product_id}/image", headers=admin, data={}).status_code == 400

    res = upload(client, admin, 99999, make_image())
    assert res.status_code == 404
    assert stored_files(app) == []  # the file saved before the lookup failed is cleaned up
    assert client.delete("/api/admin/products/99999/image", headers=admin).status_code == 404


def test_upload_names_cannot_escape_the_directory(app, client):
    secret = Path(app.config["UPLOAD_DIR"]).parent / "secret.webp"
    secret.write_bytes(b"x")
    for name in ["../secret.webp", "..%2Fsecret.webp", "secret.webp", "x.png"]:
        assert client.get(f"/api/uploads/{name}").status_code == 404


def test_request_bodies_over_the_hard_cap_are_refused_up_front(client, admin, product_id):
    res = upload(client, admin, product_id, b"\x00" * (7 * 1024 * 1024))
    assert res.status_code == 413
    assert "error" in res.json
