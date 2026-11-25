# BowlMetrics

**Video-based cricket bowling biomechanics analysis.**

BowlMetrics turns a phone or camera video of a bowling delivery into a frame-by-frame
pose breakdown: skeleton overlay, bowling phases, joint-angle charts, and a plain-language
coaching report. It is a local-first prototype built with FastAPI, MediaPipe, React, and Vite.

> **Status:** early prototype (`0.1.0`). It is a coaching and learning aid, not an official
> ICC bowling-action test. See [Limitations](#limitations).

---

## Table of contents

- [What it does](#what-it-does)
- [Features](#features)
- [How it works](#how-it-works)
- [Metrics and thresholds](#metrics-and-thresholds)
- [Project structure](#project-structure)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [API reference](#api-reference)
- [Using the app](#using-the-app)
- [Testing](#testing)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)
- [License](#license)

---

## What it does

1. You upload a short video of one bowling delivery (or record one in the browser).
2. The backend extracts a 33-point body pose from every frame with MediaPipe.
3. It smooths the tracking data, detects the bowling phases, and computes four
   biomechanical measurements.
4. The frontend draws the skeleton over the video, lets you scrub frame by frame,
   charts the angles over time, and shows a coaching report in English or Roman Urdu.

Supported inputs: **MP4, MOV, WebM**. A steady, side-on shot with the full body in frame
works best.

---

## Features

### Analysis

- 33-keypoint pose tracking with MediaPipe Pose
- Butterworth low-pass smoothing to reduce landmark jitter
- Automatic detection of five phases:
  - Run-up
  - BFC — back-foot contact
  - FFC — front-foot contact
  - Ball release
  - Follow-through
- Four kinematic measurements:
  - Elbow extension (ICC 15°-style check)
  - Front-knee flexion at front-foot contact and release
  - Hip-shoulder separation
  - Trunk lateral tilt
- Pace and spin modes with different coaching thresholds

### Frontend studio

- Drag-and-drop upload or in-browser webcam recording
- Skeleton, joint-angle, and wrist-trail overlays on the video
- Frame stepping (`-1` / `+1`) and 0.25× / 0.5× / 1× playback
- Clickable phase timeline for instant seeking
- Angle-over-frames chart (click a point to jump to that frame)
- Coaching report with **EN / Roman Urdu** toggle and an ICC 15° elbow badge
- Side-by-side comparison with the previous delivery, including synced playback

### Backend

- FastAPI with automatic OpenAPI docs at `/docs`
- Temporary upload handling (the video file is deleted after the request)
- Typed request/response contracts with Pydantic
- CORS enabled for local Vite development

---

## How it works

```
Video upload
    │
    ▼
MediaPipe Pose (per frame)
    │  33 landmarks: x, y, z, visibility, presence
    ▼
Coordinate smoothing
    │  4th-order Butterworth low-pass, 6 Hz cutoff
    ▼
Phase detection
    │  stride, ankle planting, wrist speed + height
    ▼
Kinematics
    │  elbow, front knee, hip-shoulder separation, trunk tilt
    ▼
AnalysisResult JSON
    │  frames + phases + angle series
    ▼
React studio
    │  skeleton overlay, timeline, charts, coaching report
    ▼
Browser
```

### 1. Pose extraction — `backend/app/core/pose_extractor.py`

- Opens the video with OpenCV and reads frames sequentially.
- Runs the MediaPipe Pose Landmarker in `VIDEO` tracking mode with the full model.
- Downloads `pose_landmarker_full.task` (~9.4 MB) on first use and caches it in
  `backend/app/models_data/`.
- If a frame has no detection, the last known coordinates are reused with zero visibility.
- Smooths each landmark track with a zero-phase Butterworth filter.
- Falls back to 30 fps when the container does not report a valid frame rate.

### 2. Phase detection — `backend/app/core/phase_detector.py`

- Finds the main travel direction from the hip centroid.
- Uses front/back ankle stride to locate **front-foot contact (FFC)**.
- Uses the back ankle's first planted moment to locate **back-foot contact (BFC)**.
- Scores the bowling wrist by speed and height to locate **release**.
- Builds the five phase segments returned to the client.

### 3. Kinematics — `backend/app/core/kinematics.py`

- Joint angles use the standard vector formula
  `θ = arccos((u · v) / (|u| |v|))`.
- **Elbow extension** is the change in elbow angle between the frame where the upper arm
  is most horizontal and the release frame.
- **Front-knee flexion** is measured at FFC and at release.
- **Hip-shoulder separation** is the angle between the hip line and shoulder line at FFC.
- **Trunk tilt** is the angle of the shoulder-to-hip line away from vertical at release.

### 4. Coaching — `backend/app/core/feedback.py` and `FeedbackPanel.tsx`

The backend has a rule-based feedback generator (`generate_feedback`) that produces
English and Roman Urdu tips. The current API returns the raw metrics and pose data; the
web UI builds its own summary cards from the returned angle series.

---

## Metrics and thresholds

Thresholds live in `backend/app/core/kinematics.py` (`MODE_THRESHOLDS`).

| Metric | Pace | Spin | Notes |
| --- | ---: | ---: | --- |
| Maximum elbow extension | 15° | 15° | Same ICC-style limit for both modes |
| Minimum front-knee angle at FFC | 155° | 130° | Higher value = straighter, more braced leg |
| Minimum front-knee angle at release | 160° | 140° | Bracing through release |
| Minimum hip-shoulder separation | 30° | 40° | Measured at FFC |
| Maximum trunk lateral tilt | 15° | 20° | Measured at release |

**Reading the knee numbers:** a larger angle means a straighter leg. A front knee that
drops well below the target is collapsing instead of bracing. **Reading elbow extension:**
the value is the *change* from the most horizontal upper-arm position to release; more
than 15° is flagged as an illegal-looking action.

---

## Project structure

```
bowlmetrics/
├── Agent.md                       # Repository workflow notes
├── README.md
├── .gitignore
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py                # FastAPI app, routes, upload handling
│   │   ├── models/
│   │   │   └── schemas.py         # Pydantic contracts and enums
│   │   └── core/
│   │       ├── pose_extractor.py  # OpenCV + MediaPipe + smoothing
│   │       ├── phase_detector.py  # Run-up → follow-through segmentation
│   │       ├── kinematics.py      # Angle math and thresholds
│   │       └── feedback.py        # Rule-based EN / Roman Urdu tips
│   └── tests/
│       ├── test_smoke.py          # /api/health check
│       └── test_kinematics.py     # Angle math + phase detection tests
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.ts             # Dev proxy: /api → 127.0.0.1:8000
    ├── tailwind.config.js
    ├── tsconfig.json
    └── src/
        ├── App.tsx                # Studio layout and analysis state
        ├── types/biomechanics.ts  # API response types
        ├── utils/skeletonRenderer.ts
        └── components/
            ├── VideoDropzone.tsx
            ├── WebcamRecorderModal.tsx
            ├── BiomechanicsPlayer.tsx
            ├── PhaseTimelineBar.tsx
            ├── AngleTimeChart.tsx
            ├── FeedbackPanel.tsx
            └── SideBySideCompare.tsx
```

---

## Tech stack

| Layer | Tools |
| --- | --- |
| Backend API | FastAPI, Uvicorn, Pydantic |
| Pose + vision | MediaPipe Pose (>=0.10.30), OpenCV (headless), NumPy, SciPy |
| Frontend | React 18, TypeScript 5.7, Vite 6 |
| Charts | Recharts |
| Styling | Tailwind CSS 3 |
| Tests | pytest, HTTPX / FastAPI TestClient |

All dependencies are free and open source.

---

## Getting started

### Prerequisites

- **Python 3.11+** — MediaPipe 1.2.x also supports Python 3.14; use a current release.
- **Node.js 20+** and npm
- A modern browser (Chrome, Edge, or Firefox) for the studio and webcam recording

### 1. Backend

```bash
cd backend

# Windows
python -m venv .venv
.venv\Scripts\activate

# macOS / Linux
# python3 -m venv .venv
# source .venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt
```

FastAPI's multipart form uploads need `python-multipart`; it is included in
`requirements.txt`.

Start the API from the `backend/` directory:

```bash
uvicorn app.main:app --reload --port 8000
```

Verify it:

- Health: <http://127.0.0.1:8000/api/health>
- Interactive docs: <http://127.0.0.1:8000/docs>

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` requests to the backend on port `8000`,
so both servers must be running.

### 3. Production build

```bash
cd frontend
npm run build      # type-check + production bundle in dist/
npm run preview    # serve the built bundle locally
```

The backend can be served without `--reload` behind any ASGI server.

### 4. Android app (offline)

The Capacitor shell bundles the React studio, the MediaPipe WASM runtime, and the
pose model, so a phone can analyze a delivery at the ground with no network.

Requirements: **JDK 17+** and the **Android SDK** (Android Studio or command-line tools).

```bash
cd frontend
npm install
npm run build
npx cap sync android
cd android
./gradlew assembleDebug    # Windows: gradlew.bat assembleDebug
```

The debug APK is written to `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.

On first launch, analysis defaults to **On-device offline** mode. Open **Settings** to
switch to a remote FastAPI server and enter its LAN URL (for example
`http://192.168.1.20:8000`).

---

## API reference

Base URL: `http://127.0.0.1:8000`

### `GET /api/health`

```json
{
  "status": "ok",
  "service": "Bowling Biomechanics API",
  "version": "0.1.0",
  "timestamp": "2026-01-01T00:00:00Z"
}
```

### `POST /api/analyze`

`multipart/form-data` request:

| Field | Type | Required | Default | Values |
| --- | --- | --- | --- | --- |
| `video` | file | yes | — | MP4, MOV, or WebM |
| `bowler_type` | string | no | `pace` | `pace`, `spin` |
| `bowling_arm` | string | no | `right` | `left`, `right` |
| `camera_view` | string | no | `side` | `front`, `side`, `rear`, `diagonal` |

Example:

```bash
curl -X POST http://127.0.0.1:8000/api/analyze \
  -F "video=@delivery.mp4" \
  -F "bowler_type=pace" \
  -F "bowling_arm=right" \
  -F "camera_view=side"
```

Response (`AnalysisResult`):

```json
{
  "analysis_id": "9f2c...",
  "bowler_mode": "pace",
  "phases": [
    {
      "phase": "ffc",
      "start_frame": 42,
      "end_frame": 57,
      "start_timestamp_ms": 1400.0,
      "end_timestamp_ms": 1900.0,
      "confidence": 0.75
    }
  ],
  "angles": [
    {
      "angle": "elbow_extension",
      "samples": [
        {
          "frame_index": 0,
          "timestamp_ms": 0.0,
          "value_degrees": 142.3,
          "confidence": 0.94
        }
      ],
      "peak_degrees": 168.1,
      "mean_degrees": 151.7
    }
  ],
  "frames": [
    {
      "frame_index": 0,
      "timestamp_ms": 0.0,
      "keypoints": {
        "right_shoulder": {
          "x": 0.51,
          "y": 0.32,
          "z": -0.08,
          "visibility": 0.99,
          "presence": 1.0
        }
      }
    }
  ],
  "created_at": "2026-01-01T00:00:00Z"
}
```

The four angle series are `elbow_extension`, `front_knee_flexion`,
`hip_shoulder_separation`, and `trunk_tilt`.

Errors:

- `422` — missing file, unreadable video, empty pose sequence, or invalid form value.

Uploads are written to a temporary file and deleted when the request finishes.

---

## Using the app

1. Start the backend and frontend.
2. Drop in a video or click **Record a live delivery**.
3. Choose:
   - **Bowler type** — pace or spin (changes the thresholds)
   - **Bowling arm** — left or right
   - **Camera view** — side is recommended for the clearest angles
4. Click **Analyze delivery** and wait for pose extraction.
5. In the studio:
   - Play or step through the delivery frame by frame.
   - Toggle **Skeleton**, **Angles**, and **Trail** overlays.
   - Use the phase timeline to jump to run-up, BFC, FFC, release, or follow-through.
   - Read the coaching report; switch between **EN** and **Roman Urdu**.
   - Click a point on the angle chart to seek to that frame.
6. Analyze another delivery and click **Compare deliveries** for a side-by-side view.

### Filming tips

- Keep the camera still and side-on to the bowler.
- Fit the whole body in frame from run-up to follow-through.
- Use good, even lighting and avoid baggy clothing that hides joints.
- Trim to one delivery; long clips take longer to process.
- Prefer H.264 MP4 for the widest browser support.

---

## Testing

From `backend/` with the virtual environment active:

```bash
pytest -v
```

Run a single file:

```bash
pytest tests/test_kinematics.py -v
```

Current coverage:

- `/api/health` smoke test
- Joint-angle math
- Legal vs illegal elbow extension
- Front-knee angle calculation
- Phase detection on a synthetic delivery trajectory

The tests need the backend dependencies (including `python-multipart`) installed.

Optional linting (not pinned in `requirements.txt`):

```bash
pip install ruff
ruff check .
ruff format --check .
```

---

## Configuration

| Setting | Where | Current value |
| --- | --- | --- |
| API port | Uvicorn command | `8000` |
| Frontend dev port | Vite default | `5173` |
| API proxy | `frontend/vite.config.ts` | `/api` → `http://127.0.0.1:8000` |
| Allowed origins | `backend/app/main.py` | `localhost` / `127.0.0.1` on any port |
| Smoothing cutoff | `pose_extractor.py` | `6 Hz` |
| Pose model | `pose_extractor.py` | `pose_landmarker_full.task` (auto-downloaded) |
| Thresholds | `kinematics.py` | See [Metrics and thresholds](#metrics-and-thresholds) |

There are no environment variables, database, or external API keys. Everything runs
locally.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `ModuleNotFoundError: No module named 'fastapi'` | Activate the virtual environment and run `pip install -r requirements.txt` from `backend/`. |
| `Form data requires "python-multipart"` | Run `pip install python-multipart` (already in `requirements.txt`). |
| MediaPipe fails to install | Use Python 3.11+ and install `mediapipe>=0.10.30`; upgrade `pip` first. |
| Frontend gets `502` / network errors | Make sure Uvicorn is running on port `8000` and start the frontend with `npm run dev`. |
| CORS error | Open the app at `http://localhost:5173`, not a different host. |
| Camera access denied | Allow camera permission for `localhost`; webcam capture needs a secure context. |
| Analysis is slow | Trim the clip to one delivery and lower the resolution. |
| Skeleton is jittery or missing | Improve lighting, keep the full body visible, and use a side view. |
| Strange phases or angles | Keep the camera steady and make sure only one bowler is in frame. |

---

## Limitations

- **Not an official test.** The 15° elbow check is a simplified camera-based estimate.
  Official bowling-action clearance uses laboratory-grade 3D motion capture.
- **2D video, estimated depth.** MediaPipe's `z` value is inferred, not measured. Side-on
  footage gives the most reliable elbow and knee angles.
- **Occlusion matters.** Loose clothing, overlapping limbs, poor light, and a moving
  camera all reduce pose accuracy.
- **Single bowler per clip.** The pipeline tracks one person; spectators or teammates in
  frame can confuse detection.
- **`camera_view` is currently informational.** It is accepted and logged but does not
  change the calculations.
- **Backend tips are not returned.** `generate_feedback()` exists and is called, but the
  API response currently contains only frames, phases, and angle series. The web report
  derives its cards from those series, so its elbow badge uses peak elbow angle rather
  than the backend's elbow-extension delta.
- **No storage or accounts.** Analyses are not saved. Uploads are temporary and deleted
  after each request.
- **Simplified thresholds.** The pace/spin targets are coaching heuristics, not
  personalised clinical recommendations.

---

## License

No license file is included in this repository. Add one before redistributing or using
the project commercially.

---

Built with [FastAPI](https://fastapi.tiangolo.com/), [MediaPipe](https://developers.google.com/mediapipe),
[React](https://react.dev/), [Vite](https://vite.dev/), [Recharts](https://recharts.org/),
and [Tailwind CSS](https://tailwindcss.com/).
