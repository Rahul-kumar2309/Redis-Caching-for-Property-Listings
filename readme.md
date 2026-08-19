# Redis Cache Manager ⚡ | Property Listings

## 📌 Project Overview
The **Redis Cache Manager** is a digital enterprise solution built for the Property Listings floor staff. It replaces manual, paper-based, and Excel-driven caching systems to prevent massive data loss and operational slowdowns. 

This project fulfills **Capstone 1** requirements, heavily focusing on architectural planning (ERD, API Contracts), edge-case handling, and strict Non-Functional Requirements (NFRs).

## 🏗️ Architectural Planning (Capstone 1 Core)
As per the Technical Requirements Document (TRD), the definitive database schema and API contracts have been drafted and integrated directly into the application's **"ERD & API Docs"** tab.
- **Database Schema (ERD):** Defined structure for `CacheKey` (key_name, value, ttl, timestamps) and `AuditLog` (action, status).
- **API Contracts:** Outlined RESTful endpoints for `POST /api/cache/set`, `GET /api/cache/get/:key`, `DELETE`, and `GET /api/cache/stats`.

## ✨ Technical Implementations & TRD Compliance

### 1. The "Happy Path"
- **Clear Interface:** Built a highly intuitive, accessible, dark-mode corporate UI.
- **Immediate Response:** Utilized browser `localStorage` as a mock Redis engine to ensure zero-latency data manipulation during the prototyping phase.

### 2. The "Unhappy Path" (Edge Case Handling)
- **Empty States:** Gracefully handles empty data lists with user-friendly "No data found" illustrations instead of blank screens.
- **Bad Connectivity Simulation:** Incorporates artificial delays (`setTimeout`) and visual loading spinners during asynchronous GET/SET operations to simulate spotty 3G networks.
- **Invalid Inputs:** Prevents submission of malformed data. Missing or invalid fields are instantly highlighted with red borders to guide user correction.

### 3. Non-Functional Requirements (NFRs)
- **Accessibility (a11y):** Designed to achieve a **100% Lighthouse Accessibility Score** utilizing proper semantic HTML and ARIA labels.
- **Telemetry Simulation:** Integrated simulated analytics. Checks the browser console for `[Analytics] User interacted with Redis Caching` logs on primary actions.
- **Security:** Implemented active XSS sanitization on all text inputs before persisting data to the local state, protecting against malicious script injections.

## 🛠️ Tech Stack
- **Frontend Framework:** React.js (Vite)
- **State & Storage:** React Hooks (`useState`, `useEffect`), Web Storage API (`localStorage` Mock Engine)
- **Styling:** Custom CSS (Strict monolithic corporate dark theme, consistent 16px/32px padding scales)
- **Validation:** Real-time client-side checks