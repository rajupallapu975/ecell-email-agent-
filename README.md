# ✉️ E-Cell Bulk Mail Agent Website

A full-stack, personalized bulk email dispatch web application built for teams, startup cells, and outreach organizers.

## 🌟 Key Features
- **Send to All with Same Template:** Choose a single HTML/text email template and send it to hundreds of recipients at once.
- **Dynamic Personalization:** Supports merge tags like `{{name}}`, `{{company}}`, `{{email}}`, `{{pass_id}}`, `{{track}}`, or any custom column from your uploaded spreadsheet.
- **Upload & Select Templates:**
  - Upload your own `.html` or `.txt` templates via drag-and-drop or file picker.
  - Dropdown selector to choose which template to use when composing an outreach campaign.
  - Built-in template editor with live variable chip insertion.
- **Recipient Spreadsheet Upload:**
  - Supports `.csv`, `.xlsx`, and `.xls` files.
  - Auto-detects columns and email addresses.
  - Comes with pre-bundled sample contacts (`sample_recipients.csv`) for instant testing.
- **Interactive Live Preview:**
  - Cycle through recipients (1, 2, 3...) to see the exact email each person will receive before sending.
- **Real-Time Delivery & Progress:**
  - Real-time progress bar and delivery percentage.
  - Color-coded live terminal logs showing every sent or failed email.
  - Pause / Abort controls.
- **Flexible SMTP / Test Simulation Mode:**
  - **Simulation Mode:** Test full campaigns safely without setting up credentials (no real emails sent).
  - **Gmail (App Password):** Send from your `@gmail.com` account with built-in step-by-step guidance.
  - **Outlook / Office 365:** Connect directly to Microsoft accounts.
  - **Custom SMTP:** Connect to SendGrid, Mailgun, AWS SES, or private SMTP relays.
  - **Anti-Spam Throttling:** Configurable delay between emails (0.5s - 3s) to avoid spam filters and rate limits.
- **Campaign History:** Detailed logs and reports of all previous campaigns.

---

## 🚀 How to Run

### Method 1: One-Click Windows Launcher
Double-click `start_website.bat` in the root folder. It will launch the server and automatically open the website in your default browser.

### Method 2: Command Line
```bash
# In d:\ecell_agent:
npm start
```
Then open your browser and navigate to:
**http://localhost:3000**

---

## 📂 Project Structure
- `server/`
  - `index.js`: Express server & REST/SSE endpoints
  - `mailer.js`: Personalization engine, Nodemailer transporter & throttled bulk sender
  - `storage.js`: Persistence for templates, settings, and campaign history
- `public/`
  - `index.html`: Responsive web application dashboard
  - `css/styles.css`: Modern UI, responsive layout, glassmorphic accents
  - `js/app.js`: Reactive frontend controller & SSE real-time stream listener
- `data/`
  - `templates/`: Stored HTML/TXT email templates
  - `templates.json`: Template metadata
  - `settings.json`: Saved SMTP configuration
  - `history.json`: Logged campaign results
- `sample_recipients.csv`: Sample recipient list with 5 demo contacts
- `sample_templates/`: Additional high-converting starter HTML templates
