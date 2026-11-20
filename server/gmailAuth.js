const { google } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const fs = require('fs');
const path = require('path');
const firebaseDb = require('./firebase');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OAUTH_CONFIG_FILE = path.join(DATA_DIR, 'oauth_config.json');

// Gmail Send Scopes: includes both gmail.send and mail.google.com to match whichever is configured in Cloud Console
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'openid'
];

function getOAuthConfig() {
  let clientId = process.env.GOOGLE_CLIENT_ID || '';
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  let redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback';

  if ((!clientId || !clientSecret) && fs.existsSync(OAUTH_CONFIG_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(OAUTH_CONFIG_FILE, 'utf-8'));
      clientId = saved.clientId || clientId;
      clientSecret = saved.clientSecret || clientSecret;
      redirectUri = saved.redirectUri || redirectUri;
    } catch (e) {}
  }

  return { clientId, clientSecret, redirectUri };
}

function saveOAuthConfig({ clientId, clientSecret, redirectUri }) {
  const current = getOAuthConfig();
  const updated = {
    clientId: clientId || current.clientId,
    clientSecret: clientSecret || current.clientSecret,
    redirectUri: redirectUri || current.redirectUri || 'http://localhost:3000/api/auth/google/callback'
  };
  fs.writeFileSync(OAUTH_CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

function createOAuth2Client() {
  const config = getOAuthConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error('Google OAuth credentials not configured. Please set Client ID and Client Secret in Profile or .env');
  }
  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );
}

function getAuthorizationUrl() {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // ensures refresh_token is returned
    prompt: 'consent select_account', // forces consent screen and account selection every time
    scope: SCOPES,
    include_granted_scopes: false
  });
}

async function handleOAuthCallback(code) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Retrieve authorized user profile info
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();

  const grantedScope = tokens.scope || '';
  const hasSendScope = grantedScope.includes('gmail.send') || grantedScope.includes('mail.google.com');

  const accountRecord = {
    id: userInfo.data.id || userInfo.data.email.replace(/[^a-zA-Z0-9_]/g, '_'),
    email: userInfo.data.email,
    name: userInfo.data.name || userInfo.data.email,
    picture: userInfo.data.picture || '',
    hasSendPermission: hasSendScope,
    tokens: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type,
      expiry_date: tokens.expiry_date
    },
    connectedAt: new Date().toISOString()
  };

  await firebaseDb.saveConnectedAccount(accountRecord);

  if (!hasSendScope) {
    throw new Error(`Google authorized ${userInfo.data.email}, but the "Send email on your behalf" permission was NOT checked. Please reconnect and make sure to check that box on Google's permission screen.`);
  }

  return accountRecord;
}

/**
 * Get authenticated Gmail API client with auto-refreshing token
 */
async function getAuthenticatedGmailClient(accountId) {
  const account = await firebaseDb.getConnectedAccountById(accountId);
  if (!account || !account.tokens) {
    throw new Error(`Gmail account [${accountId}] not found or not connected.`);
  }

  // Validate that the account was granted gmail.send scope
  const scopeStr = account.tokens.scope || '';
  const hasSendScope = scopeStr.includes('gmail.send') || scopeStr.includes('mail.google.com');
  if (!hasSendScope) {
    throw new Error(`Account ${account.email} was connected without Gmail sending permissions. When signing in with Google, you MUST check the box "Send email on your behalf". Please reconnect this account and check the box.`);
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials(account.tokens);

  // Check if token expired and refresh if necessary
  const now = Date.now();
  if (account.tokens.expiry_date && account.tokens.expiry_date <= now + 60000) {
    if (!account.tokens.refresh_token) {
      throw new Error(`Access token expired and no refresh token available for ${account.email}. Please reconnect the account.`);
    }

    try {
      const refreshed = await oauth2Client.refreshAccessToken();
      const newTokens = refreshed.credentials;
      await firebaseDb.updateAccountTokens(account.id, {
        ...account.tokens,
        ...newTokens
      });
      oauth2Client.setCredentials(newTokens);
    } catch (refreshErr) {
      throw new Error(`Failed to refresh token for ${account.email}: ${refreshErr.message}. Reconnection required.`);
    }
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  return { gmail, account };
}

function stripHtml(html) {
  return (html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build 100% RFC 5322 compliant base64url encoded MIME message
 * Includes Date, Message-ID, and multipart/alternative (Plaintext + HTML)
 */
function buildRfcMimeMessage({ from, fromName, to, subject, htmlBody, attachments = [] }) {
  return new Promise((resolve, reject) => {
    const formattedFrom = fromName ? `"${fromName.replace(/"/g, '')}" <${from}>` : from;
    const plainText = stripHtml(htmlBody);

    const mail = new MailComposer({
      from: formattedFrom,
      to,
      subject,
      text: plainText,
      html: htmlBody,
      attachments,
      date: new Date()
    });

    mail.compile().build((err, messageBuffer) => {
      if (err) return reject(err);
      const encoded = messageBuffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      resolve(encoded);
    });
  });
}

/**
 * Send single email via Gmail API
 */
async function sendEmailViaGmail({ accountId, to, subject, htmlBody, fromName, attachments = [] }) {
  const { gmail, account } = await getAuthenticatedGmailClient(accountId);

  const raw = await buildRfcMimeMessage({
    from: account.email,
    fromName: fromName || account.name,
    to,
    subject,
    htmlBody,
    attachments
  });

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw }
  });

  console.log(`✉️ Gmail API sent message ID: ${response.data.id} to ${to}`);

  return {
    success: true,
    messageId: response.data.id,
    threadId: response.data.threadId,
    senderEmail: account.email
  };
}

/**
 * Fetch the sender's default signature configured in Gmail Settings
 */
async function getSenderDefaultSignature(accountId) {
  try {
    const { gmail, account } = await getAuthenticatedGmailClient(accountId);
    if (account.signature) return account.signature;

    const res = await gmail.users.settings.sendAs.list({ userId: 'me' });
    const sendAsList = res.data.sendAs || [];
    const alias = sendAsList.find(s => s.sendAsEmail === account.email && s.isPrimary) ||
                  sendAsList.find(s => s.isDefault) ||
                  sendAsList.find(s => s.isPrimary) ||
                  sendAsList[0];
    const signature = alias?.signature || '';
    if (signature) {
      try {
        account.signature = signature;
        await firebaseDb.saveConnectedAccount(account);
      } catch (e) {}
    }
    return signature;
  } catch (err) {
    console.warn('Could not fetch Gmail signature for account:', err.message);
    return '';
  }
}

module.exports = {
  SCOPES,
  getOAuthConfig,
  saveOAuthConfig,
  getAuthorizationUrl,
  handleOAuthCallback,
  getAuthenticatedGmailClient,
  sendEmailViaGmail,
  getSenderDefaultSignature
};
