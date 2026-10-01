# AIMEDIX Partner app

This Expo app follows the partner screens in `D:\11.pdf`: role-specific sign-in for one account type (pharmacy, laboratory, or doctor), a five-tab dashboard, patient list, messages, analytics and account/profile settings. Pharmacy partners can manage their medicine catalogue, prescription requests and orders; laboratories can manage tests, bookings and secure report URLs; doctors can manage consultations.

## Connect to the website

The app uses the existing provider API on the AIMEDIX MEDS website. Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_API_BASE_URL` to the same website origin used by `CustomerApp` (for example `https://amedixmeds.com`). The partner API is at `/api/v1/providers/`; the app uses `/api/v1/medical/config` to load the service areas for registration. Keep database passwords and website secrets on the server; the mobile app stores only the signed-in provider token in secure device storage.

Partner registration uses a tap-to-pin premises map in place of typed latitude/longitude. `app.config.js` reads `GOOGLE_MAPS_API_KEY` from the ignored `.env.local` file and injects it into the Android native map configuration. Before publishing, restrict this key in Google Cloud to Maps SDK for Android and the app package `com.aimedixmeds.partnerapp` plus its release signing SHA-1. Build a new Android development/production app after changing native map configuration; Expo Go does not include this native map module. iOS uses Apple Maps through Expo Maps.

New partner registration is submitted to the shared website database with `pending` status. Website administrators review the business licence and service area in the admin panel. A partner can sign in after approval; the backend limits every API request by the authenticated partner role and ownership.

## Run

Install dependencies with `npm install`, then run `npm start`. For a phone or Android emulator, use a website/API host address reachable from that device instead of `localhost`.
