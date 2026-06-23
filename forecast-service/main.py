from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional
import os
import pandas as pd
import numpy as np
from datetime import timedelta
import hashlib
import json
import time
import warnings
import traceback

warnings.filterwarnings("ignore")

PROPHET_AVAILABLE = False
try:
    import importlib
    importlib.util.find_spec("prophet")
    PROPHET_AVAILABLE = True
except Exception:
    PROPHET_AVAILABLE = False

app = FastAPI(title="CG State Risk Forecasting Service", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Init DB and register routers ──────────────────────────────────────────────
from db import init_db
from routes.facilities import router as facilities_router
from routes.forecast_sse import router as forecast_sse_router

init_db()
app.include_router(facilities_router, prefix="/api")
app.include_router(forecast_sse_router, prefix="/api/forecast")

# ── Global exception handler ──────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    tb = traceback.format_exc()
    print(f"[ERROR] Unhandled exception on {request.method} {request.url.path}:\n{tb}")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc) or "Internal server error"},
    )

# ── Cache ─────────────────────────────────────────────────────────────────────
_cache: dict = {}
CACHE_TTL_SECONDS = 3600

def _make_cache_key(data: list[dict], horizon: int, model: str) -> str:
    payload = json.dumps({"data": data, "horizon": horizon, "model": model}, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]

def _get_cached(key: str):
    entry = _cache.get(key)
    if entry is None:
        return None
    ts, result = entry
    if time.time() - ts > CACHE_TTL_SECONDS:
        del _cache[key]
        return None
    return result

def _set_cached(key: str, result: dict) -> None:
    if len(_cache) > 200:
        cutoff = time.time() - CACHE_TTL_SECONDS
        stale = [k for k, (ts, _) in _cache.items() if ts < cutoff]
        for k in stale:
            del _cache[k]
    _cache[key] = (time.time(), result)

# ── Pydantic models ───────────────────────────────────────────────────────────
class DataPoint(BaseModel):
    date: str
    value: float

class ForecastRequest(BaseModel):
    data: list[DataPoint]
    horizon: int
    model: str = "random_forest"
    metric_name: Optional[str] = "value"
    state: Optional[str] = None

class ForecastPoint(BaseModel):
    date: str
    predicted: float
    lower: float
    upper: float

class ForecastResponse(BaseModel):
    metric_name: str
    state: Optional[str]
    model: str
    horizon: int
    forecast: list[ForecastPoint]
    training_points: int
    mape: Optional[float]
    cached: bool = False

# ── Statistical fallback ──────────────────────────────────────────────────────
def run_statistical_fallback(df: pd.DataFrame, horizon: int):
    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)
    df["doy"] = df["date"].dt.dayofyear
    seasonal = df.groupby("doy")["value"].mean().to_dict()
    overall_mean = float(df["value"].mean())
    recent = df.tail(90).copy()
    recent["t"] = np.arange(len(recent))
    slope = float(np.polyfit(recent["t"], recent["value"], 1)[0]) if len(recent) >= 2 else 0.0
    last_date = df["date"].max()
    std = float(df["value"].std()) if len(df) > 1 else 5.0
    predictions = []
    for i in range(horizon):
        future_date = last_date + timedelta(days=i + 1)
        doy = future_date.timetuple().tm_yday
        seasonal_val = seasonal.get(doy, overall_mean)
        trend_contrib = slope * (i + 1) * max(0.0, 1.0 - i / (horizon * 2))
        pred = float(np.clip(seasonal_val + trend_contrib, 0, 100))
        uncertainty = std * (1 + i * 0.015)
        predictions.append(ForecastPoint(
            date=future_date.strftime("%Y-%m-%d"),
            predicted=round(pred, 4),
            lower=round(max(0, pred - 1.96 * uncertainty), 4),
            upper=round(min(100, pred + 1.96 * uncertainty), 4),
        ))
    check = df.tail(30).copy()
    check["pred"] = check["doy"].map(lambda d: seasonal.get(d, overall_mean))
    mape = float((np.abs(check["value"].values - check["pred"].values) /
                  (np.abs(check["value"].values) + 1e-8)).mean() * 100)
    return predictions, mape

# ── Prophet ───────────────────────────────────────────────────────────────────
def run_prophet(df: pd.DataFrame, horizon: int):
    if not PROPHET_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Prophet is not installed. Run: pip install prophet — or switch to Random Forest.",
        )
    try:
        from prophet import Prophet
        prophet_df = df.rename(columns={"date": "ds", "value": "y"})
        prophet_df["ds"] = pd.to_datetime(prophet_df["ds"])
        model = Prophet(
            changepoint_prior_scale=0.05,
            seasonality_prior_scale=10,
            daily_seasonality=False,
            weekly_seasonality=True,
            yearly_seasonality=True,
            interval_width=0.95,
        )
        if len(prophet_df) >= 14:
            model.add_seasonality(name="monthly", period=30.5, fourier_order=5)
        model.fit(prophet_df)
        future = model.make_future_dataframe(periods=horizon, freq="D")
        forecast_df = model.predict(future)
        result_df = forecast_df.tail(horizon)[["ds", "yhat", "yhat_lower", "yhat_upper"]]
        mape = None
        if len(prophet_df) > horizon:
            in_sample = forecast_df[forecast_df["ds"].isin(prophet_df["ds"])]
            actuals = prophet_df.set_index("ds")["y"]
            preds   = in_sample.set_index("ds")["yhat"]
            aligned = actuals.align(preds, join="inner")
            if len(aligned[0]) > 0 and aligned[0].abs().mean() > 0:
                mape = float((np.abs(aligned[0] - aligned[1]) /
                              (np.abs(aligned[0]) + 1e-8)).mean() * 100)
        points = [
            ForecastPoint(
                date=row["ds"].strftime("%Y-%m-%d"),
                predicted=round(float(row["yhat"]), 4),
                lower=round(float(row["yhat_lower"]), 4),
                upper=round(float(row["yhat_upper"]), 4),
            )
            for _, row in result_df.iterrows()
        ]
        return points, mape
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prophet error: {str(e)}")

# ── Random Forest ─────────────────────────────────────────────────────────────
def run_random_forest(df: pd.DataFrame, horizon: int):
    try:
        from sklearn.ensemble import RandomForestRegressor
        df = df.copy()
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values("date").reset_index(drop=True)

        def build_features(series: pd.Series, n_lags: int = 14) -> pd.DataFrame:
            feats = {}
            for lag in range(1, n_lags + 1):
                feats[f"lag_{lag}"] = series.shift(lag)
            feats["rolling_7"]     = series.shift(1).rolling(7).mean()
            feats["rolling_14"]    = series.shift(1).rolling(14).mean()
            feats["rolling_std_7"] = series.shift(1).rolling(7).std()
            dates = pd.to_datetime(df["date"])
            feats["dayofweek"]  = dates.dt.dayofweek.values
            feats["dayofmonth"] = dates.dt.day.values
            feats["month"]      = dates.dt.month.values
            feats["dayofyear"]  = dates.dt.dayofyear.values
            return pd.DataFrame(feats)

        n_lags   = min(14, max(3, len(df) // 4))
        features = build_features(df["value"], n_lags=n_lags)
        target   = df["value"]
        valid_idx = features.dropna().index
        X = features.loc[valid_idx]
        y = target.loc[valid_idx]
        if len(X) < 5:
            raise HTTPException(status_code=400, detail="Need at least 20 data points for Random Forest")
        model = RandomForestRegressor(n_estimators=200, max_depth=10, random_state=42, n_jobs=-1)
        model.fit(X, y)
        train_preds  = model.predict(X)
        mape         = float((np.abs(y.values - train_preds) / (np.abs(y.values) + 1e-8)).mean() * 100)
        last_date    = df["date"].max()
        history      = list(df["value"].values)
        predictions  = []
        residual_std = float(np.std(y.values - train_preds))
        for i in range(horizon):
            future_date = last_date + timedelta(days=i + 1)
            feats = {}
            for lag in range(1, n_lags + 1):
                feats[f"lag_{lag}"] = [history[-lag] if lag <= len(history) else np.nan]
            window_7  = history[-7:]  if len(history) >= 7  else history
            window_14 = history[-14:] if len(history) >= 14 else history
            feats["rolling_7"]     = [np.mean(window_7)]
            feats["rolling_14"]    = [np.mean(window_14)]
            feats["rolling_std_7"] = [np.std(window_7) if len(window_7) > 1 else 0]
            feats["dayofweek"]  = [future_date.weekday()]
            feats["dayofmonth"] = [future_date.day]
            feats["month"]      = [future_date.month]
            feats["dayofyear"]  = [future_date.timetuple().tm_yday]
            X_pred = pd.DataFrame(feats)
            pred = float(model.predict(X_pred)[0])
            uncertainty = residual_std * (1 + i * 0.01)
            predictions.append(ForecastPoint(
                date=future_date.strftime("%Y-%m-%d"),
                predicted=round(pred, 4),
                lower=round(pred - 1.96 * uncertainty, 4),
                upper=round(pred + 1.96 * uncertainty, 4),
            ))
            history.append(pred)
        return predictions, mape
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Random Forest error: {str(e)}")

# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/healthz")
def health():
    return {"status": "healthy", "cache_entries": len(_cache), "prophet_available": PROPHET_AVAILABLE}

@app.post("/api/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest):
    if req.horizon not in [30, 60, 90]:
        raise HTTPException(status_code=400, detail="horizon must be 30, 60, or 90")
    if len(req.data) < 10:
        raise HTTPException(status_code=400, detail="At least 10 data points required")
    raw_data  = [{"date": p.date, "value": p.value} for p in req.data]
    cache_key = _make_cache_key(raw_data, req.horizon, req.model)
    cached    = _get_cached(cache_key)
    if cached:
        return ForecastResponse(**{**cached, "cached": True})
    df = pd.DataFrame(raw_data).sort_values("date").reset_index(drop=True)
    if req.model == "prophet":
        if not PROPHET_AVAILABLE:
            points, mape = run_statistical_fallback(df, req.horizon)
            used_model   = "statistical_fallback"
        else:
            points, mape = run_prophet(df, req.horizon)
            used_model   = "prophet"
    elif req.model == "random_forest":
        points, mape = run_random_forest(df, req.horizon)
        used_model   = "random_forest"
    else:
        raise HTTPException(status_code=400, detail="model must be 'prophet' or 'random_forest'")
    result = dict(
        metric_name=req.metric_name or "value",
        state=req.state,
        model=used_model,
        horizon=req.horizon,
        forecast=points,
        training_points=len(df),
        mape=round(mape, 2) if mape is not None else None,
        cached=False,
    )
    _set_cached(cache_key, result)
    return ForecastResponse(**result)

@app.post("/api/forecast/compare")
def forecast_compare(req: ForecastRequest):
    if req.horizon not in [30, 60, 90]:
        raise HTTPException(status_code=400, detail="horizon must be 30, 60, or 90")
    if len(req.data) < 10:
        raise HTTPException(status_code=400, detail="At least 10 data points required")
    raw_data       = [{"date": p.date, "value": p.value} for p in req.data]
    prophet_key    = _make_cache_key(raw_data, req.horizon, "prophet")
    rf_key         = _make_cache_key(raw_data, req.horizon, "random_forest")
    prophet_cached = _get_cached(prophet_key)
    rf_cached      = _get_cached(rf_key)
    if prophet_cached and rf_cached:
        return {"metric_name": req.metric_name or "value", "state": req.state,
                "horizon": req.horizon, "cached": True,
                "prophet":       {"forecast": prophet_cached["forecast"], "mape": prophet_cached["mape"]},
                "random_forest": {"forecast": rf_cached["forecast"],      "mape": rf_cached["mape"]}}
    df = pd.DataFrame(raw_data).sort_values("date").reset_index(drop=True)
    if PROPHET_AVAILABLE:
        prophet_points, prophet_mape = run_prophet(df, req.horizon)
    else:
        prophet_points, prophet_mape = run_statistical_fallback(df, req.horizon)
    rf_points, rf_mape = run_random_forest(df, req.horizon)
    _set_cached(prophet_key, dict(
        metric_name=req.metric_name or "value", state=req.state,
        model="prophet" if PROPHET_AVAILABLE else "statistical_fallback",
        horizon=req.horizon, forecast=prophet_points, training_points=len(df),
        mape=round(prophet_mape, 2) if prophet_mape is not None else None))
    _set_cached(rf_key, dict(
        metric_name=req.metric_name or "value", state=req.state,
        model="random_forest", horizon=req.horizon, forecast=rf_points,
        training_points=len(df), mape=round(rf_mape, 2) if rf_mape is not None else None))
    return {
        "metric_name": req.metric_name or "value", "state": req.state,
        "horizon": req.horizon, "cached": False,
        "prophet":       {"forecast": [p.dict() for p in prophet_points],
                          "mape": round(prophet_mape, 2) if prophet_mape is not None else None},
        "random_forest": {"forecast": [p.dict() for p in rf_points],
                          "mape": round(rf_mape, 2) if rf_mape is not None else None},
    }

@app.delete("/api/cache")
def clear_cache():
    count = len(_cache)
    _cache.clear()
    return {"cleared": count}

# ── Serve built React frontend (SPA) ─────────────────────────────────────────
_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dist")
if os.path.isdir(_DIST):
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="spa")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8001)))
