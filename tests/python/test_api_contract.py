"""Black-box contract tests: a client in another language, against the real
running API, checked against apps/api/openapi.yaml. Read only: nothing here
buys a unit or creates an account."""

import requests

DEMO = {"email": "demo@example.com", "password": "FlashSale2026!"}
HARDENING = {
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
}


def assert_hardened(response):
    for header, value in HARDENING.items():
        assert response.headers.get(header) == value, header
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


def test_served_spec_is_the_file(api, spec):
    assert requests.get(f"{api}/docs/json", timeout=5).json() == spec


def test_health(api, documented):
    res = documented(requests.get(f"{api}/health", timeout=5), "get", "/health")
    assert res.json()["status"] in {"ok", "unavailable"}


def test_sale_status_shape_and_cdn_cache(api, documented):
    res = documented(requests.get(f"{api}/api/sale", timeout=5), "get", "/api/sale")
    body = res.json()
    assert body["status"] in {"upcoming", "active", "ended", "sold_out"}
    assert 0 <= body["stockLeft"] <= body["totalStock"]
    assert res.headers["cache-control"] == "public, max-age=0, s-maxage=1"
    assert_hardened(res)


def test_product_is_cacheable_display_data(api, documented):
    res = documented(requests.get(f"{api}/api/product", timeout=5), "get", "/api/product")
    if res.status_code == 200:
        assert res.headers["cache-control"] == "public, max-age=60"
        assert isinstance(res.json()["priceCents"], int)


def test_purchase_needs_a_session(api, documented):
    # A body naming a user must not matter: the buyer comes from the cookie.
    res = documented(requests.post(f"{api}/api/purchase", json={"userId": "someone"}, timeout=5), "post", "/api/purchase")
    assert res.status_code == 401
    assert res.json()["error"] == "unauthorized"
    assert_hardened(res)


def test_wrong_password_gets_the_generic_answer(api, documented):
    res = requests.post(f"{api}/api/auth/login", json={**DEMO, "password": "not-the-password"}, timeout=5)
    documented(res, "post", "/api/auth/login")
    assert res.status_code in {401, 429}
    if res.status_code == 401:
        assert res.json()["message"] == "Wrong email or password."


def test_malformed_idempotency_key_is_rejected_before_the_gate(api, documented):
    session = requests.Session()
    login = documented(session.post(f"{api}/api/auth/login", json=DEMO, timeout=5), "post", "/api/auth/login")
    if login.status_code != 200:
        import pytest

        pytest.skip(f"demo login answered {login.status_code}; run `pnpm cli seed`")
    res = session.post(f"{api}/api/purchase", headers={"Idempotency-Key": "bad key!"}, timeout=5)
    documented(res, "post", "/api/purchase")
    assert res.status_code == 400
    assert res.json()["error"] == "invalid_idempotency_key"
