# CG State Risk Engine
A full-stack infrastructure risk forecasting platform for Chhattisgarh, India. The system ingests facility-level operational data, runs machine-learning risk forecasts, and surfaces actionable insights through an interactive dashboard with live maps, historical analytics, and automated email alerts.
---
## Features
- **Risk Dashboard** — real-time risk scoring across all monitored facilities
- **Predictive Forecasting** — 30/60/90-day risk forecasts via Random Forest or Prophet
- **Model Comparison** — side-by-side accuracy benchmarking (MAPE) between models
- **Accuracy Backtesting** — historical hold-out validation for forecast quality
- **Live Map** — geo-visualisation of facility risk levels across Chhattisgarh districts
- **Historical Analytics** — trend analysis and seasonal decomposition
- **Facilities Database** — searchable, filterable registry of monitored infrastructure
- **School Risk Form** — manual risk entry and submission workflow
- **SSE Streaming** — real-time forecast progress via Server-Sent Events
- **Email Alerts** — EmailJS-powered alerts routed to facility contact emails
- **API Docs** — built-in interactive API reference page
- **Auth** — login/register flow with protected routes
---
## Tech Stack
| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| UI | shadcn/ui, Tailwind CSS |
| Backend | FastAPI 0.110+, Python 3.11 |
| ML | scikit-learn (Random Forest), Prophet (optional) |
| Data | pandas, NumPy |
| Database | SQLite (auto-seeded, ephemeral on free tier) |
| Streaming | Server-Sent Events (SSE) |
| Email | EmailJS |
| Deployment | Render (single-service — FastAPI serves built React SPA) |
---
## Project Structure

├── src/ # React frontend
│ ├── pages/ # Route-level pages
│ ├── components/ # Shared UI components
│ ├── hooks/ # Custom React hooks
│ ├── engine/ # Client-side scoring & prediction helpers
│ ├── config/ # EmailJS config (reads VITE_ env vars)
│ └── data/ # Static seed/mock data
├── forecast-service/ # FastAPI backend
│ ├── main.py # App entry point, forecast routes, SPA mount
│ ├── db.py # SQLite init & seeding
│ └── routes/
│ ├── facilities.py # /api/facilities CRUD
│ └── forecast_sse.py # /api/forecast/run & /stream SSE routes
├── public/ # Static assets
├── index.html
├── vite.config.ts
├── start.sh # Dev launcher (FastAPI + Vite concurrently)
└── package.json

---
## Local Development
### Prerequisites
- Node.js 18+
- Python 3.11+
### Setup
```bash
# 1. Install frontend dependencies
npm install
# 2. Install backend dependencies
pip install -r forecast-service/requirements.txt
# 3. Copy and fill environment variables
cp .env.example .env
# Edit .env with your EmailJS credentials (optional — only needed for alerts)
# 4. Start both servers
npm run dev

Frontend: http://localhost:5000
Backend API: http://localhost:8001
API requests from the frontend are proxied via Vite (/api → localhost:8001).

Environment Variables
All variables are optional. Email alerts are silently disabled if EmailJS vars are absent.

Variable	Description
VITE_EMAILJS_SERVICE_ID	EmailJS → Email Services → Service ID
VITE_EMAILJS_TEMPLATE_ID	EmailJS → Email Templates → Template ID
VITE_EMAILJS_PUBLIC_KEY	EmailJS → Account → Public Key
VITE_ALERT_RECIPIENT_EMAIL	Fallback alert recipient email
VITE_ALERT_RECIPIENT_NAME	Fallback recipient display name (default: "Education Officer")
Note: VITE_ variables are baked into the frontend at build time. Set them in your deployment environment before running the build step.

API Reference
Method	Endpoint	Description
GET	/healthz	Health check
GET	/api/facilities	List all facilities
POST	/api/facilities	Create a facility
PUT	/api/facilities/{id}	Update a facility
DELETE	/api/facilities/{id}	Delete a facility
POST	/api/forecast	Run a synchronous forecast
POST	/api/forecast/compare	Compare Prophet vs Random Forest
POST	/api/forecast/run	Start an async SSE forecast job
GET	/api/forecast/stream/{id}	Stream forecast progress (SSE)
DELETE	/api/cache	Clear the in-memory forecast cache
Forecast Models
Model	Notes
random_forest	Default. Recommended for Render free tier (low memory).
prophet	Higher accuracy; requires ~512 MB RAM. Falls back to statistical_fallback if Prophet is unavailable.
Request example
POST /api/forecast
{
  "data": [{ "date": "2024-01-01", "value": 42.5 }, ...],
  "horizon": 30,
  "model": "random_forest",
  "metric_name": "attendance_rate",
  "state": "Chhattisgarh"
}

Deployment (Render)
This project deploys as a single service — FastAPI builds and serves the React frontend as a static SPA.

1. Create a Web Service on Render
Setting	Value
Runtime	Python 3
Build Command	pip install -r forecast-service/requirements.txt && npm install && npm run build
Start Command	cd forecast-service && uvicorn main:app --host 0.0.0.0 --port $PORT
2. Set environment variables
Add the five VITE_ variables listed above in Render → Environment before triggering a deploy.

3. How routing works in production
GET /                  → FastAPI → dist/index.html   (React app shell)
GET /assets/*          → FastAPI → dist/assets/*     (JS / CSS bundles)
GET /live-map          → FastAPI → dist/index.html   (React Router SPA fallback)
GET /api/*             → FastAPI → API route handlers

Known free-tier constraints
SQLite is ephemeral — the database resets on each restart. The app auto-reseeds from mock data so no manual intervention is needed.
Cold starts — free services sleep after 15 minutes of inactivity; the first request after sleep takes ~30 seconds.
Prophet memory — Prophet may exceed the 512 MB RAM limit on free tier. The default model is random_forest; Prophet is available as an opt-in from the UI.
