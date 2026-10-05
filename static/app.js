// Gemini Managed Agents Studio - Frontend Controller

// Agent Sessions helper
function getAgentSession(agentId) {
  const id = agentId || (typeof state !== "undefined" && state.activeAgentId) || "antigravity-preview-05-2026";
  if (typeof state !== "undefined" && state.agentSessions) {
    if (!state.agentSessions[id]) {
      state.agentSessions[id] = {
        environmentId: (state.agentEnvironments && state.agentEnvironments[id]) || null,
        previousInteractionId: null,
        turnCount: 0,
        isGenerating: false,
        abortController: null,
        status: "idle", // "idle" | "running" | "complete" | "error" | "stopped"
      };
    }
    return state.agentSessions[id];
  }
  return {
    environmentId: null,
    previousInteractionId: null,
    turnCount: 0,
    isGenerating: false,
    abortController: null,
    status: "idle",
  };
}

const state = {
  activeAgentId: "antigravity-preview-05-2026",
  registeredAgents: [],
  agentSearchFilter: "",
  agentSessions: {}, // agentId -> { environmentId, previousInteractionId, turnCount, isGenerating, abortController, status }
  agentEnvironments: {}, // agentId -> environmentId
  activeRightTab: "files", // "files" | "config"
  projectId: "",
  location: "global",
  defaultEnvContent: "",
  mcpServers: [],
  filesState: {
    files: {}, // path -> { path, name, content, size, language, updated_at }
    tree: [],
    activeFilePath: null,
    isEditing: false,
    expandedDirs: new Set(),
    searchFilter: "",
    isSyncing: false,
  },

  get environmentId() {
    return getAgentSession(state.activeAgentId).environmentId;
  },
  set environmentId(val) {
    const s = getAgentSession(state.activeAgentId);
    s.environmentId = val;
    state.agentEnvironments[state.activeAgentId] = val;
  },

  get previousInteractionId() {
    return getAgentSession(state.activeAgentId).previousInteractionId;
  },
  set previousInteractionId(val) {
    getAgentSession(state.activeAgentId).previousInteractionId = val;
  },

  get turnCount() {
    return getAgentSession(state.activeAgentId).turnCount;
  },
  set turnCount(val) {
    getAgentSession(state.activeAgentId).turnCount = val;
  },

  get isGenerating() {
    return getAgentSession(state.activeAgentId).isGenerating;
  },
  set isGenerating(val) {
    getAgentSession(state.activeAgentId).isGenerating = val;
  },

  get abortController() {
    return getAgentSession(state.activeAgentId).abortController;
  },
  set abortController(val) {
    getAgentSession(state.activeAgentId).abortController = val;
  },
};

// System Instruction Presets
const PRESETS = {
  analyst: "You are a senior data analyst. You have access to a Linux sandbox with Python, pandas, and data tools. Write and execute code to verify your answers, analyze data rigorously, and present concise findings.",
  researcher: "You are an expert web researcher. Use Google Search and URL Context to gather the freshest, most factual information. Cite your sources clearly and provide structured summaries.",
  engineer: "You are a systems engineer. You can run Bash and Python commands in your sandbox environment to test hypotheses, inspect filesystem state, and write robust automation scripts."
};

// DOM Elements
const el = {
  // Top Header
  headerProject: document.getElementById("headerProject"),
  headerLocation: document.getElementById("headerLocation"),
  connectionStatus: document.getElementById("connectionStatus"),

  // Left Panel (Agents List)
  leftPanel: document.getElementById("leftPanel"),
  agentsCountBadge: document.getElementById("agentsCountBadge"),
  btnRefreshAgents: document.getElementById("btnRefreshAgents"),
  agentSearchInput: document.getElementById("agentSearchInput"),
  agentsListContainer: document.getElementById("agentsListContainer"),
  btnOpenCreateAgentModal: document.getElementById("btnOpenCreateAgentModal"),

  // Middle Panel (Chat Space)
  chatPane: document.getElementById("chatPane"),
  activeAgentAvatar: document.getElementById("activeAgentAvatar"),
  activeAgentTitle: document.getElementById("activeAgentTitle"),
  activeAgentTypeBadge: document.getElementById("activeAgentTypeBadge"),
  activeAgentSubtitle: document.getElementById("activeAgentSubtitle"),
  activeEnvBadge: document.getElementById("activeEnvBadge"),
  btnNewSession: document.getElementById("btnNewSession"),
  btnClearChat: document.getElementById("btnClearChat"),
  btnToggleRightPanel: document.getElementById("btnToggleRightPanel"),
  chatMessages: document.getElementById("chatMessages"),
  welcomeCard: document.getElementById("welcomeCard"),
  welcomeCardIcon: document.getElementById("welcomeCardIcon"),
  welcomeCardTitle: document.getElementById("welcomeCardTitle"),
  welcomeCardDesc: document.getElementById("welcomeCardDesc"),
  chatForm: document.getElementById("chatForm"),
  messageInput: document.getElementById("messageInput"),
  btnSendMessage: document.getElementById("btnSendMessage"),
  btnStopGeneration: document.getElementById("btnStopGeneration"),
  turnInfo: document.getElementById("turnInfo"),

  // Right Panel (Inspector)
  rightPanel: document.getElementById("rightPanel"),
  tabFilesBtn: document.getElementById("tabFilesBtn"),
  tabConfigBtn: document.getElementById("tabConfigBtn"),
  filesCountBadge: document.getElementById("filesCountBadge"),
  btnCloseRightPanel: document.getElementById("btnCloseRightPanel"),
  rightTabFiles: document.getElementById("rightTabFiles"),
  rightTabConfig: document.getElementById("rightTabConfig"),

  // Workspace Files & Code Editor
  treeFilesCount: document.getElementById("treeFilesCount"),
  btnSyncSandboxFiles: document.getElementById("btnSyncSandboxFiles"),
  syncIcon: document.getElementById("syncIcon"),
  btnNewSandboxFile: document.getElementById("btnNewSandboxFile"),
  fileSearchInput: document.getElementById("fileSearchInput"),
  fileTreeContainer: document.getElementById("fileTreeContainer"),
  editorHeader: document.getElementById("editorHeader"),
  editorFileIcon: document.getElementById("editorFileIcon"),
  editorFilePath: document.getElementById("editorFilePath"),
  editorLangBadge: document.getElementById("editorLangBadge"),
  editorFileSize: document.getElementById("editorFileSize"),
  editorActions: document.getElementById("editorActions"),
  btnToggleEditMode: document.getElementById("btnToggleEditMode"),
  btnSaveFileSandbox: document.getElementById("btnSaveFileSandbox"),
  btnCopyCode: document.getElementById("btnCopyCode"),
  btnDownloadFile: document.getElementById("btnDownloadFile"),
  editorEmptyState: document.getElementById("editorEmptyState"),
  editorViewerContainer: document.getElementById("editorViewerContainer"),
  editorLineNumbers: document.getElementById("editorLineNumbers"),
  editorCodeBlock: document.getElementById("editorCodeBlock"),
  editorEditContainer: document.getElementById("editorEditContainer"),
  editorTextarea: document.getElementById("editorTextarea"),

  // Configure Active Agent
  configAgentIdDisplay: document.getElementById("configAgentIdDisplay"),
  configAgentTypeDisplay: document.getElementById("configAgentTypeDisplay"),
  configAgentDescDisplay: document.getElementById("configAgentDescDisplay"),
  systemInstructionInput: document.getElementById("systemInstructionInput"),
  toolCodeExec: document.getElementById("toolCodeExec"),
  toolGoogleSearch: document.getElementById("toolGoogleSearch"),
  toolUrlContext: document.getElementById("toolUrlContext"),
  mcpServersContainer: document.getElementById("mcpServersContainer"),
  btnAddMcpServer: document.getElementById("btnAddMcpServer"),
  enableGcsMount: document.getElementById("enableGcsMount"),
  bucketCountBadge: document.getElementById("bucketCountBadge"),
  gcsFields: document.getElementById("gcsFields"),
  selectGcsBucket: document.getElementById("selectGcsBucket"),
  btnRefreshBuckets: document.getElementById("btnRefreshBuckets"),
  btnToggleCreateBucket: document.getElementById("btnToggleCreateBucket"),
  createBucketPanel: document.getElementById("createBucketPanel"),
  btnCloseCreateBucket: document.getElementById("btnCloseCreateBucket"),
  newBucketNameInput: document.getElementById("newBucketNameInput"),
  newBucketLocationSelect: document.getElementById("newBucketLocationSelect"),
  btnCreateBucketSubmit: document.getElementById("btnCreateBucketSubmit"),
  createBucketStatus: document.getElementById("createBucketStatus"),
  gcsBucketInput: document.getElementById("gcsBucketInput"),
  gcsTargetInput: document.getElementById("gcsTargetInput"),
  networkAllowlistInput: document.getElementById("networkAllowlistInput"),
  skillsTypeSelect: document.getElementById("skillsTypeSelect"),
  skillsTargetInput: document.getElementById("skillsTargetInput"),
  skillsSourceInput: document.getElementById("skillsSourceInput"),

  // Sandbox Environment & .env / API Key
  envActiveBadge: document.getElementById("envActiveBadge"),
  envApiKeyInput: document.getElementById("envApiKeyInput"),
  btnToggleApiKeyVisibility: document.getElementById("btnToggleApiKeyVisibility"),
  envVertexSelect: document.getElementById("envVertexSelect"),
  envModelSelect: document.getElementById("envModelSelect"),
  envContentTextarea: document.getElementById("envContentTextarea"),
  btnResetDefaultEnv: document.getElementById("btnResetDefaultEnv"),
  btnApplyEnvToSandbox: document.getElementById("btnApplyEnvToSandbox"),
  applyEnvStatus: document.getElementById("applyEnvStatus"),

  // Configure Agent Footer Update Button
  btnUpdateAgentConfig: document.getElementById("btnUpdateAgentConfig"),
  updateAgentStatus: document.getElementById("updateAgentStatus"),

  // Modal: Create Agent
  createAgentModal: document.getElementById("createAgentModal"),
  btnCloseCreateModal: document.getElementById("btnCloseCreateModal"),
  btnCancelCreateModal: document.getElementById("btnCancelCreateModal"),
  modalAgentIdInput: document.getElementById("modalAgentIdInput"),
  btnModalGenerateId: document.getElementById("btnModalGenerateId"),
  modalBaseAgentInput: document.getElementById("modalBaseAgentInput"),
  modalAgentDescriptionInput: document.getElementById("modalAgentDescriptionInput"),
  modalSystemInstructionInput: document.getElementById("modalSystemInstructionInput"),
  modalToolCodeExec: document.getElementById("modalToolCodeExec"),
  modalToolGoogleSearch: document.getElementById("modalToolGoogleSearch"),
  modalToolUrlContext: document.getElementById("modalToolUrlContext"),
  btnModalInitializeAgent: document.getElementById("btnModalInitializeAgent"),
  modalInitStatusMessage: document.getElementById("modalInitStatusMessage"),

  // Modal: Optional Fields
  modalEnableGcsMount: document.getElementById("modalEnableGcsMount"),
  modalGcsFields: document.getElementById("modalGcsFields"),
  modalSelectGcsBucket: document.getElementById("modalSelectGcsBucket"),
  modalGcsBucketInput: document.getElementById("modalGcsBucketInput"),
  modalGcsTargetInput: document.getElementById("modalGcsTargetInput"),
  btnModalAddMcp: document.getElementById("btnModalAddMcp"),
  modalMcpServersContainer: document.getElementById("modalMcpServersContainer"),
  modalSkillsTypeSelect: document.getElementById("modalSkillsTypeSelect"),
  modalSkillsTargetInput: document.getElementById("modalSkillsTargetInput"),
  modalSkillsSourceInput: document.getElementById("modalSkillsSourceInput"),
  modalEnvApiKeyInput: document.getElementById("modalEnvApiKeyInput"),
  btnModalToggleApiKey: document.getElementById("btnModalToggleApiKey"),
  modalEnvVertexSelect: document.getElementById("modalEnvVertexSelect"),
  modalEnvModelSelect: document.getElementById("modalEnvModelSelect"),
  modalEnvContentTextarea: document.getElementById("modalEnvContentTextarea"),

  // Modal: New File
  newFileModal: document.getElementById("newFileModal"),
  btnCloseNewFileModal: document.getElementById("btnCloseNewFileModal"),
  newFilePathInput: document.getElementById("newFilePathInput"),
  btnCancelNewFile: document.getElementById("btnCancelNewFile"),
  btnConfirmNewFile: document.getElementById("btnConfirmNewFile"),
};

// Initialize Application
async function initApp() {
  initChatPanes();
  initRightPanelResizer();
  setupEventListeners();
  await loadConfig();
  await loadRegisteredAgents();
  await loadGcsBuckets();
  await loadInitialFiles();
}

// Load Configuration from Server
async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) throw new Error(`Config request failed: ${res.statusText}`);
    const data = await res.json();
    state.projectId = data.project_id;
    state.location = data.location;
    state.defaultEnvContent = data.default_env_content || "";
    if (el.headerProject) el.headerProject.textContent = data.project_id || "sokratis-genai-bb";
    if (el.headerLocation) el.headerLocation.textContent = data.location || "global";
    if (el.systemInstructionInput) el.systemInstructionInput.value = data.default_system_instruction || "";
    if (data.default_env_content && el.envContentTextarea && !el.envContentTextarea.value.trim()) {
      el.envContentTextarea.value = data.default_env_content;
      syncEnvTextareaToQuickInputs();
    }
  } catch (err) {
    console.error("Error loading config:", err);
    if (el.headerProject) el.headerProject.textContent = "sokratis-genai-bb";
  }
}

// Load Registered Agents
async function loadRegisteredAgents() {
  try {
    const res = await fetch("/api/agents");
    if (!res.ok) throw new Error("Failed to list agents");
    const data = await res.json();
    state.registeredAgents = data.agents || [];
    renderAgentsList();
  } catch (err) {
    console.error("Error listing agents:", err);
    state.registeredAgents = [];
    renderAgentsList();
  }
}

// Helper: Initialize Chat Panes Container
function initChatPanes() {
  if (!el.chatMessages) return;
  const baseId = "antigravity-preview-05-2026";
  const safeId = "agentChatPane_" + baseId.replace(/[^a-zA-Z0-9_-]/g, "_");
  let pane = document.getElementById(safeId);
  if (!pane) {
    pane = document.createElement("div");
    pane.id = safeId;
    pane.className = "agent-chat-pane space-y-4 min-h-full";
    // Move existing initial elements (like welcomeCard) into this base pane
    while (el.chatMessages.firstChild) {
      pane.appendChild(el.chatMessages.firstChild);
    }
    el.chatMessages.appendChild(pane);
  }
}

// Get or Create Persistent DOM Chat Pane for Specific Agent
function getOrCreateAgentPane(agentId) {
  if (!el.chatMessages) return null;
  const id = agentId || state.activeAgentId || "antigravity-preview-05-2026";
  const safeId = "agentChatPane_" + id.replace(/[^a-zA-Z0-9_-]/g, "_");
  let pane = document.getElementById(safeId);
  if (!pane) {
    pane = document.createElement("div");
    pane.id = safeId;
    pane.className = "agent-chat-pane space-y-4 min-h-full";
    const welcome = createWelcomeCardElement(id);
    pane.appendChild(welcome);
    el.chatMessages.appendChild(pane);
  }
  return pane;
}

// Switch Chat Panes in DOM without altering in-progress background streams
function switchChatPane(agentId) {
  if (!el.chatMessages) return;
  const id = agentId || state.activeAgentId || "antigravity-preview-05-2026";
  const safeId = "agentChatPane_" + id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const panes = el.chatMessages.querySelectorAll(".agent-chat-pane");
  let found = false;
  panes.forEach(p => {
    if (p.id === safeId) {
      p.classList.remove("hidden");
      found = true;
    } else {
      p.classList.add("hidden");
    }
  });
  if (!found) {
    const newPane = getOrCreateAgentPane(id);
    if (newPane) newPane.classList.remove("hidden");
  }
}

// Create Customized Welcome Card for Any Agent
function createWelcomeCardElement(agentId) {
  const isBase = agentId === "antigravity-preview-05-2026";
  const ag = state.registeredAgents.find(a => a.id === agentId);
  const title = isBase ? "Gemini Managed Agents Studio" : (ag ? ag.id : agentId);
  const desc = isBase
    ? "Interactive playground for autonomous Managed Agents. Test reasoning, tool usage, sandbox bash/python execution, and inspect files live."
    : (ag?.description || "Custom registered Managed Agent. Send a message to interact with its autonomous sandbox.");

  const div = document.createElement("div");
  div.className = "welcome-card p-6 rounded-2xl bg-gradient-to-b from-slate-900/80 to-slate-950/80 border border-slate-800 text-center max-w-xl mx-auto space-y-4 shadow-xl";
  div.innerHTML = `
    <div class="w-12 h-12 rounded-xl ${isBase ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'} border flex items-center justify-center mx-auto text-xl shadow-lg">
      <i class="${isBase ? 'fa-solid fa-bolt' : 'fa-solid fa-robot'}"></i>
    </div>
    <div class="space-y-1">
      <h3 class="text-sm font-semibold text-white tracking-wide">${escapeHtml(title)}</h3>
      <p class="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">${escapeHtml(desc)}</p>
    </div>
    ${isBase ? `
    <div class="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
      <button class="quick-prompt p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs text-slate-300 hover:text-white transition group" data-prompt="Run a Python benchmark and report CPU & memory in the sandbox.">
        <div class="font-semibold text-blue-400 mb-0.5 group-hover:text-blue-300 flex items-center gap-1">
          <i class="fa-solid fa-microchip text-[11px]"></i> Benchmark Sandbox
        </div>
        <div class="text-[10px] text-slate-400">Run a Python benchmark and report CPU & memory in the sandbox.</div>
      </button>
      <button class="quick-prompt p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs text-slate-300 hover:text-white transition group" data-prompt="Create a file called 'notes.txt', write sample data, and read it back.">
        <div class="font-semibold text-emerald-400 mb-0.5 group-hover:text-emerald-300 flex items-center gap-1">
          <i class="fa-solid fa-file-code text-[11px]"></i> Multi-turn File State
        </div>
        <div class="text-[10px] text-slate-400">Create a file called 'notes.txt', write sample data, and read it back.</div>
      </button>
      <button class="quick-prompt p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs text-slate-300 hover:text-white transition group" data-prompt="Search the web for the latest Gemini Enterprise updates.">
        <div class="font-semibold text-purple-400 mb-0.5 group-hover:text-purple-300 flex items-center gap-1">
          <i class="fa-brands fa-google text-[11px]"></i> Web Search Grounding
        </div>
        <div class="text-[10px] text-slate-400">Search the web for the latest Gemini Enterprise updates.</div>
      </button>
      <button class="quick-prompt p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs text-slate-300 hover:text-white transition group" data-prompt="Generate a synthetic dataset and analyze summary statistics in Python.">
        <div class="font-semibold text-amber-400 mb-0.5 group-hover:text-amber-300 flex items-center gap-1">
          <i class="fa-solid fa-chart-line text-[11px]"></i> Data Analysis
        </div>
        <div class="text-[10px] text-slate-400">Generate a synthetic dataset and analyze summary statistics in Python.</div>
      </button>
    </div>` : `
    <div class="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400">
      Ready to accept tasks. Type your prompt below to interact with this agent.
    </div>
    `}
  `;

  // Attach quick prompt click handlers
  div.querySelectorAll(".quick-prompt").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = btn.getAttribute("data-prompt") || btn.querySelector("div:last-child")?.textContent.trim();
      if (p && el.messageInput) {
        el.messageInput.value = p;
        sendMessage();
      }
    });
  });

  return div;
}

// Render Left-Hand Agents List (Base agent + Custom agents with bin icons and live background indicators)
function renderAgentsList() {
  if (!el.agentsListContainer) return;
  el.agentsListContainer.innerHTML = "";

  const filter = (state.agentSearchFilter || "").toLowerCase().trim();

  // Unified list: Base Agent + Custom Agents
  const allAgents = [
    {
      id: "antigravity-preview-05-2026",
      is_base: true,
      name: "antigravity-preview-05-2026",
      description: "Foundational harness • Linux sandbox",
      icon: "fa-solid fa-bolt",
      iconColor: "text-amber-400",
      avatarBg: "bg-amber-500/10 border-amber-500/20",
    },
    ...state.registeredAgents.map(ag => ({
      id: ag.id,
      is_base: false,
      name: ag.id,
      description: ag.description || "Custom registered agent",
      icon: "fa-solid fa-robot",
      iconColor: "text-indigo-400",
      avatarBg: "bg-indigo-500/10 border-indigo-500/20",
      raw: ag,
    }))
  ];

  const filtered = allAgents.filter(a =>
    !filter ||
    a.name.toLowerCase().includes(filter) ||
    (a.description && a.description.toLowerCase().includes(filter))
  );

  if (el.agentsCountBadge) {
    el.agentsCountBadge.textContent = `${allAgents.length} available`;
  }

  if (filtered.length === 0) {
    el.agentsListContainer.innerHTML = `
      <div class="p-4 text-center text-slate-500 text-xs">
        <i class="fa-solid fa-magnifying-glass text-slate-600 text-base mb-1"></i>
        <p>No agents match "${escapeHtml(filter)}"</p>
      </div>
    `;
    return;
  }

  filtered.forEach(agent => {
    const isActive = state.activeAgentId === agent.id;
    const session = getAgentSession(agent.id);
    const isRunning = session.isGenerating || session.status === "running";

    const item = document.createElement("div");
    item.className = `p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 group ${
      isActive
        ? "bg-blue-600/15 border-blue-500/60 shadow-sm shadow-blue-500/10 ring-1 ring-blue-500/30"
        : "bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40"
    }`;

    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <div class="w-8 h-8 rounded-lg ${agent.avatarBg} border flex items-center justify-center ${agent.iconColor} shrink-0 relative">
          <i class="${agent.icon} text-xs"></i>
          ${isRunning ? '<span class="absolute -top-1 -right-1 flex h-2.5 w-2.5"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span></span>' : ''}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-semibold ${isActive ? 'text-white' : 'text-slate-200'} font-mono truncate">${escapeHtml(agent.name)}</span>
            ${agent.is_base ? '<span class="px-1 py-0.2 rounded text-[9px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">BASE</span>' : ''}
          </div>
          <p class="text-[10px] text-slate-400 truncate">${escapeHtml(agent.description)}</p>
        </div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        ${isRunning ? `
          <span class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse font-mono" title="Processing in background">
            <i class="fa-solid fa-spinner fa-spin text-[10px]"></i>
            <span class="text-[9px]">RUNNING</span>
          </span>
        ` : ''}
        ${isActive && !isRunning ? '<span class="w-2 h-2 rounded-full bg-blue-400 animate-pulse" title="Active"></span>' : ''}
        ${!agent.is_base ? `
          <button type="button" class="btn-delete-agent text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition" title="Delete agent ${escapeHtml(agent.id)}" data-agent-id="${escapeHtml(agent.id)}">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>
        ` : ''}
      </div>
    `;

    // Click item to select agent
    item.addEventListener("click", (e) => {
      if (e.target.closest(".btn-delete-agent")) return;
      setActiveAgent(agent.id);
    });

    // Delete button click
    const delBtn = item.querySelector(".btn-delete-agent");
    if (delBtn) {
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleDeleteAgent(agent.id);
      });
    }

    el.agentsListContainer.appendChild(item);
  });
}

// Set Active Agent & Update UI
function setActiveAgent(agentId) {
  if (state.activeAgentId === agentId) return;

  state.activeAgentId = agentId;

  // Switch chat panes in DOM: show active agent's pane, hide all others
  switchChatPane(agentId);

  // Immediately update sandbox files for this selected agent
  loadFilesForAgent(agentId);

  // Re-render agent list so active card and running status update
  renderAgentsList();

  // Update chat header
  updateChatHeaderForActiveAgent();

  // Update input controls (Send / Stop buttons, placeholder)
  updateSendControlsForActiveAgent();

  // Update right panel configure tab
  updateConfigPanelForActiveAgent();

  scrollToBottom();
}

// Update Send/Stop Controls for Active Agent
function updateSendControlsForActiveAgent() {
  const session = getAgentSession(state.activeAgentId);
  const isGen = session.isGenerating;
  if (isGen) {
    if (el.btnStopGeneration) el.btnStopGeneration.classList.remove("hidden");
    if (el.btnSendMessage) {
      el.btnSendMessage.disabled = true;
      el.btnSendMessage.classList.add("hidden");
    }
    if (el.messageInput) {
      el.messageInput.placeholder = "Agent is working in the background...";
    }
  } else {
    if (el.btnStopGeneration) el.btnStopGeneration.classList.add("hidden");
    if (el.btnSendMessage) {
      el.btnSendMessage.disabled = false;
      el.btnSendMessage.classList.remove("hidden");
    }
    if (el.messageInput) {
      el.messageInput.placeholder = "Ask the active agent to execute code, browse the web, create files, or analyze data...";
    }
  }
}

// Update Chat Header for Active Agent
function updateChatHeaderForActiveAgent() {
  const isBase = state.activeAgentId === "antigravity-preview-05-2026";
  if (el.activeAgentTitle) {
    el.activeAgentTitle.textContent = state.activeAgentId;
  }
  if (el.activeAgentAvatar) {
    el.activeAgentAvatar.className = `w-7 h-7 rounded-lg ${isBase ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'} border flex items-center justify-center shrink-0`;
    el.activeAgentAvatar.innerHTML = `<i class="${isBase ? 'fa-solid fa-bolt' : 'fa-solid fa-robot'} text-xs"></i>`;
  }
  if (el.activeAgentTypeBadge) {
    el.activeAgentTypeBadge.textContent = isBase ? "Base Agent" : "Custom Agent";
    el.activeAgentTypeBadge.className = `px-1.5 py-0.2 text-[10px] rounded font-semibold ${isBase ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'} border uppercase tracking-wider shrink-0`;
  }
  if (el.activeAgentSubtitle) {
    if (isBase) {
      el.activeAgentSubtitle.textContent = "Direct harness • Autonomous remote sandbox";
    } else {
      const ag = state.registeredAgents.find(a => a.id === state.activeAgentId);
      el.activeAgentSubtitle.textContent = ag?.description || "Registered Managed Agent";
    }
  }
  if (el.activeEnvBadge) {
    el.activeEnvBadge.textContent = state.environmentId || "None (New)";
    el.activeEnvBadge.title = state.environmentId ? `Sandbox ID: ${state.environmentId}` : "A new sandbox will be provisioned on next message";
  }
  if (el.turnInfo) {
    el.turnInfo.textContent = `Turn: ${state.turnCount}`;
  }
}

// Update Welcome Card for Active Agent
function updateWelcomeCardForActiveAgent() {
  const isBase = state.activeAgentId === "antigravity-preview-05-2026";
  if (el.welcomeCardIcon) {
    el.welcomeCardIcon.className = isBase ? "fa-solid fa-bolt" : "fa-solid fa-robot";
  }
  if (el.welcomeCardTitle) {
    el.welcomeCardTitle.textContent = `Active: ${state.activeAgentId}`;
  }
  if (el.welcomeCardDesc) {
    if (isBase) {
      el.welcomeCardDesc.textContent = "Your agent runs in a secure remote Linux sandbox with integrated Python code execution, bash terminal, live web search, and persistent filesystem state.";
    } else {
      const ag = state.registeredAgents.find(a => a.id === state.activeAgentId);
      el.welcomeCardDesc.textContent = ag?.description || `Ready to interact with custom agent ${state.activeAgentId}.`;
    }
  }
}

// Update Configure Tab for Active Agent
function updateConfigPanelForActiveAgent() {
  const isBase = state.activeAgentId === "antigravity-preview-05-2026";
  if (el.configAgentIdDisplay) {
    el.configAgentIdDisplay.textContent = state.activeAgentId;
  }
  if (el.configAgentTypeDisplay) {
    el.configAgentTypeDisplay.textContent = isBase ? "Base Agent" : "Custom Agent";
    el.configAgentTypeDisplay.className = `px-1.5 py-0.2 rounded text-[10px] font-semibold ${isBase ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'}`;
  }
  if (el.configAgentDescDisplay) {
    if (isBase) {
      el.configAgentDescDisplay.textContent = "Foundational agent with autonomous Linux sandbox execution";
    } else {
      const ag = state.registeredAgents.find(a => a.id === state.activeAgentId);
      el.configAgentDescDisplay.textContent = ag?.description || "Registered Managed Agent";
      if (ag && ag.system_instruction && el.systemInstructionInput) {
        el.systemInstructionInput.value = ag.system_instruction;
      }
    }
  }
}

// Delete Agent Handler
async function handleDeleteAgent(agentId) {
  if (agentId === "antigravity-preview-05-2026") {
    alert("The base agent cannot be deleted.");
    return;
  }

  if (!confirm(`Are you sure you want to permanently delete agent '${agentId}'?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Delete failed");
    }

    if (state.agentSessions[agentId] && state.agentSessions[agentId].abortController) {
      try {
        state.agentSessions[agentId].abortController.abort();
      } catch (e) {}
    }
    delete state.agentSessions[agentId];
    delete state.agentEnvironments[agentId];

    const safeId = "agentChatPane_" + agentId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const pane = document.getElementById(safeId);
    if (pane) pane.remove();

    // If the active agent was deleted, switch back to base agent
    if (state.activeAgentId === agentId) {
      setActiveAgent("antigravity-preview-05-2026");
    }

    await loadRegisteredAgents();
    appendSystemNotice(`🗑️ Deleted agent: <strong>${escapeHtml(agentId)}</strong>`);
  } catch (err) {
    console.error("Failed to delete agent:", err);
    alert(`Failed to delete agent: ${err.message}`);
  }
}

// Right Panel Tab Switcher
function switchRightTab(tab) {
  state.activeRightTab = tab;
  if (tab === "files") {
    if (el.tabFilesBtn) {
      el.tabFilesBtn.classList.add("bg-blue-600", "text-white");
      el.tabFilesBtn.classList.remove("text-slate-400");
    }
    if (el.tabConfigBtn) {
      el.tabConfigBtn.classList.remove("bg-blue-600", "text-white");
      el.tabConfigBtn.classList.add("text-slate-400");
    }
    if (el.rightTabFiles) el.rightTabFiles.classList.remove("hidden");
    if (el.rightTabConfig) el.rightTabConfig.classList.add("hidden");
  } else {
    if (el.tabConfigBtn) {
      el.tabConfigBtn.classList.add("bg-blue-600", "text-white");
      el.tabConfigBtn.classList.remove("text-slate-400");
    }
    if (el.tabFilesBtn) {
      el.tabFilesBtn.classList.remove("bg-blue-600", "text-white");
      el.tabFilesBtn.classList.add("text-slate-400");
    }
    if (el.rightTabConfig) el.rightTabConfig.classList.remove("hidden");
    if (el.rightTabFiles) el.rightTabFiles.classList.add("hidden");
    syncEnvTextareaToQuickInputs();
  }
}

// Toggle Right Panel Visibility
function toggleRightPanel() {
  if (el.rightPanel) {
    el.rightPanel.classList.toggle("hidden");
    const isHidden = el.rightPanel.classList.contains("hidden");
    const resizer = document.getElementById("rightPanelResizer");
    if (resizer) {
      if (isHidden) {
        resizer.classList.add("hidden");
      } else {
        resizer.classList.remove("hidden");
      }
    }
  }
}

// Resizable Right Panel Controller
function initRightPanelResizer() {
  const resizer = document.getElementById("rightPanelResizer");
  const panel = el.rightPanel || document.getElementById("rightPanel");
  if (!resizer || !panel) return;

  // Restore saved width from localStorage if valid
  const savedWidth = localStorage.getItem("gemini_studio_right_panel_width");
  if (savedWidth) {
    const num = parseInt(savedWidth, 10);
    if (!isNaN(num) && num >= 280) {
      const maxWidth = Math.max(320, Math.floor(window.innerWidth * 0.85));
      panel.style.width = `${Math.min(num, maxWidth)}px`;
    }
  }

  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    resizer.classList.add("resizing");
    document.body.classList.add("is-resizing");
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    // Dragging mouse to the left widens the right panel
    const delta = startX - e.clientX;
    const minWidth = 280;
    const maxWidth = Math.max(320, Math.floor(window.innerWidth * 0.85));
    const newWidth = Math.min(Math.max(startWidth + delta, minWidth), maxWidth);
    panel.style.width = `${newWidth}px`;
  });

  window.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    resizer.classList.remove("resizing");
    document.body.classList.remove("is-resizing");
    const currentWidth = panel.getBoundingClientRect().width;
    localStorage.setItem("gemini_studio_right_panel_width", Math.round(currentWidth));
  });
}

// Load GCS Buckets in Current Project
async function loadGcsBuckets() {
  if (!el.selectGcsBucket) return;
  try {
    el.selectGcsBucket.innerHTML = '<option value="">-- Loading buckets in project... --</option>';
    const res = await fetch("/api/buckets");
    if (!res.ok) throw new Error("Failed to list buckets");
    const data = await res.json();
    const buckets = data.buckets || [];
    if (el.bucketCountBadge) {
      el.bucketCountBadge.textContent = `${buckets.length} bucket${buckets.length === 1 ? '' : 's'}`;
    }

    el.selectGcsBucket.innerHTML = '<option value="">-- Select existing bucket --</option>';
    buckets.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.uri;
      opt.textContent = `${b.name} (${b.location || 'US'})`;
      el.selectGcsBucket.appendChild(opt);
    });
  } catch (err) {
    console.error("Error loading GCS buckets:", err);
    el.selectGcsBucket.innerHTML = '<option value="">-- Enter GCS URI manually below --</option>';
    if (el.bucketCountBadge) el.bucketCountBadge.textContent = "manual";
  }
}

// Handle Create New GCS Bucket
async function handleCreateBucket() {
  let rawName = el.newBucketNameInput.value.trim().toLowerCase();
  if (rawName.startsWith("gs://")) {
    rawName = rawName.substring(5);
  }
  rawName = rawName.replace(/\/+$/, "").trim();

  if (!rawName) {
    showCreateBucketStatus("Please enter a bucket name.", "error");
    return;
  }

  if (!/^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9]$/.test(rawName)) {
    showCreateBucketStatus("Bucket name must be 3-63 chars: lowercase letters, numbers, hyphens or underscores.", "error");
    return;
  }

  const location = el.newBucketLocationSelect.value || "US";
  showCreateBucketStatus("Creating bucket in project... (takes a few seconds)", "loading");
  el.btnCreateBucketSubmit.disabled = true;

  try {
    const res = await fetch("/api/buckets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: rawName,
        location: location,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Failed to create bucket");
    }

    const bucketUri = data.bucket?.uri || `gs://${rawName}`;
    showCreateBucketStatus(`✅ Created bucket '${rawName}' successfully!`, "success");
    await loadGcsBuckets();
    if (el.gcsBucketInput) el.gcsBucketInput.value = bucketUri;
    if (el.enableGcsMount) el.enableGcsMount.checked = true;
    if (el.gcsFields) el.gcsFields.classList.remove("opacity-50", "pointer-events-none");
    if (el.selectGcsBucket) el.selectGcsBucket.value = bucketUri;

    setTimeout(() => {
      el.createBucketPanel.classList.add("hidden");
    }, 2000);
  } catch (err) {
    console.error("Failed to create bucket:", err);
    showCreateBucketStatus(`❌ ${err.message}`, "error");
  } finally {
    el.btnCreateBucketSubmit.disabled = false;
  }
}

function showCreateBucketStatus(msg, type) {
  if (!el.createBucketStatus) return;
  el.createBucketStatus.classList.remove("hidden", "bg-blue-950/60", "text-blue-300", "border-blue-700/60", "bg-emerald-950/60", "text-emerald-300", "border-emerald-700/60", "bg-rose-950/60", "text-rose-300", "border-rose-700/60");
  el.createBucketStatus.classList.add("border");

  if (type === "loading") {
    el.createBucketStatus.classList.add("bg-blue-950/60", "text-blue-300", "border-blue-700/60");
    el.createBucketStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> ${msg}`;
  } else if (type === "success") {
    el.createBucketStatus.classList.add("bg-emerald-950/60", "text-emerald-300", "border-emerald-700/60");
    el.createBucketStatus.innerHTML = msg;
  } else {
    el.createBucketStatus.classList.add("bg-rose-950/60", "text-rose-300", "border-rose-700/60");
    el.createBucketStatus.innerHTML = msg;
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Agent Search Input
  if (el.agentSearchInput) {
    el.agentSearchInput.addEventListener("input", (e) => {
      state.agentSearchFilter = e.target.value;
      renderAgentsList();
    });
  }

  // Refresh Agents
  if (el.btnRefreshAgents) {
    el.btnRefreshAgents.addEventListener("click", loadRegisteredAgents);
  }

  // Modal: Open/Close Create Agent Modal
  if (el.btnOpenCreateAgentModal) {
    el.btnOpenCreateAgentModal.addEventListener("click", openCreateAgentModal);
  }
  if (el.btnCloseCreateModal) {
    el.btnCloseCreateModal.addEventListener("click", closeCreateAgentModal);
  }
  if (el.btnCancelCreateModal) {
    el.btnCancelCreateModal.addEventListener("click", closeCreateAgentModal);
  }
  if (el.btnModalGenerateId) {
    el.btnModalGenerateId.addEventListener("click", () => {
      const rand = Math.random().toString(36).substring(2, 8);
      if (el.modalAgentIdInput) el.modalAgentIdInput.value = `agent-${rand}`;
    });
  }
  if (el.btnModalInitializeAgent) {
    el.btnModalInitializeAgent.addEventListener("click", handleCreateAgentFromModal);
  }

  // Modal: GCS Mount toggle
  if (el.modalEnableGcsMount) {
    el.modalEnableGcsMount.addEventListener("change", (e) => {
      if (el.modalGcsFields) {
        el.modalGcsFields.classList.toggle("opacity-50", !e.target.checked);
        el.modalGcsFields.classList.toggle("pointer-events-none", !e.target.checked);
      }
    });
  }

  // Modal: Select GCS Bucket
  if (el.modalSelectGcsBucket) {
    el.modalSelectGcsBucket.addEventListener("change", (e) => {
      if (el.modalGcsBucketInput) {
        el.modalGcsBucketInput.value = e.target.value ? `gs://${e.target.value}` : "";
      }
    });
  }

  // Modal: Add MCP Server
  if (el.btnModalAddMcp) {
    el.btnModalAddMcp.addEventListener("click", addModalMcpServerRow);
  }

  // Modal: Toggle API Key visibility
  if (el.btnModalToggleApiKey) {
    el.btnModalToggleApiKey.addEventListener("click", () => {
      if (el.modalEnvApiKeyInput) {
        const isPass = el.modalEnvApiKeyInput.type === "password";
        el.modalEnvApiKeyInput.type = isPass ? "text" : "password";
        el.btnModalToggleApiKey.innerHTML = `<i class="fa-solid fa-${isPass ? 'eye-slash' : 'eye'}"></i>`;
      }
    });
  }

  // Modal: Sync Quick Inputs to .env Textarea
  if (el.modalEnvApiKeyInput) el.modalEnvApiKeyInput.addEventListener("input", syncModalQuickInputsToEnvTextarea);
  if (el.modalEnvVertexSelect) el.modalEnvVertexSelect.addEventListener("change", syncModalQuickInputsToEnvTextarea);
  if (el.modalEnvModelSelect) el.modalEnvModelSelect.addEventListener("change", syncModalQuickInputsToEnvTextarea);

  // Configure Tab: Update Agent Config button
  if (el.btnUpdateAgentConfig) {
    el.btnUpdateAgentConfig.addEventListener("click", handleUpdateAgentConfig);
  }

  // Right Panel Tabs
  if (el.tabFilesBtn) {
    el.tabFilesBtn.addEventListener("click", () => switchRightTab("files"));
  }
  if (el.tabConfigBtn) {
    el.tabConfigBtn.addEventListener("click", () => switchRightTab("config"));
  }
  if (el.btnCloseRightPanel) {
    el.btnCloseRightPanel.addEventListener("click", toggleRightPanel);
  }
  if (el.btnToggleRightPanel) {
    el.btnToggleRightPanel.addEventListener("click", toggleRightPanel);
  }

  // Presets in Configure Tab
  document.querySelectorAll(".preset-prompt").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-preset");
      if (PRESETS[key] && el.systemInstructionInput) {
        el.systemInstructionInput.value = PRESETS[key];
      }
    });
  });

  // GCS mount toggle
  if (el.enableGcsMount) {
    el.enableGcsMount.addEventListener("change", () => {
      if (el.enableGcsMount.checked) {
        el.gcsFields.classList.remove("opacity-50", "pointer-events-none");
      } else {
        el.gcsFields.classList.add("opacity-50", "pointer-events-none");
      }
    });
  }

  // GCS Bucket Select & Refresh
  if (el.selectGcsBucket) {
    el.selectGcsBucket.addEventListener("change", () => {
      if (el.selectGcsBucket.value && el.gcsBucketInput) {
        el.gcsBucketInput.value = el.selectGcsBucket.value;
      }
    });
  }
  if (el.btnRefreshBuckets) {
    el.btnRefreshBuckets.addEventListener("click", loadGcsBuckets);
  }
  if (el.btnToggleCreateBucket) {
    el.btnToggleCreateBucket.addEventListener("click", () => {
      el.createBucketPanel.classList.toggle("hidden");
      if (!el.createBucketPanel.classList.contains("hidden")) {
        el.newBucketNameInput.focus();
      }
    });
  }
  if (el.btnCloseCreateBucket) {
    el.btnCloseCreateBucket.addEventListener("click", () => {
      el.createBucketPanel.classList.add("hidden");
    });
  }
  if (el.btnCreateBucketSubmit) {
    el.btnCreateBucketSubmit.addEventListener("click", handleCreateBucket);
  }

  // Sandbox Environment & .env Configuration
  if (el.btnToggleApiKeyVisibility && el.envApiKeyInput) {
    el.btnToggleApiKeyVisibility.addEventListener("click", () => {
      const isPassword = el.envApiKeyInput.type === "password";
      el.envApiKeyInput.type = isPassword ? "text" : "password";
      const icon = el.btnToggleApiKeyVisibility.querySelector("i");
      if (icon) {
        icon.className = isPassword ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
      }
    });
  }

  if (el.envApiKeyInput) {
    el.envApiKeyInput.addEventListener("input", syncQuickInputsToEnvTextarea);
  }
  if (el.envVertexSelect) {
    el.envVertexSelect.addEventListener("change", syncQuickInputsToEnvTextarea);
  }
  if (el.envModelSelect) {
    el.envModelSelect.addEventListener("change", syncQuickInputsToEnvTextarea);
  }
  if (el.envContentTextarea) {
    el.envContentTextarea.addEventListener("input", syncEnvTextareaToQuickInputs);
  }
  if (el.btnResetDefaultEnv) {
    el.btnResetDefaultEnv.addEventListener("click", () => {
      if (state.defaultEnvContent && el.envContentTextarea) {
        el.envContentTextarea.value = state.defaultEnvContent;
        syncEnvTextareaToQuickInputs();
        showEnvStatus("Reset .env template to default", "info");
      }
    });
  }
  if (el.btnApplyEnvToSandbox) {
    el.btnApplyEnvToSandbox.addEventListener("click", handleApplyEnvToSandbox);
  }

  // MCP Servers
  if (el.btnAddMcpServer) {
    el.btnAddMcpServer.addEventListener("click", addMcpServerRow);
  }

  // New session / reset sandbox
  if (el.btnNewSession) {
    el.btnNewSession.addEventListener("click", handleNewSession);
  }
  if (el.btnClearChat) {
    el.btnClearChat.addEventListener("click", handleClearChat);
  }

  // Quick prompt buttons
  document.querySelectorAll(".quick-prompt").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = btn.querySelector("div:last-child").textContent.trim();
      el.messageInput.value = p;
      sendMessage();
    });
  });

  // Chat input
  if (el.chatForm) {
    el.chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      sendMessage();
    });
  }

  if (el.messageInput) {
    el.messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    el.messageInput.addEventListener("input", () => {
      el.messageInput.style.height = "auto";
      el.messageInput.style.height = Math.min(el.messageInput.scrollHeight, 140) + "px";
    });
  }

  // Stop generation
  if (el.btnStopGeneration) {
    el.btnStopGeneration.addEventListener("click", () => {
      const session = getAgentSession(state.activeAgentId);
      if (session.abortController) {
        session.abortController.abort();
      }
      setGenerating(false, state.activeAgentId);
    });
  }

  // Sandbox Filesystem Actions
  if (el.btnSyncSandboxFiles) el.btnSyncSandboxFiles.addEventListener("click", () => syncFilesFromSandbox(false));
  if (el.btnNewSandboxFile) el.btnNewSandboxFile.addEventListener("click", openNewFileModal);
  if (el.btnCloseNewFileModal) el.btnCloseNewFileModal.addEventListener("click", closeNewFileModal);
  if (el.btnCancelNewFile) el.btnCancelNewFile.addEventListener("click", closeNewFileModal);
  if (el.btnConfirmNewFile) el.btnConfirmNewFile.addEventListener("click", handleCreateNewFile);
  if (el.newFilePathInput) {
    el.newFilePathInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleCreateNewFile();
      }
    });
  }

  // File Search Filter
  if (el.fileSearchInput) el.fileSearchInput.addEventListener("input", handleSearchFiles);

  // Editor Actions
  if (el.btnToggleEditMode) el.btnToggleEditMode.addEventListener("click", toggleEditorMode);
  if (el.btnSaveFileSandbox) el.btnSaveFileSandbox.addEventListener("click", handleSaveFileToSandbox);
  if (el.btnCopyCode) el.btnCopyCode.addEventListener("click", handleCopyEditorCode);
  if (el.btnDownloadFile) el.btnDownloadFile.addEventListener("click", handleDownloadEditorFile);
}

// Modal Create Agent Functions
function openCreateAgentModal() {
  if (!el.createAgentModal) return;
  const rand = Math.random().toString(36).substring(2, 8);
  if (el.modalAgentIdInput) el.modalAgentIdInput.value = `agent-${rand}`;
  if (el.modalInitStatusMessage) el.modalInitStatusMessage.classList.add("hidden");

  // Populate GCS bucket options in modal
  if (el.modalSelectGcsBucket) {
    el.modalSelectGcsBucket.innerHTML = '<option value="">-- Select bucket --</option>';
    if (Array.isArray(state.gcsBuckets)) {
      state.gcsBuckets.forEach(b => {
        const opt = document.createElement("option");
        opt.value = b.name;
        opt.textContent = `${b.name} (${b.location || 'US'})`;
        el.modalSelectGcsBucket.appendChild(opt);
      });
    }
  }

  // Populate default .env
  if (el.modalEnvContentTextarea) {
    el.modalEnvContentTextarea.value = (el.envContentTextarea && el.envContentTextarea.value) || state.defaultEnvContent || "";
  }
  if (el.modalEnableGcsMount) {
    el.modalEnableGcsMount.checked = false;
    if (el.modalGcsFields) el.modalGcsFields.classList.add("opacity-50", "pointer-events-none");
  }
  if (el.modalGcsBucketInput) el.modalGcsBucketInput.value = "";
  if (el.modalSkillsTypeSelect) el.modalSkillsTypeSelect.value = "";
  if (el.modalSkillsSourceInput) el.modalSkillsSourceInput.value = "";
  if (el.modalMcpServersContainer) el.modalMcpServersContainer.innerHTML = "";

  el.createAgentModal.classList.remove("hidden");
  if (el.modalAgentIdInput) el.modalAgentIdInput.focus();
}

function closeCreateAgentModal() {
  if (el.createAgentModal) el.createAgentModal.classList.add("hidden");
}

function showModalStatus(msg, type) {
  if (!el.modalInitStatusMessage) return;
  el.modalInitStatusMessage.classList.remove("hidden", "bg-blue-950/60", "text-blue-300", "border-blue-700/60", "bg-emerald-950/60", "text-emerald-300", "border-emerald-700/60", "bg-rose-950/60", "text-rose-300", "border-rose-700/60", "border");
  el.modalInitStatusMessage.classList.add("border");

  if (type === "loading") {
    el.modalInitStatusMessage.classList.add("bg-blue-950/60", "text-blue-300", "border-blue-700/60");
    el.modalInitStatusMessage.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> ${msg}`;
  } else if (type === "success") {
    el.modalInitStatusMessage.classList.add("bg-emerald-950/60", "text-emerald-300", "border-emerald-700/60");
    el.modalInitStatusMessage.innerHTML = msg;
  } else {
    el.modalInitStatusMessage.classList.add("bg-rose-950/60", "text-rose-300", "border-rose-700/60");
    el.modalInitStatusMessage.innerHTML = msg;
  }
}

// Add Dynamic MCP Server Entry in Create Agent Modal
function addModalMcpServerRow() {
  const mcpId = "modal_mcp_" + Math.random().toString(36).substring(2, 7);
  const row = document.createElement("div");
  row.className = "modal-mcp-row p-2.5 rounded-lg bg-slate-900 border border-slate-700/80 space-y-2 text-xs";
  row.id = mcpId;
  row.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="font-medium text-emerald-400 text-[11px]"><i class="fa-solid fa-network-wired mr-1"></i>MCP HTTP Server</span>
      <button type="button" class="text-slate-400 hover:text-red-400 remove-mcp-btn" title="Remove MCP">
        <i class="fa-solid fa-times text-xs"></i>
      </button>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <input type="text" placeholder="Name (e.g. grep-search)" class="mcp-name bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-slate-200 text-xs">
      <input type="text" placeholder="URL (https://mcp.grep.app)" class="mcp-url bg-slate-950 border border-slate-700/80 rounded px-2 py-1 text-slate-200 text-xs">
    </div>
  `;
  row.querySelector(".remove-mcp-btn").addEventListener("click", () => row.remove());
  if (el.modalMcpServersContainer) el.modalMcpServersContainer.appendChild(row);
}

// Synchronize Modal Quick Inputs to Modal .env Textarea
function syncModalQuickInputsToEnvTextarea() {
  if (!el.modalEnvContentTextarea) return;
  let text = el.modalEnvContentTextarea.value;
  const apiKey = el.modalEnvApiKeyInput ? el.modalEnvApiKeyInput.value.trim() : "";
  const vertex = el.modalEnvVertexSelect ? el.modalEnvVertexSelect.value : "0";
  const model = el.modalEnvModelSelect ? el.modalEnvModelSelect.value : "gemini-3.5-flash";

  if (/^GOOGLE_GENAI_USE_VERTEXAI\s*=.*$/m.test(text)) {
    text = text.replace(/^GOOGLE_GENAI_USE_VERTEXAI\s*=.*$/m, `GOOGLE_GENAI_USE_VERTEXAI=${vertex}  # Set to true to use Vertex AI endpoint`);
  } else {
    text = `GOOGLE_GENAI_USE_VERTEXAI=${vertex}\n` + text;
  }

  if (apiKey) {
    if (/^GOOGLE_API_KEY\s*=.*$/m.test(text)) {
      text = text.replace(/^GOOGLE_API_KEY\s*=.*$/m, `GOOGLE_API_KEY=${apiKey}`);
    } else {
      text = text + `\nGOOGLE_API_KEY=${apiKey}\n`;
    }
  }

  if (/^MODEL\s*=.*$/m.test(text)) {
    text = text.replace(/^MODEL\s*=.*$/m, `MODEL=${model}`);
  } else {
    text = text + `\nMODEL=${model}\n`;
  }
  el.modalEnvContentTextarea.value = text;
}

// Handle Initialize Agent from Modal
async function handleCreateAgentFromModal() {
  const agentId = el.modalAgentIdInput ? el.modalAgentIdInput.value.trim() : "";
  if (!agentId) {
    showModalStatus("Please enter a valid Agent ID.", "error");
    return;
  }

  if (!/^[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(agentId)) {
    showModalStatus("Agent ID must be 1-63 chars: lowercase letters, numbers, hyphens (starting with letter).", "error");
    return;
  }

  const tools = [];
  if (el.modalToolCodeExec && el.modalToolCodeExec.checked) tools.push({ type: "code_execution" });
  if (el.modalToolGoogleSearch && el.modalToolGoogleSearch.checked) tools.push({ type: "google_search" });
  if (el.modalToolUrlContext && el.modalToolUrlContext.checked) tools.push({ type: "url_context" });

  // Optional MCP servers in modal
  if (el.modalMcpServersContainer) {
    const mcpRows = el.modalMcpServersContainer.querySelectorAll(".modal-mcp-row");
    mcpRows.forEach(row => {
      const name = row.querySelector(".mcp-name")?.value.trim();
      const url = row.querySelector(".mcp-url")?.value.trim();
      if (name && url) {
        tools.push({ type: "mcp_server", name: name, url: url });
      }
    });
  }

  const desc = el.modalAgentDescriptionInput ? el.modalAgentDescriptionInput.value.trim() : "";
  const sysInst = el.modalSystemInstructionInput ? el.modalSystemInstructionInput.value.trim() : "";

  // Optional GCS Mount in modal
  let gcsBucket = null;
  let gcsTarget = "/.agent";
  if (el.modalEnableGcsMount && el.modalEnableGcsMount.checked) {
    gcsBucket = el.modalGcsBucketInput ? el.modalGcsBucketInput.value.trim() : "";
    if (!gcsBucket && el.modalSelectGcsBucket && el.modalSelectGcsBucket.value) {
      gcsBucket = `gs://${el.modalSelectGcsBucket.value}`;
    }
    gcsTarget = (el.modalGcsTargetInput ? el.modalGcsTargetInput.value.trim() : "") || "/.agent";
  }

  // Optional Skills in modal
  let skillsType = null;
  let skillsTarget = "./skills";
  let skillsSource = null;
  if (el.modalSkillsTypeSelect && el.modalSkillsTypeSelect.value) {
    skillsType = el.modalSkillsTypeSelect.value;
    skillsTarget = (el.modalSkillsTargetInput ? el.modalSkillsTargetInput.value.trim() : "") || "./skills";
    skillsSource = el.modalSkillsSourceInput ? el.modalSkillsSourceInput.value.trim() : "";
  }

  // Optional .env / API Key in modal
  const envContent = el.modalEnvContentTextarea ? el.modalEnvContentTextarea.value.trim() : "";
  const apiKey = el.modalEnvApiKeyInput ? el.modalEnvApiKeyInput.value.trim() : "";

  showModalStatus("Provisioning agent on Agent Platform control plane... (takes a few seconds)", "loading");
  if (el.btnModalInitializeAgent) el.btnModalInitializeAgent.disabled = true;

  try {
    const res = await fetch("/api/agents/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: agentId,
        base_agent: "antigravity-preview-05-2026",
        description: desc,
        system_instruction: sysInst,
        tools: tools,
        gcs_bucket: gcsBucket || undefined,
        gcs_target: gcsTarget || undefined,
        skills_type: skillsType || undefined,
        skills_target: skillsTarget || undefined,
        skills_source: skillsSource || undefined,
        network_domains: ["*"],
        env_content: envContent || undefined,
        api_key: apiKey || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Initialization failed");
    }

    showModalStatus(`✅ Agent '${agentId}' initialized successfully!`, "success");
    setTimeout(async () => {
      closeCreateAgentModal();
      await loadRegisteredAgents();
      setActiveAgent(agentId);
      appendSystemNotice(`🎉 Successfully created and activated Managed Agent: <strong>${escapeHtml(agentId)}</strong>`);
    }, 700);
  } catch (err) {
    console.error("Agent initialization error:", err);
    showModalStatus(`❌ Error: ${err.message}`, "error");
  } finally {
    if (el.btnModalInitializeAgent) el.btnModalInitializeAgent.disabled = false;
  }
}

// Handle Update Agent Config from Right Panel Configure Tab
async function handleUpdateAgentConfig() {
  const agentId = state.activeAgentId || "antigravity-preview-05-2026";
  const isBase = agentId === "antigravity-preview-05-2026";

  showUpdateAgentStatus("Updating agent configuration...", "loading");
  if (el.btnUpdateAgentConfig) el.btnUpdateAgentConfig.disabled = true;

  try {
    const sysInst = el.systemInstructionInput ? el.systemInstructionInput.value.trim() : "";
    const envContent = el.envContentTextarea ? el.envContentTextarea.value.trim() : "";
    const apiKey = el.envApiKeyInput ? el.envApiKeyInput.value.trim() : "";
    const networkAllow = el.networkAllowlistInput ? el.networkAllowlistInput.value.trim() : "*";

    // 1. Push .env to sandbox
    if (envContent || apiKey) {
      await fetch("/api/sandbox/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment_id: state.environmentId || undefined,
          agent_id: agentId,
          env_content: envContent,
          api_key: apiKey || undefined,
        }),
      });
    }

    if (isBase) {
      showUpdateAgentStatus("✅ Base agent runtime config & sandbox .env updated successfully!", "success");
      appendSystemNotice(`Updated runtime configuration for base agent: <strong>${escapeHtml(agentId)}</strong>`);
    } else {
      // Gather custom agent tools
      const tools = [];
      if (el.toolCodeExecution && el.toolCodeExecution.checked) tools.push({ type: "code_execution" });
      if (el.toolGoogleSearch && el.toolGoogleSearch.checked) tools.push({ type: "google_search" });
      if (el.toolUrlContext && el.toolUrlContext.checked) tools.push({ type: "url_context" });

      if (el.mcpServersContainer) {
        el.mcpServersContainer.querySelectorAll(".p-2\\.5, [id^='mcp_']").forEach(row => {
          const name = row.querySelector(".mcp-name")?.value.trim();
          const url = row.querySelector(".mcp-url")?.value.trim();
          if (name && url) tools.push({ type: "mcp_server", name: name, url: url });
        });
      }

      let gcsBucket = null;
      let gcsTarget = "/.agent";
      if (el.enableGcsMount && el.enableGcsMount.checked) {
        gcsBucket = el.gcsBucketInput ? el.gcsBucketInput.value.trim() : "";
        if (!gcsBucket && el.selectGcsBucket) {
          gcsBucket = el.selectGcsBucket.value ? `gs://${el.selectGcsBucket.value}` : "";
        }
        gcsTarget = (el.gcsTargetInput ? el.gcsTargetInput.value.trim() : "") || "/.agent";
      }

      let skillsType = null;
      let skillsTarget = "./skills";
      let skillsSource = null;
      if (el.skillsTypeSelect && el.skillsTypeSelect.value) {
        skillsType = el.skillsTypeSelect.value;
        skillsTarget = (el.skillsTargetInput ? el.skillsTargetInput.value.trim() : "") || "./skills";
        skillsSource = el.skillsSourceInput ? el.skillsSourceInput.value.trim() : "";
      }

      const currentAg = state.registeredAgents.find(a => a.id === agentId);
      const desc = currentAg?.description || `Managed agent ${agentId}`;

      const res = await fetch("/api/agents/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          base_agent: "antigravity-preview-05-2026",
          description: desc,
          system_instruction: sysInst,
          tools: tools,
          gcs_bucket: gcsBucket || undefined,
          gcs_target: gcsTarget || undefined,
          skills_type: skillsType || undefined,
          skills_target: skillsTarget || undefined,
          skills_source: skillsSource || undefined,
          network_domains: networkAllow ? networkAllow.split(",").map(s => s.trim()).filter(Boolean) : ["*"],
          env_content: envContent || undefined,
          api_key: apiKey || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Update agent failed");

      await loadRegisteredAgents();
      showUpdateAgentStatus("✅ Agent configuration updated successfully!", "success");
      appendSystemNotice(`Saved updated configuration for agent: <strong>${escapeHtml(agentId)}</strong>`);
    }

    setTimeout(() => {
      if (el.updateAgentStatus) el.updateAgentStatus.classList.add("hidden");
    }, 4000);
  } catch (err) {
    console.error("Error updating agent config:", err);
    showUpdateAgentStatus(`❌ ${err.message}`, "error");
  } finally {
    if (el.btnUpdateAgentConfig) el.btnUpdateAgentConfig.disabled = false;
  }
}

function showUpdateAgentStatus(msg, type) {
  if (!el.updateAgentStatus) return;
  el.updateAgentStatus.classList.remove("hidden", "bg-blue-950/60", "text-blue-300", "border-blue-700/60", "bg-emerald-950/60", "text-emerald-300", "border-emerald-700/60", "bg-rose-950/60", "text-rose-300", "border-rose-700/60", "border");
  el.updateAgentStatus.classList.add("border");

  if (type === "loading") {
    el.updateAgentStatus.classList.add("bg-blue-950/60", "text-blue-300", "border-blue-700/60");
    el.updateAgentStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> ${msg}`;
  } else if (type === "success") {
    el.updateAgentStatus.classList.add("bg-emerald-950/60", "text-emerald-300", "border-emerald-700/60");
    el.updateAgentStatus.innerHTML = msg;
  } else {
    el.updateAgentStatus.classList.add("bg-rose-950/60", "text-rose-300", "border-rose-700/60");
    el.updateAgentStatus.innerHTML = msg;
  }
}

// Clear Chat Handler
function handleClearChat() {
  const pane = getOrCreateAgentPane(state.activeAgentId);
  if (!pane) return;
  pane.innerHTML = "";
  const welcome = createWelcomeCardElement(state.activeAgentId);
  pane.appendChild(welcome);
}

// Reset Session Handler
function handleNewSession() {
  state.environmentId = null;
  state.previousInteractionId = null;
  state.turnCount = 0;
  if (el.activeEnvBadge) {
    el.activeEnvBadge.textContent = "None (New)";
    el.activeEnvBadge.title = "A new sandbox will be provisioned on next message";
  }
  if (el.turnInfo) el.turnInfo.textContent = "Turn: 0";
  resetFilesExplorerState();
  appendSystemNotice(`🔄 Sandbox reset for <strong>${escapeHtml(state.activeAgentId)}</strong>: Next interaction will provision a clean container.`);
}

// Add Dynamic MCP Server Entry
function addMcpServerRow() {
  const mcpId = "mcp_" + Math.random().toString(36).substring(2, 7);
  const row = document.createElement("div");
  row.className = "p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs";
  row.id = mcpId;
  row.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="font-medium text-emerald-400">MCP Streamable HTTP Server</span>
      <button type="button" class="text-slate-500 hover:text-red-400 remove-mcp-btn" title="Remove MCP">
        <i class="fa-solid fa-times"></i>
      </button>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <input type="text" placeholder="Name (e.g. grep-search)" class="mcp-name bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-slate-200">
      <input type="text" placeholder="URL (https://mcp.grep.app)" class="mcp-url bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-slate-200">
    </div>
    <div class="grid grid-cols-2 gap-2">
      <input type="text" placeholder="Auth Header (Bearer ya29...)" class="mcp-token bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-slate-200">
      <input type="text" placeholder="X-Goog-User-Project (optional)" class="mcp-project bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-slate-200">
    </div>
  `;
  row.querySelector(".remove-mcp-btn").addEventListener("click", () => row.remove());
  if (el.mcpServersContainer) el.mcpServersContainer.appendChild(row);
}

// Synchronize Quick Inputs (API Key, Vertex, Model) with .env Content
function syncQuickInputsToEnvTextarea() {
  if (!el.envContentTextarea) return;
  let text = el.envContentTextarea.value;
  const apiKey = el.envApiKeyInput ? el.envApiKeyInput.value.trim() : "";
  const vertex = el.envVertexSelect ? el.envVertexSelect.value : "0";
  const model = el.envModelSelect ? el.envModelSelect.value : "gemini-3.5-flash";

  if (/^GOOGLE_GENAI_USE_VERTEXAI\s*=.*$/m.test(text)) {
    text = text.replace(/^GOOGLE_GENAI_USE_VERTEXAI\s*=.*$/m, `GOOGLE_GENAI_USE_VERTEXAI=${vertex}  # Set to true to use Vertex AI endpoint`);
  } else {
    text = `GOOGLE_GENAI_USE_VERTEXAI=${vertex}\n` + text;
  }

  if (apiKey) {
    if (/^GOOGLE_API_KEY\s*=.*$/m.test(text)) {
      text = text.replace(/^GOOGLE_API_KEY\s*=.*$/m, `GOOGLE_API_KEY=${apiKey} # Set if GOOGLE_GENAI_USE_VERTEXAI=0`);
    } else {
      text = text.replace(/^(GOOGLE_GENAI_USE_VERTEXAI=.*)$/m, `$1\nGOOGLE_API_KEY=${apiKey}`);
    }
  }

  if (model) {
    if (/^MODEL\s*=.*$/m.test(text)) {
      text = text.replace(/^MODEL\s*=.*$/m, `MODEL=${model}`);
    } else {
      text += `\nMODEL=${model}`;
    }
  }

  el.envContentTextarea.value = text;
}

// Synchronize .env Textarea Content to Quick Inputs
function syncEnvTextareaToQuickInputs() {
  if (!el.envContentTextarea) return;
  const text = el.envContentTextarea.value;

  const keyMatch = text.match(/^GOOGLE_API_KEY\s*=\s*([^\s#]+)/m);
  if (keyMatch && el.envApiKeyInput) {
    el.envApiKeyInput.value = keyMatch[1].trim();
  }

  const vertexMatch = text.match(/^GOOGLE_GENAI_USE_VERTEXAI\s*=\s*([01])/m);
  if (vertexMatch && el.envVertexSelect) {
    el.envVertexSelect.value = vertexMatch[1].trim();
  }

  const modelMatch = text.match(/^MODEL\s*=\s*([^\s#]+)/m);
  if (modelMatch && el.envModelSelect) {
    el.envModelSelect.value = modelMatch[1].trim();
  }

  if (el.envActiveBadge) {
    el.envActiveBadge.textContent = "Configured";
    el.envActiveBadge.className = "text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded";
  }
}

// Handle Push .env to Active Sandbox
async function handleApplyEnvToSandbox() {
  const envContent = el.envContentTextarea ? el.envContentTextarea.value.trim() : "";
  const apiKey = el.envApiKeyInput ? el.envApiKeyInput.value.trim() : "";

  if (!envContent) {
    showEnvStatus("No .env content to push.", "error");
    return;
  }

  showEnvStatus("Pushing .env to active Sandbox container...", "loading");
  if (el.btnApplyEnvToSandbox) el.btnApplyEnvToSandbox.disabled = true;

  try {
    const res = await fetch("/api/sandbox/env", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        environment_id: state.environmentId,
        agent_id: state.activeAgentId,
        env_content: envContent,
        api_key: apiKey,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Failed to update .env in sandbox");
    }

    if (data.environment_id && !state.environmentId) {
      state.environmentId = data.environment_id;
      if (el.activeEnvBadge) {
        el.activeEnvBadge.textContent = data.environment_id;
        el.activeEnvBadge.title = `Sandbox ID: ${data.environment_id}`;
      }
    }

    showEnvStatus("✅ .env updated and synced to sandbox!", "success");
    appendSystemNotice(`🔑 Applied <code>.env</code> file configuration to active Sandbox container.`);

    // Refresh file explorer from server
    await syncFilesFromSandbox(true);

    // If .env is open in editor, re-open it to show latest content
    if (state.filesState.activeFilePath === ".env" || state.filesState.activeFilePath?.endsWith(".env")) {
      const activeP = state.filesState.activeFilePath;
      if (state.filesState.files[activeP]) {
        state.filesState.files[activeP].content = envContent;
        displayFileInEditor(activeP, state.filesState.files[activeP]);
      }
    }
  } catch (err) {
    console.error("Error updating sandbox .env:", err);
    showEnvStatus(`❌ ${err.message}`, "error");
  } finally {
    if (el.btnApplyEnvToSandbox) el.btnApplyEnvToSandbox.disabled = false;
  }
}

// Status toast for .env operations
function showEnvStatus(msg, type) {
  if (!el.applyEnvStatus) return;
  el.applyEnvStatus.classList.remove(
    "hidden", "bg-blue-950/60", "text-blue-300", "border-blue-700/60",
    "bg-emerald-950/60", "text-emerald-300", "border-emerald-700/60",
    "bg-rose-950/60", "text-rose-300", "border-rose-700/60", "border"
  );
  el.applyEnvStatus.classList.add("border");

  if (type === "loading") {
    el.applyEnvStatus.classList.add("bg-blue-950/60", "text-blue-300", "border-blue-700/60");
    el.applyEnvStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> ${msg}`;
  } else if (type === "success") {
    el.applyEnvStatus.classList.add("bg-emerald-950/60", "text-emerald-300", "border-emerald-700/60");
    el.applyEnvStatus.innerHTML = msg;
    setTimeout(() => {
      el.applyEnvStatus.classList.add("hidden");
    }, 4000);
  } else if (type === "info") {
    el.applyEnvStatus.classList.add("bg-blue-950/60", "text-blue-300", "border-blue-700/60");
    el.applyEnvStatus.innerHTML = msg;
    setTimeout(() => {
      el.applyEnvStatus.classList.add("hidden");
    }, 3000);
  } else {
    el.applyEnvStatus.classList.add("bg-rose-950/60", "text-rose-300", "border-rose-700/60");
    el.applyEnvStatus.innerHTML = msg;
  }
}

// Send Chat Message & Handle SSE Streaming (Per-Agent Concurrency & Background Execution)
async function sendMessage() {
  const text = el.messageInput.value.trim();
  const targetAgent = state.activeAgentId;
  const session = getAgentSession(targetAgent);
  if (!text || session.isGenerating) return;

  const targetPane = getOrCreateAgentPane(targetAgent);

  // Remove welcome card if inside targetPane
  const welcomeCard = targetPane.querySelector(".welcome-card");
  if (welcomeCard) welcomeCard.remove();

  // Append user message to targetPane
  appendUserMessage(text, targetPane);
  el.messageInput.value = "";
  el.messageInput.style.height = "auto";

  // Create assistant message card inside targetPane
  const msgCard = createAssistantMessageCard(targetAgent);
  targetPane.appendChild(msgCard.card);
  if (state.activeAgentId === targetAgent) {
    scrollToBottom();
  }

  setGenerating(true, targetAgent);
  session.abortController = new AbortController();
  session.turnCount += 1;
  session.status = "running";
  renderAgentsList();

  if (state.activeAgentId === targetAgent && el.turnInfo) {
    el.turnInfo.textContent = `Turn: ${session.turnCount}`;
  }

  const envContent = el.envContentTextarea ? el.envContentTextarea.value.trim() : null;

  const payload = {
    agent_id: targetAgent,
    message: text,
    environment_id: session.environmentId || undefined,
    previous_interaction_id: session.previousInteractionId || undefined,
    env_content: envContent || undefined,
  };

  try {
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: session.abortController.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Server returned ${response.status}: ${errText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullOutputText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const dataStr = line.slice(6).trim();
        if (dataStr === "[DONE]") {
          msgCard.statusBadge.textContent = "Complete";
          msgCard.statusBadge.className = "px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
          session.status = "complete";
          continue;
        }

        try {
          const evt = JSON.parse(dataStr);
          handleStreamEvent(evt, msgCard, targetAgent, (deltaText, isFallback) => {
            if (isFallback) {
              if (!fullOutputText.trim()) {
                fullOutputText = deltaText;
                msgCard.textContainer.innerHTML = marked.parse(fullOutputText);
                linkifySandboxFiles(msgCard.textContainer);
                if (state.activeAgentId === targetAgent) scrollToBottom();
              }
            } else {
              fullOutputText += deltaText;
              msgCard.textContainer.innerHTML = marked.parse(fullOutputText);
              linkifySandboxFiles(msgCard.textContainer);
              if (state.activeAgentId === targetAgent) scrollToBottom();
            }
          });
        } catch (parseErr) {
          console.warn("Could not parse SSE event JSON:", dataStr, parseErr);
        }
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      msgCard.statusBadge.textContent = "Stopped";
      msgCard.statusBadge.className = "px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20";
      appendSystemNotice("Generation stopped by user.", targetAgent);
      session.status = "stopped";
    } else {
      console.error("Chat error for agent " + targetAgent + ":", err);
      msgCard.statusBadge.textContent = "Error";
      msgCard.statusBadge.className = "px-2 py-0.5 rounded text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20";
      msgCard.textContainer.innerHTML += `<div class="p-3 mt-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs"><strong>Error:</strong> ${escapeHtml(err.message)}</div>`;
      session.status = "error";
    }
  } finally {
    setGenerating(false, targetAgent);
    session.abortController = null;
    renderAgentsList();
    if (state.activeAgentId === targetAgent) {
      updateSendControlsForActiveAgent();
      scrollToBottom();
    }
  }
}

// Handle Incoming Event from SSE Stream
function handleStreamEvent(evt, msgCard, targetAgent, appendTextCb) {
  const type = evt.event_type || "";
  const session = getAgentSession(targetAgent);

  if (type === "connecting") {
    msgCard.statusBadge.textContent = "Connecting";
    msgCard.statusBadge.className = "px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse";
  } else if (type === "interaction.created") {
    if (evt.interaction_id) {
      session.previousInteractionId = evt.interaction_id;
    }
    if (evt.environment_id) {
      session.environmentId = evt.environment_id;
      state.agentEnvironments[targetAgent] = evt.environment_id;
      if (state.activeAgentId === targetAgent) {
        if (el.activeEnvBadge) {
          el.activeEnvBadge.textContent = evt.environment_id;
          el.activeEnvBadge.title = `Persistent Sandbox ID: ${evt.environment_id}`;
        }
        if (el.envActiveBadge) {
          el.envActiveBadge.textContent = "Active";
          el.envActiveBadge.className = "text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded";
        }
      }
    }
  } else if (type === "step.start") {
    const stepType = (evt.step_type || evt.step?.type || "").toLowerCase();
    const toolName = evt.tool || (stepType.includes("code") ? "code_execution" : stepType.includes("search") ? "google_search" : stepType || "sandbox_action");
    const callId = `step-${evt.index ?? Date.now()}`;

    if (stepType.includes("code") || stepType.includes("search") || stepType.includes("tool") || evt.tool) {
      msgCard.statusBadge.textContent = stepType.includes("code") ? "Executing code..." : stepType.includes("search") ? "Searching web..." : "Executing tool...";
      msgCard.statusBadge.className = "px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse";
      const block = renderToolCallBlock(toolName, callId, msgCard);
      const cmd = evt.command || evt.step?.command || evt.step?.code;
      if (cmd) {
        const outputDiv = block.querySelector(".tool-output");
        if (outputDiv) {
          outputDiv.classList.remove("hidden");
          outputDiv.textContent = `$ ${cmd}\n`;
        }
      }
    } else if (stepType.includes("thought")) {
      msgCard.statusBadge.textContent = "Reasoning...";
      msgCard.statusBadge.className = "px-2 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 animate-pulse";
    }
  } else if (type === "step.delta") {
    // 1. Text delta
    const textDelta = evt.text || evt.delta?.text;
    if (textDelta) {
      msgCard.statusBadge.textContent = "Responding";
      msgCard.statusBadge.className = "px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      appendTextCb(textDelta, false);
    }
    // 2. Thought delta
    const thoughtDelta = evt.thought || evt.delta?.thought;
    if (thoughtDelta) {
      msgCard.statusBadge.textContent = "Reasoning...";
      msgCard.statusBadge.className = "px-2 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 animate-pulse";
      renderOrAppendThought(thoughtDelta, msgCard);
    }
    // 3. Code or Command delta
    const codeDelta = evt.code || evt.delta?.code || evt.command || evt.delta?.command;
    const callId = `step-${evt.index ?? ""}`;
    if (codeDelta) {
      appendToolCodeOrOutput(codeDelta, callId, msgCard);
    }
    // 4. Output delta
    const outDelta = evt.output || evt.delta?.output;
    if (outDelta) {
      appendToolCodeOrOutput(outDelta, callId, msgCard);
    }
  } else if (type === "step.stop") {
    const callId = `step-${evt.index ?? ""}`;
    const result = evt.result || evt.step?.output || evt.step?.result;
    if (result) {
      updateToolResultBlock("tool", result, callId, msgCard);
    }
  } else if (type === "interaction.completed" || type === "interaction_end") {
    if (evt.interaction_id) {
      session.previousInteractionId = evt.interaction_id;
    }
    if (evt.environment_id) {
      session.environmentId = evt.environment_id;
      state.agentEnvironments[targetAgent] = evt.environment_id;
      if (state.activeAgentId === targetAgent) {
        if (el.activeEnvBadge) {
          el.activeEnvBadge.textContent = evt.environment_id;
          el.activeEnvBadge.title = `Persistent Sandbox ID: ${evt.environment_id}`;
        }
        if (el.envActiveBadge) {
          el.envActiveBadge.textContent = "Active";
          el.envActiveBadge.className = "text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded";
        }
      }
    }
    const finalOut = evt.output_text || evt.final_output || evt.text;
    if (finalOut) {
      appendTextCb(finalOut, true);
    }
    if (Array.isArray(evt.sandbox_files) && evt.sandbox_files.length > 0) {
      if (state.activeAgentId === targetAgent) {
        evt.sandbox_files.forEach(f => {
          state.filesState.files[f.path] = f;
          const parts = f.path.split("/");
          let cur = "";
          for (let i = 0; i < parts.length - 1; i++) {
            cur = cur ? `${cur}/${parts[i]}` : parts[i];
            state.filesState.expandedDirs.add(cur);
          }
        });
        state.filesState.tree = evt.sandbox_tree || buildClientTree(state.filesState.files);
        function autoExpand(nodes) {
          if (!nodes) return;
          for (const n of nodes) {
            if (n.type === "directory" || n.type === "dir") {
              state.filesState.expandedDirs.add(n.path);
              if (n.children) autoExpand(n.children);
            }
          }
        }
        autoExpand(state.filesState.tree);
        renderFileTree();
      }
    }
    msgCard.statusBadge.textContent = "Complete";
    msgCard.statusBadge.className = "px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    session.status = "complete";
  } else if (type === "sandbox.file_updated" || type === "sandbox_file_created" || type === "sandbox_file_updated") {
    handleSandboxFileUpdated(evt, msgCard, targetAgent);
  } else if (type === "thought") {
    renderOrAppendThought(evt.content || evt.thought, msgCard);
  } else if (type === "tool_call") {
    renderToolCallBlock(evt.tool, evt.call_id, msgCard);
  } else if (type === "tool_result") {
    updateToolResultBlock(evt.tool, evt.result, evt.call_id, msgCard);
  } else if (type === "text") {
    msgCard.statusBadge.textContent = "Responding";
    msgCard.statusBadge.className = "px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    appendTextCb(evt.content || evt.text, false);
  } else if (type === "error") {
    msgCard.statusBadge.textContent = "Failed";
    msgCard.statusBadge.className = "px-2 py-0.5 rounded text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20";
    msgCard.textContainer.innerHTML += `<div class="p-3 mt-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">❌ <strong>Error:</strong> ${escapeHtml(evt.error || evt.message || "Unknown error")}</div>`;
    session.status = "error";
  }
}

// Append User Message to Chat
function appendUserMessage(text, targetPane = null) {
  const card = document.createElement("div");
  card.className = "flex items-start justify-end gap-3 animate-fade-in";
  card.innerHTML = `
    <div class="max-w-2xl bg-blue-600/90 text-white rounded-2xl rounded-tr-none px-4 py-3 shadow-md text-xs leading-relaxed break-words whitespace-pre-wrap">
      ${escapeHtml(text)}
    </div>
    <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-slate-700 to-slate-600 flex items-center justify-center text-white text-xs shrink-0 shadow-md">
      <i class="fa-solid fa-user"></i>
    </div>
  `;
  const pane = targetPane || getOrCreateAgentPane(state.activeAgentId);
  if (pane) pane.appendChild(card);
}

// Create Assistant Message Card Container
function createAssistantMessageCard(targetAgent = null) {
  const card = document.createElement("div");
  card.className = "flex items-start gap-3 animate-fade-in";

  const agentId = targetAgent || state.activeAgentId || "antigravity-preview-05-2026";
  const isBase = agentId === "antigravity-preview-05-2026";
  const icon = isBase ? "fa-bolt" : "fa-robot";
  const iconColor = isBase ? "text-amber-400" : "text-indigo-400";
  const avatarBg = isBase ? "bg-amber-500/10 border-amber-500/20" : "bg-indigo-500/10 border-indigo-500/20";

  card.innerHTML = `
    <div class="w-8 h-8 rounded-xl ${avatarBg} border flex items-center justify-center ${iconColor} text-xs shrink-0 shadow-md">
      <i class="fa-solid ${icon}"></i>
    </div>
    <div class="flex-1 max-w-3xl space-y-2.5">
      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold text-slate-200 font-mono">${escapeHtml(agentId)}</span>
        <span class="msg-status-badge px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse">
          Starting...
        </span>
      </div>
      <div class="msg-thoughts space-y-2"></div>
      <div class="msg-tools space-y-2"></div>
      <div class="msg-text markdown-body bg-slate-900/40 border border-slate-800/80 rounded-2xl rounded-tl-none p-4 text-xs shadow-inner"></div>
    </div>
  `;

  return {
    card: card,
    statusBadge: card.querySelector(".msg-status-badge"),
    thoughtsContainer: card.querySelector(".msg-thoughts"),
    toolsContainer: card.querySelector(".msg-tools"),
    textContainer: card.querySelector(".msg-text"),
  };
}

// Render or Incrementally Append to Thought Block
function renderOrAppendThought(thoughtText, msgCard) {
  if (!thoughtText) return;
  let thoughtDiv = msgCard.thoughtsContainer.querySelector(".thought-content");
  if (!thoughtDiv) {
    const block = document.createElement("details");
    block.className = "group rounded-xl bg-purple-950/20 border border-purple-800/30 overflow-hidden text-xs";
    block.innerHTML = `
      <summary class="flex items-center justify-between px-3 py-1.5 cursor-pointer text-purple-300 font-medium hover:bg-purple-900/20 select-none transition">
        <span class="flex items-center gap-1.5 text-[11px]">
          <i class="fa-solid fa-brain text-purple-400 text-xs"></i>
          <span>Thought Process</span>
        </span>
        <i class="fa-solid fa-chevron-down text-[10px] text-purple-400 group-open:rotate-180 transition-transform"></i>
      </summary>
      <div class="thought-content px-3 py-2 border-t border-purple-800/20 text-[11px] text-purple-200/90 whitespace-pre-wrap font-mono leading-relaxed bg-purple-950/30"></div>
    `;
    msgCard.thoughtsContainer.appendChild(block);
    thoughtDiv = block.querySelector(".thought-content");
  }
  thoughtDiv.textContent += thoughtText;
  scrollToBottom();
}

// Render Collapsible Thought Block
function renderThoughtBlock(thoughtText, msgCard) {
  renderOrAppendThought(thoughtText, msgCard);
}

// Append Code or Output to Active Tool Block
function appendToolCodeOrOutput(text, callId, msgCard) {
  if (!text) return;
  let block = callId ? document.getElementById(callId) : msgCard.toolsContainer.lastElementChild;
  if (!block) return;
  const outputDiv = block.querySelector(".tool-output");
  if (outputDiv) {
    outputDiv.classList.remove("hidden");
    outputDiv.textContent += text;
  }
  scrollToBottom();
}

// Render Tool Call Block
function renderToolCallBlock(toolName, callId, msgCard) {
  const safeId = callId || `tool-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  let existing = document.getElementById(safeId);
  if (existing) return existing;

  const block = document.createElement("div");
  block.className = "tool-block rounded-xl bg-slate-900 border border-slate-800 p-3 text-xs space-y-1.5 transition";
  block.id = safeId;
  
  let toolIcon = "fa-screwdriver-wrench";
  let toolColor = "text-blue-400";
  const lowerName = (toolName || "tool").toLowerCase();
  if (lowerName.includes("bash") || lowerName.includes("code") || lowerName.includes("execute")) {
    toolIcon = "fa-terminal";
    toolColor = "text-amber-400";
  } else if (lowerName.includes("search")) {
    toolIcon = "fa-google";
    toolColor = "text-blue-400";
  } else if (lowerName.includes("url")) {
    toolIcon = "fa-link";
    toolColor = "text-indigo-400";
  }

  block.innerHTML = `
    <div class="flex items-center justify-between text-[11px]">
      <div class="flex items-center gap-2">
        <i class="fa-solid ${toolIcon} ${toolColor}"></i>
        <span class="font-mono font-medium text-slate-200">${escapeHtml(toolName || "Code Execution")}</span>
      </div>
      <span class="tool-status flex items-center gap-1 text-slate-400 text-[10px]">
        <i class="fa-solid fa-spinner fa-spin text-blue-400"></i> Executing in Sandbox...
      </span>
    </div>
    <div class="tool-output hidden p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 font-mono text-[10px] text-slate-300 max-h-48 overflow-y-auto whitespace-pre-wrap custom-scrollbar"></div>
  `;
  msgCard.toolsContainer.appendChild(block);
  scrollToBottom();
  return block;
}

// Update Tool Result Block
function updateToolResultBlock(toolName, result, callId, msgCard) {
  let block = null;
  if (callId) {
    block = document.getElementById(callId);
  }
  if (!block && msgCard.toolsContainer.lastElementChild) {
    block = msgCard.toolsContainer.lastElementChild;
  }
  if (!block) return;

  const statusSpan = block.querySelector(".tool-status");
  const outputDiv = block.querySelector(".tool-output");

  if (statusSpan) {
    statusSpan.innerHTML = `<i class="fa-solid fa-check text-emerald-400"></i> Done`;
    statusSpan.className = "tool-status text-emerald-400 text-[10px] font-medium";
  }

  if (outputDiv && result) {
    outputDiv.classList.remove("hidden");
    let outText = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    if (!outputDiv.textContent.includes(outText)) {
      outputDiv.textContent += (outputDiv.textContent ? "\n" : "") + outText;
    }
  }
  scrollToBottom();
}

// Append System Notice Message
function appendSystemNotice(html, targetAgent = null) {
  const agentId = targetAgent || state.activeAgentId;
  const pane = getOrCreateAgentPane(agentId);
  if (!pane) return;
  const notice = document.createElement("div");
  notice.className = "text-center my-2 text-[11px] text-slate-400 font-sans";
  notice.innerHTML = `<span class="px-3 py-1 rounded-full bg-slate-900 border border-slate-800">${html}</span>`;
  pane.appendChild(notice);
  if (state.activeAgentId === agentId) {
    scrollToBottom();
  }
}

// Helper: Set Generating State
function setGenerating(isGen, agentId = null) {
  const targetId = agentId || state.activeAgentId;
  const session = getAgentSession(targetId);
  session.isGenerating = isGen;
  if (!isGen && session.status === "running") {
    session.status = "idle";
  }
  renderAgentsList();
  if (targetId === state.activeAgentId) {
    updateSendControlsForActiveAgent();
  }
}

// Helper: Scroll Chat to Bottom
function scrollToBottom() {
  if (el.chatMessages) {
    el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
  }
}

// Escape HTML
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Linkify Sandbox Files inside Assistant Output
function linkifySandboxFiles(container) {
  if (!container) return;
  const filePaths = Object.keys(state.filesState.files);
  if (filePaths.length === 0) return;

  container.querySelectorAll("code").forEach(codeEl => {
    const text = codeEl.textContent.trim();
    if (state.filesState.files[text]) {
      codeEl.classList.add("sandbox-file-link");
      codeEl.style.cursor = "pointer";
      codeEl.title = `Click to view /workspace/${text} in code editor`;
      codeEl.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openFileInEditor(text);
      };
    }
  });
}

// ==========================================
// SANDBOX FILESYSTEM EXPLORER & CODE EDITOR
// ==========================================

function renderFileTree() {
  if (!el.fileTreeContainer) return;
  el.fileTreeContainer.innerHTML = "";

  const filesMap = state.filesState.files;
  const totalCount = Object.keys(filesMap).length;

  if (el.treeFilesCount) el.treeFilesCount.textContent = totalCount;
  if (el.filesCountBadge) el.filesCountBadge.textContent = totalCount;

  if (totalCount === 0) {
    el.fileTreeContainer.innerHTML = `
      <div class="p-3 text-center text-slate-500 text-xs space-y-1">
        <i class="fa-solid fa-inbox text-base opacity-40"></i>
        <p>No sandbox files discovered yet.</p>
      </div>
    `;
    return;
  }

  const filter = (state.filesState.searchFilter || "").toLowerCase().trim();
  const tree = state.filesState.tree || buildClientTree(filesMap);

  function renderNodes(nodes, container, depth = 0) {
    nodes.forEach(node => {
      const isDir = (node.type === "directory" || node.type === "dir");

      if (!isDir && filter && !node.path.toLowerCase().includes(filter)) {
        return;
      }

      if (isDir) {
        const hasMatchingChild = !filter || checkDirHasMatchingChild(node, filter) || node.name.toLowerCase().includes(filter);
        if (!hasMatchingChild) return;

        const isExpanded = state.filesState.expandedDirs.has(node.path) || filter.length > 0;
        const dirEl = document.createElement("div");
        dirEl.className = "space-y-0.5";

        const header = document.createElement("div");
        header.className = `tree-item hover:bg-slate-800/60 rounded px-1.5 py-1 flex items-center gap-1.5 text-slate-300 font-medium cursor-pointer select-none text-[11px]`;
        header.style.paddingLeft = `${depth * 10 + 6}px`;
        header.innerHTML = `
          <i class="fa-solid fa-chevron-right text-[9px] text-slate-500 transition-transform ${isExpanded ? 'rotate-90 text-blue-400' : ''}"></i>
          <i class="fa-solid ${isExpanded ? 'fa-folder-open text-blue-400' : 'fa-folder text-blue-400'} text-xs"></i>
          <span class="truncate">${escapeHtml(node.name)}</span>
        `;

        header.addEventListener("click", () => {
          if (state.filesState.expandedDirs.has(node.path)) {
            state.filesState.expandedDirs.delete(node.path);
          } else {
            state.filesState.expandedDirs.add(node.path);
          }
          renderFileTree();
        });

        dirEl.appendChild(header);

        if (isExpanded && node.children && node.children.length > 0) {
          const childrenContainer = document.createElement("div");
          childrenContainer.className = "space-y-0.5";
          renderNodes(node.children, childrenContainer, depth + 1);
          dirEl.appendChild(childrenContainer);
        }

        container.appendChild(dirEl);
      } else {
        // File node
        const isSelected = state.filesState.activeFilePath === node.path;
        const fileInfo = getFileInfo(node.path, node.content || "");
        const fileEl = document.createElement("div");
        fileEl.className = `tree-item rounded px-1.5 py-1 flex items-center justify-between text-[11px] cursor-pointer select-none transition ${
          isSelected ? 'bg-blue-600/20 text-blue-300 font-medium border-l-2 border-blue-500' : 'text-slate-300 hover:bg-slate-800/50 hover:text-white'
        }`;
        fileEl.style.paddingLeft = `${depth * 10 + 16}px`;

        fileEl.innerHTML = `
          <div class="flex items-center gap-1.5 min-w-0">
            <i class="${fileInfo.icon} ${fileInfo.colorClass} text-xs shrink-0"></i>
            <span class="truncate font-mono text-[11px]">${escapeHtml(node.name)}</span>
          </div>
          <span class="text-[9px] text-slate-500 font-mono">${formatBytes(node.size || 0)}</span>
        `;

        fileEl.addEventListener("click", () => {
          openFileInEditor(node.path);
        });

        container.appendChild(fileEl);
      }
    });
  }

  renderNodes(tree, el.fileTreeContainer, 0);
}

function checkDirHasMatchingChild(dirNode, filter) {
  if (!dirNode.children) return false;
  return dirNode.children.some(child => {
    if (child.type === "file") return child.path.toLowerCase().includes(filter);
    if (child.type === "directory" || child.type === "dir") return checkDirHasMatchingChild(child, filter) || child.name.toLowerCase().includes(filter);
    return false;
  });
}

// Build Client-Side Tree Structure from Flat Files Map
function buildClientTree(filesMap) {
  const root = [];
  const dirs = {};

  const paths = Object.keys(filesMap).sort();

  paths.forEach(p => {
    const parts = p.split("/");
    const fileName = parts.pop();
    let currentLevel = root;
    let currentPath = "";

    parts.forEach(part => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!dirs[currentPath]) {
        const dirNode = {
          type: "directory",
          name: part,
          path: currentPath,
          children: [],
        };
        dirs[currentPath] = dirNode;
        currentLevel.push(dirNode);
      }
      currentLevel = dirs[currentPath].children;
    });

    currentLevel.push({
      type: "file",
      name: fileName,
      path: p,
      size: filesMap[p].size || (filesMap[p].content ? filesMap[p].content.length : 0),
      language: filesMap[p].language || "plaintext",
      updated_at: filesMap[p].updated_at || "",
      content: filesMap[p].content || "",
    });
  });

  return root;
}

// Open File in Code Editor / Viewer
async function openFileInEditor(path) {
  if (!path) return;

  // If clicked item is actually a directory, toggle expansion in tree
  if (state.filesState.tree) {
    function findNode(nodes) {
      for (const n of nodes) {
        if (n.path === path) return n;
        if (n.children) {
          const res = findNode(n.children);
          if (res) return res;
        }
      }
      return null;
    }
    const node = findNode(state.filesState.tree);
    if (node && (node.type === "directory" || node.type === "dir")) {
      if (state.filesState.expandedDirs.has(path)) {
        state.filesState.expandedDirs.delete(path);
      } else {
        state.filesState.expandedDirs.add(path);
      }
      renderFileTree();
      return;
    }
  }

  state.filesState.activeFilePath = path;
  state.filesState.isEditing = false;
  renderFileTree();

  // Make sure inspector right panel is visible
  if (el.rightPanel && el.rightPanel.classList.contains("hidden")) {
    el.rightPanel.classList.remove("hidden");
    const resizer = document.getElementById("rightPanelResizer");
    if (resizer) resizer.classList.remove("hidden");
  }
  switchRightTab("files");

  let fileData = state.filesState.files[path];
  if (!fileData || typeof fileData.content === "undefined") {
    try {
      const envId = state.environmentId || "";
      const res = await fetch(`/api/sandbox/file?path=${encodeURIComponent(path)}&environment_id=${encodeURIComponent(envId)}`);
      if (res.ok) {
        fileData = await res.json();
        state.filesState.files[path] = fileData;
      }
    } catch (e) {
      console.warn("Could not fetch file content:", e);
    }
  }

  if (!fileData) {
    fileData = { path: path, name: path.split("/").pop(), content: "", size: 0, language: "plaintext" };
  }

  displayFileInEditor(path, fileData);
}

// Display File Content in Editor with Highlight.js and Line Numbers
function displayFileInEditor(path, fileData) {
  const content = fileData.content || "";
  const fileInfo = getFileInfo(path, content);

  if (el.editorEmptyState) el.editorEmptyState.classList.add("hidden");
  if (el.editorActions) el.editorActions.classList.remove("hidden");

  if (el.editorFilePath) {
    el.editorFilePath.textContent = path;
    el.editorFilePath.title = `/workspace/${path}`;
  }
  if (el.editorFileIcon) {
    el.editorFileIcon.innerHTML = `<i class="${fileInfo.icon} ${fileInfo.colorClass}"></i>`;
  }
  if (el.editorLangBadge) {
    el.editorLangBadge.classList.remove("hidden");
    el.editorLangBadge.textContent = fileInfo.badge;
  }
  if (el.editorFileSize) {
    el.editorFileSize.classList.remove("hidden");
    el.editorFileSize.textContent = formatBytes(fileData.size || content.length);
  }

  // Syntax highlighting
  let highlighted = "";
  if (window.hljs) {
    try {
      if (fileInfo.lang && hljs.getLanguage(fileInfo.lang)) {
        highlighted = hljs.highlight(content, { language: fileInfo.lang, ignoreIllegals: true }).value;
      } else {
        const autoRes = hljs.highlightAuto(content);
        highlighted = autoRes.value;
        if (autoRes.language && fileInfo.badge === "File" && el.editorLangBadge) {
          el.editorLangBadge.textContent = autoRes.language.toUpperCase();
        }
      }
    } catch (e) {
      highlighted = escapeHtml(content);
    }
  } else {
    highlighted = escapeHtml(content);
  }

  if (el.editorCodeBlock) el.editorCodeBlock.innerHTML = highlighted;

  // Generate line numbers
  const lines = content.split("\n");
  const lineNums = [];
  for (let i = 1; i <= Math.max(lines.length, 1); i++) {
    lineNums.push(i);
  }
  if (el.editorLineNumbers) el.editorLineNumbers.innerHTML = lineNums.join("<br>");

  // Fill editable textarea
  if (el.editorTextarea) el.editorTextarea.value = content;

  // Show viewer by default
  if (el.editorViewerContainer) el.editorViewerContainer.classList.remove("hidden");
  if (el.editorEditContainer) el.editorEditContainer.classList.add("hidden");
  if (el.btnToggleEditMode) {
    el.btnToggleEditMode.innerHTML = `<i class="fa-solid fa-pen-to-square text-[10px]"></i> <span>Edit</span>`;
    el.btnToggleEditMode.className = "px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition flex items-center gap-1";
  }
}

// Toggle between Code Viewer and Code Editor
function toggleEditorMode() {
  state.filesState.isEditing = !state.filesState.isEditing;

  if (state.filesState.isEditing) {
    el.editorViewerContainer.classList.add("hidden");
    el.editorEditContainer.classList.remove("hidden");
    el.btnToggleEditMode.innerHTML = `<i class="fa-solid fa-eye text-[10px]"></i> <span>Preview</span>`;
    el.btnToggleEditMode.className = "px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium transition flex items-center gap-1";
    el.editorTextarea.focus();
  } else {
    // Sync textarea content back to viewer
    const newContent = el.editorTextarea.value;
    if (state.filesState.activeFilePath && state.filesState.files[state.filesState.activeFilePath]) {
      state.filesState.files[state.filesState.activeFilePath].content = newContent;
      state.filesState.files[state.filesState.activeFilePath].size = newContent.length;
      displayFileInEditor(state.filesState.activeFilePath, state.filesState.files[state.filesState.activeFilePath]);
    }
  }
}

// Save File Changes Directly to Sandbox
async function handleSaveFileToSandbox() {
  const filePath = state.filesState.activeFilePath;
  if (!filePath) return;

  const content = state.filesState.isEditing ? el.editorTextarea.value : (state.filesState.files[filePath]?.content || el.editorTextarea.value);
  const envId = state.environmentId;

  if (!envId) {
    alert("No active sandbox container found. Please start a conversation turn first.");
    return;
  }

  const origHtml = el.btnSaveFileSandbox.innerHTML;
  el.btnSaveFileSandbox.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-[10px]"></i> Saving...`;
  el.btnSaveFileSandbox.disabled = true;

  try {
    const res = await fetch("/api/sandbox/file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        environment_id: envId,
        path: filePath,
        content: content,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }

    // Update in state
    if (state.filesState.files[filePath]) {
      state.filesState.files[filePath].content = content;
      state.filesState.files[filePath].size = content.length;
    }

    displayFileInEditor(filePath, state.filesState.files[filePath]);
    renderFileTree();

    el.btnSaveFileSandbox.innerHTML = `<i class="fa-solid fa-check text-[10px]"></i> Saved!`;
    setTimeout(() => {
      el.btnSaveFileSandbox.innerHTML = origHtml;
      el.btnSaveFileSandbox.disabled = false;
    }, 2000);

    appendSystemNotice(`💾 Saved file <code>${escapeHtml(filePath)}</code> directly into sandbox container.`);
  } catch (err) {
    console.error("Save file error:", err);
    alert(`Failed to save file to sandbox: ${err.message}`);
    el.btnSaveFileSandbox.innerHTML = origHtml;
    el.btnSaveFileSandbox.disabled = false;
  }
}

// Copy Code from Editor
function handleCopyEditorCode() {
  const path = state.filesState.activeFilePath;
  if (!path) return;
  const content = state.filesState.isEditing ? el.editorTextarea.value : (state.filesState.files[path]?.content || "");
  navigator.clipboard.writeText(content).then(() => {
    const orig = el.btnCopyCode.innerHTML;
    el.btnCopyCode.innerHTML = `<i class="fa-solid fa-check text-emerald-400"></i>`;
    setTimeout(() => { el.btnCopyCode.innerHTML = orig; }, 1500);
  });
}

// Download File from Editor
function handleDownloadEditorFile() {
  const path = state.filesState.activeFilePath;
  if (!path) return;
  const content = state.filesState.isEditing ? el.editorTextarea.value : (state.filesState.files[path]?.content || "");
  const filename = path.split("/").pop();
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Modal: Create New File in Sandbox
function openNewFileModal() {
  el.newFilePathInput.value = "";
  el.newFileModal.classList.remove("hidden");
  el.newFilePathInput.focus();
}

function closeNewFileModal() {
  el.newFileModal.classList.add("hidden");
}

async function handleCreateNewFile() {
  let path = el.newFilePathInput.value.trim();
  if (!path) {
    alert("Please enter a relative file path (e.g. agent.py).");
    return;
  }
  path = path.replace(/^\/+/, "");

  closeNewFileModal();

  const emptyFile = {
    path: path,
    name: path.split("/").pop(),
    content: "# New file created in sandbox\n",
    size: 32,
    language: getFileInfo(path).lang,
    updated_at: new Date().toLocaleTimeString(),
  };

  state.filesState.files[path] = emptyFile;
  const parts = path.split("/");
  let cur = "";
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur ? `${cur}/${parts[i]}` : parts[i];
    state.filesState.expandedDirs.add(cur);
  }
  state.filesState.tree = buildClientTree(state.filesState.files);
  renderFileTree();
  openFileInEditor(path);

  // If active container exists, save it directly
  const envId = state.environmentId;
  if (envId) {
    try {
      await fetch("/api/sandbox/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment_id: envId,
          path: path,
          content: emptyFile.content,
        }),
      });
      appendSystemNotice(`📄 Created new file <code>${escapeHtml(path)}</code> in sandbox.`);
    } catch (e) {
      console.warn("Auto save new file error:", e);
    }
  }
}

// Handle File Search Filter
function handleSearchFiles(e) {
  state.filesState.searchFilter = e.target.value;
  renderFileTree();
}

// Sync Files Directly from Sandbox Container
async function syncFilesFromSandbox(silent = false) {
  if (state.filesState.isSyncing) return;

  const envId = state.environmentId;
  if (!envId) {
    if (!silent) {
      alert("No active sandbox container found. Initialize an agent or send a prompt to allocate a container first.");
    }
    return;
  }

  state.filesState.isSyncing = true;
  if (el.syncIcon) el.syncIcon.classList.add("fa-spin");

  try {
    const res = await fetch("/api/sandbox/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: state.activeAgentId,
        environment_id: envId,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }

    const data = await res.json();
    const filesList = data.files || [];

    // Merge into state
    for (const f of filesList) {
      state.filesState.files[f.path] = f;
      const parts = f.path.split("/");
      let cur = "";
      for (let i = 0; i < parts.length - 1; i++) {
        cur = cur ? `${cur}/${parts[i]}` : parts[i];
        state.filesState.expandedDirs.add(cur);
      }
    }

    state.filesState.tree = data.tree || buildClientTree(state.filesState.files);
    function autoExpand(nodes) {
      if (!nodes) return;
      for (const n of nodes) {
        if (n.type === "directory" || n.type === "dir") {
          state.filesState.expandedDirs.add(n.path);
          if (n.children) autoExpand(n.children);
        }
      }
    }
    autoExpand(state.filesState.tree);
    renderFileTree();

    // If currently open file was updated, refresh editor
    if (state.filesState.activeFilePath && state.filesState.files[state.filesState.activeFilePath]) {
      displayFileInEditor(state.filesState.activeFilePath, state.filesState.files[state.filesState.activeFilePath]);
    }

    if (!silent && el.btnSyncSandboxFiles) {
      const origTitle = el.btnSyncSandboxFiles.title;
      el.btnSyncSandboxFiles.title = `Synced ${data.files_count || filesList.length} files successfully!`;
      setTimeout(() => { el.btnSyncSandboxFiles.title = origTitle; }, 3000);
    }
  } catch (err) {
    console.error("Failed to sync sandbox files:", err);
    if (!silent) {
      alert(`Sync failed: ${err.message}`);
    }
  } finally {
    state.filesState.isSyncing = false;
    if (el.syncIcon) el.syncIcon.classList.remove("fa-spin");
  }
}

// Handle Real-time File Update from SSE Stream
function handleSandboxFileUpdated(evt, msgCard) {
  const f = evt.file || evt;
  const filePath = f.path;
  if (!filePath) return;

  const content = f.content || "";
  state.filesState.files[filePath] = {
    path: filePath,
    name: f.name || filePath.split("/").pop(),
    content: content,
    size: f.size || content.length,
    language: f.language || getFileInfo(filePath, content).lang,
    updated_at: new Date().toLocaleTimeString(),
  };

  const parts = filePath.split("/");
  let cur = "";
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur ? `${cur}/${parts[i]}` : parts[i];
    state.filesState.expandedDirs.add(cur);
  }

  state.filesState.tree = buildClientTree(state.filesState.files);
  renderFileTree();

  if (state.filesState.activeFilePath === filePath) {
    displayFileInEditor(filePath, state.filesState.files[filePath]);
  }

  // File chip in chat message
  if (msgCard && msgCard.toolsContainer) {
    const chip = document.createElement("div");
    chip.className = "flex items-center gap-2 p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300 font-mono";
    chip.innerHTML = `
      <i class="fa-solid fa-file-circle-check text-emerald-400"></i>
      <span>File generated: <strong class="underline cursor-pointer hover:text-emerald-200" title="Click to view file">${escapeHtml(filePath)}</strong></span>
      <span class="text-[10px] text-emerald-500 font-sans ml-auto">${formatBytes(content.length)}</span>
    `;
    chip.querySelector("strong").addEventListener("click", () => {
      openFileInEditor(filePath);
    });
    msgCard.toolsContainer.appendChild(chip);
    scrollToBottom();
  }
}

// Get File Language, Icon, and Color Badge
function getFileInfo(path, content = "") {
  const lower = path.toLowerCase();
  const ext = lower.includes(".") ? lower.split(".").pop() : "";

  if (lower === ".env" || lower.endsWith("/.env") || ext === "env") {
    return { lang: "bash", icon: "fa-solid fa-key", colorClass: "text-amber-400", badge: "ENV" };
  }
  if (ext === "py" || content.includes("import ") || content.includes("def ") || content.includes("print(")) {
    return { lang: "python", icon: "fa-brands fa-python", colorClass: "tree-icon-python", badge: "Python" };
  }
  if (ext === "json" || (content.trim().startsWith("{") && content.trim().endsWith("}"))) {
    return { lang: "json", icon: "fa-solid fa-brackets-curly", colorClass: "tree-icon-json", badge: "JSON" };
  }
  if (ext === "java" || content.includes("public class ") || content.includes("System.out.println")) {
    return { lang: "java", icon: "fa-brands fa-java", colorClass: "tree-icon-java", badge: "Java" };
  }
  if (ext === "js" || ext === "mjs") {
    return { lang: "javascript", icon: "fa-brands fa-js", colorClass: "tree-icon-javascript", badge: "JavaScript" };
  }
  if (ext === "ts" || ext === "tsx") {
    return { lang: "typescript", icon: "fa-solid fa-code", colorClass: "tree-icon-typescript", badge: "TypeScript" };
  }
  if (ext === "sh" || ext === "bash" || content.startsWith("#!/bin/bash") || content.startsWith("#!/bin/sh")) {
    return { lang: "bash", icon: "fa-solid fa-terminal", colorClass: "tree-icon-bash", badge: "Bash" };
  }
  if (ext === "md" || ext === "markdown") {
    return { lang: "markdown", icon: "fa-solid fa-file-lines", colorClass: "tree-icon-markdown", badge: "Markdown" };
  }
  if (ext === "yaml" || ext === "yml") {
    return { lang: "yaml", icon: "fa-solid fa-gear", colorClass: "tree-icon-yaml", badge: "YAML" };
  }
  if (ext === "sql") {
    return { lang: "sql", icon: "fa-solid fa-database", colorClass: "tree-icon-sql", badge: "SQL" };
  }
  if (ext === "html" || ext === "htm") {
    return { lang: "html", icon: "fa-brands fa-html5", colorClass: "tree-icon-html", badge: "HTML" };
  }
  if (ext === "css") {
    return { lang: "css", icon: "fa-brands fa-css3-alt", colorClass: "tree-icon-css", badge: "CSS" };
  }
  if (ext === "txt" || ext === "log") {
    return { lang: "plaintext", icon: "fa-regular fa-file-lines", colorClass: "tree-icon-file", badge: "Text" };
  }

  return { lang: "plaintext", icon: "fa-regular fa-file-code", colorClass: "tree-icon-file", badge: ext ? ext.toUpperCase() : "File" };
}

// Format Byte Size
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Load Files For Specific Agent & Update Tree
async function loadFilesForAgent(agentId) {
  resetFilesExplorerState();
  const targetAgent = agentId || state.activeAgentId || "antigravity-preview-05-2026";
  try {
    const res = await fetch(`/api/sandbox/files?agent_id=${encodeURIComponent(targetAgent)}`);
    if (res.ok) {
      const data = await res.json();
      state.environmentId = data.environment_id || null;
      if (el.activeEnvBadge) {
        el.activeEnvBadge.textContent = data.environment_id || "None (New)";
        el.activeEnvBadge.title = data.environment_id ? `Persistent Sandbox ID: ${data.environment_id}` : "A new sandbox container will be provisioned on next message";
      }
      if (data && data.files && data.files.length > 0) {
        for (const f of data.files) {
          state.filesState.files[f.path] = f;
          const parts = f.path.split("/");
          let cur = "";
          for (let i = 0; i < parts.length - 1; i++) {
            cur = cur ? `${cur}/${parts[i]}` : parts[i];
            state.filesState.expandedDirs.add(cur);
          }
        }
        state.filesState.tree = data.tree || buildClientTree(state.filesState.files);

        // Auto-expand all directory nodes in tree
        function autoExpand(nodes) {
          if (!nodes) return;
          for (const n of nodes) {
            if (n.type === "directory" || n.type === "dir") {
              state.filesState.expandedDirs.add(n.path);
              if (n.children) autoExpand(n.children);
            }
          }
        }
        autoExpand(state.filesState.tree);
        renderFileTree();
      } else {
        renderFileTree();
      }
    }
  } catch (err) {
    console.warn("Could not load files for agent:", agentId, err);
  }
}

// Load Initial Cached Files on Page Load
async function loadInitialFiles() {
  await loadFilesForAgent(state.activeAgentId);
}

// Reset Files Explorer State
function resetFilesExplorerState() {
  state.filesState.files = {};
  state.filesState.tree = [];
  state.filesState.activeFilePath = null;
  state.filesState.isEditing = false;
  state.filesState.expandedDirs.clear();
  state.filesState.searchFilter = "";
  if (el.fileSearchInput) el.fileSearchInput.value = "";
  renderFileTree();
  if (el.editorEmptyState) el.editorEmptyState.classList.remove("hidden");
  if (el.editorActions) el.editorActions.classList.add("hidden");
  if (el.editorViewerContainer) el.editorViewerContainer.classList.add("hidden");
  if (el.editorEditContainer) el.editorEditContainer.classList.add("hidden");
  if (el.editorFilePath) el.editorFilePath.textContent = "No file selected";
  if (el.editorLangBadge) el.editorLangBadge.classList.add("hidden");
  if (el.editorFileSize) el.editorFileSize.classList.add("hidden");
}

// Start Application
initApp();
