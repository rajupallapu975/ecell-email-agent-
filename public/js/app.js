// E-Cell Bulk Mail Agent Application State
const state = {
  templates: [],
  selectedTemplateId: null,
  selectedTemplate: null,
  connectedAccounts: [],
  selectedSenderAccountId: null,
  recipients: [],
  keywordMappings: {}, // maps bracket keyword (e.g. 'name') -> column from data
  previewIndex: 0,
  maxPreviewedIndex: 0,
  history: [],
  oauthConfig: {},
  settings: {},
  currentCampaignId: null,
  eventSource: null
};

// Default sample recipients for testing
const SAMPLE_RECIPIENTS = [
  {
    name: "Rahul Verma",
    email: "rahul.verma@example.com",
    company: "Nexus AI",
    organization: "IIT Tech Incubator",
    role: "Founder & CEO",
    track: "AI & Venture DeepTech",
    pass_id: "ESUMMIT-2026-001",
    industry: "Enterprise AI",
    day: "Thursday"
  },
  {
    name: "Priya Sharma",
    email: "priya.sharma@example.com",
    company: "FinFlow Technologies",
    organization: "FinFlow",
    role: "Product Lead",
    track: "Fintech & Web3",
    pass_id: "ESUMMIT-2026-002",
    industry: "Fintech",
    day: "Friday"
  },
  {
    name: "Arjun Nair",
    email: "arjun.nair@example.com",
    company: "GreenGrid Solar",
    organization: "GreenGrid",
    role: "VP Engineering",
    track: "ClimateTech",
    pass_id: "ESUMMIT-2026-003",
    industry: "Clean Energy",
    day: "Thursday"
  },
  {
    name: "Ananya Sen",
    email: "ananya.sen@example.com",
    company: "VenturePulse Capital",
    organization: "VenturePulse",
    role: "Associate Partner",
    track: "Investor Circle",
    pass_id: "ESUMMIT-2026-004",
    industry: "Venture Capital",
    day: "Friday"
  },
  {
    name: "Karthik Rao",
    email: "karthik.rao@example.com",
    company: "QuantBit Labs",
    organization: "QuantBit",
    role: "CTO",
    track: "DeepTech & Robotics",
    pass_id: "ESUMMIT-2026-005",
    industry: "Robotics",
    day: "Thursday"
  }
];

// Document Ready
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initModals();
  initTextSelectionKeywordTool();
  initWorkflowStepper();
  initSenderSelection();
  initTemplateSelection();
  initRecipientManagement();
  initPreviewNavigation();
  initProfileAndOAuth();

  loadTemplates();
  loadConnectedAccounts();
  loadOAuthConfig();
  loadSettings();
  loadHistory();

  // Check URL query parameters for OAuth redirect notifications
  handleOAuthRedirectStatus();
});

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span> <div>${message}</div>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// -------------------------------------------------------------------
// 1. Navigation & Screen Management (4 Core Screens)
// -------------------------------------------------------------------
function initNavigation() {
  const navBtns = document.querySelectorAll('.nav-tab-btn');
  const panes = document.querySelectorAll('.tab-pane');

  function navigateTo(targetId) {
    navBtns.forEach(b => {
      if (b.getAttribute('data-tab') === targetId) b.classList.add('active');
      else b.classList.remove('active');
    });

    panes.forEach(p => {
      if (p.id === targetId) p.classList.add('active');
      else p.classList.remove('active');
    });

    if (targetId === 'historyView') loadHistory();
    if (targetId === 'homeView') updateHomeOverviewStats();
    if (targetId === 'profileView') loadConnectedAccounts();
  }

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      navigateTo(targetId);
    });
  });

  // Brand click -> Home
  document.querySelectorAll('[data-tab-nav]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(el.getAttribute('data-tab-nav'));
    });
  });

  // Top status badge click -> Profile
  document.getElementById('smtpStatusBadge')?.addEventListener('click', () => {
    navigateTo('profileView');
  });

  // "Send Mails" CTA button on Home Screen -> Start Workflow
  document.getElementById('btnStartSendMails')?.addEventListener('click', () => {
    startSendMailsWorkflow();
  });
}

function updateHomeOverviewStats() {
  document.getElementById('homeStatAccounts').textContent = state.connectedAccounts.length;
  document.getElementById('homeStatTemplates').textContent = state.templates.length;
  document.getElementById('homeStatCampaigns').textContent = state.history.length;

  let totalDelivered = 0;
  state.history.forEach(h => {
    totalDelivered += Number(h.sent) || 0;
  });
  document.getElementById('homeStatDelivered').textContent = totalDelivered;

  // Update top status badge
  const dot = document.getElementById('smtpStatusDot');
  const txt = document.getElementById('smtpStatusText');

  if (state.selectedSenderAccountId) {
    const acc = state.connectedAccounts.find(a => a.id === state.selectedSenderAccountId);
    if (acc) {
      dot.className = 'status-dot active';
      txt.textContent = `Sender: ${acc.email}`;
      return;
    }
  }

  if (state.connectedAccounts.length > 0) {
    dot.className = 'status-dot sim';
    txt.textContent = `${state.connectedAccounts.length} Gmails Connected`;
  } else {
    dot.className = 'status-dot';
    txt.textContent = 'Connect Gmail';
  }
}

// -------------------------------------------------------------------
// 2. Send Mails Workflow Stepper Management
// -------------------------------------------------------------------
function startSendMailsWorkflow() {
  const container = document.getElementById('sendMailsWorkflowContainer');
  container.style.display = 'block';
  container.scrollIntoView({ behavior: 'smooth' });

  // If already have connected accounts and none selected, auto-select first
  if (!state.selectedSenderAccountId && state.connectedAccounts.length > 0) {
    selectSenderAccount(state.connectedAccounts[0].id);
  }

  // Go to step 1
  switchWorkflowStep(1);
}

function switchWorkflowStep(stepNumber) {
  // Update stepper UI
  document.querySelectorAll('.step-item').forEach(item => {
    const s = parseInt(item.getAttribute('data-step'));
    item.classList.remove('active', 'completed');
    if (s === stepNumber) item.classList.add('active');
    else if (s < stepNumber) item.classList.add('completed');
  });

  // Hide all step panes
  document.querySelectorAll('.workflow-step-pane').forEach(p => p.style.display = 'none');

  // Show target step pane
  if (stepNumber === 1) document.getElementById('step1SenderPane').style.display = 'block';
  if (stepNumber === 2) {
    document.getElementById('step2TemplatePane').style.display = 'block';
    updateStep2SenderBadge();
  }
  if (stepNumber === 3) {
    document.getElementById('step3RecipientsPane').style.display = 'block';
    renderWorkflowRecipientsTable();
  }
  if (stepNumber === 4) {
    document.getElementById('step4PreviewPane').style.display = 'block';
    state.previewIndex = 0;
    state.maxPreviewedIndex = 0;
    renderIndividualPreview(0);
  }
  if (stepNumber === 5) {
    document.getElementById('step5DispatchPane').style.display = 'block';
  }
}

function initWorkflowStepper() {
  // Cancel / Exit workflow
  document.getElementById('btnExitWorkflow')?.addEventListener('click', () => {
    document.getElementById('sendMailsWorkflowContainer').style.display = 'none';
  });

  // Stepper navigation buttons
  document.getElementById('btnStep1Next')?.addEventListener('click', () => {
    if (!state.selectedSenderAccountId) {
      showToast('Please select a sender Gmail account to proceed.', 'error');
      return;
    }
    const acc = state.connectedAccounts.find(a => a.id === state.selectedSenderAccountId);
    const scopeStr = acc?.tokens?.scope || '';
    const hasSendScope = scopeStr.includes('gmail.send') || scopeStr.includes('mail.google.com') || (acc?.hasSendPermission === true);
    if (!hasSendScope) {
      showToast(`Account [${acc?.email}] is missing Gmail sending permissions. Please click "Connect New Gmail Account" and ensure the checkbox "Send email on your behalf" is checked.`, 'error');
      return;
    }
    switchWorkflowStep(2);
  });

  document.getElementById('btnStep2Back')?.addEventListener('click', () => switchWorkflowStep(1));
  document.getElementById('btnStep2Next')?.addEventListener('click', () => {
    if (!state.selectedTemplate) {
      showToast('Please select an email template.', 'error');
      return;
    }
    const subj = document.getElementById('workflowSubjectInput').value.trim();
    if (!subj) {
      showToast('Please enter an email subject line.', 'error');
      return;
    }
    switchWorkflowStep(3);
  });

  document.getElementById('btnStep3Back')?.addEventListener('click', () => switchWorkflowStep(2));
  document.getElementById('btnStep3Next')?.addEventListener('click', () => {
    if (state.recipients.length === 0) {
      showToast('Please add at least one recipient to the list.', 'error');
      return;
    }
    switchWorkflowStep(4);
  });

  document.getElementById('btnStep4Back')?.addEventListener('click', () => switchWorkflowStep(3));

  // Connect Google account triggers
  document.getElementById('btnConnectGoogleAccount')?.addEventListener('click', initiateGoogleOAuth);
  document.getElementById('btnConnectGoogleAccountPrompt')?.addEventListener('click', initiateGoogleOAuth);
}

// -------------------------------------------------------------------
// 3. Sender Email Selection (Gmail API Connected Accounts)
// -------------------------------------------------------------------
function initSenderSelection() {
  document.getElementById('btnConnectGoogleAccount')?.addEventListener('click', initiateGoogleOAuth);
  document.getElementById('btnConnectGoogleAccountPrompt')?.addEventListener('click', initiateGoogleOAuth);

  function openAppPasswordModal() {
    const modal = document.getElementById('appPasswordModal');
    if (modal) modal.classList.add('active');
  }

  document.getElementById('btnOpenAppPasswordModal')?.addEventListener('click', openAppPasswordModal);
  document.getElementById('btnOpenAppPasswordModalPrompt')?.addEventListener('click', openAppPasswordModal);

  document.getElementById('btnSubmitAppPassword')?.addEventListener('click', async () => {
    const email = document.getElementById('appPassEmail')?.value.trim();
    const name = document.getElementById('appPassName')?.value.trim();
    const appPassword = document.getElementById('appPassPassword')?.value.trim();

    if (!email || !email.includes('@')) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }
    if (!appPassword || appPassword.length < 8) {
      showToast('Please enter your 16-character Google App Password.', 'error');
      return;
    }

    const btn = document.getElementById('btnSubmitAppPassword');
    btn.disabled = true;
    btn.textContent = 'Verifying with Google...';

    try {
      const res = await fetch('/api/accounts/app-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, appPassword, name })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        document.getElementById('appPasswordModal')?.classList.remove('active');
        document.getElementById('appPassEmail').value = '';
        document.getElementById('appPassName').value = '';
        document.getElementById('appPassPassword').value = '';
        await loadConnectedAccounts();
        if (data.account?.id) {
          selectSenderAccount(data.account.id);
        }
      } else {
        showToast(data.message || 'Failed to connect account', 'error');
      }
    } catch (err) {
      showToast('Connection error: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>🚀</span> Verify & Connect Account';
    }
  });
}

async function loadConnectedAccounts() {
  try {
    const res = await fetch('/api/accounts/gmail');
    const data = await res.json();
    if (data.success) {
      state.connectedAccounts = data.accounts || [];
      renderSenderAccountsGrid();
      renderProfileAccountsList();
      updateHomeOverviewStats();

      // If we had a selected account, verify it still exists
      if (state.selectedSenderAccountId) {
        const stillExists = state.connectedAccounts.some(a => a.id === state.selectedSenderAccountId);
        if (!stillExists) state.selectedSenderAccountId = null;
      }

      // Default select first account if none selected
      if (!state.selectedSenderAccountId && state.connectedAccounts.length > 0) {
        selectSenderAccount(state.connectedAccounts[0].id);
      }
    }
  } catch (err) {
    console.error('Error loading connected Gmail accounts:', err);
  }
}

function renderSenderAccountsGrid() {
  const container = document.getElementById('senderAccountsList');
  const noAccounts = document.getElementById('noAccountsWarning');
  const btnNext = document.getElementById('btnStep1Next');
  if (!container) return;

  container.innerHTML = '';

  if (state.connectedAccounts.length === 0) {
    noAccounts.style.display = 'block';
    if (btnNext) btnNext.disabled = true;
    return;
  }

  noAccounts.style.display = 'none';

  state.connectedAccounts.forEach(account => {
    const card = document.createElement('div');
    const scopeStr = account.tokens?.scope || '';
    const hasSendScope = scopeStr.includes('gmail.send') || scopeStr.includes('mail.google.com') || (account.hasSendPermission === true);

    card.className = `sender-account-card ${account.id === state.selectedSenderAccountId ? 'selected' : ''}`;
    if (!hasSendScope) {
      card.style.borderColor = '#fca5a5';
      card.style.background = '#fef2f2';
    }
    card.setAttribute('data-account-id', account.id);

    const avatarHtml = account.picture
      ? `<img src="${account.picture}" class="sender-avatar" alt="${account.name}">`
      : `<div class="sender-avatar">${(account.name || account.email).charAt(0).toUpperCase()}</div>`;

    const scopeBadge = hasSendScope
      ? `<div style="font-size: 11px; color: #166534; font-weight: 600; margin-top: 3px;">✅ Ready to send emails</div>`
      : `<div style="font-size: 11px; color: #dc2626; font-weight: 700; margin-top: 3px;">⚠️ Missing send permission. Click to reconnect & check "Send email on your behalf".</div>`;

    card.innerHTML = `
      ${avatarHtml}
      <div class="sender-info" style="flex: 1;">
        <div class="sender-name">${account.name || 'Gmail User'}</div>
        <div class="sender-email">${account.email}</div>
        ${scopeBadge}
      </div>
      <div class="sender-radio"></div>
    `;

    card.addEventListener('click', () => {
      selectSenderAccount(account.id);
    });

    container.appendChild(card);
  });

  if (btnNext) btnNext.disabled = !state.selectedSenderAccountId;
}

function selectSenderAccount(accountId) {
  state.selectedSenderAccountId = accountId;
  const btnNext = document.getElementById('btnStep1Next');
  if (btnNext) btnNext.disabled = false;

  // Update selection styling
  document.querySelectorAll('.sender-account-card').forEach(c => {
    if (c.getAttribute('data-account-id') === accountId) c.classList.add('selected');
    else c.classList.remove('selected');
  });

  updateStep2SenderBadge();
  updateHomeOverviewStats();
}

function updateStep2SenderBadge() {
  const badge = document.getElementById('step2ActiveSenderBadge');
  const previewSender = document.getElementById('previewSenderAccountText');
  const acc = state.connectedAccounts.find(a => a.id === state.selectedSenderAccountId);

  if (acc) {
    if (badge) badge.innerHTML = `Sender: <strong>${acc.email}</strong> (${acc.name || 'Gmail'})`;
    if (previewSender) previewSender.textContent = `${acc.name ? `"${acc.name}" ` : ''}<${acc.email}>`;
  } else {
    if (badge) badge.innerHTML = `Sender: <strong>None selected</strong>`;
    if (previewSender) previewSender.textContent = `selected@gmail.com`;
  }
}

async function initiateGoogleOAuth() {
  try {
    const res = await fetch('/api/auth/google/url');
    const data = await res.json();
    if (data.success && data.url) {
      window.location.href = data.url;
    } else {
      // Prompt user with the Google Sign-In setup modal
      const modal = document.getElementById('googleOAuthSetupModal');
      if (modal) {
        document.getElementById('modalOauthClientId').value = state.oauthConfig.clientId || '';
        modal.classList.add('active');
      } else {
        document.querySelector('[data-tab="profileView"]')?.click();
      }
    }
  } catch (err) {
    const modal = document.getElementById('googleOAuthSetupModal');
    if (modal) {
      document.getElementById('modalOauthClientId').value = state.oauthConfig.clientId || '';
      modal.classList.add('active');
    } else {
      showToast('Failed to start Google OAuth: ' + err.message, 'error');
    }
  }
}

function handleOAuthRedirectStatus() {
  const params = new URLSearchParams(window.location.search);
  const authStatus = params.get('auth_status');
  const email = params.get('connected_email');
  const errorMsg = params.get('message');

  if (authStatus === 'success') {
    showToast(`Successfully connected Gmail account: ${email || ''}!`, 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
    loadConnectedAccounts();
  } else if (authStatus === 'error') {
    showToast(`OAuth Error: ${errorMsg || 'Failed to authenticate Google account'}`, 'error');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// -------------------------------------------------------------------
// 4. Template Selection & Template Selection Interface Modal
// -------------------------------------------------------------------
function initTemplateSelection() {
  // Click on Selected Template Box opens the Template Selection Interface Modal
  document.getElementById('templateSelectionTriggerBox')?.addEventListener('click', () => {
    openTemplateSelectionModal();
  });

  document.getElementById('btnBrowseTemplates')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openTemplateSelectionModal();
  });
}

function openTemplateSelectionModal() {
  renderModalTemplateGrid();
  document.getElementById('templateSelectionModal')?.classList.add('active');
}

function renderModalTemplateGrid() {
  const grid = document.getElementById('modalTemplateSelectorGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (state.templates.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 30px;">No templates found. Go to the Templates tab to create or upload one.</div>';
    return;
  }

  state.templates.forEach(tpl => {
    const card = document.createElement('div');
    card.className = `template-card ${tpl.id === state.selectedTemplateId ? 'selected-card' : ''}`;

    const tagsHtml = (tpl.variables || []).map(v => `<span class="chip code">{{${v}}}</span>`).join(' ');

    card.innerHTML = `
      <div class="template-card-header">
        <div class="template-card-title">${tpl.name}</div>
        <span class="badge ${tpl.format === 'html' ? 'badge-info' : 'badge-warning'}">${tpl.format.toUpperCase()}</span>
      </div>
      <div class="template-card-desc">${tpl.description || 'Application template ready for outreach.'}</div>
      <div class="template-card-subject"><strong>Default Subject:</strong> ${tpl.subject || 'N/A'}</div>
      <div style="margin-bottom: 14px;">
        <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Variables:</div>
        <div class="chips-container">${tagsHtml || '<span style="font-size:12px;color:#94a3b8;">None</span>'}</div>
      </div>
      <div class="template-card-footer">
        <button class="btn btn-primary btn-sm btn-select-this" data-id="${tpl.id}" style="width: 100%;">
          <span>✓</span> Select This Template
        </button>
      </div>
    `;

    card.querySelector('.btn-select-this').addEventListener('click', () => {
      selectTemplateForWorkflow(tpl.id);
      document.getElementById('templateSelectionModal').classList.remove('active');
    });

    grid.appendChild(card);
  });
}

async function selectTemplateForWorkflow(templateId) {
  state.selectedTemplateId = templateId;

  try {
    const res = await fetch(`/api/templates/${templateId}`);
    const data = await res.json();
    if (data.success) {
      state.selectedTemplate = data.template;

      // Update Selected Template Section Display Box
      const box = document.getElementById('templateSelectionTriggerBox');
      box.classList.add('has-template');

      document.getElementById('selectedTemplateNameDisplay').textContent = data.template.name;
      document.getElementById('selectedTemplateDescDisplay').textContent = data.template.description || 'Selected for outreach';

      const pillsContainer = document.getElementById('selectedTemplateVariablesPills');
      pillsContainer.innerHTML = '';
      (data.template.variables || []).slice(0, 5).forEach(v => {
        const pill = document.createElement('span');
        pill.className = 'chip code';
        pill.textContent = `[${v}]`;
        pillsContainer.appendChild(pill);
      });

      // Update Subject Input with selected template default subject
      const subjInput = document.getElementById('workflowSubjectInput');
      if (subjInput) {
        subjInput.value = data.template.subject || '';
      }

      // Render Variable Tag Chips for Subject
      renderWorkflowSubjectTags(data.template.variables || []);

      // Reset and refresh keyword mappings for Step 3
      state.keywordMappings = {};
      updateKeywordMappingUI();
      renderWorkflowRecipientsTable();

      // Enable Step 2 Next button
      document.getElementById('btnStep2Next').disabled = false;
    }
  } catch (err) {
    console.error('Error selecting template:', err);
  }
}

function renderWorkflowSubjectTags(variables) {
  const container = document.getElementById('workflowSubjectTags');
  if (!container) return;
  container.innerHTML = '';

  variables.forEach(v => {
    const chip = document.createElement('span');
    chip.className = 'chip code';
    chip.textContent = `[${v}]`;
    chip.title = 'Click to insert bracket keyword into subject line';
    chip.addEventListener('click', () => {
      const input = document.getElementById('workflowSubjectInput');
      input.value += ` [${v}]`;
    });
    container.appendChild(chip);
  });
}

// -------------------------------------------------------------------
// 5. Recipient List Management (Step 3)
// -------------------------------------------------------------------
function initRecipientManagement() {
  // Source tabs switching (Outside, In-App, Associated)
  document.querySelectorAll('.source-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.source-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const source = btn.getAttribute('data-source');
      document.querySelectorAll('.source-subpane').forEach(p => p.style.display = 'none');

      if (source === 'outside') document.getElementById('sourceOutsidePane').style.display = 'block';
      if (source === 'inapp') document.getElementById('sourceInAppPane').style.display = 'block';
      if (source === 'associated') document.getElementById('sourceAssociatedPane').style.display = 'block';
    });
  });

  // Dropzone for Outside CSV / Excel upload
  setupFileDropzone(
    document.getElementById('workflowRecipientDropzone'),
    document.getElementById('workflowRecipientFileInput'),
    handleWorkflowRecipientUpload
  );

  // Manual email input
  document.getElementById('btnAddManualEmail')?.addEventListener('click', () => {
    const input = document.getElementById('workflowManualEmailInput');
    const raw = input.value.trim();
    if (!raw) return;

    const items = raw.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    const added = [];
    items.forEach(item => {
      if (item.includes('@')) {
        added.push({ email: item, name: item.split('@')[0], organization: 'Manual Entry' });
      }
    });

    if (added.length > 0) {
      appendRecipients(added);
      input.value = '';
      showToast(`Added ${added.length} recipient(s)!`, 'success');
    } else {
      showToast('Please enter valid email addresses.', 'error');
    }
  });

  // Load 5 Sample Contacts
  document.getElementById('btnLoad5SampleWorkflow')?.addEventListener('click', () => {
    appendRecipients(SAMPLE_RECIPIENTS);
    showToast('Loaded 5 sample contacts for outreach testing!', 'success');
  });

  // Import In-App Registered Emails
  document.getElementById('btnImportInAppRecipients')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/recipients/in-app');
      const data = await res.json();
      if (data.success && data.recipients && data.recipients.length > 0) {
        appendRecipients(data.recipients);
        showToast(`Imported ${data.recipients.length} in-app contacts!`, 'success');
      } else {
        showToast('No in-app recipients available to import.', 'info');
      }
    } catch (e) {
      showToast('Error importing in-app recipients: ' + e.message, 'error');
    }
  });

  // Associated Filter
  document.getElementById('btnApplyAssociationFilter')?.addEventListener('click', () => {
    const query = document.getElementById('associationFilterInput').value.trim().toLowerCase();
    if (!query) {
      showToast('Please enter a domain or association term (e.g. ecell.org)', 'error');
      return;
    }

    const matched = state.recipients.filter(r => {
      const email = (r.email || '').toLowerCase();
      const org = (r.organization || r.company || '').toLowerCase();
      return email.includes(query) || org.includes(query);
    });

    if (matched.length > 0) {
      state.recipients = matched;
      renderWorkflowRecipientsTable();
      showToast(`Filtered down to ${matched.length} associated contacts.`, 'info');
    } else {
      showToast(`No recipients found associated with "${query}".`, 'warning');
    }
  });

  // Clear recipients
  document.getElementById('btnClearWorkflowRecipients')?.addEventListener('click', () => {
    state.recipients = [];
    state.keywordMappings = {};
    renderWorkflowRecipientsTable();
    showToast('Recipient list cleared.', 'info');
  });

  // Auto-map keywords to columns by index or name
  document.getElementById('btnAutoMapByIndex')?.addEventListener('click', () => {
    autoMapKeywordsByIndex();
  });

  document.getElementById('btnAutoMapByName')?.addEventListener('click', () => {
    autoMapKeywordsByName();
  });
}

async function handleWorkflowRecipientUpload(file) {
  const formData = new FormData();
  formData.append('recipientFile', file);

  showToast(`Parsing recipient spreadsheet: ${file.name}...`, 'info');

  try {
    const res = await fetch('/api/recipients/parse', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      appendRecipients(data.allRecipients);
      showToast(`Successfully added ${data.totalRows} recipients from ${file.name}!`, 'success');
    } else {
      showToast(data.message || 'Failed to parse file', 'error');
    }
  } catch (err) {
    showToast('Upload error: ' + err.message, 'error');
  }
}

function appendRecipients(newItems) {
  const existingEmails = new Set(state.recipients.map(r => (r.email || '').toLowerCase().trim()));
  const toAdd = [];

  newItems.forEach(rawItem => {
    const keys = Object.keys(rawItem);
    // Find email column title with case-insensitive / partial match
    let emailCol = keys.find(k => {
      const lower = k.trim().toLowerCase();
      return lower === 'email' || lower === 'e-mail' || lower === 'mail' || lower.includes('email') || lower.includes('mail');
    });
    // Fallback: check values for '@' symbol
    if (!emailCol) {
      emailCol = keys.find(k => String(rawItem[k] || '').includes('@'));
    }

    const email = emailCol ? String(rawItem[emailCol] || '').trim() : '';

    if (email && email.includes('@') && !existingEmails.has(email.toLowerCase())) {
      existingEmails.add(email.toLowerCase());
      
      const item = { ...rawItem };
      item.email = email;

      // Extract Name
      const nameCol = keys.find(k => {
        const lower = k.trim().toLowerCase();
        return (lower === 'name' || lower === 'full name' || lower === 'fullname' || lower === 'student name' || lower === 'candidate name') && !lower.includes('email');
      });
      if (nameCol && rawItem[nameCol]) {
        item.name = String(rawItem[nameCol]).trim();
        item.Name = item.name;
      } else if (!item.name && item.Name) {
        item.name = String(item.Name).trim();
      }

      toAdd.push(item);
    }
  });

  state.recipients = state.recipients.concat(toAdd);
  renderWorkflowRecipientsTable();
  updateKeywordMappingUI();
}

// Helper to intelligently detect the best column for a keyword based on semantic column titles
function findBestColumnForKeyword(keyword, columns, sampleRow = {}) {
  if (!keyword || !columns || columns.length === 0) return '';

  const normKey = keyword.toLowerCase().trim().replace(/[^a-z0-9]/g, '');

  // Helper: check if a column represents an email address
  function isEmailCol(col) {
    const cLower = col.toLowerCase().trim();
    if (cLower === 'email' || cLower === 'e-mail' || cLower === 'mail' || cLower.includes('email') || cLower.includes('mail_id') || cLower.includes('mail id')) return true;
    if (sampleRow[col] && String(sampleRow[col]).includes('@')) return true;
    return false;
  }

  // If keyword itself is asking for email
  if (normKey.includes('email') || normKey === 'mail' || normKey.includes('mailid')) {
    const emailCol = columns.find(c => isEmailCol(c));
    return emailCol || '';
  }

  // Strictly filter out email columns for non-email keywords
  const candidateCols = columns.filter(c => !isEmailCol(c));
  if (candidateCols.length === 0) return '';

  // 1. Exact match (ignoring spaces, underscores, casing)
  const exact = candidateCols.find(c => c.toLowerCase().trim().replace(/[^a-z0-9]/g, '') === normKey);
  if (exact) return exact;

  // 2. Semantic dictionary matches
  const semanticGroups = {
    name: ['name', 'fullname', 'studentname', 'candidatename', 'first', 'firstname', 'participant', 'person', 'contactname', 'user'],
    department: ['department', 'dept', 'branch', 'stream', 'domain', 'division', 'faculty'],
    college: ['college', 'university', 'campus', 'institute', 'institution', 'school', 'academy'],
    company: ['company', 'organization', 'org', 'firm', 'workplace', 'employer', 'agency'],
    role: ['role', 'designation', 'position', 'title', 'post', 'job'],
    pass_id: ['passid', 'pass', 'ticket', 'ticketid', 'rollno', 'roll', 'regno', 'registration', 'id', 'studentid'],
    date: ['date', 'time', 'day', 'eventdate', 'slot'],
    phone: ['phone', 'mobile', 'cell', 'whatsapp', 'contactno']
  };

  for (const [group, patterns] of Object.entries(semanticGroups)) {
    const keywordMatchesGroup = patterns.some(p => normKey.includes(p) || p.includes(normKey));
    if (keywordMatchesGroup) {
      const matchedCol = candidateCols.find(col => {
        const cNorm = col.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        return patterns.some(p => cNorm.includes(p) || p.includes(cNorm));
      });
      if (matchedCol) return matchedCol;
    }
  }

  // 3. Substring match
  const substringCol = candidateCols.find(col => {
    const cNorm = col.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    return cNorm.includes(normKey) || normKey.includes(cNorm);
  });
  if (substringCol) return substringCol;

  // No match in CSV titles
  return '';
}

// Helper to extract the resolved value of a specific keyword for a recipient
function getRecipientKeywordValue(r, keyword) {
  if (!r) return '-';
  const keyLower = keyword.toLowerCase().trim();

  // 0. Row-specific custom edits override everything
  if (r._customFields && r._customFields[keyword] !== undefined && String(r._customFields[keyword]).trim() !== '') {
    return String(r._customFields[keyword]).trim();
  }
  const customKey = r._customFields && Object.keys(r._customFields).find(k => k.trim().toLowerCase() === keyLower);
  if (customKey && r._customFields[customKey] !== undefined && String(r._customFields[customKey]).trim() !== '') {
    return String(r._customFields[customKey]).trim();
  }

  // 1. Check explicit user mapping (e.g. keywordMappings['department_name'] = 'Department')
  const mappedCol = state.keywordMappings ? state.keywordMappings[keyword] : undefined;
  if (mappedCol !== undefined && mappedCol !== '') {
    if (r[mappedCol] !== undefined && r[mappedCol] !== null && String(r[mappedCol]).trim() !== '') {
      return String(r[mappedCol]).trim();
    }
  }

  // If explicitly unmapped, return '-'
  if (mappedCol === '') {
    return '-';
  }

  // 2. Direct exact property on recipient object
  if (r[keyword] !== undefined && r[keyword] !== null && String(r[keyword]).trim() !== '' && String(r[keyword]).trim() !== '-') {
    return String(r[keyword]).trim();
  }

  // 3. Case-insensitive property match (preventing email leakage)
  const isEmailKeyword = keyLower.includes('email') || keyLower === 'mail';
  const directKey = Object.keys(r).find(k => k.trim().toLowerCase() === keyLower);
  if (directKey && r[directKey] !== undefined && r[directKey] !== null && String(r[directKey]).trim() !== '') {
    if (!isEmailKeyword && (directKey.toLowerCase().includes('email') || String(r[directKey]).includes('@'))) {
      // Don't leak email
    } else {
      return String(r[directKey]).trim();
    }
  }

  // 4. Semantic aliases
  if (keyLower === 'name' && (r.name || r.Name)) return String(r.name || r.Name).trim();
  if ((keyLower === 'department' || keyLower === 'department_name' || keyLower === 'dept') && (r.department || r.Department || r.dept || r.Dept || r.Branch || r.branch)) {
    return String(r.department || r.Department || r.dept || r.Dept || r.Branch || r.branch).trim();
  }
  if ((keyLower === 'college' || keyLower === 'university' || keyLower === 'institution') && (r.college || r.College || r.university || r.University)) {
    return String(r.college || r.College || r.university || r.University).trim();
  }
  if ((keyLower === 'organization' || keyLower === 'company' || keyLower === 'org') && (r.organization || r.company || r.Company)) {
    return String(r.organization || r.company || r.Company).trim();
  }
  if ((keyLower === 'role' || keyLower === 'designation') && (r.role || r.Role || r.designation)) {
    return String(r.role || r.Role || r.designation).trim();
  }
  if ((keyLower === 'pass_id' || keyLower === 'ticket' || keyLower === 'roll_no') && (r.pass_id || r.ticket || r.roll_no)) {
    return String(r.pass_id || r.ticket || r.roll_no).trim();
  }
  if (keyLower === 'date' && (r.date || r.Date)) {
    return String(r.date || r.Date).trim();
  }

  return '-';
}

function renderWorkflowRecipientsTable() {
  const tbody = document.getElementById('workflowRecipientsBody');
  const countDisplay = document.getElementById('workflowRecipientCount');
  const completeListCount = document.getElementById('completeListCount');
  const btnNext = document.getElementById('btnStep3Next');
  const headerRow = document.getElementById('workflowRecipientsHeader');

  const count = state.recipients.length;
  if (countDisplay) countDisplay.textContent = `${count} Total Recipients`;
  if (completeListCount) completeListCount.textContent = count;
  if (btnNext) btnNext.disabled = (count === 0);

  if (!tbody) return;

  const templateVars = state.selectedTemplate?.variables || [];

  // Dynamically update Table Headers to show Keywords (Keyword 1, Keyword 2, etc.)
  if (headerRow) {
    if (templateVars.length > 0) {
      let headerHtml = '<th>#</th><th>Email</th>';
      templateVars.forEach((v, vIdx) => {
        headerHtml += `
          <th>
            <div style="font-weight: 700; color: #1e40af; font-size: 13px;">[${v}]</div>
            <div style="font-size: 11px; color: #64748b; font-weight: 500;">Keyword #${vIdx + 1}</div>
          </th>`;
      });
      headerHtml += '<th>Action</th>';
      headerRow.innerHTML = headerHtml;
    } else {
      headerRow.innerHTML = `
        <th>#</th>
        <th>Email</th>
        <th>Name</th>
        <th>Organization</th>
        <th>Action</th>`;
    }
  }

  const colSpan = templateVars.length > 0 ? templateVars.length + 3 : 5;

  if (count === 0) {
    tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align: center; color: var(--text-muted); padding: 24px;">No recipients entered yet. Use Outside Upload, In-App import, or manual entry.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  state.recipients.slice(0, 100).forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.title = 'Click ✏️ Edit or double-click row to modify recipient details';
    const isModified = r._customFields && Object.keys(r._customFields).length > 0;
    const modifiedBadge = isModified ? `<span style="background: #dbeafe; color: #1e40af; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">Edited</span>` : '';
    let cellsHtml = `<td>${idx + 1}</td><td><span style="color: var(--primary); font-weight: 600;">${r.email}</span>${modifiedBadge}</td>`;

    if (templateVars.length > 0) {
      templateVars.forEach(v => {
        const val = getRecipientKeywordValue(r, v);
        cellsHtml += `<td>${val}</td>`;
      });
    } else {
      const name = r.name || r.Name || '-';
      const org = r.organization || r.company || r.Company || '-';
      cellsHtml += `<td>${name}</td><td>${org}</td>`;
    }

    cellsHtml += `
      <td style="white-space: nowrap;">
        <button type="button" class="btn btn-outline btn-sm btn-edit-recipient" data-idx="${idx}" title="Edit recipient keywords and details" style="color: var(--primary); border-color: #93c5fd; padding: 3px 8px; margin-right: 6px; font-weight: 600; font-size: 11px;">✏️ Edit</button>
        <button type="button" class="btn btn-outline btn-sm btn-remove-row" data-idx="${idx}" title="Remove recipient" style="color: var(--danger); padding: 3px 8px; font-size: 11px;">✕</button>
      </td>
    `;
    tr.innerHTML = cellsHtml;

    tr.addEventListener('dblclick', () => {
      openEditRecipientModal(idx);
    });

    tr.querySelector('.btn-edit-recipient').addEventListener('click', (e) => {
      e.stopPropagation();
      const editIndex = parseInt(e.currentTarget.getAttribute('data-idx'));
      openEditRecipientModal(editIndex);
    });

    tr.querySelector('.btn-remove-row').addEventListener('click', (e) => {
      e.stopPropagation();
      const removeIndex = parseInt(e.currentTarget.getAttribute('data-idx'));
      state.recipients.splice(removeIndex, 1);
      renderWorkflowRecipientsTable();
    });

    tbody.appendChild(tr);
  });

  if (count > 100) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="${colSpan}" style="text-align: center; color: var(--text-muted); font-style: italic;">Showing first 100 of ${count} recipients...</td>`;
    tbody.appendChild(tr);
  }

  // Refresh Keyword & Index Mapping whenever recipients table changes
  updateKeywordMappingUI();
}

// -------------------------------------------------------------------
// 5.1 Edit Particular Recipient (Mail & Template Keywords 1, 2, ...)
// -------------------------------------------------------------------
function openEditRecipientModal(index) {
  const r = state.recipients[index];
  if (!r) return;

  document.getElementById('editRecipientIndexInput').value = index;
  document.getElementById('editRecipientIndexBadge').textContent = `#${index + 1}`;
  document.getElementById('editRecipEmail').value = r.email || '';

  const templateVars = state.selectedTemplate?.variables || [];
  const dynamicContainer = document.getElementById('editRecipDynamicKeywordsContainer');
  if (dynamicContainer) {
    dynamicContainer.innerHTML = '';
    if (templateVars.length > 0) {
      templateVars.forEach((v, vIdx) => {
        const val = getRecipientKeywordValue(r, v);
        const displayVal = val === '-' ? '' : val;
        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'form-group';
        fieldDiv.style.marginBottom = '10px';
        fieldDiv.innerHTML = `
          <label class="form-label" style="font-weight: 700; font-size: 13px; color: #1e40af; margin-bottom: 3px;">
            Keyword #${vIdx + 1}: [${v}]
          </label>
          <input type="text" class="form-control edit-recip-keyword-input" data-var="${v}" value="${displayVal}" placeholder="Enter value for [${v}]" style="font-size: 13px;">
        `;
        dynamicContainer.appendChild(fieldDiv);
      });
    } else {
      // Fallback if template has no keywords
      dynamicContainer.innerHTML = `
        <div class="form-group" style="margin-bottom: 10px;">
          <label class="form-label" style="font-weight: 700; font-size: 13px;">Recipient Name</label>
          <input type="text" class="form-control edit-recip-keyword-input" data-var="name" value="${r.name || r.Name || ''}" placeholder="Full Name" style="font-size: 13px;">
        </div>
        <div class="form-group" style="margin-bottom: 10px;">
          <label class="form-label" style="font-weight: 700; font-size: 13px;">Organization / College</label>
          <input type="text" class="form-control edit-recip-keyword-input" data-var="organization" value="${r.organization || r.company || r.Company || ''}" placeholder="e.g. E-Cell, Startup Inc" style="font-size: 13px;">
        </div>
      `;
    }
  }

  document.getElementById('editRecipientModal').classList.add('active');
}

function saveRecipientEdit() {
  const index = parseInt(document.getElementById('editRecipientIndexInput').value);
  if (isNaN(index) || !state.recipients[index]) return;

  const email = document.getElementById('editRecipEmail').value.trim();
  if (!email || !email.includes('@')) {
    showToast('Please enter a valid email address.', 'error');
    return;
  }

  const r = state.recipients[index];

  // 1. Update email on both r.email and any imported spreadsheet email column keys
  r.email = email;
  Object.keys(r).forEach(k => {
    const kLower = k.toLowerCase().trim();
    if (kLower === 'email' || kLower === 'e-mail' || kLower === 'mail' || kLower.includes('email') || kLower.includes('mail')) {
      r[k] = email;
    }
  });

  // Track explicit row custom edits
  if (!r._customFields) r._customFields = {};
  r._customFields.email = email;

  // 2. Save all keyword values to r[v], r[mappedCol], and r._customFields
  document.querySelectorAll('.edit-recip-keyword-input').forEach(input => {
    const v = input.getAttribute('data-var');
    const val = input.value.trim();
    if (v) {
      r[v] = val;
      r._customFields[v] = val;

      // Also update the mapped column if one was matched from the spreadsheet
      const mappedCol = state.keywordMappings ? state.keywordMappings[v] : null;
      if (mappedCol && mappedCol !== v) {
        r[mappedCol] = val;
        r._customFields[mappedCol] = val;
      }

      if (v.toLowerCase() === 'name') {
        r.name = val;
        r.Name = val;
        r._customFields.name = val;
        r._customFields.Name = val;
      }
      if (v.toLowerCase() === 'organization' || v.toLowerCase() === 'company' || v.toLowerCase() === 'org') {
        r.organization = val;
        r.company = val;
        r.Company = val;
        r.Organization = val;
        r._customFields.organization = val;
        r._customFields.company = val;
      }
    }
  });

  // Reset any cached customBody/customSubject on this recipient so fresh preview & send use the new values
  delete r.customBody;
  delete r.customSubject;

  document.getElementById('editRecipientModal').classList.remove('active');
  renderWorkflowRecipientsTable();

  // If in step 4 preview, update preview immediately
  const step4Pane = document.getElementById('step4PreviewPane');
  if (step4Pane && step4Pane.style.display !== 'none') {
    renderIndividualPreview(state.previewIndex);
  }

  showToast(`Updated details for #${index + 1} (${email})`, 'success');
}

// Keyword-to-Column Index & Name Mapping (As Requested)
function updateKeywordMappingUI() {
  const card = document.getElementById('keywordMappingCard');
  const grid = document.getElementById('keywordMappingGrid');
  if (!card || !grid) return;

  const templateVars = state.selectedTemplate?.variables || [];
  if (templateVars.length === 0 || state.recipients.length === 0) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  grid.innerHTML = '';

  const sampleRow = state.recipients[0] || {};
  const columns = Object.keys(sampleRow);

  templateVars.forEach((v, vIdx) => {
    const item = document.createElement('div');
    item.style = 'background: #ffffff; border: 1px solid var(--border); border-radius: 6px; padding: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);';

    // Current mapped value or smart title-based default
    let currentMapped = state.keywordMappings[v];
    if (currentMapped === undefined) {
      currentMapped = findBestColumnForKeyword(v, columns, sampleRow);
      state.keywordMappings[v] = currentMapped;
    }

    let optionsHtml = `<option value="" ${currentMapped === '' ? 'selected' : ''}>-- Not in CSV (No match / fill in preview) --</option>`;
    columns.forEach((col, cIdx) => {
      const selected = (col === currentMapped) ? 'selected' : '';
      const sampleVal = sampleRow[col] ? ` (e.g. "${sampleRow[col]}")` : '';
      optionsHtml += `<option value="${col}" ${selected}>Index ${cIdx}: "${col}"${sampleVal}</option>`;
    });

    item.innerHTML = `
      <div style="font-weight: 700; font-size: 12px; color: var(--primary); margin-bottom: 4px;">
        Keyword #${vIdx + 1}: <code>[${v}]</code>
      </div>
      <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">Fills from column:</div>
      <select class="form-select keyword-map-select" data-var="${v}" style="font-size: 12px; padding: 4px 8px;">
        ${optionsHtml}
      </select>
    `;

    item.querySelector('.keyword-map-select').addEventListener('change', (e) => {
      state.keywordMappings[v] = e.target.value;
      renderWorkflowRecipientsTable();
      showToast(`Mapped [${v}] to column "${e.target.value || 'None'}"`, 'info');
    });

    grid.appendChild(item);
  });
}

function autoMapKeywordsByIndex() {
  const templateVars = state.selectedTemplate?.variables || [];
  if (state.recipients.length === 0) {
    showToast('Add recipients first to map columns', 'warning');
    return;
  }
  const sampleRow = state.recipients[0] || {};
  const columns = Object.keys(sampleRow);

  // Filter candidate columns to prevent mapping email columns to non-email keywords
  templateVars.forEach((v, idx) => {
    const isEmail = v.toLowerCase().includes('email') || v.toLowerCase() === 'mail';
    const candidateCols = isEmail
      ? columns
      : columns.filter(c => !c.toLowerCase().includes('email') && !c.toLowerCase().includes('mail') && !(sampleRow[c] && String(sampleRow[c]).includes('@')));

    if (candidateCols[idx] !== undefined) {
      state.keywordMappings[v] = candidateCols[idx];
    } else {
      state.keywordMappings[v] = '';
    }
  });

  updateKeywordMappingUI();
  renderWorkflowRecipientsTable();
  showToast('⚡ Auto-mapped keywords to columns safely by index order!', 'success');
}

function autoMapKeywordsByName() {
  const templateVars = state.selectedTemplate?.variables || [];
  if (state.recipients.length === 0) {
    showToast('Add recipients first to map columns', 'warning');
    return;
  }
  const sampleRow = state.recipients[0] || {};
  const columns = Object.keys(sampleRow);

  templateVars.forEach((v) => {
    state.keywordMappings[v] = findBestColumnForKeyword(v, columns, sampleRow);
  });

  updateKeywordMappingUI();
  renderWorkflowRecipientsTable();
  showToast('🏷️ Auto-mapped keywords to columns by matching titles and names!', 'success');
}

// -------------------------------------------------------------------
// 6. Email Preview and Swipe-Style Navigation (Step 4)
// -------------------------------------------------------------------
function initPreviewNavigation() {
  // Swipe Next Button
  document.getElementById('btnSwipeNext')?.addEventListener('click', () => {
    if (state.previewIndex < state.recipients.length - 1) {
      state.previewIndex++;
      if (state.previewIndex > state.maxPreviewedIndex) {
        state.maxPreviewedIndex = state.previewIndex;
      }
      renderIndividualPreview(state.previewIndex);
    }
  });

  // Swipe Prev Button
  document.getElementById('btnSwipePrev')?.addEventListener('click', () => {
    if (state.previewIndex > 0) {
      state.previewIndex--;
      renderIndividualPreview(state.previewIndex);
    }
  });

  // Direct Subject Input Live Editing
  const subjectInput = document.getElementById('swipeSubjectInput');
  subjectInput?.addEventListener('input', (e) => {
    const currentRecipient = state.recipients[state.previewIndex];
    if (currentRecipient) {
      currentRecipient.customSubject = e.target.value;
      const badge = document.getElementById('previewEditScopeBadge');
      if (badge) {
        badge.textContent = '✏️ Modified (Save for this recipient or apply to all)';
        badge.style.display = 'inline-flex';
        badge.style.background = '#fef3c7';
        badge.style.color = '#92400e';
        badge.style.borderColor = '#fde68a';
      }
    }
  });

  // Apply to Current Recipient Only
  document.getElementById('btnApplyToCurrentRecipient')?.addEventListener('click', () => {
    const currentRecipient = state.recipients[state.previewIndex];
    if (!currentRecipient) return;

    const subjectInput = document.getElementById('swipeSubjectInput');
    if (subjectInput) {
      currentRecipient.customSubject = subjectInput.value;
    }

    const iframe = document.getElementById('swipeIframe');
    const doc = iframe ? (iframe.contentDocument || iframe.contentWindow?.document) : null;
    if (doc && doc.body) {
      currentRecipient.customBody = doc.body.innerHTML;
    }

    const badge = document.getElementById('previewEditScopeBadge');
    if (badge) {
      badge.textContent = `👤 Applied to this recipient only (${currentRecipient.email})`;
      badge.style.display = 'inline-flex';
      badge.style.background = '#e0e7ff';
      badge.style.color = '#3730a3';
      badge.style.borderColor = '#c7d2fe';
    }
    showToast(`✓ Applied changes only to ${currentRecipient.email}!`, 'success');
  });

  // Apply to ALL Recipients (Updates the whole template body/subject for this outreach)
  document.getElementById('btnApplyToAllRecipients')?.addEventListener('click', async () => {
    const currentRecipient = state.recipients[state.previewIndex];
    if (!currentRecipient || !state.selectedTemplate) return;

    const subjectInput = document.getElementById('swipeSubjectInput');
    const editedSubject = subjectInput ? subjectInput.value : '';

    const iframe = document.getElementById('swipeIframe');
    const doc = iframe ? (iframe.contentDocument || iframe.contentWindow?.document) : null;
    const editedBody = (doc && doc.body) ? doc.body.innerHTML : '';

    if (!editedBody) {
      showToast('No content to apply', 'warning');
      return;
    }

    // Generalize the edited body by replacing current recipient's personal keyword values with bracket tags [tag]
    let generalizedBody = editedBody;
    let generalizedSubject = editedSubject;

    const templateVars = state.selectedTemplate.variables || [];
    templateVars.forEach(v => {
      const val = getRecipientKeywordValue(currentRecipient, v);
      if (val && val !== '-' && val.length > 1) {
        const safeVal = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        generalizedBody = generalizedBody.replace(new RegExp(safeVal, 'g'), `[${v}]`);
        generalizedSubject = generalizedSubject.replace(new RegExp(safeVal, 'g'), `[${v}]`);
      }
    });

    // Also generalize standard fields (name, email)
    if (currentRecipient.name && currentRecipient.name.length > 1) {
      const safeName = currentRecipient.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      generalizedBody = generalizedBody.replace(new RegExp(safeName, 'g'), '[name]');
      generalizedSubject = generalizedSubject.replace(new RegExp(safeName, 'g'), '[name]');
    }
    if (currentRecipient.email && currentRecipient.email.length > 3) {
      const safeEmail = currentRecipient.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      generalizedBody = generalizedBody.replace(new RegExp(safeEmail, 'g'), '[email]');
      generalizedSubject = generalizedSubject.replace(new RegExp(safeEmail, 'g'), '[email]');
    }

    // Strip attached signature block so it remains dynamic and not baked into the template body
    generalizedBody = generalizedBody.replace(/<!-- EMAIL_SIGNATURE_START -->[\s\S]*?<!-- EMAIL_SIGNATURE_END -->\s*/g, '').trim();

    // Update campaign base template in memory
    state.selectedTemplate.content = generalizedBody;
    state.selectedTemplate.subject = generalizedSubject;
    const wfSubject = document.getElementById('workflowSubjectInput');
    if (wfSubject) wfSubject.value = generalizedSubject;

    // Persist permanently to backend template storage
    try {
      const saveRes = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: state.selectedTemplate.id,
          name: state.selectedTemplate.name,
          subject: generalizedSubject,
          content: generalizedBody,
          format: state.selectedTemplate.format || 'html',
          headerConfig: state.selectedTemplate.headerConfig || null
        })
      });
      const saveData = await saveRes.json();
      if (saveData.success && saveData.template) {
        state.selectedTemplate = saveData.template;
        loadTemplates(); // sync in background
      }
    } catch (saveErr) {
      console.warn('Could not auto-persist template to server:', saveErr);
    }

    // Clear individual custom overrides so all recipients inherit the new template wording
    state.recipients.forEach(r => {
      delete r.customBody;
      delete r.customSubject;
    });

    const badge = document.getElementById('previewEditScopeBadge');
    if (badge) {
      badge.textContent = `🌐 Saved & Applied to ALL ${state.recipients.length} recipients`;
      badge.style.display = 'inline-flex';
      badge.style.background = '#dcfce7';
      badge.style.color = '#166534';
      badge.style.borderColor = '#bbf7d0';
    }

    showToast(`✓ Template updated & saved for ALL ${state.recipients.length} recipients!`, 'success');

    // Re-render current preview with updated template
    await renderIndividualPreview(state.previewIndex);
  });

  // Step 4 Signature Toggle change listener
  document.getElementById('step4SignatureToggle')?.addEventListener('change', () => {
    const cur = state.recipients[state.previewIndex];
    if (cur && cur.customBody) {
      delete cur.customBody;
    }
    renderIndividualPreview(state.previewIndex);
  });

  // Launch Send Mails Final Action
  document.getElementById('btnLaunchSendMailsFinal')?.addEventListener('click', launchSendMailsFinal);

  document.getElementById('btnStartNewCampaign')?.addEventListener('click', () => {
    switchWorkflowStep(1);
    document.getElementById('wfCompletedActions').style.display = 'none';
  });

  document.getElementById('btnViewSentHistory')?.addEventListener('click', () => {
    document.querySelector('[data-tab="historyView"]')?.click();
  });
}

// Renders an editable body document inside swipeIframe so the user can click and edit any word or text
function renderIframeEditableContent(htmlContent, recipient) {
  const iframe = document.getElementById('swipeIframe');
  if (!iframe) return;

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          margin: 0;
          padding: 24px;
          color: #1e293b;
          font-size: 14px;
          line-height: 1.6;
          cursor: text;
          outline: none;
          min-height: 90vh;
          box-sizing: border-box;
        }
        body:focus {
          outline: none;
        }
      </style>
    </head>
    <body contenteditable="true" spellcheck="true" title="Click anywhere to edit any word or text directly">
      ${htmlContent}
    </body>
    </html>
  `);
  doc.close();

  // Listen for user edits and update state + badge
  doc.body.addEventListener('input', () => {
    recipient.customBody = doc.body.innerHTML;
    const badge = document.getElementById('previewEditScopeBadge');
    if (badge) {
      badge.textContent = '✏️ Modified (Save for this recipient or apply to all)';
      badge.style.display = 'inline-flex';
      badge.style.background = '#fef3c7';
      badge.style.color = '#92400e';
      badge.style.borderColor = '#fde68a';
    }
  });
}

async function renderIndividualPreview(index) {
  if (state.recipients.length === 0) return;

  const total = state.recipients.length;
  const currentRecipient = state.recipients[index];
  state.previewIndex = index;
  if (index > state.maxPreviewedIndex) state.maxPreviewedIndex = index;

  // Update counter & displays
  document.getElementById('swipeCurrentIndex').textContent = index + 1;
  document.getElementById('swipeTotalCount').textContent = total;
  document.getElementById('swipeRecipientEmailDisplay').textContent = currentRecipient.email;

  // Prev / Next button states
  const btnPrev = document.getElementById('btnSwipePrev');
  const btnNext = document.getElementById('btnSwipeNext');
  const btnConfirm = document.getElementById('btnLaunchSendMailsFinal');

  if (btnPrev) btnPrev.disabled = (index === 0);

  // If on the last recipient, show the Confirm & Send Mails button!
  if (index === total - 1) {
    if (btnNext) {
      btnNext.textContent = 'All Previewed ✓';
      btnNext.disabled = true;
    }
    if (btnConfirm) btnConfirm.style.display = 'inline-flex';
  } else {
    if (btnNext) {
      btnNext.textContent = `Next Recipient (${index + 2}/${total}) ▶`;
      btnNext.disabled = false;
    }
    if (btnConfirm) {
      btnConfirm.style.display = (state.maxPreviewedIndex >= total - 1) ? 'inline-flex' : 'none';
    }
  }

  const subjectInput = document.getElementById('swipeSubjectInput');
  const scopeBadge = document.getElementById('previewEditScopeBadge');

  function updateCustomizedBadge() {
    const isCustomized = Boolean(
      (currentRecipient.customSubject !== undefined && currentRecipient.customSubject !== null) ||
      (currentRecipient.customBody !== undefined && currentRecipient.customBody !== null)
    );
    if (scopeBadge) {
      if (isCustomized) {
        scopeBadge.textContent = '👤 This recipient only';
        scopeBadge.style.display = 'inline-flex';
        scopeBadge.style.background = '#e0e7ff';
        scopeBadge.style.color = '#3730a3';
        scopeBadge.style.borderColor = '#c7d2fe';
      } else {
        scopeBadge.style.display = 'none';
      }
    }
  }

  // 1. If recipient already has customBody or customSubject from previous direct editing:
  if (currentRecipient.customSubject !== undefined && subjectInput) {
    subjectInput.value = currentRecipient.customSubject;
  }

  if (currentRecipient.customBody !== undefined) {
    renderIframeEditableContent(currentRecipient.customBody, currentRecipient);
    updateCustomizedBadge();
    return;
  }

  // 2. Fetch fresh personalized preview via preview API
  const baseSubject = document.getElementById('workflowSubjectInput') ? document.getElementById('workflowSubjectInput').value : '';

  try {
    const res = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: state.selectedTemplate?.id,
        templateContent: state.selectedTemplate?.content,
        subject: baseSubject,
        recipient: currentRecipient,
        mappings: state.keywordMappings || {},
        senderAccountId: state.selectedSenderAccountId,
        includeSignature: document.getElementById('step4SignatureToggle')?.checked ?? true
      })
    });
    const data = await res.json();
    if (data.success) {
      if (currentRecipient.customSubject === undefined && subjectInput) {
        subjectInput.value = data.subject;
      }
      let bodyToRender = data.body;
      if (data.format === 'txt') {
        bodyToRender = `<div style="font-family: monospace; white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: #1e293b;">${escapeHtml(data.body)}</div>`;
      }
      renderIframeEditableContent(bodyToRender, currentRecipient);
      updateCustomizedBadge();
    }
  } catch (err) {
    console.error('Preview error:', err);
  }
}

// -------------------------------------------------------------------
// 7. Final Dispatch via Selected Gmail Account
// -------------------------------------------------------------------
async function launchSendMailsFinal() {
  if (!state.selectedSenderAccountId) {
    showToast('Please select a sender Gmail account!', 'error');
    switchWorkflowStep(1);
    return;
  }

  if (!state.selectedTemplate) {
    showToast('Please select an email template!', 'error');
    switchWorkflowStep(2);
    return;
  }

  if (state.recipients.length === 0) {
    showToast('No recipients to send to!', 'error');
    switchWorkflowStep(3);
    return;
  }

  const senderAcc = state.connectedAccounts.find(a => a.id === state.selectedSenderAccountId);
  const senderEmail = senderAcc ? senderAcc.email : 'Selected Account';
  const subject = document.getElementById('workflowSubjectInput').value.trim();

  const confirmMsg = `Ready to dispatch emails to all ${state.recipients.length} recipients?\n\nFrom: ${senderEmail}\nTemplate: ${state.selectedTemplate.name}`;
  if (!confirm(confirmMsg)) return;

  // Switch to Step 5 (Dispatch & Live Progress)
  switchWorkflowStep(5);

  document.getElementById('wfStatTotal').textContent = state.recipients.length;
  document.getElementById('wfStatSent').textContent = '0';
  document.getElementById('wfStatFailed').textContent = '0';
  document.getElementById('wfStatPercentage').textContent = '0%';
  document.getElementById('wfProgressBarFill').style.width = '0%';
  document.getElementById('wfProgressTitle').textContent = `Sending via ${senderEmail}...`;
  document.getElementById('wfProgressSub').textContent = `Gmail API Dispatch in progress`;
  document.getElementById('wfCompletedActions').style.display = 'none';

  // Reset text error status box
  const errBox = document.getElementById('wfErrorStatusBox');
  const errText = document.getElementById('wfErrorStatusText');
  if (errBox) errBox.style.display = 'none';
  if (errText) errText.textContent = '';

  try {
    const res = await fetch('/api/campaign/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderAccountId: state.selectedSenderAccountId,
        templateId: state.selectedTemplate.id,
        templateContent: state.selectedTemplate.content,
        subject,
        recipients: state.recipients,
        format: state.selectedTemplate.format,
        mappings: state.keywordMappings || {},
        senderAccountId: state.selectedSenderAccountId,
        includeSignature: document.getElementById('step4SignatureToggle')?.checked ?? true
      })
    });
    const data = await res.json();
    if (data.success) {
      state.currentCampaignId = data.campaignId;
      connectToWorkflowStream(data.campaignId);
    } else {
      if (errBox && errText) {
        errBox.style.display = 'block';
        errText.textContent = `error: ${data.message || 'Dispatch failed to start'}`;
      }
      showToast(data.message || 'Dispatch failed to start', 'error');
    }
  } catch (err) {
    if (errBox && errText) {
      errBox.style.display = 'block';
      errText.textContent = `error: ${err.message}`;
    }
    showToast('Dispatch error: ' + err.message, 'error');
  }
}

function connectToWorkflowStream(campaignId) {
  if (state.eventSource) state.eventSource.close();

  const es = new EventSource(`/api/campaign/stream/${campaignId}`);
  state.eventSource = es;

  const errBox = document.getElementById('wfErrorStatusBox');
  const errText = document.getElementById('wfErrorStatusText');

  es.addEventListener('log', (e) => {
    const log = JSON.parse(e.data);
    // Only display errors in clean text format
    if (log.type === 'error' && errBox && errText) {
      errBox.style.display = 'block';
      const existing = errText.textContent ? errText.textContent + '\n' : '';
      errText.textContent = `${existing}error: ${log.text}`;
    }
  });

  es.addEventListener('progress', (e) => {
    const progress = JSON.parse(e.data);
    document.getElementById('wfStatSent').textContent = progress.sent;
    document.getElementById('wfStatFailed').textContent = progress.failed;

    const percent = Math.round((progress.current / progress.total) * 100);
    document.getElementById('wfStatPercentage').textContent = `${percent}%`;
    document.getElementById('wfProgressBarFill').style.width = `${percent}%`;
    document.getElementById('wfProgressTitle').textContent = `Sending: ${progress.current} of ${progress.total}`;
  });

  es.addEventListener('completed', (e) => {
    const result = JSON.parse(e.data);
    es.close();
    state.eventSource = null;

    if (result.failed > 0) {
      document.getElementById('wfProgressTitle').textContent = `⚠️ Dispatch Finished with Errors`;
      document.getElementById('wfProgressSub').textContent = `Total: ${result.total} | Sent: ${result.sent} | Failed: ${result.failed}`;
      if (errBox && errText && !errText.textContent) {
        errBox.style.display = 'block';
        errText.textContent = `error: ${result.failed} email(s) failed during dispatch. Please verify your Gmail API credentials or recipient addresses.`;
      }
    } else {
      document.getElementById('wfProgressTitle').textContent = `✅ All Mails Sent Successfully!`;
      document.getElementById('wfProgressSub').textContent = `Total: ${result.total} | Sent: ${result.sent} | Failed: 0`;
    }

    document.getElementById('wfProgressBarFill').style.width = '100%';
    document.getElementById('wfCompletedActions').style.display = 'block';

    showToast(`Campaign completed! ${result.sent} sent via Gmail API.`, 'success');
    loadHistory();
    updateHomeOverviewStats();
  });

  es.onerror = (err) => {
    console.error('SSE connection error:', err);
    if (errBox && errText && !errText.textContent) {
      errBox.style.display = 'block';
      errText.textContent = 'error: Connection interrupted during live status updates.';
    }
  };
}

async function cancelActiveCampaign() {
  if (!state.currentCampaignId) return;
  if (!confirm('Are you sure you want to stop the current email dispatch?')) return;

  try {
    const res = await fetch(`/api/campaign/cancel/${state.currentCampaignId}`, { method: 'POST' });
    const data = await res.json();
    showToast(data.message, 'info');
  } catch (e) {
    showToast('Failed to cancel: ' + e.message, 'error');
  }
}

// -------------------------------------------------------------------
// 8. Profile Screen & Google OAuth 2.0 Management
// -------------------------------------------------------------------
function initProfileAndOAuth() {
  // Modal: Save & Launch Google OAuth
  document.getElementById('btnSaveAndLaunchGoogleOAuth')?.addEventListener('click', async () => {
    const clientId = document.getElementById('modalOauthClientId').value.trim();
    const clientSecret = document.getElementById('modalOauthClientSecret').value.trim();

    if (!clientId || !clientSecret) {
      showToast('Please enter both Google Client ID and Client Secret.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/auth/google/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret })
      });
      const data = await res.json();
      if (data.success) {
        showToast('OAuth credentials saved! Redirecting to Google Sign-In...', 'info');
        document.getElementById('googleOAuthSetupModal')?.classList.remove('active');
        await loadOAuthConfig();
        // Trigger Google OAuth authorization redirect
        const urlRes = await fetch('/api/auth/google/url');
        const urlData = await urlRes.json();
        if (urlData.success && urlData.url) {
          window.location.href = urlData.url;
        }
      }
    } catch (err) {
      showToast('Error saving OAuth config: ' + err.message, 'error');
    }
  });

  // Firebase Service Account Upload
  document.getElementById('btnUploadServiceAccount')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('firebaseServiceAccountFileInput');
    if (!fileInput.files || fileInput.files.length === 0) {
      showToast('Please select a serviceAccountKey.json file.', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('serviceAccountFile', fileInput.files[0]);

    try {
      const res = await fetch('/api/firebase/config', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        showToast('Firebase Admin initialized with project: ' + data.projectId, 'success');
        checkFirebaseStatus();
      } else {
        showToast(data.message || 'Firebase initialization failed', 'error');
      }
    } catch (err) {
      showToast('Upload error: ' + err.message, 'error');
    }
  });

  document.getElementById('btnSaveProfile')?.addEventListener('click', async () => {
    // 1. Save Profile info
    const profileData = {
      fromName: document.getElementById('profileFromName').value.trim(),
      organization: document.getElementById('profileOrganization').value.trim(),
      role: document.getElementById('profileRole').value.trim(),
      fromEmail: document.getElementById('profileFromEmail').value.trim(),
      replyTo: document.getElementById('profileReplyTo').value.trim(),
      includeSignature: Boolean(document.getElementById('profileIncludeSignatureToggle')?.checked)
    };

    // 2. Save Google OAuth Client credentials
    const oauthData = {
      clientId: document.getElementById('oauthClientId').value.trim(),
      clientSecret: document.getElementById('oauthClientSecret').value.trim()
    };

    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData)
      });

      if (oauthData.clientId) {
        await fetch('/api/auth/google/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(oauthData)
        });
      }

      showToast('Profile and OAuth credentials saved!', 'success');
      loadSettings();
      loadOAuthConfig();
    } catch (err) {
      showToast('Error saving profile: ' + err.message, 'error');
    }
  });

  // Handle sync default signature from Gmail
  document.getElementById('btnSyncGmailSignature')?.addEventListener('click', async () => {
    showToast('Syncing signature from sender Gmail...', 'info');
    await loadProfileSignaturePreview();
    showToast('Signature synced from Gmail!', 'success');
  });

  checkFirebaseStatus();
}

async function checkFirebaseStatus() {
  try {
    const res = await fetch('/api/firebase/status');
    const data = await res.json();
    const badge = document.getElementById('firebaseStatusBadge');
    if (badge) {
      if (data.active) {
        badge.className = 'badge badge-success';
        badge.textContent = '🔥 Cloud Firestore Connected';
      } else {
        badge.className = 'badge badge-info';
        badge.textContent = '📁 Local Datastore Active';
      }
    }
  } catch (e) {}
}

async function loadOAuthConfig() {
  try {
    const res = await fetch('/api/auth/google/config');
    const data = await res.json();
    if (data.success) {
      state.oauthConfig = data;
      const cidInput = document.getElementById('oauthClientId');
      const csecInput = document.getElementById('oauthClientSecret');
      if (cidInput) cidInput.value = data.clientId || '';
      if (csecInput && data.hasSecret) csecInput.placeholder = '•••••••••••• (Secret Configured)';
    }
  } catch (e) {}
}

function renderProfileAccountsList() {
  const container = document.getElementById('profileConnectedAccountsList');
  if (!container) return;
  container.innerHTML = '';

  if (state.connectedAccounts.length === 0) {
    container.innerHTML = '<div style="font-size: 12px; color: var(--text-muted);">No accounts connected. Use the Send Mails workflow or click Connect above.</div>';
    return;
  }

  state.connectedAccounts.forEach(acc => {
    const row = document.createElement('div');
    row.style = 'display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f8fafc; border: 1px solid var(--border); border-radius: 6px;';
    const scopeStr = acc.tokens?.scope || '';
    const hasSendScope = scopeStr.includes('gmail.send') || scopeStr.includes('mail.google.com') || (acc.hasSendPermission === true);
    const scopeText = hasSendScope
      ? `<span style="color: #166534; font-weight: 600;">• ✅ Ready to send</span>`
      : `<span style="color: #dc2626; font-weight: 700;">• ⚠️ Missing send scope (Reconnect & check "Send email on your behalf")</span>`;

    row.innerHTML = `
      <div>
        <div style="font-weight: 600; font-size: 13px; color: #0f172a;">${acc.email}</div>
        <div style="font-size: 11px; color: var(--text-muted);">${acc.name || 'Gmail Account'} • Connected: ${new Date(acc.connectedAt).toLocaleDateString()} ${scopeText}</div>
      </div>
      <button class="btn btn-outline btn-sm btn-disconnect" data-id="${acc.id}" style="color: var(--danger); font-size: 11px; padding: 4px 8px;">
        Disconnect
      </button>
    `;

    row.querySelector('.btn-disconnect').addEventListener('click', async () => {
      if (!confirm(`Disconnect Gmail account ${acc.email}?`)) return;
      try {
        const res = await fetch(`/api/accounts/gmail/${acc.id}`, { method: 'DELETE' });
        const d = await res.json();
        if (d.success) {
          showToast(`Disconnected ${acc.email}`, 'info');
          loadConnectedAccounts();
        }
      } catch (e) {
        showToast('Failed to disconnect: ' + e.message, 'error');
      }
    });

    container.appendChild(row);
  });
}

// -------------------------------------------------------------------
// 9. Templates & History Loading & Global Helpers
// -------------------------------------------------------------------
async function loadTemplates() {
  try {
    const res = await fetch('/api/templates');
    const data = await res.json();
    if (data.success) {
      state.templates = data.templates;
      renderTemplateCards();
      updateHomeOverviewStats();

      // If nothing selected, pick first template
      if (!state.selectedTemplateId && state.templates.length > 0) {
        selectTemplateForWorkflow(state.templates[0].id);
      }
    }
  } catch (e) {
    console.error('Error loading templates:', e);
  }
}

function renderTemplateCards() {
  const container = document.getElementById('templatesContainer');
  if (!container) return;
  container.innerHTML = '';

  state.templates.forEach(tpl => {
    const card = document.createElement('div');
    card.className = 'template-card';

    const tagsHtml = (tpl.variables || []).map(v => `<span class="chip code">{{${v}}}</span>`).join(' ');

    card.innerHTML = `
      <div class="template-card-header">
        <div class="template-card-title">${tpl.name}</div>
        <span class="badge ${tpl.format === 'html' ? 'badge-info' : 'badge-warning'}">${tpl.format.toUpperCase()}</span>
      </div>
      <div class="template-card-desc">${tpl.description || 'Application template ready for outreach.'}</div>
      <div class="template-card-subject"><strong>Subject:</strong> ${tpl.subject || 'N/A'}</div>
      <div style="margin-bottom: 14px;">
        <div style="font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Variables:</div>
        <div class="chips-container">${tagsHtml || '<span style="font-size:12px;color:#94a3b8;">None</span>'}</div>
      </div>
      <div class="template-card-footer">
        <button class="btn btn-outline btn-sm btn-use" data-id="${tpl.id}">
          <span>🚀</span> Use in Send Mails
        </button>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-outline btn-sm btn-edit" data-id="${tpl.id}" title="Edit Template">✏️</button>
          <button class="btn btn-outline btn-sm btn-del" data-id="${tpl.id}" title="Delete" style="color:var(--danger);">🗑️</button>
        </div>
      </div>
    `;

    card.querySelector('.btn-use').addEventListener('click', () => {
      selectTemplateForWorkflow(tpl.id);
      document.querySelector('[data-tab="homeView"]').click();
      startSendMailsWorkflow();
      switchWorkflowStep(2);
    });

    card.querySelector('.btn-edit').addEventListener('click', () => editTemplate(tpl.id));
    card.querySelector('.btn-del').addEventListener('click', () => confirmDeleteTemplate(tpl.id));

    container.appendChild(card);
  });
}

async function editTemplate(id) {
  try {
    const res = await fetch(`/api/templates/${id}`);
    const data = await res.json();
    if (data.success) {
      const t = data.template;
      if (document.getElementById('editorModalTitle')) document.getElementById('editorModalTitle').textContent = 'Edit Email Template';
      if (document.getElementById('editTemplateId')) document.getElementById('editTemplateId').value = t.id;
      if (document.getElementById('editTemplateName')) document.getElementById('editTemplateName').value = t.name;
      if (document.getElementById('editTemplateSubject')) document.getElementById('editTemplateSubject').value = t.subject || '';
      if (document.getElementById('editTemplateDesc')) document.getElementById('editTemplateDesc').value = t.description || '';
      if (document.getElementById('editTemplateFormat')) document.getElementById('editTemplateFormat').value = t.format || 'html';

      let bodyText = t.content || '';

      // Determine header banner config
      if (t.headerConfig && (t.headerConfig.title || t.headerConfig.subtitle)) {
        if (document.getElementById('editHeaderToggle')) document.getElementById('editHeaderToggle').checked = Boolean(t.headerConfig.enabled);
        if (document.getElementById('editHeaderTitle')) document.getElementById('editHeaderTitle').value = t.headerConfig.title || '';
        if (document.getElementById('editHeaderSubtitle')) document.getElementById('editHeaderSubtitle').value = t.headerConfig.subtitle || '';
      } else if (bodyText.includes('<!-- EMAIL_HEADER_START -->')) {
        const titleMatch = bodyText.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
        const subMatch = bodyText.match(/<!-- EMAIL_HEADER_START -->[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<!-- EMAIL_HEADER_END -->/i);
        if (document.getElementById('editHeaderToggle')) document.getElementById('editHeaderToggle').checked = true;
        if (document.getElementById('editHeaderTitle')) document.getElementById('editHeaderTitle').value = titleMatch ? titleMatch[1].trim() : '';
        if (document.getElementById('editHeaderSubtitle')) document.getElementById('editHeaderSubtitle').value = subMatch ? subMatch[1].trim() : '';
      } else {
        if (document.getElementById('editHeaderToggle')) document.getElementById('editHeaderToggle').checked = false;
        if (document.getElementById('editHeaderTitle')) document.getElementById('editHeaderTitle').value = '';
        if (document.getElementById('editHeaderSubtitle')) document.getElementById('editHeaderSubtitle').value = '';
      }

      // Strip header comment block from the editable body text
      bodyText = bodyText.replace(/<!-- EMAIL_HEADER_START -->[\s\S]*?<!-- EMAIL_HEADER_END -->\s*/g, '');

      // Convert HTML body into natural plain text with paragraphs for the editor textarea
      let displayBody = bodyText;
      if (bodyText.includes('<p>') || bodyText.includes('<br>') || bodyText.includes('<div')) {
        displayBody = bodyText
          .replace(/<\/?div[^>]*>/gi, '')
          .replace(/<p[^>]*>/gi, '')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<br\s*[\/]?>/gi, '\n')
          .replace(/<strong>(.*?)<\/strong>/gi, '$1')
          .replace(/<b>(.*?)<\/b>/gi, '$1')
          .replace(/<em>(.*?)<\/em>/gi, '$1')
          .replace(/<i>(.*?)<\/i>/gi, '$1')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }

      if (document.getElementById('editTemplateContent')) {
        document.getElementById('editTemplateContent').value = displayBody || bodyText;
      }

      // Populate active template keywords
      state.activeTemplateKeywords = new Set(t.variables || []);
      const kwMatches = ((t.content || '') + ' ' + (t.subject || '')).matchAll(/(\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\[\s*([a-zA-Z0-9_]+)\s*\])/g);
      for (const m of kwMatches) {
        const k = m[2] || m[3];
        if (k) state.activeTemplateKeywords.add(k);
      }
      renderSelectedKeywordChips();
      document.getElementById('templateEditorModal').classList.add('active');
    } else {
      showToast(data.message || 'Template not found', 'error');
    }
  } catch (e) {
    console.error('editTemplate error:', e);
    showToast('Failed to load template for edit: ' + e.message, 'error');
  }
}

async function confirmDeleteTemplate(id) {
  if (!confirm('Are you sure you want to delete this template?')) return;
  try {
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Template deleted', 'success');
      if (state.selectedTemplateId === id) {
        state.selectedTemplateId = null;
        state.selectedTemplate = null;
      }
      loadTemplates();
    }
  } catch (e) {
    showToast('Delete error: ' + e.message, 'error');
  }
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.success) {
      state.settings = data.settings;
      const s = data.settings;
      if (document.getElementById('profileFromName')) document.getElementById('profileFromName').value = s.fromName || '';
      if (document.getElementById('profileOrganization')) document.getElementById('profileOrganization').value = s.organization || '';
      if (document.getElementById('profileRole')) document.getElementById('profileRole').value = s.role || '';
      if (document.getElementById('profileFromEmail')) document.getElementById('profileFromEmail').value = s.fromEmail || '';
      if (document.getElementById('profileReplyTo')) document.getElementById('profileReplyTo').value = s.replyTo || '';
      if (document.getElementById('profileIncludeSignatureToggle')) document.getElementById('profileIncludeSignatureToggle').checked = (s.includeSignature !== false);
      if (document.getElementById('step4SignatureToggle')) document.getElementById('step4SignatureToggle').checked = (s.includeSignature !== false);

      const heading = s.fromName || 'E-Cell Outreach Team';
      const org = s.organization || 'Entrepreneurship Cell';
      const email = s.fromEmail || 'team@ecell.org';
      const role = s.role || 'Outreach Lead';

      if (document.getElementById('profileDisplayHeading')) document.getElementById('profileDisplayHeading').textContent = heading;
      if (document.getElementById('profileDisplaySub')) document.getElementById('profileDisplaySub').textContent = `${org} • ${email}`;
      if (document.getElementById('profileBadgeRole')) document.getElementById('profileBadgeRole').textContent = role;

      const initials = heading.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'EC';
      if (document.getElementById('profileAvatarCircle')) document.getElementById('profileAvatarCircle').textContent = initials;
      loadProfileSignaturePreview();
    }
  } catch (e) {}
}

async function loadProfileSignaturePreview() {
  const container = document.getElementById('profileSignatureHtmlPreview');
  if (!container) return;
  const accountId = state.selectedSenderAccountId || (state.connectedAccounts && state.connectedAccounts[0]?.id);
  if (!accountId) {
    container.innerHTML = '<span style="color:#64748b; font-size:13px; font-style:italic;">Connect a sender Gmail account in Step 1 or Profile to sync your default signature.</span>';
    return;
  }
  try {
    const res = await fetch(`/api/accounts/${accountId}/signature`);
    const data = await res.json();
    if (data.success && data.signature) {
      container.innerHTML = data.signature;
    } else {
      container.innerHTML = '<span style="color:#64748b; font-size:13px; font-style:italic;">No signature found in Gmail settings for this sender account.</span>';
    }
  } catch (e) {
    container.innerHTML = '<span style="color:#ef4444; font-size:13px;">Error loading signature from Gmail.</span>';
  }
}

async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    if (data.success) {
      state.history = data.history || [];
      renderHistoryTable(state.history);
      updateHomeOverviewStats();
    }
  } catch (e) {}
}

function renderHistoryTable(history) {
  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;

  if (!history || history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 30px;">No campaigns sent yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  history.forEach(item => {
    const tr = document.createElement('tr');
    const dateStr = new Date(item.createdAt).toLocaleString();
    tr.innerHTML = `
      <td>${dateStr}</td>
      <td><code>${item.id}</code></td>
      <td><strong>${item.templateName}</strong></td>
      <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${item.subject}</td>
      <td><strong>${item.total}</strong></td>
      <td><span class="badge badge-success">${item.sent}</span></td>
      <td><span class="badge ${item.failed > 0 ? 'badge-danger' : 'badge-info'}">${item.failed}</span></td>
      <td><span class="badge badge-info">${item.provider}</span></td>
      <td>
        <button class="btn btn-outline btn-sm btn-report" data-id="${item.id}">View Log</button>
      </td>
    `;

    tr.querySelector('.btn-report').addEventListener('click', () => showCampaignReport(item));
    tbody.appendChild(tr);
  });
}

function showCampaignReport(item) {
  document.getElementById('reportModalTitle').textContent = `Report: ${item.templateName} (${item.id})`;
  document.getElementById('reportTotal').textContent = item.total;
  document.getElementById('reportSent').textContent = item.sent;
  document.getElementById('reportFailed').textContent = item.failed;

  const tbody = document.getElementById('reportDetailBody');
  tbody.innerHTML = '';

  (item.results || []).forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${r.email}</strong> ${r.name ? `(${r.name})` : ''}</td>
      <td><span class="badge ${r.status === 'sent' ? 'badge-success' : 'badge-danger'}">${r.status.toUpperCase()}</span></td>
      <td style="font-size: 12px;">${r.subject || '-'}</td>
      <td style="font-size: 12px; color: ${r.status === 'sent' ? 'var(--text-muted)' : 'var(--danger)'};">${r.error || 'Delivered'}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('campaignReportModal').classList.add('active');
}

function setupFileDropzone(dropzoneEl, inputEl, handler) {
  if (!dropzoneEl || !inputEl) return;

  ['dragenter', 'dragover'].forEach(name => {
    dropzoneEl.addEventListener(name, (e) => {
      e.preventDefault();
      dropzoneEl.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzoneEl.addEventListener(name, (e) => {
      e.preventDefault();
      dropzoneEl.classList.remove('dragover');
    });
  });

  dropzoneEl.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) handler(files[0]);
  });

  inputEl.addEventListener('change', () => {
    if (inputEl.files.length > 0) handler(inputEl.files[0]);
  });
}

function initModals() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close-modal');
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.remove('active');
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  });

  document.getElementById('btnOpenCreateModal')?.addEventListener('click', () => {
    document.getElementById('editorModalTitle').textContent = 'Create Email Template';
    document.getElementById('editTemplateId').value = '';
    document.getElementById('editTemplateName').value = '';
    document.getElementById('editTemplateSubject').value = 'Welcome to E-Summit. Congratulations on your selection, [name]';
    
    // Reset Header Banner Inputs
    if (document.getElementById('editHeaderToggle')) document.getElementById('editHeaderToggle').checked = true;
    if (document.getElementById('editHeaderTitle')) document.getElementById('editHeaderTitle').value = '🚀 Welcome to E-Summit 2026';
    if (document.getElementById('editHeaderSubtitle')) document.getElementById('editHeaderSubtitle').value = 'Official Invitation for [name]';

    state.activeTemplateKeywords = new Set(['name', 'college', 'pass_id']);
    document.getElementById('editTemplateContent').value = getDefaultTemplateBodyText();
    renderSelectedKeywordChips();
    document.getElementById('templateEditorModal').classList.add('active');
  });

  // Custom Keyword Inserter ([keyword])
  function handleAddCustomKeyword() {
    const input = document.getElementById('customKeywordInput');
    const val = input.value.trim().replace(/[\[\]\{\}\s]/g, '');
    if (!val) {
      showToast('Please type a keyword name first', 'warning');
      return;
    }
    const keywordTag = `[${val}]`;
    if (!state.activeTemplateKeywords) state.activeTemplateKeywords = new Set();
    state.activeTemplateKeywords.add(val);

    insertTagIntoEditor(keywordTag);
    renderSelectedKeywordChips();

    input.value = '';
    showToast(`Added and inserted ${keywordTag}!`, 'info');
  }

  document.getElementById('btnInsertCustomBracket')?.addEventListener('click', handleAddCustomKeyword);
  document.getElementById('customKeywordInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCustomKeyword();
    }
  });

  document.getElementById('btnOpenUploadModal')?.addEventListener('click', () => {
    document.getElementById('uploadModalName').value = '';
    document.getElementById('uploadModalSubject').value = '';
    document.getElementById('uploadModalFile').value = '';
    document.getElementById('templateUploadModal').classList.add('active');
  });

  document.getElementById('btnConfirmUploadTemplate')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('uploadModalFile');
    if (!fileInput.files || fileInput.files.length === 0) {
      showToast('Please select a file to upload.', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('templateFile', fileInput.files[0]);
    formData.append('name', document.getElementById('uploadModalName').value.trim());
    formData.append('subject', document.getElementById('uploadModalSubject').value.trim());

    try {
      const res = await fetch('/api/templates/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        showToast('Template uploaded successfully!', 'success');
        document.getElementById('templateUploadModal').classList.remove('active');
        await loadTemplates();
        if (data.template && data.template.id) {
          selectTemplateForWorkflow(data.template.id);
        }
      } else {
        showToast(data.message || 'Upload failed', 'error');
      }
    } catch (e) {
      showToast('Error uploading template: ' + e.message, 'error');
    }
  });

  document.getElementById('btnSaveTemplateEditor')?.addEventListener('click', async () => {
    const id = document.getElementById('editTemplateId').value;
    const name = document.getElementById('editTemplateName').value.trim();
    const subject = document.getElementById('editTemplateSubject').value.trim();
    const includeHeader = document.getElementById('editHeaderToggle')?.checked;
    const headerTitle = document.getElementById('editHeaderTitle')?.value.trim();
    const headerSubtitle = document.getElementById('editHeaderSubtitle')?.value.trim();
    const rawContent = document.getElementById('editTemplateContent').value.trim();

    if (!name) {
      showToast('Please enter a template name.', 'error');
      return;
    }
    if (!rawContent) {
      showToast('Please enter the email message.', 'error');
      return;
    }

    // Clean body of any existing header comments
    let cleanBody = rawContent
      .replace(/<!-- EMAIL_HEADER_START -->[\s\S]*?<!-- EMAIL_HEADER_END -->\s*/g, '')
      .trim();

    // If cleanBody is plain text without HTML paragraph tags, convert newlines to proper HTML paragraphs
    let bodyHtml = cleanBody;
    if (!cleanBody.includes('<p>') && !cleanBody.includes('<div') && !cleanBody.includes('<table')) {
      const paragraphs = cleanBody.split(/\r?\n\r?\n+/);
      const paragraphsHtml = paragraphs
        .map(p => `<p>${p.trim().replace(/\r?\n/g, '<br>')}</p>`)
        .join('\n');
      bodyHtml = `<div style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 15px; color: #1e293b; line-height: 1.6; padding: 10px;">\n${paragraphsHtml}\n</div>`;
    }

    // Build header block if enabled
    let finalHtml = bodyHtml;
    if (includeHeader && headerTitle) {
      const headerBlock = `<!-- EMAIL_HEADER_START -->
<div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; padding: 25px 20px; text-align: center; border-radius: 8px 8px 0 0; margin-bottom: 20px;">
  <h2 style="margin: 0; font-size: 22px; font-weight: 700;">${headerTitle}</h2>
  ${headerSubtitle ? `<p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">${headerSubtitle}</p>` : ''}
</div>
<!-- EMAIL_HEADER_END -->`;
      finalHtml = `${headerBlock}\n\n${bodyHtml}`;
    }

    const headerConfig = {
      enabled: Boolean(includeHeader),
      title: headerTitle || '',
      subtitle: headerSubtitle || ''
    };

    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: id || undefined,
          name,
          subject: subject || 'Notice for [name]',
          format: 'html',
          content: finalHtml,
          headerConfig
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Template saved successfully!', 'success');
        document.getElementById('templateEditorModal').classList.remove('active');
        await loadTemplates();

        // If this template is the one currently selected in workflow, or if no template is selected yet:
        if (state.selectedTemplateId === data.template.id || !state.selectedTemplateId) {
          selectTemplateForWorkflow(data.template.id);
        }
      } else {
        showToast(data.message || 'Error saving template', 'error');
      }
    } catch (e) {
      showToast('Save error: ' + e.message, 'error');
    }
  });

  document.getElementById('btnClearHistoryBtn')?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear all campaign history logs?')) return;
    try {
      const res = await fetch('/api/history', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('All campaign history cleared!', 'success');
        loadHistory();
      }
    } catch (e) {
      showToast('Error clearing history: ' + e.message, 'error');
    }
  });

  // Recipient Edit Modal Event Listeners
  document.getElementById('btnSaveEditRecipient')?.addEventListener('click', saveRecipientEdit);
  ['editRecipEmail', 'editRecipName', 'editRecipOrg'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveRecipientEdit();
      }
    });
  });
  document.getElementById('btnEditCurrentPreviewRecipient')?.addEventListener('click', () => {
    openEditRecipientModal(state.previewIndex);
  });
}

function insertTagIntoEditor(tag) {
  const textarea = document.getElementById('editTemplateContent');
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  textarea.value = text.substring(0, start) + tag + text.substring(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + tag.length;
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

function getDefaultTemplateBodyText() {
  return `Dear [name],

Congratulations! We are delighted to inform you that you have been selected for the upcoming Workshop representing [college].

Your attendee pass ID is: [pass_id].

Please confirm your attendance by replying directly to this email.

Warm regards,
Organizing Committee`;
}

// -------------------------------------------------------------------
// 10. Text Selection Keyword Converter & Live Detector
// -------------------------------------------------------------------
function initTextSelectionKeywordTool() {
  const textarea = document.getElementById('editTemplateContent');
  const popup = document.getElementById('selectionKeywordPopup');
  const popupText = document.getElementById('popupSelectedTextDisplay');
  const btnPopupTurn = document.getElementById('btnPopupTurnKeyword');
  const btnClosePopup = document.getElementById('btnCloseSelectionPopup');
  
  const inlinePrompt = document.getElementById('inlineKeywordPrompt');
  const inlineInput = document.getElementById('inlineKeywordNameInput');
  const inlineReplaceAll = document.getElementById('inlineReplaceAllOccurrences');
  const btnApplyInline = document.getElementById('btnApplyInlineKeyword');
  const btnCancelInline = document.getElementById('btnCancelInlineKeyword');

  if (!textarea || !popup) return;

  function hideAllSelectionPopups() {
    if (popup) popup.style.display = 'none';
    if (inlinePrompt) inlinePrompt.style.display = 'none';
  }

  function handleSelection() {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) {
      hideAllSelectionPopups();
      return;
    }

    const selected = textarea.value.substring(start, end).trim();
    if (!selected || selected.length > 60 || (selected.startsWith('[') && selected.endsWith(']'))) {
      hideAllSelectionPopups();
      return;
    }

    state.currentSelection = {
      text: selected,
      start: start,
      end: end
    };

    if (popupText) popupText.textContent = selected;
    if (popup) popup.style.display = 'flex';
    if (inlinePrompt) inlinePrompt.style.display = 'none';
  }

  textarea.addEventListener('mouseup', handleSelection);
  textarea.addEventListener('keyup', handleSelection);
  textarea.addEventListener('select', handleSelection);

  btnClosePopup?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideAllSelectionPopups();
  });

  btnCancelInline?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideAllSelectionPopups();
  });

  btnPopupTurn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!state.currentSelection?.text) return;

    if (popup) popup.style.display = 'none';
    if (inlinePrompt) inlinePrompt.style.display = 'flex';

    // Guess sensible default keyword name based on selected text
    const txt = state.currentSelection.text;
    let guess = 'name';
    if (/college|university|institute|school|campus/i.test(txt)) {
      guess = 'college';
    } else if (/department|dept|branch|division/i.test(txt)) {
      guess = 'department_name';
    } else if (/company|inc|ltd|corp|tech|solutions/i.test(txt)) {
      guess = 'company';
    } else if (/pass|ticket|id|roll|code|token|number/i.test(txt) || /^[A-Z0-9_-]{3,}$/.test(txt)) {
      guess = 'pass_id';
    } else if (/date|day|time|month|year/i.test(txt)) {
      guess = 'date';
    } else if (/role|lead|head|manager|director|founder/i.test(txt)) {
      guess = 'role';
    } else {
      guess = txt.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').substring(0, 40) || 'name';
    }

    if (inlineInput) {
      inlineInput.value = guess;
      inlineInput.focus();
      inlineInput.select();
    }
  });

  function applyKeywordReplacement() {
    if (!state.currentSelection?.text) return;
    const rawKw = inlineInput ? inlineInput.value.trim().replace(/[\[\]\{\}\s]/g, '') : '';
    const kw = rawKw || 'keyword';
    const tag = `[${kw}]`;
    const selectedText = state.currentSelection.text;

    if (inlineReplaceAll?.checked) {
      // Replace all occurrences of this exact text in the message body
      const escaped = selectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      textarea.value = textarea.value.replace(regex, tag);
    } else {
      // Replace only at selected position
      textarea.value = textarea.value.substring(0, state.currentSelection.start) + tag + textarea.value.substring(state.currentSelection.end);
    }

    // Register active keyword
    if (!state.activeTemplateKeywords) state.activeTemplateKeywords = new Set();
    state.activeTemplateKeywords.add(kw);

    hideAllSelectionPopups();
    renderSelectedKeywordChips();
    showToast(`✨ Replaced "${selectedText}" with ${tag}!`, 'success');
  }

  btnApplyInline?.addEventListener('click', applyKeywordReplacement);
  inlineInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyKeywordReplacement();
    } else if (e.key === 'Escape') {
      hideAllSelectionPopups();
    }
  });

  // Sync selected keywords when typing in textarea, subject, or headers
  textarea.addEventListener('input', renderSelectedKeywordChips);
  document.getElementById('editTemplateSubject')?.addEventListener('input', renderSelectedKeywordChips);
  document.getElementById('editHeaderTitle')?.addEventListener('input', renderSelectedKeywordChips);
  document.getElementById('editHeaderSubtitle')?.addEventListener('input', renderSelectedKeywordChips);
}

function renderSelectedKeywordChips() {
  const container = document.getElementById('editorKeywordChips');
  if (!container) return;

  const content = document.getElementById('editTemplateContent')?.value || '';
  const subject = document.getElementById('editTemplateSubject')?.value || '';
  const headerTitle = document.getElementById('editHeaderTitle')?.value || '';
  const headerSubtitle = document.getElementById('editHeaderSubtitle')?.value || '';
  const fullText = subject + ' ' + content + ' ' + headerTitle + ' ' + headerSubtitle;

  // Find all keywords actually present in the template text
  const regex = /(\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\[\s*([a-zA-Z0-9_]+)\s*\])/g;
  const foundKeywords = new Set();
  let match;
  while ((match = regex.exec(fullText)) !== null) {
    const k = match[2] || match[3];
    if (k) foundKeywords.add(k);
  }

  // Also retain any newly registered keywords by user
  if (state.activeTemplateKeywords) {
    state.activeTemplateKeywords.forEach(k => foundKeywords.add(k));
  }

  container.innerHTML = '';

  if (foundKeywords.size === 0) {
    container.innerHTML = '<span style="font-size: 12px; color: #64748b; font-style: italic;">No keywords selected yet. Type a keyword below or highlight any text in your message to add one.</span>';
    return;
  }

  foundKeywords.forEach(kw => {
    const chip = document.createElement('div');
    chip.className = 'removable-keyword-chip';
    chip.innerHTML = `
      <span class="kw-insert-text" title="Click to insert [${kw}] at cursor position in message">[${kw}]</span>
      <button type="button" class="kw-remove-btn" title="Remove [${kw}] from template">✕</button>
    `;

    // Click text to insert keyword
    chip.querySelector('.kw-insert-text').addEventListener('click', () => {
      insertTagIntoEditor(`[${kw}]`);
      showToast(`Inserted [${kw}] into message`, 'info');
    });

    // Click ✕ to remove keyword
    chip.querySelector('.kw-remove-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      removeKeywordFromTemplate(kw);
    });

    container.appendChild(chip);
  });
}

function removeKeywordFromTemplate(kw) {
  if (state.activeTemplateKeywords) {
    state.activeTemplateKeywords.delete(kw);
  }

  // Remove [kw] and {{kw}} from message body, subject, and header
  const textarea = document.getElementById('editTemplateContent');
  const subjectInput = document.getElementById('editTemplateSubject');
  const headerSubtitle = document.getElementById('editHeaderSubtitle');
  const headerTitle = document.getElementById('editHeaderTitle');

  const kwRegex = new RegExp(`(\\{\\{\\s*${kw}\\s*\\}\\}|\\[\\s*${kw}\\s*\\])`, 'gi');

  if (textarea && textarea.value) {
    textarea.value = textarea.value.replace(kwRegex, '');
  }

  if (subjectInput && subjectInput.value) {
    subjectInput.value = subjectInput.value.replace(kwRegex, '');
  }

  if (headerSubtitle && headerSubtitle.value) {
    headerSubtitle.value = headerSubtitle.value.replace(kwRegex, '');
  }

  if (headerTitle && headerTitle.value) {
    headerTitle.value = headerTitle.value.replace(kwRegex, '');
  }

  renderSelectedKeywordChips();
  showToast(`Removed [${kw}] from template`, 'info');
}
