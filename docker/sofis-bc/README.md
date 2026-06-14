# Sofi's Mini Donuts — dedicated Bigcapital VPS

A standalone **production** Bigcapital instance for one client, on its **own VPS**.
Self-contained: brings its own Traefik edge (TLS + routing); no shared portal
Traefik, no `portal-net`, no JJOC OAuth edge.

|             |                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------- |
| **Host**    | dedicated VPS `163.192.116.72`, **4 GB / 2 vCPU / ≥ 40 GB SSD**, Ubuntu 22.04 LTS, **arm64** |
| **SSH**     | custom port **4321**, key-only, `PermitRootLogin prohibit-password`                          |
| **URL**     | `https://books.sofisminidonuts.com` (A record → `163.192.116.72`, confirmed)                 |
| **Access**  | Client logs in directly; Bigcapital JWT is the only identity gate                            |
| **Edge**    | Traefik bundled in this compose (Let's Encrypt HTTP-01)                                      |
| **Images**  | Pinned GHCR SHA tags (`${SERVER_IMAGE}`/`${WEBAPP_IMAGE}`); **manual** updates               |
| **Data**    | Starts **EMPTY** (fresh org). NOT a clone.                                                   |
| **On host** | `/srv/bigcapital/`                                                                           |

> ✅ **FQDN confirmed:** `books.sofisminidonuts.com`, `A` record → `163.192.116.72`.
> Wired into the compose, `.env`, and `traefik-dynamic/sofis-bc.yml`.

---

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
- Let's Encrypt HTTP-01 needs this resolving **and** ports 80/443 open **before**
  first boot, or cert issuance fails (Traefik retries; check `docker logs bigcapital-sofis-traefik`).

## 4. Drop the stack on the host

```bash
mkdir -p /srv/bigcapital && cd /srv/bigcapital
# scp from repo docker/sofis-bc/:
#   docker-compose.yml, .env (from .env.example, filled in),
#   traefik/traefik.yml, traefik-dynamic/, mariadb/, redis/
```

Edit two things before boot:

- `traefik/traefik.yml` → set a real **ACME email** (static config; no env interpolation).
- `.env` → fill every `<...>` (fresh secrets below), pin `SERVER_IMAGE`/`WEBAPP_IMAGE`
  to the SHA tag proven on staging, leave `SIGNUP_DISABLED=false` +
  `SIGNUP_ALLOWED_EMAILS=<client email>` for now.

```bash
openssl rand -hex 32   # JWT_SECRET, SQUARE_TOKEN_ENCRYPTION_KEY
openssl rand -hex 24   # DB_PASSWORD, DB_ROOT_PASSWORD, S3_SECRET_ACCESS_KEY
openssl rand -hex 16   # S3_ACCESS_KEY_ID
```

## 5. First boot (fresh — no data restore)

```bash
cd /srv/bigcapital
docker compose up -d mysql
until docker exec bigcapital-sofis-mysql mysqladmin ping -u root \
  -p"$(grep DB_ROOT_PASSWORD .env | cut -d= -f2-)" --silent; do sleep 2; done
docker compose up -d                                   # brings up traefik + app + migrations + minio
docker logs -f bigcapital-sofis-database-migration     # wait for "Migrations complete"
docker logs bigcapital-sofis-traefik | grep -i acme    # confirm cert issued, no errors
```

## 6. Create the client org, then lock signup

- Visit `https://books.sofisminidonuts.com` → **Register** with the allowed email
  → finish the org wizard (becomes tenant `bigcapital_sofis_tenant_<orgId>`).
- Lock it: set `SIGNUP_DISABLED=true` in `.env` → `docker compose up -d server`.
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
install -m 0750 -o root -g root backup.sh /srv/bigcapital/backup.sh
install -m 0644 -o root -g root bigcapital-sofis-backup.cron /etc/cron.d/bigcapital-sofis-backup
# create /etc/restic/bigcapital-sofis.env from restic.env.example, then:
chmod 0600 /etc/restic/bigcapital-sofis.env
apt-get install -y restic
/srv/bigcapital/backup.sh           # first run: inits repo + takes snapshot
```

> 🔑 The restic **repo must be offsite** (another provider/region) and the repo
> password stored in your password manager — lose it and the backups are
> unrecoverable. Point `RESTIC_REPOSITORY` at a bucket NOT on this VPS.

> ✅ **Test a restore into a throwaway DB before go-live** (recipe in the
> `backup.sh` header). A backup you haven't restored isn't a backup.

## Updating the pinned image (deliberate, after staging proves it)

```bash
cd /srv/bigcapital
# edit SERVER_IMAGE / WEBAPP_IMAGE in .env to the new vetted sha tag
docker compose pull server webapp
docker compose up -d --force-recreate server webapp
docker logs -f bigcapital-sofis-database-migration   # if the bump adds migrations
```

Note the prior tag for instant rollback (re-edit `.env`, `up -d` again).

## Teardown

```bash
cd /srv/bigcapital
docker compose down -v        # -v DESTROYS the named volumes (all data)
# then decommission the VPS + remove the DNS record.
```
