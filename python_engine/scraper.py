from __future__ import annotations

import hashlib
import ipaddress
import os
import random
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from html.parser import HTMLParser
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

# Rotating User-Agent pool so repeated scrapes look like ordinary clients.
USER_AGENTS: list[str] = [
    "FluxentiqPythonEngine/1.0 (+self-hosted HR platform)",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
]

_RETRYABLE = (URLError, TimeoutError, ConnectionError, OSError)


@dataclass(frozen=True)
class ScrapeResult:
    url: str
    host: str
    title: str
    text: str
    content_type: str
    bytes_downloaded: int
    fetched_at: str
    content_sha256: str


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._title = ""
        self._in_title = False
        self._ignored_depth = 0
        self._chunks: list[str] = []

    @property
    def title(self) -> str:
        return " ".join(self._title.split())

    @property
    def text(self) -> str:
        return " ".join(" ".join(self._chunks).split())

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript", "svg"}:
            self._ignored_depth += 1
        if tag == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg"} and self._ignored_depth:
            self._ignored_depth -= 1
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._ignored_depth:
            return
        if self._in_title:
            self._title += f" {data}"
        self._chunks.append(data)


def allowed_hosts() -> set[str]:
    return {host.strip().lower() for host in os.getenv("PYTHON_BRIDGE_ALLOWED_SCRAPE_HOSTS", "").split(",") if host.strip()}


def validate_scrape_url(url: str, permitted_hosts: set[str] | None = None) -> tuple[str, str]:
    parsed = urlparse(url)
    if parsed.scheme not in {"https", "http"} or not parsed.hostname:
        raise ValueError("Scrape URL must be a fully qualified http(s) URL.")
    host = parsed.hostname.lower()
    try:
        address = ipaddress.ip_address(host)
        if address.is_private or address.is_loopback or address.is_link_local or address.is_reserved:
            raise PermissionError("Private, loopback, link-local, and reserved network targets are blocked.")
    except ValueError:
        pass
    allowed = permitted_hosts if permitted_hosts is not None else allowed_hosts()
    if not allowed:
        raise PermissionError("No scrape hosts are configured. Set PYTHON_BRIDGE_ALLOWED_SCRAPE_HOSTS.")
    if host not in allowed:
        raise PermissionError(f"Host {host} is not allowed for scraping.")
    return parsed.geturl(), host


def _fetch_with_retry(
    target: str,
    byte_limit: int,
    *,
    attempts: int = 3,
    base_delay: float = 0.5,
    max_delay: float = 8.0,
) -> tuple[str, bytes]:
    """GETs ``target`` with exponential backoff + full jitter and UA rotation.

    Retries only transient failures (URLError/timeout/connection); HTTP 4xx is
    treated as terminal and re-raised immediately so we don't hammer a server
    that is actively refusing us.
    """
    last_exc: Exception | None = None
    for attempt in range(attempts):
        user_agent = USER_AGENTS[attempt % len(USER_AGENTS)]
        request = Request(target, headers={"User-Agent": user_agent}, method="GET")
        try:
            with urlopen(request, timeout=25) as response:
                content_type = response.headers.get("Content-Type", "")
                payload = response.read(byte_limit + 1)
            return content_type, payload
        except HTTPError:
            # 4xx/5xx HTTP responses are not retried (non-transient).
            raise
        except _RETRYABLE as exc:
            last_exc = exc
            if attempt == attempts - 1:
                break
            delay = min(max_delay, base_delay * (2 ** attempt))
            time.sleep(random.uniform(0, delay))  # full jitter
    raise RuntimeError(f"Scrape failed after {attempts} attempts: {last_exc}") from last_exc


def scrape_url(url: str, *, max_bytes: int | None = None, permitted_hosts: set[str] | None = None) -> ScrapeResult:
    target, host = validate_scrape_url(url, permitted_hosts)
    byte_limit = max_bytes if max_bytes is not None else int(os.getenv("PYTHON_BRIDGE_MAX_SCRAPE_BYTES", "2000000"))
    content_type, payload = _fetch_with_retry(target, byte_limit)
    if len(payload) > byte_limit:
        raise RuntimeError("Scrape response exceeded configured byte limit.")
    decoded = payload.decode("utf-8", errors="replace")
    parser = _TextExtractor()
    parser.feed(decoded)
    text = parser.text if "html" in content_type.lower() else decoded
    return ScrapeResult(
        url=target,
        host=host,
        title=parser.title,
        text=text[:120000],
        content_type=content_type,
        bytes_downloaded=len(payload),
        fetched_at=datetime.now(UTC).isoformat(),
        content_sha256=hashlib.sha256(payload).hexdigest(),
    )
