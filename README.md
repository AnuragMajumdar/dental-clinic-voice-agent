# Dental Clinic Voice AI Agent — "Maya"

A voice AI front-desk receptionist for **Smile Dental Clinic**, built on the [Feather](https://dashboard.featherhq.com) platform.

## What It Does

Maya handles inbound patient calls end-to-end:
- **Verifies** existing patients (name + DOB lookup in Google Sheets)
- **Registers** new patients with automatic doctor assignment
- **Determines** appointment type based on symptoms (Checkup, Sensitivity, Pain/Swelling, Emergency)
- **Books** appointments via Cal.com API
- **Logs** call outcomes to Google Sheets

## Architecture

```
Patient Call → Feather Voice Agent (Maya)
                    ↓
              Google Apps Script (API Proxy)
                 ↓          ↓
          Google Sheets   Cal.com API
          (Patient DB)    (Booking)
```

## Tools (Feather Agent)

| Tool | Method | Description |
|------|--------|-------------|
| `verifypatient` | POST | Checks if patient exists in Google Sheets |
| `registerpatient` | POST | Creates new patient record, assigns doctor |
| `checkavailableslots` | GET | Fetches open slots from Cal.com |
| `bookappointment` | POST | Books appointment on Cal.com via Apps Script proxy |
| `logcalloutcome` | POST | Logs call summary to CallLog sheet |

## Key Design Decisions

- **Apps Script as proxy**: Cal.com booking API requires `eventTypeId` as integer, but Feather's JSON editor can't template `{{variable}}` without quotes. Routing through Apps Script allows `parseInt()` conversion.
- **Doctor alternation**: New patients are assigned to Dr. Mehta or Dr. Sharma alternately based on total patient count.
- **Duplicate prevention**: `registerpatient` checks for existing patients (same name + DOB) before creating — updates contact info instead of creating duplicates.
- **UTC → IST handling**: Agent prompt includes explicit conversion rules so times are communicated correctly to patients in IST.

## Files

- `apps-script.js` — Google Apps Script backend (deploy as Web App)
- `feather-agent-prompt.md` — Full agent prompt for Feather
- `tool-configs.md` — Feather tool configurations

## Setup

1. **Google Sheets**: Create a spreadsheet with `Patients` and `CallLog` tabs
2. **Apps Script**: Paste `apps-script.js` into the script editor → Deploy as Web App (Anyone can access)
3. **Cal.com**: Create event types for each appointment category
4. **Feather**: Create voice agent with the prompt and tool configs

## Tech Stack

- Feather (Voice AI platform)
- Google Apps Script (Serverless backend)
- Google Sheets (Patient database)
- Cal.com (Appointment scheduling)
