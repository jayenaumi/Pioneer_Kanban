# Deploying GarmentTrack Pro to Netlify

To deploy this application to Netlify, follow these steps:

## 1. Environment Variables
In the Netlify Dashboard (Site settings > Build & deploy > Environment variables), add the following variables:

| Variable Name | Description | Example |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Your Supabase Project URL | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase Anon Key | `eyJhbGciOiJIUz...` |
| `VITE_ADMIN_PASSWORD` | Password for protected actions | `112` (default) |
| `VITE_GEMINI_API_KEY` | (Optional) Gemini AI API Key | `AIzaSy...` |
| `VITE_EMAILJS_SERVICE_ID` | (Optional) EmailJS Service ID | `service_xxx` |
| `VITE_EMAILJS_TEMPLATE_ID` | (Optional) EmailJS Template ID | `template_xxx` |
| `VITE_EMAILJS_PUBLIC_KEY` | (Optional) EmailJS Public Key | `user_xxx` |
| `VITE_RECIPIENT_EMAIL` | (Optional) Default email for reports | `admin@example.com` |

## 2. Permissions Policy (Camera Access)
The application requires camera access for the QR scanner. 
We have already included a `Permissions-Policy` in `netlify.toml`. 

**Note:** If the camera doesn't work after deployment, ensure your Netlify site is served over **HTTPS** (Netlify provides this automatically with their `.netlify.app` subdomains).

## 3. Build Settings
If you are connecting your own Git repository, use these settings:
- **Build command:** `npm run build`
- **Publish directory:** `dist`

## 4. Single Page Application (SPA) Support
We have included both a `netlify.toml` and a `_redirects` file. This ensures that if a user refreshes the page on a sub-route (like `/history`), Netlify will correctly serve the app.
