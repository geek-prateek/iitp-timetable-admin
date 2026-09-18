# IITP Timetable Admin

Standalone Vercel project for editing and publishing timetable data used by the web and Android apps.

## Production setup

1. Open the `iitp-timetable-admin` project in Vercel.
2. In Project Settings > Environment Variables, add `MONGODB_URI` connected to your MongoDB cluster for data persistence.
3. Add `ADMIN_PASSWORD` for Production authentication.
4. Redeploy the latest production deployment so both variables are available to the API.

The public app reads `GET /api/timetable`. The admin signs in as `admin` through `POST /api/auth`, receives a signed HttpOnly session cookie, and publishes through the protected `POST /api/timetable` endpoint. Sessions expire after 12 hours and are invalidated when `ADMIN_PASSWORD` changes. Until MongoDB is connected, the GET endpoint safely returns `data/default-timetable.json`.

## Local data refresh

After intentionally changing the bundled defaults in `js/courses.js`, run:

```powershell
npm run timetable:export
```

This refreshes `data/default-timetable.json` for the next admin deployment.
