import {
  Server, Zap, Database, Radio, ChevronRight,
  CheckCircle2, AlertTriangle, Clock,
} from "lucide-react";

interface Param {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  summary: string;
  description: string;
  requestBody?: { params: Param[] };
  response: string;
  badge?: string;
}

const METHOD_COLORS: Record<string, string> = {
  GET:    "bg-emerald-100 text-emerald-700 border-emerald-300",
  POST:   "bg-blue-100 text-blue-700 border-blue-300",
  PUT:    "bg-orange-100 text-orange-700 border-orange-300",
  DELETE: "bg-red-100 text-red-700 border-red-300",
};

const SECTIONS: {
  title: string;
  icon: React.ReactNode;
  color: string;
  endpoints: Endpoint[];
}[] = [
  {
    title: "Health",
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: "text-emerald-600",
    endpoints: [
      {
        method: "GET",
        path: "/healthz",
        summary: "Health Check",
        description: "Returns server status, Prophet availability, and cache entry count.",
        response: `{ "status": "healthy", "prophet_available": true, "cache_entries": 12 }`,
      },
    ],
  },
  {
    title: "Facilities",
    icon: <Database className="w-4 h-4" />,
    color: "text-indigo-600",
    endpoints: [
      {
        method: "GET",
        path: "/facilities",
        summary: "List All Facilities",
        description: "Returns all facilities stored in SQLite. Used by the frontend on load.",
        response: `[{ "id": "...", "name": "...", "district": "Durg", "facilityType": "school", ... }]`,
      },
      {
        method: "POST",
        path: "/facilities",
        summary: "Create Facility",
        description: "Adds a single new facility to the database.",
        requestBody: {
          params: [
            { name: "name",             type: "string",  required: true,  description: "Facility display name" },
            { name: "district",         type: "string",  required: true,  description: "Chhattisgarh district name" },
            { name: "facilityType",     type: "string",  required: true,  description: '"school" or "hospital"' },
            { name: "coordinates",      type: "object",  required: true,  description: '{ lat: number, lng: number }' },
            { name: "primaryWaterSource", type: "string", required: false, description: '"tap" | "handpump" | "tanker"' },
            { name: "riskOverall",      type: "number",  required: false, description: "Initial risk % (0–100)" },
          ],
        },
        response: `{ "id": "uuid", "name": "...", ... }`,
      },
      {
        method: "POST",
        path: "/facilities/bulk",
        summary: "Bulk Create Facilities",
        description: "Seeds the database with multiple facilities at once. Called on first app load if DB is empty.",
        requestBody: {
          params: [
            { name: "facilities", type: "array", required: true, description: "Array of facility objects (same shape as single create)" },
          ],
        },
        response: `{ "created": 42, "skipped": 0 }`,
      },
      {
        method: "PUT",
        path: "/facilities/{id}",
        summary: "Update Facility",
        description: "Updates any field of an existing facility by ID.",
        requestBody: {
          params: [
            { name: "id",   type: "path param", required: true,  description: "Facility UUID" },
            { name: "body", type: "object",      required: true,  description: "Partial facility fields to update" },
          ],
        },
        response: `{ "id": "...", "name": "...", ...updated fields }`,
      },
      {
        method: "DELETE",
        path: "/facilities/{id}",
        summary: "Delete Facility",
        description: "Removes a facility from the database by ID.",
        requestBody: {
          params: [
            { name: "id", type: "path param", required: true, description: "Facility UUID" },
          ],
        },
        response: `{ "deleted": true }`,
      },
    ],
  },
  {
    title: "ML Forecast (Single)",
    icon: <Zap className="w-4 h-4" />,
    color: "text-purple-600",
    endpoints: [
      {
        method: "POST",
        path: "/forecast",
        summary: "Run Single Forecast",
        description:
          "Runs Prophet or Random Forest on a time series of daily risk values. Results are cached for 1 hour by payload hash. Used internally by the SSE runner.",
        badge: "Cached 1h",
        requestBody: {
          params: [
            { name: "data",        type: "DataPoint[]", required: true,  description: 'Array of { date: "YYYY-MM-DD", value: number }' },
            { name: "horizon",     type: "number",      required: true,  description: "30 | 60 | 90 (days ahead to forecast)" },
            { name: "model",       type: "string",      required: true,  description: '"prophet" | "random_forest"' },
            { name: "metric_name", type: "string",      required: false, description: 'Label for the metric (e.g. "risk")' },
            { name: "state",       type: "string",      required: false, description: "District name for logging" },
          ],
        },
        response: `{
  "metric_name": "risk",
  "model": "prophet",
  "horizon": 30,
  "forecast": [{ "date": "2026-07-13", "predicted": 62.4, "lower": 48.1, "upper": 76.7 }],
  "training_points": 365,
  "mape": 8.3,
  "cached": false
}`,
      },
    ],
  },
  {
    title: "ML Forecast (SSE Streaming)",
    icon: <Radio className="w-4 h-4" />,
    color: "text-rose-600",
    endpoints: [
      {
        method: "POST",
        path: "/forecast/run",
        summary: "Start Per-Facility Forecast Run",
        description:
          "Kicks off a background forecast job for all facilities. Converts district weather history rows into daily risk DataPoints, then calls /forecast per facility in parallel threads. Returns a runId immediately.",
        badge: "Async",
        requestBody: {
          params: [
            { name: "facilities",        type: "array",  required: true,  description: "Facility objects with vulnerability score attached" },
            { name: "districtHistories", type: "object", required: true,  description: "Map of district → array of weather history rows" },
            { name: "horizon",           type: "number", required: true,  description: "30 | 60 | 90" },
            { name: "model",             type: "string", required: true,  description: '"prophet" | "random_forest"' },
            { name: "concurrency",       type: "number", required: false, description: "Max parallel threads (default: 5)" },
          ],
        },
        response: `{ "runId": "550e8400-e29b-41d4-a716-446655440000" }`,
      },
      {
        method: "GET",
        path: "/forecast/stream/{runId}",
        summary: "Stream Forecast Results (SSE)",
        description:
          "Opens a Server-Sent Events connection. Streams live progress, per-facility results, district averages, and a final done signal. Client closes the connection on 'done'.",
        badge: "SSE",
        requestBody: {
          params: [
            { name: "runId", type: "path param", required: true, description: "The runId returned by POST /forecast/run" },
          ],
        },
        response: `// Event stream — one JSON object per line, prefixed with "data: "

data: { "type": "progress", "done": 3, "total": 42 }

data: { "type": "result", "facilityId": "abc", "district": "Durg",
        "score": 67.2, "source": "ml" }

data: { "type": "districtAverages",
        "averages": { "Durg": 64.1, "Raipur": 71.3 } }

data: { "type": "done" }

// On error:
data: { "type": "error", "message": "Forecast timed out" }`,
      },
    ],
  },
];

export default function ApiDocs() {
  return (
    <div className="space-y-8 max-w-5xl">

      {/* Header */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 text-white">
        <div className="flex items-center gap-3 mb-3">
          <Server className="w-6 h-6 text-indigo-400" />
          <span className="text-sm font-semibold text-indigo-300 uppercase tracking-widest">
            FastAPI · Port 8001
          </span>
        </div>
        <h1 className="text-3xl font-black mb-2">CG Risk Engine — API Reference</h1>
        <p className="text-gray-400 text-sm max-w-2xl">
          All endpoints are served by a local FastAPI (uvicorn) instance. The Vite dev server
          proxies <code className="text-indigo-300 font-mono">/api/*</code> → <code className="text-indigo-300 font-mono">localhost:8001/*</code> (stripping the <code>/api</code> prefix).
        </p>
        <div className="mt-5 grid grid-cols-4 gap-4">
          {[
            { label: "Base URL (dev)",    value: "localhost:8001"    },
            { label: "Via Vite proxy",    value: "/api/*"            },
            { label: "ML Models",         value: "Prophet · RF"      },
            { label: "DB",                value: "SQLite (local)"    },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-700/50 rounded-xl p-3">
              <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{label}</div>
              <div className="text-sm font-bold text-white mt-0.5 font-mono">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* SSE Flow Diagram */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
        <div className="text-sm font-semibold text-indigo-700 mb-3 flex items-center gap-2">
          <Radio className="w-4 h-4" /> Per-Facility ML Forecast Flow
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          {[
            "POST /forecast/run",
            "← runId",
            "GET /forecast/stream/{runId}",
            "← progress events",
            "← result events (per facility)",
            "← districtAverages",
            "← done",
          ].map((step, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded ${
                step.startsWith("←")
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-indigo-100 text-indigo-700"
              }`}>{step}</span>
              {i < 6 && <ChevronRight className="w-3 h-3 text-gray-400" />}
            </span>
          ))}
        </div>
      </div>

      {/* Endpoint Sections */}
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <div className={`flex items-center gap-2 mb-4 ${section.color}`}>
            {section.icon}
            <h2 className="text-base font-bold">{section.title}</h2>
          </div>
          <div className="space-y-4">
            {section.endpoints.map((ep) => (
              <div key={ep.path} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                {/* Endpoint Header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50">
                  <span className={`text-xs font-black px-2 py-1 rounded border font-mono ${METHOD_COLORS[ep.method]}`}>
                    {ep.method}
                  </span>
                  <code className="text-sm font-mono font-semibold text-gray-800">{ep.path}</code>
                  <span className="text-sm text-gray-500 ml-1">— {ep.summary}</span>
                  {ep.badge && (
                    <span className="ml-auto text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      {ep.badge === "Cached 1h" && <Clock className="w-3 h-3" />}
                      {ep.badge === "Async"     && <Zap   className="w-3 h-3" />}
                      {ep.badge === "SSE"       && <Radio className="w-3 h-3" />}
                      {ep.badge}
                    </span>
                  )}
                </div>

                <div className="px-5 py-4 space-y-4">
                  <p className="text-sm text-gray-600">{ep.description}</p>

                  {/* Request Body */}
                  {ep.requestBody && (
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        {ep.method === "GET" || ep.path.includes("{") ? "Parameters" : "Request Body"}
                      </div>
                      <div className="border border-gray-100 rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                              <th className="px-3 py-2 text-left font-semibold text-gray-500">Name</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-500">Type</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-500">Req?</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-500">Description</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {ep.requestBody.params.map((p) => (
                              <tr key={p.name} className="hover:bg-gray-50">
                                <td className="px-3 py-2 font-mono font-semibold text-indigo-700">{p.name}</td>
                                <td className="px-3 py-2 font-mono text-gray-500">{p.type}</td>
                                <td className="px-3 py-2">
                                  {p.required !== false
                                    ? <span className="text-red-500 font-bold">yes</span>
                                    : <span className="text-gray-400">no</span>}
                                </td>
                                <td className="px-3 py-2 text-gray-600">{p.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Response */}
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Response</div>
                    <pre className="bg-gray-900 text-emerald-300 text-xs rounded-lg p-4 overflow-x-auto leading-relaxed font-mono whitespace-pre-wrap">
                      {ep.response}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Notes */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2 text-yellow-700 font-semibold text-sm">
          <AlertTriangle className="w-4 h-4" /> Notes
        </div>
        <ul className="text-xs text-yellow-800 space-y-1.5 list-disc list-inside">
          <li>All endpoints require the Python service running on port 8001 (<code className="font-mono">python forecast-service/main.py</code>).</li>
          <li><strong>/forecast/run</strong> spawns one OS thread per facility (capped by <code>concurrency</code>). Keep concurrency ≤ 5 to avoid hitting Prophet's GIL.</li>
          <li><strong>/forecast/stream</strong> times out after 120 seconds per batch. For very large facility sets, increase this in <code>forecast_sse.py</code>.</li>
          <li>Prophet must be installed separately: <code className="font-mono">pip install prophet</code>. Without it, the service auto-falls back to Random Forest → Statistical.</li>
          <li>The <code>/forecast</code> endpoint caches results by payload hash for 1 hour. Force a fresh run by changing the horizon or model.</li>
        </ul>
      </div>
    </div>
  );
}