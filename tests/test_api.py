from fastapi.testclient import TestClient

from app import main
from app.main import app

client = TestClient(app)


def test_analyze_returns_explained_verdict():
    r = client.post("/api/analyze", json={"content": "Your SBI KYC is pending, account will be blocked. Update at http://sbi-kyc.xyz"})
    assert r.status_code == 200
    body = r.json()
    assert body["level"] == "high"
    assert body["indicators"] and body["advice"] and body["urls"]
    assert r.headers["cache-control"] == "no-store"
    assert "default-src 'self'" in r.headers["content-security-policy"]


def test_rejects_empty_and_oversized_input():
    assert client.post("/api/analyze", json={"content": ""}).status_code == 422
    assert client.post("/api/analyze", json={"content": "   "}).status_code == 422
    assert client.post("/api/analyze", json={"content": "a" * 20001}).status_code == 422
    assert client.post("/api/analyze", json={}).status_code == 422


def test_rate_limit():
    main._hits.clear()
    headers = {"x-forwarded-for": "203.0.113.9"}
    codes = [client.post("/api/analyze", json={"content": "hello there friend"}, headers=headers).status_code for _ in range(main.RATE_LIMIT + 1)]
    assert codes[-1] == 429 and set(codes[:-1]) == {200}
    main._hits.clear()


def test_batch_scores_each_item_and_counts_levels():
    main._hits.clear()
    r = client.post("/api/batch", json={"items": ["arnazon.com/prime", "Hi, are we meeting at 6?", "  "]})
    assert r.status_code == 200
    body = r.json()
    assert len(body["results"]) == 2 and body["results"][0]["level"] == "high"
    assert body["counts"]["high"] == 1
    assert client.post("/api/batch", json={"items": ["x"] * 21}).status_code == 422
    assert client.post("/api/batch", json={"items": ["a" * 5001]}).status_code == 422
    main._hits.clear()


def test_batch_counts_every_item_against_the_rate_limit():
    main._hits.clear()
    headers = {"x-forwarded-for": "203.0.113.10"}
    assert client.post("/api/batch", json={"items": ["hello"] * 20}, headers=headers).status_code == 200
    assert client.post("/api/batch", json={"items": ["hello"] * 11}, headers=headers).status_code == 429
    main._hits.clear()


def test_scenarios_endpoint_lists_advice():
    s = client.get("/api/scenarios").json()["scenarios"]
    assert any(x["id"] == "brand_impersonation" for x in s) and all(x["advice"] for x in s)


def test_pages_and_health():
    assert client.get("/").status_code == 200
    assert client.get("/app").status_code == 200
    assert client.get("/report").status_code == 200
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and h["models"] == {"text": True, "url": True}
