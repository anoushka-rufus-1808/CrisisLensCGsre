import asyncio
import threading
import uuid
import json
import httpx

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Any

router = APIRouter()

# In-memory store: runId -> asyncio.Queue
_run_queues: dict[str, asyncio.Queue] = {}


class ForecastRunRequest(BaseModel):
    facilities:        list[dict[str, Any]]
    districtHistories: dict[str, Any]
    horizon:           int
    model:             str
    concurrency:       int = 5


@router.post("/run")
async def start_forecast_run(req: ForecastRunRequest):
    run_id = str(uuid.uuid4())
    loop   = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()
    _run_queues[run_id] = queue

    state = {"done": 0, "total": len(req.facilities)}

    def run_in_background():
        sem = threading.Semaphore(req.concurrency)

        def forecast_one(facility: dict[str, Any]):
            with sem:
                fid      = facility.get("id", "unknown")
                district = facility.get("district", "")
                vuln     = float(facility.get("vulnerability", 0.5))
                history  = req.districtHistories.get(district, [])

                # Convert raw weather rows → {date, value} DataPoints
                # value = climate stress score weighted by facility vulnerability
                data_points = []
                for row in history:
                    date = row.get("date") or row.get("ds")
                    if not date:
                        continue
                    temp  = float(row.get("temperature_max", row.get("temperature_2m", 35)))
                    rain  = float(row.get("precipitation_sum", row.get("precipitation", 0)))
                    # Climate stress 0–100: heat drives risk up, rain drives it slightly down
                    stress = min(100.0, max(0.0, (temp - 25.0) * 4.0 - rain * 0.5))
                    # Weight by facility vulnerability
                    value  = round(min(100.0, stress * (0.5 + 0.5 * vuln)), 4)
                    data_points.append({"date": str(date), "value": value})

                source = "statistical_fallback"
                score  = round(50.0 * vuln, 2)  # default fallback

                if len(data_points) >= 10:
                    try:
                        resp = httpx.post(
                            "http://localhost:8001/forecast",
                            json={
                                "data":        data_points,
                                "horizon":     req.horizon,
                                "model":       req.model,
                                "metric_name": "risk",
                                "state":       district,
                            },
                            timeout=60,
                        )
                        resp.raise_for_status()
                        result   = resp.json()
                        forecast = result.get("forecast", [])
                        if forecast:
                            preds  = [p["predicted"] for p in forecast]
                            score  = round(min(100.0, max(0.0, sum(preds) / len(preds))), 2)
                            used   = result.get("model", "ml")
                            source = "ml" if used != "statistical_fallback" else "statistical_fallback"
                    except Exception as e:
                        print(f"[SSE] ML call failed for {fid}: {e}")
                        # Keep statistical fallback score already computed above
                        rows = history if isinstance(history, list) else []
                        if rows:
                            temps = [float(r.get("temperature_max", r.get("temperature_2m", 35))) for r in rows[-90:]]
                            avg   = sum(temps) / len(temps) if temps else 35.0
                            score = round(min(100.0, max(0.0, (avg - 25.0) * 4.0 * vuln)), 2)
                else:
                    # Not enough history rows — pure statistical
                    rows = history if isinstance(history, list) else []
                    if rows:
                        temps = [float(r.get("temperature_max", r.get("temperature_2m", 35))) for r in rows[-90:]]
                        avg   = sum(temps) / len(temps) if temps else 35.0
                        score = round(min(100.0, max(0.0, (avg - 25.0) * 4.0 * vuln)), 2)

                state["done"] += 1

                asyncio.run_coroutine_threadsafe(
                    queue.put({
                        "type":  "progress",
                        "done":  state["done"],
                        "total": state["total"],
                    }),
                    loop,
                )
                asyncio.run_coroutine_threadsafe(
                    queue.put({
                        "type":       "result",
                        "facilityId": fid,
                        "district":   district,
                        "score":      score,
                        "source":     source,
                    }),
                    loop,
                )

        threads = [
            threading.Thread(target=forecast_one, args=(f,), daemon=True)
            for f in req.facilities
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        asyncio.run_coroutine_threadsafe(
            queue.put({"type": "done"}),
            loop,
        )

    threading.Thread(target=run_in_background, daemon=True).start()
    return {"runId": run_id}


@router.get("/stream/{run_id}")
async def stream_forecast(run_id: str):
    queue = _run_queues.get(run_id)
    if queue is None:
        raise HTTPException(status_code=404, detail="Run not found")

    async def event_generator():
        facility_scores: dict[str, dict] = {}
        try:
            while True:
                msg = await asyncio.wait_for(queue.get(), timeout=120)

                if msg["type"] == "result":
                    facility_scores[msg["facilityId"]] = msg

                yield f"data: {json.dumps(msg)}\n\n"

                if msg["type"] == "done":
                    # Compute and stream district averages
                    district_map: dict[str, list[float]] = {}
                    for r in facility_scores.values():
                        d = r.get("district", "")
                        district_map.setdefault(d, []).append(r["score"])

                    averages = {
                        d: round(sum(scores) / len(scores), 2)
                        for d, scores in district_map.items()
                        if scores
                    }
                    yield f"data: {json.dumps({'type': 'districtAverages', 'averages': averages})}\n\n"
                    break

        except asyncio.TimeoutError:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Forecast timed out'})}\n\n"
        finally:
            _run_queues.pop(run_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":               "no-cache",
            "X-Accel-Buffering":           "no",
            "Access-Control-Allow-Origin": "*",
        },
    )