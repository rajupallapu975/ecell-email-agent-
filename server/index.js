require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const xlsx = require('xlsx');
const nodemailer = require('nodemailer');

const storage = require('./storage');
const mailer = require('./mailer');
const gmailAuth = require('./gmailAuth');
const firebaseDb = require('./firebase');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize storage directories
storage.initStorage();
firebaseDb.initFirebase();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Configure Multer for template and recipient uploads
const upload = multer({
  dest: storage.UPLOADS_DIR,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit
});

// SSE active clients by campaignId
const campaignClients = new Map();

function broadcastCampaignEvent(campaignId, eventType, data) {
  const clients = campaignClients.get(campaignId);
  if (clients && clients.length > 0) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    clients.forEach(res => {
      try {
        res.write(payload);
      } catch (e) {
        // Handle disconnected client
      }
    });
  }
}

// ==========================================
// 1. TEMPLATES API
// ==========================================

// List all templates
app.get('/api/templates', (req, res) => {
  try {
    const templates = storage.getTemplates();
    res.json({ success: true, templates });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



// Get single template with content
app.get('/api/templates/:id', (req, res) => {
  try {
    const template = storage.getTemplateById(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    res.json({ success: true, template });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



// Upload a new template file (.html, .htm, .txt)
app.post('/api/templates/upload', upload.single('templateFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const originalName = req.file.originalname;
    const ext = path.extname(originalName).toLowerCase();
    const format = ext === '.txt' ? 'txt' : 'html';

    // Read uploaded content
    const content = fs.readFileSync(req.file.path, 'utf-8');

    // Clean up temp file
    try { fs.unlinkSync(req.file.path); } catch (e) {}

    const templateName = req.body.name || originalName.replace(/\.[^/.]+$/, "");
    const description = req.body.description || `Uploaded template from ${originalName}`;
    const subject = req.body.subject || 'Hello {{name}}';

    const saved = storage.saveTemplate({
      name: templateName,
      description,
      subject,
      content,
      format,
      originalFilename: originalName
    });

    res.json({
      success: true,
      message: 'Template uploaded and saved successfully!',
      template: saved
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



// Create or update template directly (from UI editor)
app.post('/api/templates', (req, res) => {
  try {
    const { id, name, description, subject, content, format, headerConfig } = req.body;
    if (!name || !content) {
      return res.status(400).json({ success: false, message: 'Template name and content are required' });
    }

    const saved = storage.saveTemplate({
      id,
      name,
      description,
      subject,
      content,
      format: format || 'html',
      headerConfig
    });

    res.json({ success: true, message: 'Template saved successfully', template: saved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



// Delete template
app.delete('/api/templates/:id', (req, res) => {
  try {
    const success = storage.deleteTemplate(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



// ==========================================
// 2. RECIPIENTS / CSV / EXCEL PARSER API
// ==========================================

app.post('/api/recipients/parse', upload.single('recipientFile'), (req, res) => {
  try {
    let rows = [];
    let headers = [];

    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const filePath = req.file.path;

      if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
        const workbook = xlsx.readFile(filePath);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        rows = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
      } else {
        // Treat as text / CSV
        const raw = fs.readFileSync(filePath, 'utf-8');
        rows = parseCsvString(raw);
      }

      try { fs.unlinkSync(filePath); } catch (e) {}
    } else if (req.body.csvText) {
      rows = parseCsvString(req.body.csvText);
    } else if (req.body.recipients && Array.isArray(req.body.recipients)) {
      rows = req.body.recipients;
    } else {
      return res.status(400).json({ success: false, message: 'No recipient file or data provided' });
    }

    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No recipient rows could be extracted.' });
    }

    headers = Object.keys(rows[0]);

    // Check if an email column is found with smart title matching
    const emailHeader = headers.find(h => {
      const lower = h.trim().toLowerCase();
      return lower === 'email' || lower === 'e-mail' || lower === 'mail' || lower.includes('email') || lower.includes('mail');
    });

    const nameHeader = headers.find(h => {
      const lower = h.trim().toLowerCase();
      return (lower === 'name' || lower === 'full name' || lower === 'fullname' || lower === 'student name' || lower === 'candidate name') && !lower.includes('email');
    });

    // Normalize rows so row.email and row.name are always directly available
    rows.forEach(r => {
      if (!r.email && emailHeader && r[emailHeader]) {
        r.email = String(r[emailHeader]).trim();
      }
      if (!r.name && nameHeader && r[nameHeader]) {
        r.name = String(r[nameHeader]).trim();
      }
    });

    res.json({
      success: true,
      totalRows: rows.length,
      headers,
      emailColumnDetected: emailHeader || null,
      preview: rows.slice(0, 10),
      allRecipients: rows
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



function parseCsvString(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]);
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header.trim()] = values[idx] !== undefined ? values[idx].trim() : '';
    });
    // Only include if has at least one non-empty value
    if (Object.values(obj).some(val => val.length > 0)) {
      results.push(obj);
    }
  }
  return results;
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// ==========================================
// 3. PREVIEW API
// ==========================================

app.post('/api/preview', async (req, res) => {
  try {
    const { templateId, templateContent, subject, recipient, mappings, senderAccountId } = req.body;
    let content = templateContent;
    let subj = subject;
    let format = 'html';

    if (templateId && !content) {
      const tpl = storage.getTemplateById(templateId);
      if (tpl) {
        content = tpl.content;
        subj = subj || tpl.subject;
        format = tpl.format;
      }
    }

    const sampleRecipient = recipient || {
      name: 'Aditya Sharma',
      email: 'aditya.sharma@example.com',
      company: 'TechVentures Labs',
      organization: 'TechVentures Labs',
      role: 'Lead Architect',
      pass_id: 'ESUMMIT-2026-VIP',
      track: 'AI & Venture DeepTech',
      industry: 'Enterprise Software',
      day: 'Thursday'
    };

    const variablesUsed = storage.extractVariables((content || '') + ' ' + (subj || ''));
    const renderedSubject = (sampleRecipient.customSubject && sampleRecipient.customSubject.trim())
      ? sampleRecipient.customSubject.trim()
      : mailer.renderContent(subj || 'Welcome [name]', sampleRecipient, mappings || {}, variablesUsed);
    let renderedBody = (sampleRecipient.customBody && sampleRecipient.customBody.trim())
      ? sampleRecipient.customBody
      : mailer.renderContent(content || '', sampleRecipient, mappings || {}, variablesUsed);

    // Append sender's default Gmail signature if enabled
    const settings = storage.getSettings();
    const shouldAddSignature = req.body.includeSignature !== undefined
      ? Boolean(req.body.includeSignature)
      : (settings.includeSignature !== false);

    if (shouldAddSignature && format !== 'txt' && !renderedBody.includes('<!-- EMAIL_SIGNATURE_START -->')) {
      let sig = '';
      if (senderAccountId) {
        try {
          sig = await gmailAuth.getSenderDefaultSignature(senderAccountId);
        } catch (e) {}
      }
      if (sig) {
        renderedBody += mailer.getSignatureHtml({ signatureHtml: sig });
      }
    }

    res.json({
      success: true,
      subject: renderedSubject,
      body: renderedBody,
      format,
      variablesUsed
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get sender's default signature from Gmail settings
app.get('/api/accounts/:id/signature', async (req, res) => {
  try {
    const signature = await gmailAuth.getSenderDefaultSignature(req.params.id);
    res.json({ success: true, signature });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



// ==========================================
// 4. SETTINGS & SMTP API
// ==========================================

app.get('/api/settings', (req, res) => {
  try {
    const settings = storage.getSettings();
    // Mask password before returning
    const safeSettings = {
      ...settings,
      hasPassword: Boolean(settings.pass && settings.pass.length > 0),
      pass: settings.pass ? '••••••••••••' : ''
    };
    res.json({ success: true, settings: safeSettings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



app.post('/api/settings', (req, res) => {
  try {
    const current = storage.getSettings();
    const incoming = req.body;

    // If password is sent as the masked string, keep current password
    if (incoming.pass === '••••••••••••') {
      incoming.pass = current.pass;
    }

    const updated = storage.saveSettings(incoming);
    res.json({
      success: true,
      message: 'SMTP settings saved successfully!',
      settings: {
        ...updated,
        hasPassword: Boolean(updated.pass && updated.pass.length > 0),
        pass: updated.pass ? '••••••••••••' : ''
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Upload custom email signature image
app.post('/api/settings/signature/upload', upload.single('signatureFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No signature image selected' });
    }

    const targetPublic = path.join(__dirname, '..', 'public', 'assets', 'signature.png');
    const targetData = path.join(__dirname, '..', 'data', 'signature.png');

    fs.copyFileSync(req.file.path, targetPublic);
    fs.copyFileSync(req.file.path, targetData);

    try { fs.unlinkSync(req.file.path); } catch (e) {}

    storage.saveSettings({ includeSignature: true, signatureImagePath: '/assets/signature.png' });

    res.json({
      success: true,
      message: 'Signature image uploaded and applied successfully!',
      imagePath: '/assets/signature.png?v=' + Date.now()
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



app.post('/api/settings/test', async (req, res) => {
  try {
    const current = storage.getSettings();
    const testConfig = { ...current, ...req.body };
    if (testConfig.pass === '••••••••••••') {
      testConfig.pass = current.pass;
    }

    const result = await mailer.verifyConnection(testConfig);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



// ==========================================
// 4.5. GOOGLE OAUTH 2.0 & GMAIL API & ACCOUNTS
// ==========================================

// Get Google OAuth Authorization URL
app.get('/api/auth/google/url', (req, res) => {
  try {
    const url = gmailAuth.getAuthorizationUrl();
    res.json({ success: true, url });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// OAuth Callback from Google
app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    if (error) {
      return res.redirect(`/?auth_status=error&message=${encodeURIComponent(error)}`);
    }
    if (!code) {
      return res.redirect(`/?auth_status=error&message=${encodeURIComponent('No authorization code received')}`);
    }

    const account = await gmailAuth.handleOAuthCallback(code);
    res.redirect(`/?auth_status=success&connected_email=${encodeURIComponent(account.email)}`);
  } catch (err) {
    res.redirect(`/?auth_status=error&message=${encodeURIComponent(err.message)}`);
  }
});

// Get OAuth Client configuration
app.get('/api/auth/google/config', (req, res) => {
  try {
    const config = gmailAuth.getOAuthConfig();
    res.json({
      success: true,
      clientId: config.clientId,
      hasSecret: Boolean(config.clientSecret),
      redirectUri: config.redirectUri
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Save OAuth Client credentials
app.post('/api/auth/google/config', (req, res) => {
  try {
    const saved = gmailAuth.saveOAuthConfig(req.body);
    res.json({
      success: true,
      message: 'Google OAuth credentials saved!',
      config: {
        clientId: saved.clientId,
        hasSecret: Boolean(saved.clientSecret),
        redirectUri: saved.redirectUri
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// List all connected Gmail accounts
app.get('/api/accounts/gmail', async (req, res) => {
  try {
    const accounts = await firebaseDb.getConnectedAccounts();
    // Return sanitized account cards without raw refresh tokens or passwords
    const sanitized = accounts.map(a => ({
      id: a.id,
      email: a.email,
      name: a.name,
      picture: a.picture,
      authType: a.authType || 'oauth',
      hasSendPermission: a.authType === 'app_password' ? true : (a.hasSendPermission || (a.tokens?.scope || '').includes('gmail.send') || (a.tokens?.scope || '').includes('mail.google.com')),
      connectedAt: a.connectedAt
    }));
    res.json({ success: true, accounts: sanitized });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Disconnect a connected Gmail account
app.delete('/api/accounts/gmail/:id', async (req, res) => {
  try {
    await firebaseDb.deleteConnectedAccount(req.params.id);
    res.json({ success: true, message: 'Gmail account disconnected successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Connect account via Google App Password (Direct SMTP - Works 100% for College / Institutional domains)
app.post('/api/accounts/app-password', async (req, res) => {
  try {
    const { email, appPassword, name } = req.body;
    if (!email || !appPassword) {
      return res.status(400).json({ success: false, message: 'Email and 16-character App Password are required' });
    }

    const cleanPass = appPassword.replace(/\s+/g, '');
    const cleanEmail = email.trim();

    // Verify connection to Gmail SMTP
    const testTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: cleanEmail,
        pass: cleanPass
      }
    });

    await testTransporter.verify();

    const accountRecord = {
      id: cleanEmail.replace(/[^a-zA-Z0-9_]/g, '_'),
      email: cleanEmail,
      name: name?.trim() || cleanEmail.split('@')[0],
      authType: 'app_password',
      appPassword: cleanPass,
      hasSendPermission: true,
      picture: '',
      connectedAt: new Date().toISOString()
    };

    await firebaseDb.saveConnectedAccount(accountRecord);

    res.json({
      success: true,
      message: `Successfully connected ${cleanEmail} via Gmail App Password!`,
      account: {
        id: accountRecord.id,
        email: accountRecord.email,
        name: accountRecord.name,
        authType: 'app_password'
      }
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: `Verification failed: ${err.message}. Please check that 2-Step Verification is enabled and that you generated an App Password from myaccount.google.com/apppasswords.`
    });
  }
});

// Configure Firebase Service Account credentials
app.post('/api/firebase/config', upload.single('serviceAccountFile'), (req, res) => {
  try {
    let serviceAccount = null;
    if (req.file) {
      const content = fs.readFileSync(req.file.path, 'utf-8');
      serviceAccount = JSON.parse(content);
      const targetPath = path.join(__dirname, '..', 'serviceAccountKey.json');
      fs.writeFileSync(targetPath, content, 'utf-8');
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    } else if (req.body.serviceAccountJson) {
      serviceAccount = typeof req.body.serviceAccountJson === 'string'
        ? JSON.parse(req.body.serviceAccountJson)
        : req.body.serviceAccountJson;
      const targetPath = path.join(__dirname, '..', 'serviceAccountKey.json');
      fs.writeFileSync(targetPath, JSON.stringify(serviceAccount, null, 2), 'utf-8');
    }

    if (serviceAccount) {
      firebaseDb.initFirebase();
      res.json({
        success: true,
        message: 'Firebase Admin initialized successfully with provided service account!',
        projectId: serviceAccount.project_id
      });
    } else {
      res.status(400).json({ success: false, message: 'No service account JSON provided' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Firebase configuration error: ' + err.message });
  }
});

// Check Firebase connection status
app.get('/api/firebase/status', (req, res) => {
  const active = firebaseDb.isFirebaseActive();
  res.json({
    success: true,
    active,
    mode: active ? 'cloud_firestore' : 'local_datastore'
  });
});

// In-App Recipients list
app.get('/api/recipients/in-app', async (req, res) => {
  try {
    const recipients = await firebaseDb.getInAppRecipients();
    res.json({ success: true, recipients });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/recipients/in-app', async (req, res) => {
  try {
    await firebaseDb.saveInAppRecipients(req.body.recipients || []);
    res.json({ success: true, message: 'In-app recipients saved successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 5. CAMPAIGN EXECUTION & REALTIME SSE API
// ==========================================

// SSE Stream endpoint for real-time progress & logs
app.get('/api/campaign/stream/:campaignId', (req, res) => {
  const { campaignId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!campaignClients.has(campaignId)) {
    campaignClients.set(campaignId, []);
  }
  campaignClients.get(campaignId).push(res);

  // Send initial ping
  res.write(`event: connected\ndata: ${JSON.stringify({ campaignId })}\n\n`);

  req.on('close', () => {
    const clients = campaignClients.get(campaignId) || [];
    campaignClients.set(campaignId, clients.filter(c => c !== res));
  });
});

// Trigger bulk email send
app.post('/api/campaign/send', async (req, res) => {
  try {
    const { templateId, templateContent, subject, recipients, format = 'html' } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ success: false, message: 'Recipients list is required' });
    }

    let templateObj = { content: templateContent, format, subject };

    if (templateId) {
      const stored = storage.getTemplateById(templateId);
      if (stored) {
        templateObj = {
          content: templateContent || stored.content,
          format: stored.format || format,
          subject: subject || stored.subject
        };
      }
    }

    if (!templateObj.content) {
      return res.status(400).json({ success: false, message: 'Template content cannot be empty' });
    }

    const campaignId = 'camp_' + Date.now();
    const baseSettings = storage.getSettings();
    const settings = {
      ...baseSettings,
      senderAccountId: req.body.senderAccountId || null,
      rateLimitMs: req.body.rateLimitMs || baseSettings.rateLimitMs,
      mappings: req.body.mappings || {},
      includeSignature: req.body.includeSignature !== undefined ? Boolean(req.body.includeSignature) : (baseSettings.includeSignature !== false)
    };

    // Return campaignId immediately so client can hook SSE
    res.json({
      success: true,
      campaignId,
      totalRecipients: recipients.length,
      message: 'Campaign initiated! Listen to SSE stream for live updates.'
    });

    // Run sending in background
    setTimeout(async () => {
      const startTime = Date.now();

      let activeProvider = settings.provider;
      if (settings.senderAccountId) {
        try {
          const acc = await firebaseDb.getConnectedAccountById(settings.senderAccountId);
          if (acc) activeProvider = `gmail_api (${acc.email})`;
        } catch (e) {}
      }

      const results = await mailer.sendBulkCampaign({
        campaignId,
        template: templateObj,
        recipients,
        subject: templateObj.subject,
        settings,
        onProgress: (progress) => {
          broadcastCampaignEvent(campaignId, 'progress', progress);
        },
        onLog: (log) => {
          broadcastCampaignEvent(campaignId, 'log', {
            ...log,
            timestamp: new Date().toLocaleTimeString()
          });
        }
      });

      const campaignRecord = {
        id: campaignId,
        templateName: templateId ? (storage.getTemplateById(templateId)?.name || 'Custom Template') : 'Custom Template',
        subject: templateObj.subject,
        total: results.total,
        sent: results.sent,
        failed: results.failed,
        results: results.results,
        provider: activeProvider,
        durationSeconds: ((Date.now() - startTime) / 1000).toFixed(1),
        createdAt: new Date().toISOString()
      };

      storage.saveHistoryItem(campaignRecord);

      broadcastCampaignEvent(campaignId, 'completed', campaignRecord);
      campaignClients.delete(campaignId);
    }, 100);

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



// Cancel active campaign
app.post('/api/campaign/cancel/:campaignId', (req, res) => {
  const { campaignId } = req.params;
  const cancelled = mailer.cancelCampaign(campaignId);
  res.json({ success: cancelled, message: cancelled ? 'Cancel signal sent.' : 'Campaign not running or already finished.' });
});

// ==========================================
// 6. HISTORY API
// ==========================================

app.get('/api/history', (req, res) => {
  try {
    const history = storage.getHistory();
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



// Clear all campaign history
app.delete('/api/history', (req, res) => {
  try {
    storage.clearHistory();
    res.json({ success: true, message: 'Campaign history cleared successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



// ==========================================
// Start Server
// ==========================================

function startServer(portToTry) {
  const server = app.listen(portToTry, () => {
    console.log(`=======================================================`);
    console.log(`🚀 E-Cell Bulk Mail Agent Website running successfully!`);
    console.log(`🌐 Local Web App URL: http://localhost:${portToTry}`);
    console.log(`=======================================================`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ Port ${portToTry} in use, trying port ${portToTry + 1}...`);
      startServer(portToTry + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(PORT);
