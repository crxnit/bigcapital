# Sofi's Mini Donuts — dedicated Bigcapital VPS

A standalone **production** Bigcapital instance for one client, on its **own VPS**.
The box runs the operator's **standard hosting environment** — a HOST-level Traefik
(container `traefik`, external network `portal-net`, dynamic config in
`/srv/portal/traefik/dynamic/`). This stack does **not** bring its own edge; it
plugs into the host Traefik exactly like `docker/sandbox-bc/`. No JJOC OAuth edge.

|             |                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------- |
| **Host**    | dedicated VPS `163.192.116.72`, **4 GB / 2 vCPU / 45 GB SSD**, Ubuntu 22.04 LTS, **arm64** ✅ |
| **SSH**     | custom port **4321**, key-only, `PermitRootLogin prohibit-password` (login user `john`)       |
| **URL**     | `https://books.sofisminidonuts.com` (A record → `163.192.116.72`, confirmed)                  |
| **Access**  | Client logs in directly; Bigcapital JWT is the only identity gate                             |
| **Edge**    | **HOST** Traefik (`/srv/portal/`), `letsencrypt` resolver; router in this bundle              |
| **Images**  | Pinned GHCR SHA tags (`${SERVER_IMAGE}`/`${WEBAPP_IMAGE}`); **manual** updates                |
| **Data**    | Starts **EMPTY** (fresh org). NOT a clone.                                                    |
| **On host** | `/srv/portal/clients/sofis-bc/` (stack); `/srv/portal/traefik/dynamic/sofis-bc.yml` (router)  |

> ✅ **FQDN confirmed:** `books.sofisminidonuts.com`, `A` record → `163.192.116.72`.
> Wired into the compose, `.env`, and `traefik-dynamic/sofis-bc.yml`.
> ✅ **Host Traefik confirmed** (2026-06-14): `traefik:v3.3` on `portal-net`,
> resolver `letsencrypt`, predefined `security-headers`/`rate-limit` middlewares.

---

> ✅ **Sections 1–3 are DONE** for `163.192.116.72` (provisioned + hardened
> 2026-06-13/14: swap, UFW 4321/80/443, Docker 29.5.3, SSH on 4321, host Traefik
> via `/srv/portal/`). They're kept below as the rebuild-from-scratch reference.
> To deploy onto the existing box, skip to **§4**.

## 1. Provision the VPS

- 4 GB / 2 vCPU / ≥ 40 GB SSD, Ubuntu 22.04 LTS, in a region near the client.
- Note its public IPv4.

## 2. Harden the host (before anything else)

```bash
# --- swap (safety margin on a 4 GB box) ---
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl -w vm.swappiness=10 && echo 'vm.swappiness=10' >> /etc/sysctl.d/99-swap.conf

# --- firewall: only SSH (custom port 4321) + web ---
# Open 4321 in the PROVIDER firewall too, and verify a new ssh -p 4321 session
# BEFORE removing port 22 (see SSH-port change procedure).
ufw default deny incoming && ufw default allow outgoing
ufw allow 4321/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

# --- Docker engine + compose plugin ---
curl -fsSL https://get.docker.com | sh

# --- auto security updates ---
apt-get install -y unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades
```

**SSH lockdown (port 4321):** drop-in `/etc/ssh/sshd_config.d/99-hardening.conf` with
`Port 4321`, `PasswordAuthentication no`, `PermitRootLogin prohibit-password`. Run
`sshd -t` before restart; if `ssh.socket` is active, override its `ListenStream` to
4321 instead. **Verify a new `ssh -p 4321` session before closing the old one and
before removing port 22** (UFW _and_ the provider firewall).

> 🔒 **cloud-init NOPASSWD-sudo trap** (bit us before — see CLAUDE.md): many
> providers drop `<user> ALL=(ALL) NOPASSWD:ALL` into
> `/etc/sudoers.d/90-cloud-init-users`, giving any default user broad passwordless
> root. Audit and remove it: `sudo -l -U <user>` should NOT show blanket
> `NOPASSWD: ALL`. Rewrite that file to scope sudo down.

## 3. DNS

- `A` record `books.sofisminidonuts.com` → `163.192.116.72` ✅ (confirmed in place).
- Let's Encrypt HTTP-01 needs this resolving **and** ports 80/443 open (the host
  Traefik already owns them); the cert is issued on the first HTTPS request to the
  FQDN after the router file lands. Check `sudo docker logs traefik | grep -i acme`.

## 4. Drop the stack on the host

The host edge is **already running** (`/srv/portal/`). This stack only adds the
two app containers to `portal-net` and a router file into the host Traefik's
dynamic dir — no bundled Traefik, no ACME email to set here (host resolver
`letsencrypt` already has `letsencrypt@jjocllc.com`).

```bash
sudo mkdir -p /srv/portal/clients/sofis-bc && cd /srv/portal/clients/sofis-bc
# scp from repo docker/sofis-bc/:
#   docker-compose.yml, .env (from .env.example, filled in), mariadb/, redis/
# AND copy the router into the HOST Traefik dynamic dir (it hot-reloads):
#   traefik-dynamic/sofis-bc.yml → /srv/portal/traefik/dynamic/sofis-bc.yml
```

Edit one thing before boot:

- `.env` → fill every `<...>` (fresh secrets below); `SERVER_IMAGE`/`WEBAPP_IMAGE`
  are pre-pinned to `sha-386d9fd` (vetted clean on sandbox + UAT, arm64), bump only
  to a newer proven sha. Leave `SIGNUP_DISABLED=false` +
  `SIGNUP_ALLOWED_EMAILS=<client email>` for now.

```bash
openssl rand -hex 32   # JWT_SECRET, SQUARE_TOKEN_ENCRYPTION_KEY
openssl rand -hex 24   # DB_PASSWORD, DB_ROOT_PASSWORD, S3_SECRET_ACCESS_KEY
openssl rand -hex 16   # S3_ACCESS_KEY_ID
```

## 5. First boot (fresh — no data restore)

```bash
cd /srv/portal/clients/sofis-bc
sudo docker compose up -d mysql
until sudo docker exec bigcapital-sofis-mysql mysqladmin ping -u root \
  -p"$(grep DB_ROOT_PASSWORD .env | cut -d= -f2-)" --silent; do sleep 2; done
sudo docker compose up -d                                   # app + migrations + minio
sudo docker logs -f bigcapital-sofis-database-migration     # wait for "Migrations complete"
# Cert is issued by the HOST Traefik on first request to the FQDN:
sudo docker logs traefik 2>&1 | grep -i 'sofisminidonuts\|acme\|certificate' | tail
```

## 6. Create the client org, then lock signup

- Visit `https://books.sofisminidonuts.com` → **Register** with the allowed email
  → finish the org wizard (becomes tenant `bigcapital_sofis_tenant_<orgId>`).
- Lock it: set `SIGNUP_DISABLED=true` in `.env` → `sudo docker compose up -d server`.
  Verify registration is now refused.

## 7. Smoke test

```bash
curl -fsS https://books.sofisminidonuts.com/api/health     # expect ok, valid TLS
```

Log in as the client; confirm an empty Chart of Accounts. This empty org is the
import target — start with the COA (`tools/qb-migration/`), then the journal replay.

---

## Backups (set up BEFORE real data lands — mandatory on a dedicated box)

No sibling stack to fall back on here, so **offsite** restic backups are
non-negotiable. The scripts are in this bundle:

- `backup.sh` — nightly `mysqldump` (legacy binary — `mariadb:10.2` has no
  `mariadb-dump`) of the system + every tenant DB, a MinIO `mc mirror`, and a
  `.env` snapshot → `restic backup` with 7d/4w/12m/3y retention. Self-inits the
  repo on first run. Fails loudly on an empty dump.
- `bigcapital-sofis-backup.cron` — nightly 03:27 UTC → journald tag `bc-sofis-backup`.
- `restic.env.example` — backend + repo-password template.

Install:

```bash
install -m 0750 -o root -g root backup.sh /srv/portal/clients/sofis-bc/backup.sh
install -m 0644 -o root -g root bigcapital-sofis-backup.cron /etc/cron.d/bigcapital-sofis-backup
# create /etc/restic/bigcapital-sofis.env from restic.env.example, then:
chmod 0600 /etc/restic/bigcapital-sofis.env
apt-get install -y restic
/srv/portal/clients/sofis-bc/backup.sh           # first run: inits repo + takes snapshot
```

> 🔑 The restic **repo must be offsite** (another provider/region) and the repo
> password stored in your password manager — lose it and the backups are
> unrecoverable. Point `RESTIC_REPOSITORY` at a bucket NOT on this VPS.

> ✅ **Test a restore into a throwaway DB before go-live** (recipe in the
> `backup.sh` header). A backup you haven't restored isn't a backup.

## Updating the pinned image (deliberate, after staging proves it)

```bash
cd /srv/portal/clients/sofis-bc
# edit SERVER_IMAGE / WEBAPP_IMAGE in .env to the new vetted sha tag
sudo docker compose pull server webapp
sudo docker compose up -d --force-recreate server webapp
sudo docker logs -f bigcapital-sofis-database-migration   # if the bump adds migrations
```

Note the prior tag for instant rollback (re-edit `.env`, `up -d` again).

## Teardown

```bash
cd /srv/portal/clients/sofis-bc
sudo docker compose down -v        # -v DESTROYS the named volumes (all data)
# then decommission the VPS + remove the DNS record.
```
