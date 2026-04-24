<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Pioneer Group Kanban - Production Tracking System

A real-time production tracking and Kanban system for garment manufacturing, featuring QR scanning, live dashboards, and detailed reporting.

## 🚀 Features

- **Live Dashboard**: Real-time tracking of Cutting, Sewing, Wash, and Finishing.
- **QR Scanning**: Seamless production entry via mobile or desktop cameras.
- **Floor Matrix**: Line-by-line performance tracking.
- **History & Reports**: Detailed logs with filtering and Excel export capabilities.
- **Security**: Password-protected data management and deletion.

## 🛠️ Local Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Supabase Account](https://supabase.com/)

### Installation

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd pioneer-group-kanban
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   - Create a `.env` file in the root directory (copy from `.env.example`).
   - Add your Supabase credentials:
     ```env
     VITE_SUPABASE_URL=your_project_url
     VITE_SUPABASE_ANON_KEY=your_anon_key
     ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

## 🌐 Deployment

### Netlify Deployment

This project is pre-configured for Netlify.

1. **Connect your GitHub repository** to Netlify.
2. **Build Settings**:
   - Build command: `npm run build`
   - Publish directory: `dist`
3. **Environment Variables**:
   - Go to **Site settings > Environment variables**.
   - Add the following variables:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
     - `VITE_ADMIN_PASSWORD` (optional, defaults to `112`)
4. **HTTPS**: Netlify provides SSL by default, which is **required** for the QR scanner to work.

## 🗄️ Database Setup (Supabase)

Create an `orders` table in your Supabase project with the following columns:

- `id`: uuid (primary key)
- `bundle_id`: text (unique)
- `buyer`: text
- `style`: text
- `po`: text
- `color`: text
- `size`: text
- `po_quantity`: integer
- `cutting_done`: integer
- `sew_in`: integer
- `sew_out`: integer
- `wash_in`: integer
- `wash_out`: integer
- `fin_in`: integer
- `fin_out`: integer
- `line`: text
- `sewing_line`: text
- `finishing_line`: text
- `created_at`: timestamptz (default: now())

---
*Built with React, Vite, Tailwind CSS, and Supabase.*
