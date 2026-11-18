import os
from pathlib import Path

import pytest
import requests
import yaml

API_URL = os.environ.get("API_URL", "http://localhost:3000").rstrip("/")
SPEC_PATH = Path(__file__).resolve().parents[2] / "apps" / "api" / "openapi.yaml"


@pytest.fixture(scope="session")
def api():
    """Base URL of a running API. Skips the suite when nothing is listening."""
    try:
        requests.get(f"{API_URL}/health", timeout=2)
    except requests.ConnectionError:
        pytest.skip(f"no API at {API_URL}; start it with `pnpm dev`")
    return API_URL


@pytest.fixture(scope="session")
def spec():
    return yaml.safe_load(SPEC_PATH.read_text())


@pytest.fixture(scope="session")
def documented(spec):
    """Asserts a response's status code is one the spec lists for that route."""

    def check(response, method, path):
        codes = spec["paths"][path][method]["responses"].keys()
        assert str(response.status_code) in codes, f"{method.upper()} {path} answered {response.status_code}, spec lists {sorted(codes)}"
        return response

    return check
