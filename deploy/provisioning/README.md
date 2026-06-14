# Host provisioning (recovered cloud-init)

The original servers were provisioned by a cloud-init `user-data` script (and/or
Ansible) that was **never version-controlled** — recovered 2026-06-14 from
`/var/lib/cloud/instance/user-data.txt` on `production-public-webproxy-ai-01`.
This directory is its tracked home so it can't be lost again.

## Files

- `cloud-init.sanitized.yaml` — the recovered script with **every secret replaced
  by a `{{ PLACEHOLDER }}`**. This is the only version that may be committed.
- Real values live OUTSIDE git: in the VPS provider's user-data field at instance
  creation, or a `secrets.env` / vault (both `.gitignore`d here).

## How to sanitize the recovered file (do NOT commit the raw copy)

1. Copy the raw file off the server to here as `user-data.real.yaml` (gitignored):
   `scp -P 4321 root@<host>:/var/lib/cloud/instance/user-data.txt user-data.real.yaml`
2. Inventory secrets:
   `grep -nEi 'pass(word|wd)|secret|token|api[_-]?key|client_secret|ghp_|BEGIN [A-Z ]*PRIVATE KEY' user-data.real.yaml`
3. Copy to `cloud-init.sanitized.yaml` and replace each flagged value with a
   `{{ NAMED_PLACEHOLDER }}`. Keep _public_ SSH keys (not secret). Document each
   placeholder at the top of the sanitized file.
4. Verify it's clean before committing — a scan should come back empty:
   `gitleaks detect --no-git --source cloud-init.sanitized.yaml -v`
5. Commit ONLY `cloud-init.sanitized.yaml`.

## Re-using it on a new box (e.g. the Sofi's VPS 163.192.116.72)

cloud-init `user-data` runs **once at first boot** and won't cleanly re-run on an
existing box. For a box that already exists:

- Either pass the (real-value) user-data at _instance creation_ next time, or
- Extract the meaningful steps into an idempotent setup script / Ansible playbook
  and run them by hand.

**Adapt for differences before applying:**

- **arch**: new client box is **arm64** — drop/adjust any `amd64`-pinned apt repos
  or binary downloads.
- **SSH**: client box uses **port 4321** (not 22) + `PermitRootLogin prohibit-password`.
- **per-host values**: hostname, IP, domain, certs — don't copy the source host's verbatim.
- Don't blindly replay secrets that were unique per host (rotate instead).
