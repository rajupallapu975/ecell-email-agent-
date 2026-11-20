const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const gmailAuth = require('./gmailAuth');
const firebaseDb = require('./firebase');

// Active campaigns map for cancellation/progress
const activeCampaigns = new Map();

/**
 * Generate official E-Cell Vishnu Institute of Technology email signature HTML
 * forPreview: uses /assets/signature.png for iframe display
 * false: uses cid:email_signature_img for RFC-compliant inline delivery in Gmail
 */
function getSignatureHtml({ signatureHtml = '' } = {}) {
  if (!signatureHtml) return '';
  return `\n<!-- EMAIL_SIGNATURE_START -->
<div class="email-signature" style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
  ${signatureHtml}
</div>
<!-- EMAIL_SIGNATURE_END -->`;
}

/**
 * Replace placeholders like {{name}}, [name], {{0}}, [0] with recipient properties
 * Supports both named variables, bracket keywords, explicit mappings, and index-based column mapping
 */
function renderContent(templateStr, data = {}, mappings = {}, templateVariables = []) {
  if (!templateStr) return '';

  const dataValues = Array.isArray(data) ? data : Object.values(data);
  const dataKeys = Array.isArray(data) ? [] : Object.keys(data);

  return templateStr.replace(/(\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\[\s*([a-zA-Z0-9_]+)\s*\])/g, (match, full, key1, key2) => {
    const rawKey = key1 || key2;
    const keyLower = rawKey.toLowerCase().trim();
    const isEmailKeyword = keyLower.includes('email') || keyLower === 'mail';

    // 0. Priority: check recipient-specific custom edits
    if (data._customFields && data._customFields[rawKey] !== undefined) {
      return String(data._customFields[rawKey]).trim();
    }
    const customKey = data._customFields && Object.keys(data._customFields).find(k => k.trim().toLowerCase() === keyLower);
    if (customKey && data._customFields[customKey] !== undefined) {
      return String(data._customFields[customKey]).trim();
    }

    // 1. Check explicit user mapping (e.g., mappings['name'] = 'Full Name' or mappings['department_name'] = 'Branch')
    if (mappings && mappings[rawKey] !== undefined) {
      const mappedCol = mappings[rawKey];
      if (mappedCol === '') {
        // Explicitly unmapped - do not fallback to email or incorrect column
        return '';
      }
      if (data[mappedCol] !== undefined && data[mappedCol] !== null && String(data[mappedCol]).trim() !== '') {
        const valStr = String(data[mappedCol]).trim();
        // Prevent email leakage into non-email keyword
        if (!isEmailKeyword && (mappedCol.toLowerCase().includes('email') || valStr.includes('@'))) {
          // Do not substitute email
        } else {
          return valStr;
        }
      }
    }

    // 2. Direct field name match in data (case-insensitive)
    const directKey = dataKeys.find(k => k.trim().toLowerCase() === keyLower);
    if (directKey && data[directKey] !== undefined && data[directKey] !== null && String(data[directKey]).trim() !== '') {
      const valStr = String(data[directKey]).trim();
      if (!isEmailKeyword && (directKey.toLowerCase().includes('email') || valStr.includes('@'))) {
        // Do not substitute email
      } else {
        return valStr;
      }
    }

    // 3. Semantic aliases for known variables
    if (keyLower === 'name' && (data.name || data.Name)) return String(data.name || data.Name).trim();
    if ((keyLower === 'department' || keyLower === 'department_name' || keyLower === 'dept') && (data.department || data.Department || data.dept || data.Dept || data.Branch || data.branch)) {
      return String(data.department || data.Department || data.dept || data.Dept || data.Branch || data.branch).trim();
    }
    if ((keyLower === 'college' || keyLower === 'university' || keyLower === 'institution') && (data.college || data.College || data.university || data.University || data.institution)) {
      return String(data.college || data.College || data.university || data.University || data.institution).trim();
    }
    if ((keyLower === 'company' || keyLower === 'organization' || keyLower === 'org') && (data.company || data.Company || data.organization || data.Organization || data.org)) {
      return String(data.company || data.Company || data.organization || data.Organization || data.org).trim();
    }
    if ((keyLower === 'role' || keyLower === 'designation' || keyLower === 'position') && (data.role || data.Role || data.designation || data.Designation || data.position)) {
      return String(data.role || data.Role || data.designation || data.Designation || data.position).trim();
    }
    if ((keyLower === 'pass_id' || keyLower === 'ticket' || keyLower === 'roll_no' || keyLower === 'id') && (data.pass_id || data.ticket || data.roll_no || data.id)) {
      return String(data.pass_id || data.ticket || data.roll_no || data.id).trim();
    }
    if (keyLower === 'date' && (data.date || data.Date || data.event_date)) {
      return String(data.date || data.Date || data.event_date).trim();
    }
    if (isEmailKeyword && (data.email || data.Email)) {
      return String(data.email || data.Email).trim();
    }

    // Unresolved keyword: return empty string or clean default so brackets or emails don't leak
    return '';
  });
}

/**
 * Create a nodemailer transporter based on user settings
 */
function createTransporter(settings) {
  if (settings.provider === 'simulation') {
    return { isSimulation: true };
  }

  let transportConfig = {};

  if (settings.provider === 'gmail') {
    transportConfig = {
      service: 'gmail',
      auth: {
        user: settings.user,
        pass: settings.pass // Google App Password (16 characters)
      }
    };
  } else if (settings.provider === 'outlook') {
    transportConfig = {
      service: 'hotmail',
      auth: {
        user: settings.user,
        pass: settings.pass
      }
    };
  } else {
    // Custom SMTP
    transportConfig = {
      host: settings.host,
      port: Number(settings.port) || 587,
      secure: Boolean(settings.secure), // true for 465, false for other ports
      auth: {
        user: settings.user,
        pass: settings.pass
      },
      tls: {
        rejectUnauthorized: false // allow self-signed certificates in dev/local networks
      }
    };
  }

  return {
    isSimulation: false,
    transporter: nodemailer.createTransport(transportConfig)
  };
}

/**
 * Verify SMTP connection
 */
async function verifyConnection(settings) {
  if (settings.provider === 'simulation') {
    return {
      success: true,
      message: 'Simulation Mode Active: Ready to test send emails without an SMTP server!'
    };
  }

  if (!settings.user || !settings.pass) {
    return {
      success: false,
      message: 'SMTP Username/Email and Password are required.'
    };
  }

  const { isSimulation, transporter } = createTransporter(settings);
  if (isSimulation) return { success: true, message: 'Simulation Mode verified.' };

  try {
    await transporter.verify();
    return {
      success: true,
      message: `Successfully connected to ${settings.provider.toUpperCase()} SMTP server as ${settings.user}!`
    };
  } catch (error) {
    let helpMsg = error.message;
    if (settings.provider === 'gmail' && error.message.includes('Username and Password not accepted')) {
      helpMsg += ' (Tip: Gmail requires a 16-character App Password, not your normal account password. Make sure 2-Step Verification is ON, then generate an App Password in your Google Account security settings).';
    }
    return {
      success: false,
      message: helpMsg
    };
  }
}

/**
 * Send personalized bulk emails
 */
async function sendBulkCampaign({
  campaignId,
  template,
  recipients,
  subject,
  settings,
  onProgress,
  onLog
}) {
  const state = {
    campaignId,
    cancelled: false,
    total: recipients.length,
    sent: 0,
    failed: 0,
    results: []
  };

  activeCampaigns.set(campaignId, state);

  let isGmailApi = false;
  let isAppPassword = false;
  let appPasswordTransporter = null;
  let gmailSenderAccount = null;

  if (settings.senderAccountId) {
    try {
      gmailSenderAccount = await firebaseDb.getConnectedAccountById(settings.senderAccountId);
      if (gmailSenderAccount) {
        if (gmailSenderAccount.authType === 'app_password') {
          isAppPassword = true;
          appPasswordTransporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: gmailSenderAccount.email,
              pass: gmailSenderAccount.appPassword
            }
          });
        } else {
          isGmailApi = true;
        }
      }
    } catch (e) {
      console.warn('Could not load Gmail account from Firebase:', e.message);
    }
  }

  const { isSimulation, transporter } = (isGmailApi || isAppPassword) ? { isSimulation: false, transporter: null } : createTransporter(settings);
  const delayMs = Math.max(300, Number(settings.rateLimitMs) || 1000);

  const effectiveFromName = (settings.fromName && settings.fromName !== 'E-Cell Team' && settings.fromName !== 'E-Cell Core')
    ? settings.fromName
    : (gmailSenderAccount?.name || 'Raju Pallapu');

  const fromAddress = (isGmailApi || isAppPassword)
    ? `"${effectiveFromName}" <${gmailSenderAccount.email}>`
    : (settings.fromName
      ? `"${settings.fromName}" <${settings.fromEmail || settings.user || 'mailer@ecell.org'}>`
      : (settings.fromEmail || settings.user || 'mailer@ecell.org'));

  // Retrieve the sender's default signature configured in Gmail Settings
  let senderSignatureHtml = '';
  if (settings.includeSignature !== false) {
    if (settings.senderAccountId) {
      try {
        senderSignatureHtml = await gmailAuth.getSenderDefaultSignature(settings.senderAccountId);
      } catch (e) {}
    }
    if (!senderSignatureHtml && gmailSenderAccount?.signature) {
      senderSignatureHtml = gmailSenderAccount.signature;
    }
  }

  onLog?.({
    type: 'info',
    text: `🚀 Starting campaign [${campaignId}]. Total recipients: ${recipients.length}`
  });

  if (isSimulation) {
    onLog?.({
      type: 'warning',
      text: `⚠️ Mode: SIMULATION (Safe test mode). Emails are rendered & validated but not dispatched to real inboxes.`
    });
  } else if (isGmailApi) {
    onLog?.({
      type: 'info',
      text: `📡 Connected via Gmail API using authorized account: ${gmailSenderAccount.email}. Delay: ${delayMs}ms`
    });
  } else {
    onLog?.({
      type: 'info',
      text: `📡 Connected via ${settings.provider.toUpperCase()} SMTP (${fromAddress}). Delay between sends: ${delayMs}ms`
    });
  }

  for (let i = 0; i < recipients.length; i++) {
    // Check if user clicked cancel
    if (state.cancelled) {
      onLog?.({ type: 'warning', text: '🛑 Campaign cancelled by user.' });
      break;
    }

    const recipient = recipients[i];
    // Find email address: prioritize direct recipient.email (which reflects user edits), then check row keys
    let recipientEmail = (recipient.email && String(recipient.email).includes('@'))
      ? String(recipient.email).trim()
      : '';
    if (!recipientEmail) {
      const emailKey = Object.keys(recipient).find(k => k.trim().toLowerCase() === 'email' || k.trim().toLowerCase() === 'e-mail' || k.trim().toLowerCase().includes('email') || k.trim().toLowerCase().includes('mail'));
      recipientEmail = emailKey ? String(recipient[emailKey]).trim() : '';
    }

    if (!recipientEmail || !recipientEmail.includes('@')) {
      state.failed++;
      const resItem = {
        recipientIndex: i,
        email: recipientEmail || 'Unknown',
        recipient,
        status: 'failed',
        error: 'Invalid or missing email address',
        timestamp: new Date().toISOString()
      };
      state.results.push(resItem);
      onLog?.({
        type: 'error',
        text: `[${i + 1}/${recipients.length}] ❌ Failed: Invalid email format for row ${i + 1}`
      });
      onProgress?.({ ...state, current: i + 1, lastResult: resItem });
      continue;
    }

    // Render personalized subject & body with keyword bracket & index mapping support (prioritizing custom user edits from preview)
    const tplVars = template.variables || [];
    const mappings = settings.mappings || {};
    const personalizedSubject = (recipient.customSubject && recipient.customSubject.trim())
      ? recipient.customSubject.trim()
      : renderContent(subject || template.subject || 'Hello [name]', recipient, mappings, tplVars);
    let personalizedContent = (recipient.customBody && recipient.customBody.trim())
      ? recipient.customBody
      : renderContent(template.content, recipient, mappings, tplVars);

    // Signature Handling: Apply default Gmail signature from logged in sender
    if (settings.includeSignature !== false && senderSignatureHtml && template.format !== 'txt') {
      if (!personalizedContent.includes('<!-- EMAIL_SIGNATURE_START -->')) {
        personalizedContent += getSignatureHtml({ signatureHtml: senderSignatureHtml });
      }
    }

    const attachments = [];

    const mailOptions = {
      from: fromAddress,
      to: recipientEmail,
      replyTo: settings.replyTo || settings.fromEmail || undefined,
      subject: personalizedSubject,
      [template.format === 'txt' ? 'text' : 'html']: personalizedContent,
      attachments
    };

    try {
      if (isSimulation) {
        // Simulate sending delay
        await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, 500)));
      } else if (isAppPassword) {
        // Send using Gmail SMTP via Google App Password (direct & bypasses all OAuth scope issues)
        await appPasswordTransporter.sendMail(mailOptions);
        if (i < recipients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } else if (isGmailApi) {
        // Send using Gmail API through the selected Gmail account with inline signature attachment
        await gmailAuth.sendEmailViaGmail({
          accountId: settings.senderAccountId,
          to: recipientEmail,
          subject: personalizedSubject,
          htmlBody: personalizedContent,
          fromName: effectiveFromName,
          attachments
        });
        if (i < recipients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } else {
        await transporter.sendMail(mailOptions);
        if (i < recipients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      state.sent++;
      const resItem = {
        recipientIndex: i,
        email: recipientEmail,
        name: recipient.name || recipient.Name || '',
        status: 'sent',
        subject: personalizedSubject,
        timestamp: new Date().toISOString()
      };
      state.results.push(resItem);

      onLog?.({
        type: 'success',
        text: `[${i + 1}/${recipients.length}] ✅ Sent to: ${recipientEmail} ("${personalizedSubject}")`
      });
      onProgress?.({ ...state, current: i + 1, lastResult: resItem });

    } catch (err) {
      state.failed++;
      const resItem = {
        recipientIndex: i,
        email: recipientEmail,
        name: recipient.name || recipient.Name || '',
        status: 'failed',
        error: err.message,
        timestamp: new Date().toISOString()
      };
      state.results.push(resItem);

      onLog?.({
        type: 'error',
        text: `[${i + 1}/${recipients.length}] ❌ Error sending to ${recipientEmail}: ${err.message}`
      });
      onProgress?.({ ...state, current: i + 1, lastResult: resItem });
    }
  }

  activeCampaigns.delete(campaignId);

  onLog?.({
    type: 'info',
    text: `🏁 Campaign finished! Sent: ${state.sent}, Failed: ${state.failed}, Total: ${recipients.length}`
  });

  return state;
}

function cancelCampaign(campaignId) {
  const campaign = activeCampaigns.get(campaignId);
  if (campaign) {
    campaign.cancelled = true;
    return true;
  }
  return false;
}

module.exports = {
  renderContent,
  getSignatureHtml,
  createTransporter,
  verifyConnection,
  sendBulkCampaign,
  cancelCampaign,
  activeCampaigns
};
