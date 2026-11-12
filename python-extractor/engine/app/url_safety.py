from __future__ import annotations

import ipaddress
import socket
from urllib.parse import SplitResult, urlsplit

from app.schemas import UnsafeUrlError


def validate_public_url(url: str) -> SplitResult:
    if not url or len(url) > 2048:
        raise UnsafeUrlError("URL is empty or exceeds the 2,048-character limit.")
    try:
        parsed = urlsplit(url.strip())
        port = parsed.port
    except ValueError as exc:
        raise UnsafeUrlError("URL is malformed.") from exc

    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        raise UnsafeUrlError("Only absolute HTTP and HTTPS URLs are allowed.")
    if parsed.username is not None or parsed.password is not None:
        raise UnsafeUrlError("URLs containing embedded credentials are not allowed.")
    allowed_port = 80 if parsed.scheme.lower() == "http" else 443
    if port not in {None, allowed_port}:
        raise UnsafeUrlError("Only the standard HTTP and HTTPS ports are allowed.")

    hostname = parsed.hostname.rstrip(".").lower()
    if hostname in {"localhost", "metadata.google.internal"} or hostname.endswith(
        (".localhost", ".local", ".internal")
    ):
        raise UnsafeUrlError("Local and metadata hostnames are not allowed.")

    try:
        address = ipaddress.ip_address(hostname)
        addresses = {address}
    except ValueError:
        try:
            addresses = {
                ipaddress.ip_address(result[4][0])
                for result in socket.getaddrinfo(
                    hostname, port or (443 if parsed.scheme.lower() == "https" else 80)
                )
            }
        except (OSError, ValueError) as exc:
            raise UnsafeUrlError("The hostname could not be resolved.") from exc

    if not addresses or any(not address.is_global for address in addresses):
        raise UnsafeUrlError(
            "The URL resolves to a private, reserved, or otherwise non-public address."
        )
    return parsed
