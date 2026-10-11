# Nagar Setu (नगर सेतु)
> Municipal Grievance Resolution Platform for the GovFix Hackathon Challenge (24 Hours).

Nagar Setu is a municipal grievance resolution platform designed with a **configurable workflow engine**, strictly enforced backend role-based access control, deadline SLA escalations, transparent audit logging (including logged **REFUSED** transition attempts), and an **AI suggest-only** layer that aids human officials without making unilateral decisions.

---

## 🏛️ Project Architecture

```
NAGAR SETU/
├── server/
│   ├── src/
│   │   ├── config/      # DB connection and system configs
│   │   ├── middleware/  # JWT auth, role validation, rate limiting
│   │   ├── models/      # Mongoose schemas (User, Complaint, AuditLog)
│   │   ├── routes/      # REST API endpoints (/api/health, etc.)
│   │   ├── services/    # Workflow engine, SLA scheduler, AI suggestions
│   │   ├── seed/        # Demo seed data (wards, categories, demo users)
│   │   └── index.js     # Express server entry point
│   ├── .env.example     # Environment template
│   └── package.json
├── client/
│   ├── src/
│   │   ├── components/  # Layout, Navbar, reusable UI widgets
│   │   ├── pages/       # Home, Login, Register, Report, Complaints, Map, Dashboard
│   │   ├── App.jsx      # React Router route registry
│   │   └── index.css    # Tailwind CSS & Leaflet styles
│   ├── vite.config.js   # Vite server with /api proxy to http://localhost:5000
│   └── package.json
└── README.md
```

---

## 🛠️ Tech Stack

- **Frontend**: React, Vite (JavaScript), Tailwind CSS v4, React Router v7, `lucide-react`, Leaflet + `react-leaflet`, `exifr`
- **Backend**: Node.js, Express, MongoDB with Mongoose, JWT, bcryptjs, Multer, `file-type`, `node-cron`, CORS, Dotenv, Helmet, `express-rate-limit`

---

## 🚀 Quickstart & Run Instructions

### 1. Backend Server Setup
Open a terminal in the project root:
```bash
cd server
npm install
```

Configure your environment variables:
```bash
# Copy example environment configuration
copy .env.example .env
```
Default `.env` configuration:
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/nagar_setu
JWT_SECRET=super_secret_jwt_key_change_in_production
CLIENT_URL=http://localhost:5173
DEMO_MODE=true
NEARBY_RADIUS_METERS=100
AI_API_KEY=
```
*Note: With `DEMO_MODE=true`, the server gracefully runs even if local MongoDB is temporarily offline.*

Start the backend server:
```bash
npm run dev
# or: npm start
```
The server will start at: `http://localhost:5000`

---

### 2. Frontend Client Setup
Open a second terminal in the project root:
```bash
cd client
npm install
npm run dev
```
The Vite development server will start at: `http://localhost:5173`

---

## 🔍 Verification & Health Check

1. **Direct Backend Health Check**:
   Visit or curl:
   ```bash
   curl http://localhost:5000/api/health
   ```
   Expected response:
   ```json
   {
     "status": "ok",
     "message": "Nagar Setu API is operational",
     "timestamp": "...",
     "database": "disconnected", // or "connected" when MongoDB is active
     "demoMode": true
   }
   ```

2. **Vite Proxy Verification**:
   Visit or curl:
   ```bash
   curl http://localhost:5173/api/health
   ```
   Should proxy to the backend and return the identical JSON payload.

3. **Client UI Verification**:
   Open `http://localhost:5173` in your browser.
   - The Home page tests the live backend connection via `/api/health`.
   - Test navigating across:
     - `/` (Home)
     - `/login` (Login)
     - `/register` (Register)
     - `/report` (File Grievance)
     - `/my-complaints` (Citizen Complaints)
     - `/complaints/CMP-001` (Workflow Engine Audit Trail view)
     - `/public-map` (OpenStreetMap / Leaflet view)
     - `/dashboard` (Official Triage & Action Console)

---

## 🔒 Core Governance Rules
1. **Strict Backend Access Control**: Role checks and permissions are enforced on the backend. Hiding UI elements is never used as access control.
2. **Single Workflow Engine**: Every status transition flows through one central state machine.
3. **Audit Trails**: Every transition attempt (allowed or refused) is permanently logged.
4. **AI Suggestion Only**: AI may only recommend categories or priorities; it never alters states, assignments, or deadlines.

---

## 🏙️ Multi-City Configuration (Pune Default)

To use another city, edit `server/src/config/city.config.js` only.

No city-specific names, coordinates, or bounds are hardcoded across other files. The system serves this config via `GET /api/config/city`, and the client consumes it universally via `CityContext` (`useCity()`).

### Quick Customization:
Open [`server/src/config/city.config.js`](file:///c:/Users/krish/OneDrive/Desktop/VORTEX%203.0%20%282.0%29/NAGAR%20SETU/server/src/config/city.config.js) to configure:
- `cityName`, `state`, `country`
- `authorityName` (e.g., Pune Municipal Corporation (PMC))
- `timezone` (e.g., `Asia/Kolkata` — used for process timezone, SLA deadline formatting, and UI timestamps)
- `map`: center coordinates (`lat`, `lng`), zoom levels (`minZoom`, `maxZoom`, `defaultZoom`)
- `bounds`: bounding box `{ south, west, north, east }`
- `areas`: sample localities and approximate demo centroids
- `emergencyNote`: advisory displayed across layouts (e.g., "If someone is in immediate danger, call 112.")

Alternatively, override values dynamically in `server/.env` using:
```env
CITY_NAME=Pune
CITY_STATE=Maharashtra
CITY_COUNTRY=India
---

## 👥 Demo Accounts & Seeding (Pune Municipal Redressal)

All official accounts are created **ONLY** by the seed script. Run:
```bash
cd server
npm run seed
```
*(When `DEMO_MODE=true`, seed accounts are also loaded on server startup).*

### Shared Demo Password
**`Demo@1234`**

### Demo Accounts Directory
> Note: Both `@pmc.demo.local` and legacy `@pmc.demo.gov.in` aliases are supported for login.

| Role | Name | Primary Demo Email | Department |
| :--- | :--- | :--- | :--- |
| **Reviewer** | Suresh Deshmukh (Reviewer, PMC Demo) | `reviewer@pmc.demo.local` | None |
| **Officer (Roads)** | Rohan Patil (Roads Officer, PMC Demo) | `officer.roads@pmc.demo.local` | `roads` |
| **Officer (Waste)** | Anjali Kulkarni (Waste Officer, PMC Demo) | `officer.waste@pmc.demo.local` | `waste` |
| **Officer (Water)** | Meera Joshi (Water Officer, PMC Demo) | `officer.water@pmc.demo.local` | `water` |
| **Officer (Others)** | Vikram Shinde (General Officer, PMC Demo) | `officer.others@pmc.demo.local` | `others` |
| **Supervisor** | Dr. Rajesh Gaikwad (Zonal Supervisor, PMC Demo) | `supervisor@pmc.demo.local` | `roads` (Oversight on all) |
| **Citizen 1** | Pooja Kadam (Citizen Demo) | `pooja.citizen@demo.in` | None |
| **Citizen 2** | Amitabh More (Citizen Demo) | `amitabh.citizen@demo.in` | None |
| **Citizen 3** | Sunita Chavan (Citizen Demo) | `sunita.citizen@demo.in` | None |
| **Citizen 4** | Nikhil Pawar (Citizen Demo) | `nikhil.citizen@demo.in` | None |

---

## 🔐 Auth API Endpoints & `curl` Examples

### 1. Citizen Registration (`POST /api/auth/register`)
> **Security Rule**: The endpoint strictly registers **citizens only**. Any `role` or `department` sent by the client is completely ignored and forced to `role: "citizen"` and `department: null`.

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kavita Shinde",
    "email": "kavita.citizen@demo.in",
    "password": "Password@123",
    "role": "officer"
  }'
```
**Response (201 Created):**
```json
{
  "message": "Citizen account registered successfully",
  "token": "eyJhbGciOiJIUzI1Ni...",
  "user": {
    "id": "...",
    "name": "Kavita Shinde",
    "email": "kavita.citizen@demo.in",
    "role": "citizen",
    "department": null
  }
}
```

### 2. User Login (`POST /api/auth/login`)
Works for both seeded officials and registered citizens.

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "reviewer@pmc.demo.gov.in",
    "password": "Demo@1234"
  }'
```
**Response (200 OK):**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1Ni...",
  "user": {
    "id": "...",
    "name": "Suresh Deshmukh (Reviewer, PMC Demo)",
    "email": "reviewer@pmc.demo.gov.in",
    "role": "reviewer",
    "department": null
  }
}
```

### 3. Current Authenticated Profile (`GET /api/auth/me`)
Requires `Authorization: Bearer <token>`. Never returns `passwordHash`.

```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```
**Response (200 OK):**
```json
{
  "user": {
    "id": "...",
    "name": "Suresh Deshmukh (Reviewer, PMC Demo)",
    "email": "reviewer@pmc.demo.gov.in",
    "role": "reviewer",
    "department": null
  }
}
```

---

## 📝 Complaint Submission & Evidence API

### Category Configuration (`GET /api/categories`)
Public endpoint returning official department categories:
- `waste`: Missed garbage collection, Overflowing public dustbins, Dead animal removal, Public toilet maintenance, Others
- `roads`: Potholes or damaged roads, Broken or flickering streetlights, Damaged footpaths or sidewalks, Others
- `water`: Contaminated or muddy water supply, Major pipe leaks or bursts, Overflowing sewage or blocked storm drains, Others
- `others`: Others

---

### Complaint Submission (`POST /api/complaints`)

#### 1. Valid Submission with Evidence (Inside Pune Bounds):
```bash
curl -X POST http://localhost:5000/api/complaints \
  -H "Authorization: Bearer CITIZEN_JWT_TOKEN" \
  -F "department=roads" \
  -F "category=Potholes or damaged roads" \
  -F "title=Deep crater near Deccan Gymkhana" \
  -F "description=Vehicles swerving dangerously on the turn" \
  -F "lat=18.5167" \
  -F "lng=73.8417" \
  -F "address=Deccan Gymkhana, Pune" \
  -F "locationSource=map" \
  -F "evidence=@sample_photo.jpg"
```
**Response (201 Created):**
```json
{
  "message": "Complaint submitted successfully",
  "complaint": {
    "id": "...",
    "trackingId": "NS-2026-356309",
    "title": "Deep crater near Deccan Gymkhana",
    "department": "roads",
    "category": "Potholes or damaged roads",
    "status": "Submitted",
    "priority": "Normal",
    "area": "Kasba Peth",
    "isPossibleEmergency": false,
    "isCriticalVerified": false,
    "supportCount": 1,
    "initialResponseDue": "2026-10-11T08:44:28.052Z",
    "resolutionDue": "2026-10-11T09:32:28.052Z",
    "createdAt": "2026-10-11T08:20:28.052Z"
  }
}
```

#### 2. Submission with Missing File (Refused with 400):
```bash
curl -X POST http://localhost:5000/api/complaints \
  -H "Authorization: Bearer CITIZEN_JWT_TOKEN" \
  -F "department=roads" \
  -F "category=Potholes or damaged roads" \
  -F "title=Pothole on road" \
  -F "description=Road damaged" \
  -F "lat=18.5204" \
  -F "lng=73.8567"
```
**Response (400 Bad Request):**
```json
{
  "error": "At least one evidence file (photo or video) is mandatory for submitting a complaint."
}
```

#### 3. Submission Outside Pune Bounds (Refused & Audited):
```bash
curl -X POST http://localhost:5000/api/complaints \
  -H "Authorization: Bearer CITIZEN_JWT_TOKEN" \
  -F "department=roads" \
  -F "category=Potholes or damaged roads" \
  -F "title=Out of bounds test" \
  -F "description=Coordinates outside Pune" \
  -F "lat=19.0760" \
  -F "lng=72.8777" \
  -F "evidence=@sample_photo.jpg"
```
**Response (400 Bad Request):**
```json
{
  "error": "This location is outside the Pune service area. Please correct the pin.",
  "bounds": { "south": 18.4, "west": 73.72, "north": 18.66, "east": 74.02 }
}
```

---

### Secure Evidence Access (`GET /api/evidence/:id`)
- Files are saved with randomized names under `server/uploads/` and **never served statically**.
- Streaming access is permitted **only** to the owning citizen or an authorized official (reviewer, supervisor, or officer of that department).
- Unauthorized attempts return `403 Forbidden` and are permanently logged in the audit trail.

---

## 🤖 AI Suggest-Only Architecture (Strict Read-Only Enforcement)

Nagar Setu incorporates Google Gemini and multilingual rule-based fallbacks with **hard architectural limits enforced in code**:

1. **Suggest-Only Boundary**:
   - The AI service (`aiService.js`) **ONLY READS** text and **RETURNS** suggestions.
   - It contains **zero imports, database queries, or functions** capable of mutating complaint status, assignments, priority, or SLA deadlines.
   - Suggestions are saved strictly in `AiSuggestionStore` for audit reference; they are **NEVER** written directly to the `Complaint` document.
2. **Citizen Guided Wizard ("Suggestion, you decide")**:
   - Citizen enters a description in Step 3 or Quick Form and clicks **✨ Suggest Category (AI)** (`POST /api/ai/suggest`).
   - The system displays: `"Suggestion, you decide"` with suggested department and category.
   - The citizen's original text is **always preserved**. The citizen chooses whether to accept or adjust.
3. **Staff Ticket Review Workspace**:
   - Full 2-pane desktop / mobile-friendly workspace with true-to-state stepper, 5 tabs (`Overview`, `Evidence`, `Reports`, `Notes`, `History`), and backend-driven next step actions (`GET /api/issues/:id/allowed-actions`).
   - Zero AI dependency for staff transitions; workflow rules, deadlines, audit logic, and human permissions are the sole source of truth.

---

## 📊 Supervisor Oversight & Pune Area Hotspots

The Supervisor Dashboard (`/dashboard`) provides end-to-end municipal governance:
1. **Plain Metric Cards**: Total Active, Overdue SLA, High Priority, Possible Emergencies, Resolved.
2. **Pune Area Hotspots Card**: Displays real-time grievance concentrations across Pune localities (Shivajinagar, Kothrud, Hadapsar, Swargate, etc.). Clicking any area badge instantly filters the grievance queue.
3. **Transparent Audit Viewer**:
   - Filter by: **All | Accepted | Refused 🚫 | System**.
   - Displays refusing actor, action, timestamp, and the exact refusal rationale.

---

## 🎬 Step-by-Step Live Demo Script (Pune Track)

Follow this 5-minute evaluation script to demonstrate every core requirement of the platform:

### 1. Nearby Duplicate Suggestion & 5th Supporter Auto-Escalation
1. **Login as Citizen 2** (`amitabh.citizen@demo.in` / `Demo@1234`).
2. Navigate to **Report Grievance** (`/report`).
3. Select Pune Locality **Kothrud** or drop pin near Karve Road `[18.5074, 73.8077]`.
4. Notice the **Nearby Suggestions Card** appears:
   > *"Similar Grievance Already Reported Nearby (Within 100m): NS-2026-101002 (Overflowing public dustbin on Karve Road)"*
   - Shows current support count: **4 supporters**, priority: **Normal**.
5. Click **Support this issue (4)**:
   - Your support is recorded instantly!
   - Support count reaches **5 supporters**!
   - **Priority auto-escalates from Normal to High!**
   - SLA deadline automatically tightens and a system audit event is logged.
6. Try clicking support again:
   - Friendly notice confirms you have already supported this issue (409 Conflict prevented).

### 2. Forbidden Action Refusal & Audit Logging
1. **Login as Roads Officer** (`officer.roads@pmc.demo.gov.in` / `Demo@1234`).
2. Navigate to `/dashboard`.
3. Try resolving a complaint from the **Waste** department (`NS-2026-101002`):
   - The backend strictly rejects the action with `400/403`:
     > *"Officer department (roads) does not match complaint department (waste)."*
4. Try marking a `Submitted` complaint directly as `Resolved` (illegal status jump):
   - The backend workflow engine rejects:
     > *"Cannot move from Submitted to Resolved. Allowed next states: Under Review."*
   - Refusal is permanently recorded in the append-only audit trail.

### 3. Reviewer Workflow & AI Triage
1. **Login as Reviewer** (`reviewer@pmc.demo.gov.in` / `Demo@1234`).
2. Navigate to `/dashboard`.
3. Select a new complaint in `Submitted` status (`NS-2026-101001`).
4. Review the ticket checklist (evidence, coordinates within Pune limits, category).
5. Click **Accept**:
   - Backend evaluates `allowed-actions`, advances ticket to `Accepted`, and alerts the department.

### 4. Officer Resolution & After-Repair Evidence
1. **Login as Roads Officer** (`officer.roads@pmc.demo.gov.in` / `Demo@1234`).
2. Filter queue for your department complaints. Select `NS-2026-101001`.
3. Click **Start Work** (`Accepted` → `In Progress`).
4. Complete work: Enter mandatory resolution note *"Pothole filled with cold-mix asphalt and compacted"* and attach after-repair photo.
5. Click **Mark Resolved** (`In Progress` → `Resolved`).
6. 7-day reopening countdown window activates for the citizen.

### 5. Public Map Live Sync
1. Navigate to **Public Map** (`/public-map`) without logging in.
2. The interactive Pune map shows:
   - Resolved complaint status badge updated.
   - High Priority pins styled with prominent markers.
   - Rounded coordinates (3 decimals) and zero citizen personal info exposed.

### 6. Emergency Verification & SLA Escalation
1. As Reviewer or Supervisor, inspect `NS-2026-101004` (Submerged live streetlight wire in Swargate).
2. Click **Verify Critical Emergency**:
   - Status verified as Critical Emergency; response target cut to 2 hours.
3. Inspect Overdue complaints (`NS-2026-101006`):
   - Background cron worker automatically detects overdue cases and flags them with SLA breach badges.

### 7. Supervisor Audit Viewer
1. **Login as Supervisor** (`supervisor@pmc.demo.gov.in` / `Demo@1234`).
2. Click **System Audit Trail** tab on `/dashboard`.
3. Filter by **Refused 🚫**:
   - Displays all illegal transition attempts, showing the refusing actor, illegal action, timestamp, and refusal rationale.

---

## 🛡️ Phase 0–9 Completion & Hardening Matrix

| Phase | Milestone | Scope & Deliverables | Verification Status |
| :--- | :--- | :--- | :--- |
| **Phase 0** | Baseline Inspection | Audited existing Next.js/React + Express repo, ensured zero regression across pre-existing endpoints. | ✅ Complete |
| **Phase 1** | SQLite Storage & Geofencing | Native `node:sqlite` DB, strict Pune bounding box (`[18.4130, 73.7380]` to `[18.6300, 73.9800]`), 10 area centroids. | ✅ Complete |
| **Phase 2** | Workflow Engine & Rate Limits | Strict state machine transitions, error contract (`errorCode`, `message`), rate limits (200 req/15m). | ✅ Complete |
| **Phase 3** | Append-Only Audit & SHA-256 Chains | SQLite `BEFORE UPDATE` & `BEFORE DELETE` triggers aborting with `'AuditEvent is append-only'`, SHA-256 hash chains (`/api/audit/verify`). | ✅ Complete |
| **Phase 4** | Dual SLA Deadlines & Escalation | Dual SLAs (`RESPONSE_SLA`: 48h/2h, `RESOLUTION_SLA`: 7d/24h), cron escalation, `/api/dev/run-monitor`, worker heartbeat. | ✅ Complete |
| **Phase 5** | Submission & Deduplication | `POST /api/reports`, file magic bytes check, 50m radius duplicate auto-linking, supervisor `/api/reports/:id/unlink`. | ✅ Complete |
| **Phase 6** | Public Map & PII Sanitization | `GET /api/public/issues`, rounded ~100m grid snap (3 decimal places), complete PII stripping. | ✅ Complete |
| **Phase 7** | CSRF & Login Lockout | State-mutating Origin CSRF verification, 5 failed login attempts in 15 min lock account (`LOGIN_LOCKOUT`, 429). | ✅ Complete |
| **Phase 8** | Multilingual & Civic Honesty | Full EN / HI / MR key parity (526 leaf keys), honest demo indicators (`.demo.local`, `.demo`), `#1E4FA3` SVG pin tab icon. | ✅ Complete |
| **Phase 9** | UI Additions & 17-Point Verification | Help Assistant floating chat with speech-to-text, Citizen Satisfaction rating (1-5 stars), Worker heartbeat indicator, Reroute modal. | ✅ Complete |

---

## 🧪 Verification & Automated Test Suites

### 1. Phase 9 Hardening Test Suite (24/24 Checks Passing)
Run the comprehensive Phase 9 hardening suite:
```bash
cd server
node test_hardening_suite.js
```
**Coverage:**
- [x] **1. SQLite Append-Only Triggers**: `BEFORE UPDATE` and `BEFORE DELETE` triggers reject mutations with `"AuditEvent is append-only"`.
- [x] **2. SHA-256 Hash Chain Integrity**: Validates tamper-evident cryptographic hash linkage across all audit events (`GET /api/audit/verify`).
- [x] **3. Dual Deadline Enforcement**: Verifies 48h response & 7d resolution SLAs (`POST /api/dev/run-monitor`).
- [x] **4. Worker Idempotency**: Multiple consecutive monitor runs complete safely without duplicate escalation errors.
- [x] **5. Emergency Verification Workflow**: Supervisor emergency verification elevates priority to `Critical` with accelerated 2-hour response deadline.
- [x] **6. Reopening 7-Day Window**: Non-eligible or post-7-day reopen requests refused and audited.
- [x] **7. Department Rerouting**: Supervisor reroutes department with automatic SLA deadline recalculation.
- [x] **8. Magic Bytes Validation**: Spoofed files with invalid file magic bytes rejected (`400 Bad Request`).
- [x] **9. Pune Service Area Geofence**: Out-of-bounds coordinates (e.g. Mumbai) rejected with `OUTSIDE_SERVICE_AREA`.
- [x] **10. Deduplication & Unlinking**: Reports within 50m auto-linked to single parent issue; supervisor unlinks report into separate issue.
- [x] **11. Single Citizen Support**: Citizens can support community grievances once; duplicates blocked with `409 Conflict`.
- [x] **12. Public Map PII Sanitization & Grid Snap**: Zero PII leakage; coordinates rounded to ~100m (3 decimal places).
- [x] **13. Evidence Streaming Protection**: Unauthenticated access to evidence files returns `401 Unauthorized`.
- [x] **14. Help Assistant Architectural Safety**: Verified Help Assistant code never imports or calls workflow transitions.
- [x] **15. CSRF Origin Verification**: Disallowed `Origin` headers on state-mutating requests blocked with `403 Forbidden`.
- [x] **16. Login Lockout**: 5 failed login attempts trigger `429 Too Many Requests` lockout.
- [x] **17. Civic Tab Icon & Titles**: `#1E4FA3` SVG pin icon present and loaded in `index.html`; localized `<Page> | Nagar Setu (demo)` titles.

### 2. Full QA Test Suite (21/21 Checks Passing)
```bash
cd server
node test_qa_suite.js
```

### 3. Internationalization (i18n) Key Parity Check
```bash
cd client
npm run check:i18n
```
Verifies identical 526 leaf-key parity and zero missing translations across `en.json`, `mr.json`, and `hi.json`.

### 4. Client Production Build
```bash
cd client
npm run build
```
Vite builds production bundle in ~1.1s with 0 errors.

---

## 🎬 5-Minute Evaluation & Demo Script

1. **Language & Civic Branding**:
   - Open `http://localhost:5173`.
   - Observe civic pin tab icon with `#1E4FA3` theme color.
   - Use the navbar language toggle: switch between **EN**, **हिंदी**, and **मराठी**. Notice immediate UI translation with zero mixed-language text.
2. **Citizen Submission via Help Assistant**:
   - Click the floating **Help Assistant (मदत कक्ष)** in the bottom right corner.
   - Click the microphone button to test browser speech-to-text input.
   - Follow the 5-step guided wizard: issue category, Pune location, description, photo upload.
   - Notice AI suggestion is marked *"Suggestion, you decide"*. Submit grievance (`POST /api/reports`).
3. **EXIF & Pune Geofencing**:
   - Navigate to `/report`. Upload a photo with Pune EXIF coordinates: pin automatically snaps to the location and reverse-geocodes.
   - Move pin outside Pune boundary: form displays `"This location is outside the Pune service area."`
4. **Deduplication & Auto-linking**:
   - Citizen 2 logs in and reports an issue within 50m of an existing issue.
   - Report is automatically linked under the primary issue, preventing duplicate field crew dispatches.
5. **Reviewer Acceptance**:
   - Login as `reviewer@pmc.demo.local` (`Demo@1234`).
   - Move complaint from `Submitted` → `Under Review` → `Accepted`.
6. **Officer Resolution with Photo Proof**:
   - Login as department officer (e.g. `officer.roads@pmc.demo.local`).
   - Transition to `In Progress`, enter mandatory resolution notes, upload after-repair photo, mark `Resolved`.
7. **Citizen Satisfaction Rating & 7-Day Reopen**:
   - Log back in as the filing citizen.
   - On the complaint detail page, submit 5-star citizen satisfaction rating (`POST /api/issues/:id/rating`).
   - Notice the active 7-day reopening countdown window.
8. **Supervisor Audit & SHA-256 Chain Verification**:
   - Login as `supervisor@pmc.demo.local`.
   - View Worker Heartbeat indicator (showing live background cron worker status).
   - View System Audit Trail. Check tamper verification badge (`SHA-256 Chain Verified`).
   - Filter by **Refused** to view all blocked illegal attempts.
