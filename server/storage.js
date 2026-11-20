const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TEMPLATES_DIR = path.join(DATA_DIR, 'templates');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure necessary directories exist
function initStorage() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  if (!fs.existsSync(TEMPLATES_FILE)) {
    // Seed with pre-built ready templates
    const defaultTemplates = seedDefaultTemplates();
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(defaultTemplates, null, 2), 'utf-8');
  }

  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2), 'utf-8');
  }

  if (!fs.existsSync(SETTINGS_FILE)) {
    const defaultSettings = {
      provider: 'simulation', // simulation, gmail, outlook, custom
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // true for 465, false for 587
      user: '',
      pass: '',
      fromName: 'E-Cell Team',
      fromEmail: 'team@ecell.org',
      replyTo: '',
      organization: 'Entrepreneurship Cell',
      role: 'Outreach Lead',
      rateLimitMs: 1000 // 1 second between emails
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2), 'utf-8');
  }
}

// Extract {{variable}} and [variable] bracket tags from text/html
function extractVariables(content) {
  if (!content) return [];
  const regex = /(\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\[\s*([a-zA-Z0-9_]+)\s*\])/g;
  const matches = new Set();
  let match;
  while ((match = regex.exec(content)) !== null) {
    const varName = match[2] || match[3];
    if (varName) matches.add(varName);
  }
  return Array.from(matches);
}

function seedDefaultTemplates() {
  const ecellInviteId = 'tpl_ecell_invite_1';
  const sponsorId = 'tpl_ecell_sponsor_2';

  const inviteHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f6fb; margin: 0; padding: 20px; color: #333333; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.06); }
    .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 35px 25px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 0.5px; }
    .header p { margin: 8px 0 0; opacity: 0.9; font-size: 15px; }
    .content { padding: 30px 25px; line-height: 1.65; font-size: 15px; color: #374151; }
    .highlight-box { background: #eef2ff; border-left: 4px solid #4f46e5; padding: 15px 20px; border-radius: 6px; margin: 20px 0; font-weight: 500; }
    .button-wrap { text-align: center; margin: 30px 0 20px; }
    .button { background: #4f46e5; color: #ffffff !important; padding: 13px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 E-Summit 2026 Invitation</h1>
      <p>Igniting Tomorrow's Entrepreneurs Today</p>
    </div>
    <div class="content">
      <p>Dear <strong>{{name}}</strong>,</p>
      <p>On behalf of the Entrepreneurship Cell (E-Cell), we are thrilled to formally invite you to <strong>E-Summit 2026</strong> as our distinguished participant representing <strong>{{organization}}</strong>.</p>
      
      <div class="highlight-box">
        📅 <strong>Date:</strong> Next Month, 10:00 AM onwards<br>
        📍 <strong>Venue:</strong> Main Auditorium & Innovation Hub<br>
        🎯 <strong>Exclusive Track:</strong> {{track}}
      </div>

      <p>We have reserved your seat and credentials under registration ID: <strong>{{pass_id}}</strong>. You will have direct access to keynote sessions, startup pitching arenas, and high-impact networking with industry leaders and venture capitalists.</p>

      <div class="button-wrap">
        <a href="https://ecell.org/summit" class="button">Confirm Your Attendance</a>
      </div>

      <p>If you have any questions or require travel coordination, reply directly to this email.</p>
      
      <p>Warm regards,<br>
      <strong>The E-Cell Core Committee</strong><br>
      <em>Inspiring Innovation & Leadership</em></p>
    </div>
    <div class="footer">
      <p>© 2026 E-Cell. All rights reserved.<br>You received this email because you are registered with us as {{email}}.</p>
    </div>
  </div>
</body>
</html>`;

  const sponsorHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 20px; color: #1f2937; }
    .card { max-width: 620px; margin: auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; padding: 35px; }
    h2 { color: #111827; margin-top: 0; }
    .badge { display: inline-block; background: #ecfdf5; color: #047857; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; margin-bottom: 15px; }
    p { line-height: 1.6; font-size: 15px; }
    .metrics { display: flex; gap: 15px; margin: 25px 0; }
    .metric { flex: 1; background: #f3f4f6; border-radius: 8px; padding: 15px; text-align: center; }
    .metric-val { font-size: 22px; font-weight: 700; color: #4f46e5; }
    .metric-lbl { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .btn { display: inline-block; background: #111827; color: #ffffff !important; padding: 12px 25px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 15px; }
    .footer { margin-top: 35px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Partnership Opportunity</span>
    <h2>Partnership with {{company}} - E-Cell Flagship 2026</h2>
    <p>Hi <strong>{{name}}</strong>,</p>
    <p>I hope you are doing well! I'm reaching out from the Entrepreneurship Cell. We have been closely following <strong>{{company}}</strong>'s incredible growth in {{industry}}.</p>
    <p>We are currently finalizing our Tier-1 Industry Partners for our annual flagship summit, and we believe <strong>{{company}}</strong> would be an ideal headline partner to connect directly with top tech and startup talent.</p>
    
    <div class="metrics">
      <div class="metric"><div class="metric-val">10,000+</div><div class="metric-lbl">Attendees & Founders</div></div>
      <div class="metric"><div class="metric-val">50+</div><div class="metric-lbl">Investors & VCs</div></div>
      <div class="metric"><div class="metric-val">500k+</div><div class="metric-lbl">Digital Reach</div></div>
    </div>

    <p>Could we schedule a brief 10-minute discovery call this <strong>{{day}}</strong> to discuss how we can tailor this collaboration for {{company}}?</p>
    
    <a href="https://calendly.com/ecell-partnerships" class="btn">View Pitch Deck & Schedule Call</a>

    <div class="footer">
      Best regards,<br>
      <strong>Head of Corporate Relations</strong><br>
      E-Cell Operations & Outreach
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(TEMPLATES_DIR, `${ecellInviteId}.html`), inviteHtml, 'utf-8');
  fs.writeFileSync(path.join(TEMPLATES_DIR, `${sponsorId}.html`), sponsorHtml, 'utf-8');

  return [
    {
      id: ecellInviteId,
      name: 'E-Summit Event Invitation (Formal)',
      description: 'Official invitation for participants, delegates, and guests with pass ID & track details.',
      subject: 'Exclusive Invitation: E-Summit 2026 for {{name}}',
      filename: `${ecellInviteId}.html`,
      format: 'html',
      variables: ['name', 'organization', 'track', 'pass_id', 'email'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: sponsorId,
      name: 'Corporate Sponsorship Pitch',
      description: 'Outreach email to companies and sponsors pitching event partnership tiers.',
      subject: 'Partnership Opportunity: E-Cell & {{company}}',
      filename: `${sponsorId}.html`,
      format: 'html',
      variables: ['name', 'company', 'industry', 'day', 'email'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
}

function getTemplates() {
  initStorage();
  try {
    const data = fs.readFileSync(TEMPLATES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function getTemplateById(id) {
  const templates = getTemplates();
  const meta = templates.find(t => t.id === id);
  if (!meta) return null;

  const filePath = path.join(TEMPLATES_DIR, meta.filename);
  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  }
  return { ...meta, content };
}

function saveTemplate({ id, name, description, subject, content, format = 'html', originalFilename = null, headerConfig = null }) {
  initStorage();
  const templates = getTemplates();
  const templateId = id || 'tpl_' + Date.now();
  const extension = format === 'txt' ? '.txt' : '.html';
  const filename = `${templateId}${extension}`;
  const filePath = path.join(TEMPLATES_DIR, filename);

  fs.writeFileSync(filePath, content || '', 'utf-8');

  const headerTexts = headerConfig ? ` ${headerConfig.title || ''} ${headerConfig.subtitle || ''}` : '';
  const variables = extractVariables((content || '') + ' ' + (subject || '') + headerTexts);

  const existingIndex = templates.findIndex(t => t.id === templateId);
  const templateRecord = {
    id: templateId,
    name: name || (originalFilename ? originalFilename.replace(/\.[^/.]+$/, "") : 'Untitled Template'),
    description: description || 'Custom email template',
    subject: subject || 'Notice for [name]',
    filename,
    format,
    variables,
    headerConfig: headerConfig || (existingIndex >= 0 ? templates[existingIndex].headerConfig : null),
    createdAt: existingIndex >= 0 ? templates[existingIndex].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    templates[existingIndex] = templateRecord;
  } else {
    templates.push(templateRecord);
  }

  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2), 'utf-8');
  return { ...templateRecord, content };
}

function deleteTemplate(id) {
  initStorage();
  let templates = getTemplates();
  const template = templates.find(t => t.id === id);
  if (!template) return false;

  const filePath = path.join(TEMPLATES_DIR, template.filename);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (e) {}
  }

  templates = templates.filter(t => t.id !== id);
  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2), 'utf-8');
  return true;
}

function getSettings() {
  initStorage();
  try {
    const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}

function saveSettings(settings) {
  initStorage();
  const current = getSettings();
  const updated = { ...current, ...settings };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

function getHistory() {
  initStorage();
  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function saveHistoryItem(item) {
  initStorage();
  const history = getHistory();
  history.unshift(item); // Latest first
  // Keep last 100 campaigns
  if (history.length > 100) history.pop();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

function clearHistory() {
  initStorage();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2), 'utf-8');
  return true;
}

module.exports = {
  DATA_DIR,
  TEMPLATES_DIR,
  UPLOADS_DIR,
  initStorage,
  extractVariables,
  getTemplates,
  getTemplateById,
  saveTemplate,
  deleteTemplate,
  getSettings,
  saveSettings,
  getHistory,
  saveHistoryItem,
  clearHistory
};
