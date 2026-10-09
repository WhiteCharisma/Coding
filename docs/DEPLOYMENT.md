# Deployment

> Status: deployment files are added in Phase 6. This document is completed there; the
> hosting analysis below is final.

## Which Hostinger product works?

| Hostinger product | Works? | Why |
|---|---|---|
| **VPS (KVM) with Ubuntu 22.04/24.04** — e.g. the "Ubuntu 24.04 with Docker" template | ✅ **Supported target** | Root access, Docker + Compose, persistent volumes, ports 80/443, long-running processes and WebSockets |
| Shared / Premium / Business web hosting | ❌ Not supported | No Docker, no root, no persistent Node.js process, WebSockets and long-lived connections are not available; processes are killed |
| Cloud hosting (managed) | ❌ Not supported | Same restrictions as shared hosting (managed LiteSpeed/PHP stack) |
| Hostinger "Node.js" web app hosting (managed) | ⚠️ Not supported as-is | Provider-managed runtime; no Docker, no guaranteed persistent disk for SQLite/uploads, no control over the reverse proxy or long-lived WebSockets. Would need a different architecture (external database + object storage) |

Minimum VPS size: 1 vCPU, 2 GB RAM, 20 GB disk (KVM 1 or larger). Recommended for a few
hundred active users: 2 vCPU, 4–8 GB RAM. Measured resource usage is in `docs/PERFORMANCE.md`.

You also need a domain (or subdomain) whose DNS **A record** points to the VPS IP address,
and ports 80 and 443 open (Hostinger VPS firewall), so Caddy can obtain a Let's Encrypt
certificate automatically.
