# Gemini Managed Agents Studio & Python Examples

A complete, production-ready implementation and interactive Web UI exploring Google Cloud's **Managed Agents API** on **Agent Platform** (Gemini Enterprise Agent Platform / Vertex AI), powered by the **Antigravity harness**.

Based on:
- [Google Cloud Managed Agents Overview](https://docs.cloud.google.com/gemini-enterprise-agent-platform/build/managed-agents)
- [Create and Manage Agents Guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/build/managed-agents/create-manage)
- [Official Generative AI Managed Agents Notebook](https://github.com/GoogleCloudPlatform/generative-ai/blob/main/agents/managed-agents/intro_managed_agents_python.ipynb)

---

## 🌟 Key Architecture Concepts

Managed Agents API on Agent Platform operates across two key planes:

1. **Control Plane (`Agents API` & `client.agents.*`)**:
   - Used to register and configure agents (`create`, `list`, `get`, `delete`).
   - Configures the base agent harness (`antigravity-preview-05-2026`).
   - Mounts external data sources (such as Google Cloud Storage `gs://` buckets to `/.agent`).
   - Configures remote Model Context Protocol (MCP) servers.
   - Attaches skills (from Cloud Storage or Skill Registry).
   - Manages container sandbox security and outbound network allowlists (`*`).

2. **Data Plane (`Interactions API` & `client.interactions.*`)**:
   - Communicates with agents at runtime using streaming Server-Sent Events (SSE).
   - Reuses persistent compute sandboxes via `environment_id` across multi-turn interactions.
   - Maintains conversation history via `previous_interaction_id`.
   - Supports dynamically overriding tools and MCP configurations on each turn.

---

## 📁 Repository Structure

```
0_managed_agents/
├── app.py                     # FastAPI application serving Web UI & streaming SSE endpoints
├── agent_service.py           # Core wrapper for Google GenAI Managed Agents & Interactions SDK
├── config.py                  # Project settings, default tools, and environment variables
├── managed_agent_example.py   # Standalone Python script demonstrating end-to-end API usage
├── run.sh                     # Quick launcher script for the web studio
├── requirements.txt           # Frozen Python dependencies (google-genai, fastapi, uvicorn, etc.)
├── .env                       # Environment configuration (GCP project, location, port)
├── .env.example               # Template for environment settings
└── static/
    ├── index.html             # Modern Web UI with configuration drawer and chat arena
    ├── style.css              # Custom styling, markdown rules, and animations
    └── app.js                 # Frontend state manager and SSE streaming handler
```

---

## 🚀 Quick Start

### 1. Prerequisites
- Google Cloud project with `aiplatform.googleapis.com` enabled.
- Service agent `service-<PROJECT_NUMBER>@gcp-sa-aiplatform.iam.gserviceaccount.com` with role `roles/aiplatform.serviceAgent`.
- Application Default Credentials (ADC) active:
  ```bash
  gcloud auth application-default login
  gcloud config set project sokratis-genai-bb
  ```

### 2. Launch the Web Studio
Run the launcher script:
```bash
./run.sh
```
Or directly using Python:
```bash
./.venv/bin/python app.py
```
Open your browser at:
👉 **[http://localhost:8000](http://localhost:8000)**

---

## 💻 Web UI Features

1. **Agent Initialization & Customization Panel (Left)**:
   - **Custom Agent Mode**:
     - Customize Agent ID (e.g. `data-analyst-1`).
     - Base Agent harness (`antigravity-preview-05-2026`).
     - System instructions & personas (Presets for Analyst, Researcher, Engineer).
     - **Cloud Storage (GCS) Mount**: Mount a GCS bucket (e.g. `gs://my-bucket`) directly into the sandbox filesystem (`/.agent`).
     - **Tools & MCP**:
       - Default 1P Tools: Code Execution (Bash/Python/Node.js), Filesystem, Google Search Grounding, URL Context.
       - Add custom remote **Streamable HTTP MCP Servers** with authorization headers.
     - **Sandbox & Skills**:
       - Remote Linux sandbox with configurable network allowlist (`*` for internet).
       - Attach skills from GCS or central Skill Registry (`projects/.../skills/...`).
     - **"🚀 Initialize Agent" Button**: Provisions the agent configuration on the Agent Platform control plane.
   - **Base Agent Mode**:
     - Immediate, zero-setup direct access to `antigravity-preview-05-2026`.
   - **Registered Agents Picker**:
     - View, select, and delete existing custom agents in your GCP project.

2. **Interactive Multi-Turn Chat (Right)**:
   - Real-time Server-Sent Events (SSE) streaming.
   - **Thought Process Accordion**: Inspect the model's inner reasoning and plan before actions are executed.
   - **Sandbox Tool Cards**:
     - View Bash / Python scripts executed live inside the Linux container.
     - View console stdout/stderr and exit codes.
     - View Google Search grounding queries and URLs.
   - **Persistent Sandbox State**:
     - Automatically captures `environment_id` on the initial turn and reuses it for subsequent turns.
     - Files created in the sandbox container (`hello.txt`, data files) remain intact across the entire conversation!
   - **"New Sandbox" Button**: Cleans up and provisions a fresh sandbox when you want a clean slate.

---

## 🐍 Running the Standalone Python Example

To test the Managed Agents API without the web UI, execute:
```bash
./.venv/bin/python managed_agent_example.py
```

This script:
1. Connects to `sokratis-genai-bb` using `genai.Client(vertexai=True, project=..., location="global")`.
2. Interacts with the foundational base agent (`antigravity-preview-05-2026`).
3. Executes a multi-turn turn that proves filesystem state persistence across turns.
4. Creates a custom agent with GCS mount, default tools, and remote environment.
5. Lists registered agents and cleans up the test agent.

---

## 📘 Python SDK Code Snippets

### 1. Initialize Client
```python
from google import genai

client = genai.Client(
    vertexai=True,
    project="sokratis-genai-bb",
    location="global",
)
```

### 2. Create a Custom Agent
```python
agent = client.agents.create(
    id="my-data-analyst",
    base_agent="antigravity-preview-05-2026",
    description="Analyzes data and executes Python scripts.",
    system_instruction="You are a data analyst with access to a Linux sandbox.",
    tools=[
        {"type": "code_execution"},
        {"type": "filesystem"},
        {"type": "google_search"},
        {"type": "url_context"},
    ],
    base_environment={
        "type": "remote",
        "sources": [
            {
                "type": "gcs",
                "source": "gs://my-bucket/data",
                "target": "/.agent",
            }
        ],
        "network": {
            "allowlist": [{"domain": "*"}]
        },
    },
)
```

### 3. Stream Interaction (Initial Turn)
```python
stream = client.interactions.create(
    agent="my-data-analyst",
    input="Create a file called numbers.txt with numbers 1 to 10 in Python.",
    environment={"type": "remote"},
    stream=True,
    background=True,
    store=True,
)

env_id = None
for event in stream:
    if event.event_type == "step.delta" and hasattr(event.delta, "text"):
        print(event.delta.text, end="")
    elif event.event_type == "interaction.completed":
        env_id = event.interaction.environment_id

print(f"\nAllocated Sandbox Environment ID: {env_id}")
```

### 4. Multi-Turn Interaction (Reusing Environment)
```python
# Pass the string env_id to keep all files and container state alive!
stream = client.interactions.create(
    agent="my-data-analyst",
    input="Read numbers.txt and compute the sum.",
    environment=env_id,
    stream=True,
    background=True,
    store=True,
)
```
