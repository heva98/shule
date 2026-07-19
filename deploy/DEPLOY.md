# Deploying Shule SMS to shule.ac.tz (161.97.68.240)

Server user: `deployuser`. Project already uploaded at `/home/deployuser/shule`.
Nginx, Python3+venv, and Node.js are already installed. PostgreSQL and Redis are not.

Run everything below as `deployuser` unless a step says `sudo`.

## 1. Install PostgreSQL and Redis

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib redis-server
sudo systemctl enable --now postgresql redis-server
```

## 2. Create the database

```bash
sudo -u postgres psql -c "CREATE DATABASE shule_db;"
sudo -u postgres psql -c "CREATE USER shule_user WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';"
sudo -u postgres psql -c "ALTER ROLE shule_user SET client_encoding TO 'utf8';"
sudo -u postgres psql -c "ALTER ROLE shule_user SET timezone TO 'Africa/Dar_es_Salaam';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE shule_db TO shule_user;"
sudo -u postgres psql -d shule_db -c "GRANT ALL ON SCHEMA public TO shule_user;"
```

Pick a real password and remember it — it goes in `.env` in step 5.

## 3. Python virtual environment + dependencies

```bash
cd /home/deployuser/shule
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

`gunicorn` is now included in `requirements.txt`, so it installs automatically.

## 4. Create runtime directories

```bash
mkdir -p /home/deployuser/shule/logs
mkdir -p /home/deployuser/shule/media
```

## 5. Configure environment variables

```bash
cp deploy/.env.production.example .env
```

Edit `.env` and fill in:
- `SECRET_KEY` — generate one:
  ```bash
  venv/bin/python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
  ```
- `DB_PASSWORD` — the password you set in step 2
- `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` — if you want real emails sent (leave blank to keep console/no-op email for now)
- `AFRICASTALKING_*` / `MPESA_*` — fill in when you're ready to wire those up; safe to leave blank for now

`ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, and `FRONTEND_URL` are already set correctly for `shule.ac.tz` in the template — leave them as-is unless your domain changes.

## 6. Migrate, create admin user, collect static files

```bash
cd /home/deployuser/shule
source venv/bin/activate
python manage.py migrate
python manage.py createsuperuser
python manage.py collectstatic --noinput
```

## 7. Build the frontend

```bash
cd /home/deployuser/shule/shule-frontend
npm ci
npm run build
```

This produces `shule-frontend/dist/`, which Nginx will serve directly (`VITE_API_BASE=/api` is already relative, so no rebuild config is needed for the domain).

## 8. systemd services (gunicorn + celery worker + celery beat)

```bash
sudo cp /home/deployuser/shule/deploy/systemd/shule-gunicorn.service /etc/systemd/system/
sudo cp /home/deployuser/shule/deploy/systemd/shule-celery.service /etc/systemd/system/
sudo cp /home/deployuser/shule/deploy/systemd/shule-celerybeat.service /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable --now shule-gunicorn shule-celery shule-celerybeat

# check status
sudo systemctl status shule-gunicorn shule-celery shule-celerybeat
```

If any service fails to start, check logs:
```bash
sudo journalctl -u shule-gunicorn -n 50 --no-pager
tail -n 50 /home/deployuser/shule/logs/gunicorn-error.log
```

## 9. Nginx site

The other domain already served by this Nginx is untouched — this adds a new site alongside it.

```bash
sudo cp /home/deployuser/shule/deploy/nginx/shule.ac.tz.conf /etc/nginx/sites-available/shule.ac.tz.conf
sudo ln -s /etc/nginx/sites-available/shule.ac.tz.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

At this point `http://shule.ac.tz` should serve the app (DNS already points here).

## 10. HTTPS via Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d shule.ac.tz -d www.shule.ac.tz
```

Certbot edits the Nginx config to add the SSL server block and HTTP→HTTPS redirect, and sets up auto-renewal.

## 11. Verify

- `https://shule.ac.tz/` → frontend loads
- `https://shule.ac.tz/api/` → JSON API root response
- `https://shule.ac.tz/admin/` → Django admin login works (log in with the superuser from step 6)
- `sudo systemctl status shule-gunicorn shule-celery shule-celerybeat` → all `active (running)`

## Redeploying after future code changes

```bash
cd /home/deployuser/shule
git pull
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
sudo systemctl restart shule-gunicorn shule-celery shule-celerybeat

cd shule-frontend
npm ci
npm run build
```

No Nginx reload needed for app updates (only if `deploy/nginx/shule.ac.tz.conf` itself changes).
