"""Trusted proxy helpers used by middleware."""

from ipaddress import IPv4Network, IPv6Network, ip_address, ip_network

from starlette.datastructures import Headers

type TrustedProxyNetwork = tuple[IPv4Network | IPv6Network, ...]


def parse_trusted_proxies(raw: list[str]) -> TrustedProxyNetwork:
    networks: list[IPv4Network | IPv6Network] = []
    for item in raw:
        try:
            networks.append(ip_network(item, strict=False))
        except ValueError:
            continue
    return tuple(networks)


def is_trusted_proxy(client_host: str, trusted_proxies: TrustedProxyNetwork) -> bool:
    try:
        address = ip_address(client_host)
    except ValueError:
        return False
    return any(address in network for network in trusted_proxies)


def normalize_forwarded_proto(value: str | None) -> str | None:
    if not value:
        return None
    proto = value.split(",", 1)[0].strip().lower()
    return proto if proto in {"http", "https"} else None


def get_forwarded_client_ip(
    headers: Headers,
    proxy_headers: list[str],
    trusted_proxies: TrustedProxyNetwork,
) -> str | None:
    for header in proxy_headers:
        value = headers.get(header)
        if not value:
            continue
        for candidate in [part.strip() for part in value.split(",") if part.strip()]:
            try:
                address = ip_address(candidate)
            except ValueError:
                continue
            if not any(address in network for network in trusted_proxies):
                return candidate
    return None
