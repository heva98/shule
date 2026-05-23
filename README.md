# Shule SMS — School Management System

A Django REST API backend for managing a private school in Tanzania. Built to handle student records, fee payments (M-Pesa/TZS), attendance, exams, staff, and SMS communications via Africa's Talking.

## Project Structure

```
shule-sms/
├── shule/              # Project config (settings, urls, wsgi)
├── accounts/           # Authentication & user management
├── students/           # Student enrolment & profiles
├── fees/               # Fee schedules, invoices & M-Pesa payments
├── attendance/         # Daily attendance tracking
├── exams/              # Exam results & report cards
├── staff/              # Staff records & roles
├── communications/     # SMS & notifications via Africa's Talking
├── manage.py
├── .env.example
└── requirements.txt
```

## Tech Stack

- **Backend:** Django 4.2, Django REST Framework
- **Auth:** JWT via `djangorestframework-simplejwt`
- **Database:** PostgreSQL
- **Cache:** Redis
- **SMS:** Africa's Talking
- **Payments:** M-Pesa (Vodacom Tanzania)
- **Currency:** TZS (Tanzanian Shilling)
- **Timezone:** Africa/Dar_es_Salaam

## Prerequisites

- Python 3.9+
- PostgreSQL 14+
- Redis 6+

## Setup

### 1. Clone and activate environment

```bash
git clone <repo-url>
cd shule-sms
# activate your virtual environment
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in all required values:

| Variable | Description |
|---|---|
| `SECRET_KEY` | Django secret key (generate with `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`) |
| `DEBUG` | `True` for development, `False` for production |
| `DB_NAME` | PostgreSQL database name |
| `DB_USER` | PostgreSQL username |
| `DB_PASSWORD` | PostgreSQL password |
| `DB_HOST` | Database host (default: `localhost`) |
| `DB_PORT` | Database port (default: `5432`) |
| `REDIS_URL` | Redis connection URL |
| `AFRICASTALKING_USERNAME` | Africa's Talking account username |
| `AFRICASTALKING_API_KEY` | Africa's Talking API key |
| `MPESA_CONSUMER_KEY` | M-Pesa API consumer key |
| `MPESA_CONSUMER_SECRET` | M-Pesa API consumer secret |
| `MPESA_SHORTCODE` | M-Pesa business shortcode |
| `MPESA_PASSKEY` | M-Pesa passkey |
| `FRONTEND_URL` | Frontend origin for CORS (default: `http://localhost:5173`) |

### 4. Set up the database

```bash
createdb shule_db
python manage.py migrate
python manage.py createsuperuser
```

### 5. Run the development server

```bash
python manage.py runserver
```

API is available at `http://localhost:8000/api/`.

## API Authentication

All endpoints require a JWT Bearer token. Obtain tokens at:

```
POST /api/token/          # obtain access + refresh tokens
POST /api/token/refresh/  # refresh access token
```

Include the token in requests:

```
Authorization: Bearer <access_token>
```

## Running Tests

```bash
python manage.py test
```

## Production Checklist

- Set `DEBUG=False` in `.env`
- Set `ALLOWED_HOSTS` to your domain
- Configure a proper `SECRET_KEY`
- Use `gunicorn` or `uvicorn` as the WSGI/ASGI server
- Set up Nginx as a reverse proxy
- Run `python manage.py collectstatic`
