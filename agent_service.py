import os
import re
import json
import glob
import base64
import datetime
import time
import logging
from typing import Any, Dict, List, Optional, Generator, AsyncGenerator
import asyncio
from concurrent.futures import ThreadPoolExecutor

import httpx
from google import genai
import google.auth
from google.auth.transport.requests import AuthorizedSession
import config

logger = logging.getLogger("agent_service")
logging.basicConfig(level=logging.INFO)

# Thread pool for synchronous client calls
_executor = ThreadPoolExecutor(max_workers=8)

# Recognized tool types in Vertex AI Managed Agents AgentTool schema
VALID_AGENT_TOOL_TYPES = {
    "code_execution",
    "google_search",
    "url_context",
    "mcp_server",
    "function",
}


def sanitize_tools(tools: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """
    Sanitizes agent tools so only valid AgentTool variants are sent.
    Prevents Pydantic UnknownAgentTool serialization errors (400 Bad Request).
    """
    raw_list = tools if tools is not None else config.DEFAULT_TOOLS
    sanitized: List[Dict[str, Any]] = []
    for t in raw_list:
        if isinstance(t, dict):
            t_type = t.get("type")
            if t_type in VALID_AGENT_TOOL_TYPES:
                sanitized.append(t)
            else:
                logger.warning(f"Omitting unsupported agent tool type '{t_type}' from request payload")
        else:
            sanitized.append(t)
    return sanitized


def get_gcs_session() -> tuple[AuthorizedSession, Optional[str]]:
    """Returns an authorized requests session and default project ID for Google Cloud Storage."""
    creds, default_proj = google.auth.default(
        scopes=["https://www.googleapis.com/auth/devstorage.full_control", "https://www.googleapis.com/auth/cloud-platform"]
    )
    return AuthorizedSession(creds), default_proj


def list_gcs_buckets(project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Lists all Google Cloud Storage buckets in the project."""
    session, def_proj = get_gcs_session()
    proj = project_id or def_proj or config.PROJECT_ID
    url = f"https://storage.googleapis.com/storage/v1/b?project={proj}"

    logger.info(f"Listing GCS buckets for project: {proj}")
    resp = session.get(url, timeout=config.TIMEOUT_SECONDS)
    if resp.status_code != 200:
        logger.error(f"Error listing GCS buckets ({resp.status_code}): {resp.text}")
        raise Exception(f"Failed to list GCS buckets: {resp.text}")

    data = resp.json()
    items = data.get("items", [])
    buckets = []
    for b in items:
        buckets.append({
            "name": b.get("name"),
            "location": b.get("location", "US"),
            "storage_class": b.get("storageClass", "STANDARD"),
            "time_created": b.get("timeCreated"),
            "uri": f"gs://{b.get('name')}",
        })
    return buckets


def create_gcs_bucket(
    bucket_name: str,
    location: str = "US",
    project_id: Optional[str] = None
) -> Dict[str, Any]:
    """Creates a new Google Cloud Storage bucket in the project."""
    clean_name = bucket_name.strip()
    if clean_name.startswith("gs://"):
        clean_name = clean_name[5:].rstrip("/")

    if not clean_name:
        raise ValueError("Bucket name cannot be empty")

    session, def_proj = get_gcs_session()
    proj = project_id or def_proj or config.PROJECT_ID
    url = f"https://storage.googleapis.com/storage/v1/b?project={proj}"
    payload = {
        "name": clean_name,
        "location": location or "US",
    }

    logger.info(f"Creating GCS bucket '{clean_name}' in {location} for project '{proj}'")
    resp = session.post(url, json=payload, timeout=config.TIMEOUT_SECONDS)

    if resp.status_code not in (200, 201):
        logger.error(f"Error creating GCS bucket '{clean_name}' ({resp.status_code}): {resp.text}")
        raise Exception(f"Failed to create bucket '{clean_name}': {resp.text}")

    b = resp.json()
    return {
        "name": b.get("name", clean_name),
        "location": b.get("location", location),
        "storage_class": b.get("storageClass", "STANDARD"),
        "time_created": b.get("timeCreated"),
        "uri": f"gs://{b.get('name', clean_name)}",
    }


def get_genai_client(project_id: Optional[str] = None, location: Optional[str] = None) -> genai.Client:
    """Returns an authenticated GenAI Client configured for Vertex AI Managed Agents."""
    proj = project_id or config.PROJECT_ID
    loc = location or config.LOCATION
    return genai.Client(
        vertexai=True,
        project=proj,
        location=loc,
        http_options={"timeout": int(config.TIMEOUT_SECONDS * 1000)}
    )
AGENT_REGISTRY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".agent_registry.json")

def load_local_agents() -> List[Dict[str, Any]]:
    if os.path.exists(AGENT_REGISTRY_FILE):
        try:
            with open(AGENT_REGISTRY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except Exception as e:
            logger.warning(f"Error reading local agent registry: {e}")
    return []

def save_local_agents(agents: List[Dict[str, Any]]) -> None:
    try:
        serializable_agents = _to_json_serializable(agents)
        temp_file = AGENT_REGISTRY_FILE + ".tmp"
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(serializable_agents, f, indent=2)
        os.replace(temp_file, AGENT_REGISTRY_FILE)
    except Exception as e:
        logger.warning(f"Error saving local agent registry: {e}")


def create_agent(
    agent_id: str,
    base_agent: str = config.DEFAULT_BASE_AGENT,
    description: Optional[str] = None,
    system_instruction: Optional[str] = None,
    tools: Optional[List[Dict[str, Any]]] = None,
    gcs_bucket: Optional[str] = None,
    gcs_target: Optional[str] = "/.agent",
    skills_source: Optional[str] = None,
    skills_type: Optional[str] = "gcs",
    skills_target: Optional[str] = "./skills",
    network_domains: Optional[List[str]] = None,
    env_content: Optional[str] = None,
    api_key: Optional[str] = None,
    project_id: Optional[str] = None,
    location: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Creates and provisions a new managed agent using the Agents API.
    """
    client = get_genai_client(project_id, location)

    # Register and store .env configuration if provided
    if env_content or api_key:
        set_sandbox_env(env_content=env_content, api_key=api_key, agent_id=agent_id)

    # Built-in or custom tools sanitized to prevent 400 unknown tool errors
    agent_tools = sanitize_tools(tools)

    # Environment sources (Cloud Storage bucket, skills)
    sources = []
    if gcs_bucket and gcs_bucket.strip():
        b_uri = gcs_bucket.strip()
        if not b_uri.startswith("gs://"):
            b_uri = f"gs://{b_uri}"
        sources.append({
            "type": "gcs",
            "source": b_uri,
            "target": gcs_target or "/.agent",
        })

    if skills_source and skills_source.strip():
        s_src = skills_source.strip()
        s_type = skills_type or "gcs"
        if s_type == "gcs" and not s_src.startswith("gs://"):
            s_src = f"gs://{s_src}"
        sources.append({
            "type": s_type,
            "source": s_src,
            "target": skills_target or "./skills",
        })

    # Network allowlist
    domains = network_domains if network_domains else ["*"]
    allowlist = [{"domain": d.strip()} for d in domains if d.strip()]

    base_environment: Dict[str, Any] = {
        "type": "remote",
        "network": {
            "allowlist": allowlist
        }
    }
    if sources:
        base_environment["sources"] = sources

    effective_env = _agent_env_content.get(agent_id, _active_env_content)
    final_instruction = (system_instruction or config.DEFAULT_SYSTEM_INSTRUCTION).strip()
    if effective_env:
        final_instruction += (
            f"\n\n[Runtime Sandbox .env Configuration]\n"
            f"The environment is configured with the following .env settings:\n"
            f"```\n{effective_env.strip()}\n```\n"
            f"Always ensure any created packages, modules, or tools reference or contain this .env file."
        )

    payload: Dict[str, Any] = {
        "id": agent_id,
        "base_agent": base_agent or config.DEFAULT_BASE_AGENT,
        "description": description or f"Managed agent {agent_id}",
        "system_instruction": final_instruction,
        "tools": agent_tools,
        "base_environment": base_environment,
    }

    logger.info(f"Creating agent with ID: {agent_id}")
    try:
        res = client.agents.create(**payload)
        agent_obj = res
        # Poll for agent availability on the control plane (up to 10s)
        for attempt in range(8):
            try:
                time.sleep(1.2)
                verified = client.agents.get(id=agent_id)
                if verified:
                    agent_obj = verified
                    logger.info(f"Agent {agent_id} verified active on control plane (attempt {attempt+1})")
                    break
            except Exception as poll_err:
                logger.debug(f"Polling agent {agent_id} status: {poll_err}")
    except Exception as create_err:
        err_str = str(create_err)
        if "already exists" in err_str.lower() or "409" in err_str:
            logger.info(f"Agent {agent_id} already exists. Recreating with updated config...")
            try:
                client.agents.delete(id=agent_id)
                time.sleep(1.0)
                agent_obj = client.agents.create(**payload)
            except Exception as recreate_err:
                logger.warning(f"Could not recreate remote agent {agent_id}: {recreate_err}. Updating local registry.")
                agent_obj = payload
        else:
            logger.warning(f"Remote create_agent error for {agent_id}: {create_err}. Saving to local registry.")
            agent_obj = payload

    formatted = format_agent_object(agent_obj)
    # Save to local agent registry
    local_agents = load_local_agents()
    reg_map = {a["id"]: a for a in local_agents if a.get("id")}
    if formatted.get("id"):
        reg_map[formatted["id"]] = formatted
    save_local_agents(list(reg_map.values()))
    return formatted


def list_agents(project_id: Optional[str] = None, location: Optional[str] = None) -> List[Dict[str, Any]]:
    """Lists all registered custom agents in the specified project."""
    local_agents = load_local_agents()
    reg_map = {a["id"]: a for a in local_agents if a.get("id")}
    try:
        client = get_genai_client(project_id, location)
        response = client.agents.list()
        result = []
        if response:
            agents_iter = getattr(response, "agents", None)
            if agents_iter is None and hasattr(response, "__iter__"):
                agents_iter = response
            if agents_iter:
                for ag in agents_iter:
                    f = format_agent_object(ag)
                    if f.get("id"):
                        reg_map[f["id"]] = f
                        result.append(f)
        merged = list(reg_map.values())
        save_local_agents(merged)
        return merged
    except Exception as e:
        logger.warning(f"Remote list_agents error, returning local cached agents ({len(reg_map)}): {e}")
        return list(reg_map.values())


def get_agent(agent_id: str, project_id: Optional[str] = None, location: Optional[str] = None) -> Dict[str, Any]:
    """Retrieves full configuration details for a specific custom agent."""
    try:
        client = get_genai_client(project_id, location)
        res = client.agents.get(id=agent_id)
        return format_agent_object(res)
    except Exception as e:
        local_agents = load_local_agents()
        for a in local_agents:
            if a.get("id") == agent_id:
                return a
        raise e


def delete_agent(agent_id: str, project_id: Optional[str] = None, location: Optional[str] = None) -> Dict[str, Any]:
    """Deletes a custom agent definition permanently."""
    raw_res = None
    err = None
    try:
        client = get_genai_client(project_id, location)
        raw_res = client.agents.delete(id=agent_id)
    except Exception as e:
        err = str(e)
        logger.warning(f"Remote delete_agent error for {agent_id}: {e}")

    # Remove from local registry
    local_agents = load_local_agents()
    remaining = [a for a in local_agents if a.get("id") != agent_id]
    save_local_agents(remaining)

    # Also clean agent env content if cached
    _agent_env_content.pop(agent_id, None)

    return {"status": "deleted", "agent_id": agent_id, "raw": str(raw_res), "warning": err}


def format_agent_object(ag: Any) -> Dict[str, Any]:
    """Converts a GenAI agent SDK object to a serializable Python dict."""
    if isinstance(ag, dict):
        return ag

    raw_id = getattr(ag, "id", None)
    name = getattr(ag, "name", None)
    if not raw_id and name and "/" in name:
        raw_id = name.split("/")[-1]

    out = {
        "id": raw_id,
        "name": name,
        "base_agent": getattr(ag, "base_agent", None),
        "description": getattr(ag, "description", None),
        "system_instruction": getattr(ag, "system_instruction", None),
        "created": str(getattr(ag, "created", "")) if getattr(ag, "created", None) else None,
        "updated": str(getattr(ag, "updated", "")) if getattr(ag, "updated", None) else None,
        "tools": [],
        "base_environment": None,
    }

    # Tools
    tools = getattr(ag, "tools", None)
    if tools:
        for t in tools:
            if isinstance(t, dict):
                out["tools"].append(t)
            else:
                tool_dict = {"type": getattr(t, "type", None)}
                if hasattr(t, "name") and t.name:
                    tool_dict["name"] = t.name
                if hasattr(t, "url") and t.url:
                    tool_dict["url"] = t.url
                out["tools"].append(tool_dict)

    # Base environment
    base_env = getattr(ag, "base_environment", None)
    if base_env:
        if isinstance(base_env, dict):
            out["base_environment"] = _to_json_serializable(base_env)
        else:
            env_dict = {
                "type": getattr(base_env, "type", None),
                "sources": [],
            }
            net = getattr(base_env, "network", None)
            if net is not None:
                env_dict["network"] = _to_json_serializable(net)
            sources = getattr(base_env, "sources", None)
            if sources:
                for s in sources:
                    if isinstance(s, dict):
                        env_dict["sources"].append(_to_json_serializable(s))
                    else:
                        env_dict["sources"].append({
                            "type": getattr(s, "type", None),
                            "source": getattr(s, "source", None),
                            "target": getattr(s, "target", None),
                        })
            out["base_environment"] = env_dict

    return out


def _to_json_serializable(val: Any) -> Any:
    """Recursively converts SDK model objects, pydantic models, or custom types to JSON-safe structures."""
    if val is None or isinstance(val, (int, float, str, bool)):
        return val
    if isinstance(val, dict):
        return {str(k): _to_json_serializable(v) for k, v in val.items()}
    if isinstance(val, (list, tuple, set)):
        return [_to_json_serializable(x) for x in val]
    if hasattr(val, "model_dump"):
        try:
            return _to_json_serializable(val.model_dump())
        except Exception:
            pass
    if hasattr(val, "to_dict"):
        try:
            return _to_json_serializable(val.to_dict())
        except Exception:
            pass
    if hasattr(val, "__dict__"):
        try:
            return _to_json_serializable(
                {k: v for k, v in vars(val).items() if not k.startswith("_")}
            )
        except Exception:
            pass
    return str(val)


def _serialize_step(step: Any) -> Dict[str, Any]:
    """Helper to convert step object into clean JSON dict for frontend display."""
    if not step:
        return {}
    step_dict = {"type": getattr(step, "type", None)}
    for attr in [
        "content", "thought", "summary", "text", "query", "url",
        "code", "command", "language", "output", "exit_code",
        "name", "arguments", "result", "status", "sources"
    ]:
        if hasattr(step, attr):
            val = getattr(step, attr)
            if val is not None:
                step_dict[attr] = _to_json_serializable(val)

    # Extract text from content if text is not explicitly set
    if not step_dict.get("text") and step_dict.get("content"):
        c_val = step_dict["content"]
        if isinstance(c_val, list):
            extracted = []
            for item in c_val:
                if isinstance(item, dict) and item.get("text"):
                    extracted.append(str(item["text"]))
                elif isinstance(item, str):
                    extracted.append(item)
            if extracted:
                step_dict["text"] = "\n".join(extracted)
        elif isinstance(c_val, str):
            step_dict["text"] = c_val

    return step_dict


def _serialize_delta(delta: Any) -> Dict[str, Any]:
    """Helper to convert step delta into clean JSON dict."""
    if not delta:
        return {}
    delta_dict = {"type": getattr(delta, "type", None)}
    for attr in [
        "text", "thought", "thought_summary", "code", "command",
        "output", "query", "url", "name", "arguments_delta", "result"
    ]:
        if hasattr(delta, attr):
            val = getattr(delta, attr)
            if val is not None:
                delta_dict[attr] = _to_json_serializable(val)
    return delta_dict


# ==========================================
# Sandbox Filesystem Management & Tree Cache
# ==========================================

SANDBOX_CACHE_DIR = os.path.join(os.path.dirname(__file__), ".sandbox_cache")
os.makedirs(SANDBOX_CACHE_DIR, exist_ok=True)

# In-memory file cache: { environment_id: { file_path: { ... } } }
_sandbox_files: Dict[str, Dict[str, Dict[str, Any]]] = {}

# Map environment_id -> latest interaction_id for non-intrusive sync
_env_last_interaction: Dict[str, str] = {
    "env_CAEQgICAgIDwqIocGiAyZWQ5ODZkNTU3MTI0MTQwYmVhMzUyMDczN2ZhYmYyYQ": "ChBhMjMyYWE5NDI3ZmZmMzU0EAgaATAqBG1haW4"
}

# Active and agent-specific .env configurations
_active_env_content: str = config.DEFAULT_ENV_CONTENT
_agent_env_content: Dict[str, str] = {}

# Agent-to-Environment ID mapping persistence
AGENT_ENV_MAP_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".agent_env_map.json")


def load_agent_env_map() -> Dict[str, str]:
    """Loads persistent mapping of agent_id -> environment_id."""
    default_map: Dict[str, str] = {
        "analyst-agent-demo": "env_CAEQgICAgIDwqIocGiAyZWQ5ODZkNTU3MTI0MTQwYmVhMzUyMDczN2ZhYmYyYQ",
        "antigravity-preview-05-2026": "env_CAEQgICAgIDwqIocGiAyZWQ5ODZkNTU3MTI0MTQwYmVhMzUyMDczN2ZhYmYyYQ",
        "agent-test": "env_CAEQgICAgIDwqIocGiBjMjliNzczMTE3NTI0NmQxYjMwZDkwNWE0YzhhZTA5Mw",
    }
    if os.path.exists(AGENT_ENV_MAP_FILE):
        try:
            with open(AGENT_ENV_MAP_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                if isinstance(saved, dict):
                    default_map.update(saved)
        except Exception as e:
            logger.warning(f"Error reading agent_env_map: {e}")
    return default_map


def save_agent_env_map(m: Dict[str, str]) -> None:
    """Saves mapping of agent_id -> environment_id to disk."""
    try:
        temp_file = AGENT_ENV_MAP_FILE + ".tmp"
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(m, f, indent=2)
        os.replace(temp_file, AGENT_ENV_MAP_FILE)
    except Exception as e:
        logger.warning(f"Error saving agent_env_map: {e}")



def set_sandbox_env(
    environment_id: Optional[str] = None,
    env_content: Optional[str] = None,
    api_key: Optional[str] = None,
    agent_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Sets or updates the .env configuration in memory, disk cache, and active sandbox container.
    Also propagates updated API key/configuration to subproject .env files (e.g. holiday_booking_agent/.env).
    """
    global _active_env_content
    final_content = (env_content or "").strip()
    if not final_content:
        final_content = config.DEFAULT_ENV_CONTENT

    # If api_key provided and not already in final_content, replace/inject GOOGLE_API_KEY
    if api_key and api_key.strip():
        k = api_key.strip()
        if "GOOGLE_API_KEY=" in final_content:
            final_content = re.sub(r"GOOGLE_API_KEY=[^\n]*", f"GOOGLE_API_KEY={k}", final_content)
        else:
            final_content += f"\nGOOGLE_API_KEY={k}\n"

    _active_env_content = final_content

    if agent_id:
        _agent_env_content[agent_id.strip()] = final_content

    clean_env_id = (environment_id or "").strip()
    if not clean_env_id:
        if _sandbox_files:
            clean_env_id = list(_sandbox_files.keys())[-1]
        else:
            disk_files = glob.glob(os.path.join(SANDBOX_CACHE_DIR, "*.json"))
            if disk_files:
                disk_files.sort(key=os.path.getmtime, reverse=True)
                clean_env_id = os.path.splitext(os.path.basename(disk_files[0]))[0]

    updated_files = []
    if clean_env_id:
        ensure_env_cache(clean_env_id)
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # 1. Update root .env
        env_file_info = {
            "path": ".env",
            "name": ".env",
            "content": final_content,
            "size": len(final_content.encode("utf-8")),
            "language": "plaintext",
            "updated_at": now_str,
        }
        _sandbox_files[clean_env_id][".env"] = env_file_info
        updated_files.append(".env")

        # 2. Check and propagate to any subproject .env files
        for fpath in list(_sandbox_files[clean_env_id].keys()):
            if fpath != ".env" and fpath.endswith(".env"):
                _sandbox_files[clean_env_id][fpath] = {
                    "path": fpath,
                    "name": os.path.basename(fpath),
                    "content": final_content,
                    "size": len(final_content.encode("utf-8")),
                    "language": "plaintext",
                    "updated_at": now_str,
                }
                updated_files.append(fpath)

        save_env_cache(clean_env_id)
        logger.info(f"Updated .env and propagated to {updated_files} for sandbox {clean_env_id}")

    files_map = _sandbox_files.get(clean_env_id, {}) if clean_env_id else {}
    return {
        "status": "success",
        "environment_id": clean_env_id,
        "env_content": final_content,
        "updated_files": updated_files,
        "tree": build_file_tree(files_map) if files_map else [],
        "count": len(files_map),
    }


def ensure_env_cache(env_id: str) -> None:
    """Ensures environment cache is initialized and loaded from persistent disk cache."""
    if not env_id:
        return
    clean_id = env_id.strip()
    if clean_id not in _sandbox_files:
        _sandbox_files[clean_id] = {}
        # Try loading from disk
        safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", clean_id)
        cache_file = os.path.join(SANDBOX_CACHE_DIR, f"{safe_name}.json")
        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    _sandbox_files[clean_id] = json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load cache for {clean_id}: {e}")


def save_env_cache(env_id: str) -> None:
    """Saves environment file cache to disk for persistent reload survival."""
    if not env_id:
        return
    clean_id = env_id.strip()
    safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", clean_id)
    cache_file = os.path.join(SANDBOX_CACHE_DIR, f"{safe_name}.json")
    try:
        temp_file = cache_file + ".tmp"
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(_sandbox_files.get(clean_id, {}), f, indent=2)
        os.replace(temp_file, cache_file)
    except Exception as e:
        logger.warning(f"Failed to save cache for {clean_id}: {e}")


def detect_language(path: str, content: str = "") -> str:
    """Detects programming language from file extension and content."""
    ext = os.path.splitext(path)[1].lower().lstrip(".")
    ext_map = {
        "py": "python",
        "pyw": "python",
        "json": "json",
        "java": "java",
        "js": "javascript",
        "jsx": "javascript",
        "mjs": "javascript",
        "ts": "typescript",
        "tsx": "typescript",
        "sh": "bash",
        "bash": "bash",
        "zsh": "bash",
        "md": "markdown",
        "html": "html",
        "htm": "html",
        "css": "css",
        "scss": "css",
        "sql": "sql",
        "yaml": "yaml",
        "yml": "yaml",
        "xml": "xml",
        "c": "c",
        "h": "c",
        "cpp": "cpp",
        "cc": "cpp",
        "hpp": "cpp",
        "go": "go",
        "rs": "rust",
        "csv": "csv",
        "txt": "plaintext",
        "log": "plaintext",
        "dockerfile": "dockerfile",
    }
    if ext in ext_map:
        return ext_map[ext]
    base = os.path.basename(path).lower()
    if base in ("dockerfile", "makefile", "procfile", "requirements.txt"):
        return "dockerfile" if base == "dockerfile" else ("makefile" if base == "makefile" else "plaintext")
    if content:
        c_strip = content.strip()
        if c_strip.startswith(("{", "[")) and c_strip.endswith(("}", "]")):
            return "json"
        if "public class " in content or "import java." in content or "System.out.print" in content:
            return "java"
        if "def " in content or "import " in content or "print(" in content or re.search(r"\bclass\s+\w+(?:\([^)]*\))?:", content):
            return "python"
        if "<!DOCTYPE html>" in content or "<html" in content:
            return "html"
    return "plaintext"


def build_file_tree(files_dict: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Builds a hierarchical directory and file tree structure from flat file paths."""
    tree: Dict[str, Any] = {}

    for path, meta in sorted(files_dict.items()):
        parts = path.strip("/").split("/")
        current = tree
        for i, part in enumerate(parts):
            if i == len(parts) - 1:
                # File node
                current[part] = {
                    "type": "file",
                    "name": part,
                    "path": path,
                    "size": meta.get("size", len(meta.get("content", "").encode("utf-8"))),
                    "language": meta.get("language", detect_language(path, meta.get("content", ""))),
                    "updated_at": meta.get("updated_at"),
                }
            else:
                # Directory node
                if part not in current:
                    current[part] = {
                        "type": "directory",
                        "name": part,
                        "path": "/".join(parts[: i + 1]),
                        "children": {},
                    }
                current = current[part]["children"]

    def _convert_dict_to_list(node_dict: Dict[str, Any]) -> List[Dict[str, Any]]:
        dirs = []
        files = []
        for k, v in node_dict.items():
            if v.get("type") == "directory":
                v["children"] = _convert_dict_to_list(v.get("children", {}))
                dirs.append(v)
            else:
                files.append(v)
        dirs.sort(key=lambda x: x["name"].lower())
        files.sort(key=lambda x: x["name"].lower())
        return dirs + files

    return _convert_dict_to_list(tree)


def extract_files_from_step(step: Any) -> List[Dict[str, Any]]:
    """Extracts any files and content created or modified by this step."""
    results: List[Dict[str, Any]] = []
    if not step:
        return results

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Arguments can be dict or JSON string
    args = getattr(step, "arguments", {}) or (step.get("arguments") if isinstance(step, dict) else {})
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except Exception:
            args = {}

    if isinstance(args, dict):
        # 1. Direct file path argument (create_file, write_to_file, etc.)
        target = (
            args.get("TargetFile")
            or args.get("target_file")
            or args.get("path")
            or args.get("file_path")
            or args.get("target")
            or args.get("filename")
            or args.get("file")
        )
        if target and isinstance(target, str):
            clean_path = target.strip().lstrip("/").removeprefix("workspace/")
            if clean_path and ("." in os.path.basename(clean_path) or "/" in clean_path):
                content = (
                    args.get("Content")
                    or args.get("CodeContent")
                    or args.get("content")
                    or args.get("code")
                    or args.get("text")
                    or ""
                )
                results.append({
                    "path": clean_path,
                    "name": os.path.basename(clean_path),
                    "content": content,
                    "size": len(content.encode("utf-8")),
                    "language": detect_language(clean_path, content),
                    "updated_at": now_str,
                })

        # 2. Check for bash commands or scripts in arguments
        for cmd_key in ("command", "code", "script", "cmd"):
            cmd_val = args.get(cmd_key)
            if cmd_val and isinstance(cmd_val, str):
                results.extend(extract_files_from_content(cmd_val))

    # 3. Direct step attributes (command, code, content)
    for attr in ("command", "code", "content"):
        val = getattr(step, attr, None)
        if val and isinstance(val, str):
            results.extend(extract_files_from_content(val))

    return results


def extract_file_from_step(step: Any) -> Optional[Dict[str, Any]]:
    """Backward-compatible helper returning a single file dict if found."""
    files = extract_files_from_step(step)
    return files[0] if files else None


def extract_files_from_content(text: str) -> List[Dict[str, Any]]:
    """
    Extracts files and code contents written or generated in agent execution steps.
    """
    extracted: List[Dict[str, Any]] = []
    if not text:
        return extracted

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # 1. Bash: cat << 'EOF' > path ... EOF or cat > path << 'EOF'
    bash_cats = re.finditer(
        r"cat\s+(?:<<\s*['\"]?([A-Za-z0-9_]+)['\"]?\s*>\s*([^\s\n]+)|>\s*([^\s\n]+)\s*<<\s*['\"]?([A-Za-z0-9_]+)['\"]?)\n(.*?)\n\1|\4",
        text,
        re.DOTALL
    )
    for m in bash_cats:
        raw_path = m.group(2) or m.group(3)
        if raw_path:
            clean_path = raw_path.strip().strip("'\"").lstrip("/")
            if clean_path.startswith("workspace/"):
                clean_path = clean_path[len("workspace/"):]
            content = m.group(5) or ""
            extracted.append({
                "path": clean_path,
                "name": os.path.basename(clean_path),
                "content": content,
                "size": len(content.encode("utf-8")),
                "language": detect_language(clean_path, content),
                "updated_at": now_str,
            })

    # 2. Python open(..., 'w').write(...) or with open(...) as f: f.write(...)
    py_writes = re.finditer(
        r'open\(\s*["\']([^"\']+\.[a-zA-Z0-9_]+)["\']\s*,\s*["\']w[b]?["\'].*?\)(?:\.write\(\s*(?:"""|\'\'\'|["\'])(.*?)(?:"""|\'\'\'|["\'])\s*\)|\s*as\s+\w+:\s*.*?\w+\.write\(\s*(?:"""|\'\'\'|["\'])(.*?)(?:"""|\'\'\'|["\'])\s*\))',
        text,
        re.DOTALL
    )
    for m in py_writes:
        raw_path = m.group(1).lstrip("/")
        if raw_path.startswith("workspace/"):
            raw_path = raw_path[len("workspace/"):]
        content = m.group(2) or m.group(3) or ""
        extracted.append({
            "path": raw_path,
            "name": os.path.basename(raw_path),
            "content": content,
            "size": len(content.encode("utf-8")),
            "language": detect_language(raw_path, content),
            "updated_at": now_str,
        })

    # 3. Echo file creation: echo '...' > path
    echos = re.finditer(r"echo\s+['\"](.*?)['\"]\s*>\s*([^\s\n]+)", text, re.DOTALL)
    for m in echos:
        raw_path = m.group(2).strip().strip("'\"").lstrip("/")
        if raw_path.startswith("workspace/"):
            raw_path = raw_path[len("workspace/"):]
        if "." in os.path.basename(raw_path):
            content = m.group(1) or ""
            extracted.append({
                "path": raw_path,
                "name": os.path.basename(raw_path),
                "content": content,
                "size": len(content.encode("utf-8")),
                "language": detect_language(raw_path, content),
                "updated_at": now_str,
            })

    # 4. Markdown code blocks with file path header or comment
    md_files = re.finditer(
        r'(?:(?:File|Path|Target):\s*`?([a-zA-Z0-9_\-\./]+\.[a-zA-Z0-9_]+)`?\s*\n\s*```[a-zA-Z0-9_]*\n(.*?)```|```[a-zA-Z0-9_]*\n\s*(?:#|//|<!--)\s*([a-zA-Z0-9_\-\./]+\.[a-zA-Z0-9_]+)\s*\n(.*?)```)',
        text,
        re.DOTALL
    )
    for m in md_files:
        path = m.group(1) or m.group(3)
        code = m.group(2) or m.group(4)
        if path and code:
            clean_path = path.strip().lstrip("/").removeprefix("workspace/")
            extracted.append({
                "path": clean_path,
                "name": os.path.basename(clean_path),
                "content": code,
                "size": len(code.encode("utf-8")),
                "language": detect_language(clean_path, code),
                "updated_at": now_str,
            })

    return extracted


def get_sandbox_files(environment_id: Optional[str] = None, agent_id: Optional[str] = None) -> Dict[str, Any]:
    """Retrieves all cached sandbox files and tree for the given environment or agent (or latest active)."""
    clean_id = (environment_id or "").strip()
    clean_agent = (agent_id or "").strip()

    if not clean_id and clean_agent:
        agent_env_map = load_agent_env_map()
        clean_id = agent_env_map.get(clean_agent, "").strip()

    if not clean_id and not clean_agent:
        # Fallback to latest active environment
        if _sandbox_files:
            clean_id = list(_sandbox_files.keys())[-1]
        else:
            disk_files = glob.glob(os.path.join(SANDBOX_CACHE_DIR, "*.json"))
            if disk_files:
                disk_files.sort(key=os.path.getmtime, reverse=True)
                try:
                    with open(disk_files[0], "r", encoding="utf-8") as f:
                        data = json.load(f)
                    base_id = os.path.splitext(os.path.basename(disk_files[0]))[0]
                    _sandbox_files[base_id] = data
                    clean_id = base_id
                except Exception:
                    pass

    if not clean_id:
        return {"environment_id": None, "files": [], "tree": [], "count": 0}

    ensure_env_cache(clean_id)
    files_map = _sandbox_files.get(clean_id, {})
    return {
        "environment_id": clean_id,
        "files": list(files_map.values()),
        "tree": build_file_tree(files_map),
        "count": len(files_map),
    }


def get_sandbox_file(environment_id: Optional[str], path: str, agent_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Retrieves a single file's content and metadata by path."""
    if not path:
        return None
    clean_id = (environment_id or "").strip()
    clean_agent = (agent_id or "").strip()
    if not clean_id and clean_agent:
        agent_env_map = load_agent_env_map()
        clean_id = agent_env_map.get(clean_agent, "").strip()
    if not clean_id and _sandbox_files:
        clean_id = list(_sandbox_files.keys())[-1]
    if not clean_id:
        disk_files = glob.glob(os.path.join(SANDBOX_CACHE_DIR, "*.json"))
        if disk_files:
            disk_files.sort(key=os.path.getmtime, reverse=True)
            clean_id = os.path.splitext(os.path.basename(disk_files[0]))[0]

    if not clean_id:
        return None

    clean_path = path.strip().lstrip("/")
    ensure_env_cache(clean_id)
    return _sandbox_files.get(clean_id, {}).get(clean_path)


def sync_sandbox_files(
    agent_id: str,
    environment_id: str,
    project_id: Optional[str] = None,
    location: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Syncs and discovers all created files, their paths, sizes, and contents.
    Inspects recent interaction steps, updates cache and returns the file tree.
    """
    if not environment_id or not environment_id.strip():
        return {"environment_id": None, "files": [], "tree": [], "count": 0}

    env_id = environment_id.strip()
    ensure_env_cache(env_id)

    # 1. Inspect latest interaction steps if available
    last_interaction_id = _env_last_interaction.get(env_id)
    if last_interaction_id:
        try:
            client = get_genai_client(project_id, location)
            interaction = client.interactions.get(id=last_interaction_id)
            if interaction and hasattr(interaction, "steps") and interaction.steps:
                now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                for s in interaction.steps:
                    for f in extract_files_from_step(s):
                        if f and f.get("content"):
                            _sandbox_files[env_id][f["path"]] = f
                save_env_cache(env_id)
                logger.info(f"Refreshed {len(_sandbox_files[env_id])} files for {env_id} from interaction {last_interaction_id}")
        except Exception as e:
            logger.warning(f"Could not inspect interaction {last_interaction_id}: {e}")

    files_map = _sandbox_files.get(env_id, {})
    return {
        "environment_id": env_id,
        "files": list(files_map.values()),
        "tree": build_file_tree(files_map),
        "count": len(files_map),
    }


def write_sandbox_file(
    agent_id: str,
    environment_id: str,
    path: str,
    content: str,
    project_id: Optional[str] = None,
    location: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Writes or updates a file directly in the sandbox container and updates cache.
    """
    clean_path = path.strip().lstrip("/")
    if not clean_path:
        raise ValueError("Invalid file path")

    env_id = environment_id.strip()
    client = get_genai_client(project_id, location)

    b64_content = base64.b64encode(content.encode("utf-8")).decode("ascii")
    write_cmd = (
        f"Execute this bash command in your environment to write file '{clean_path}':\n"
        f"python3 -c \"import os, base64; "
        f"p = '{clean_path}'; "
        f"d = os.path.dirname(p); "
        f"os.makedirs(d, exist_ok=True) if d else None; "
        f"open(p, 'wb').write(base64.b64decode('{b64_content}')); "
        f"print('FILE_WRITE_SUCCESS')\""
    )

    logger.info(f"Writing file '{clean_path}' to sandbox '{env_id}'")
    stream = client.interactions.create(
        agent=agent_id or config.DEFAULT_BASE_AGENT,
        environment=env_id,
        input=write_cmd,
        stream=True,
        background=True,
        store=True,
        timeout=60.0
    )
    for _ in stream:
        pass

    ensure_env_cache(env_id)
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    file_info = {
        "path": clean_path,
        "name": os.path.basename(clean_path),
        "content": content,
        "size": len(content.encode("utf-8")),
        "language": detect_language(clean_path, content),
        "updated_at": now_str,
    }
    _sandbox_files[env_id][clean_path] = file_info
    save_env_cache(env_id)

    return {
        "status": "success",
        "file": file_info,
        "tree": build_file_tree(_sandbox_files[env_id]),
    }


async def stream_chat(
    agent_id: str,
    message: str,
    environment_id: Optional[str] = None,
    previous_interaction_id: Optional[str] = None,
    override_tools: Optional[List[Dict[str, Any]]] = None,
    env_content: Optional[str] = None,
    project_id: Optional[str] = None,
    location: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """
    Streams an interaction turn with the agent via Server-Sent Events (SSE).
    Maintains session state via environment_id and previous_interaction_id.
    """
    client = get_genai_client(project_id, location)

    target_agent = (agent_id or "").strip() or config.DEFAULT_BASE_AGENT
    is_base_agent = (target_agent == config.DEFAULT_BASE_AGENT)

    # Determine effective .env content
    effective_env_content = env_content or _agent_env_content.get(target_agent) or _active_env_content
    if environment_id and effective_env_content:
        set_sandbox_env(environment_id=environment_id, env_content=effective_env_content, agent_id=target_agent)

    effective_input = message
    if effective_env_content and not previous_interaction_id:
        effective_input = (
            f"[Workspace Environment Setup: The following .env file is configured in your sandbox workspace:\n"
            f"```\n{effective_env_content.strip()}\n```\n"
            f"Always ensure /workspace/.env and any subproject .env files use these settings.]\n\n"
            f"{message}"
        )

    interaction_kwargs: Dict[str, Any] = {
        "agent": target_agent,
        "input": effective_input,
        "stream": True,
        "background": True,
        "store": True,
        "timeout": config.TIMEOUT_SECONDS,
    }

    # Determine environment parameter:
    # 1. Turn 2+: If environment_id is provided, reuse existing persistent container across turns.
    # 2. Turn 1 Base Agent: Must pass environment={"type": "remote"} to provision fresh container.
    # 3. Turn 1 Custom Agent: Do NOT pass environment kwarg! Custom agents embed base_environment
    #    in their definition. Passing environment={"type": "remote"} causes a 404 Entity Not Found.
    if environment_id and environment_id.strip():
        interaction_kwargs["environment"] = environment_id.strip()
        logger.info(f"Reusing environment '{environment_id.strip()}' for agent '{target_agent}'")
    elif is_base_agent:
        interaction_kwargs["environment"] = {"type": "remote"}
        logger.info(f"Provisioning fresh remote environment for base agent '{target_agent}'")
    else:
        logger.info(f"Omitting environment kwarg for turn 1 of custom agent '{target_agent}' (uses preconfigured base_environment)")

    if previous_interaction_id and previous_interaction_id.strip():
        interaction_kwargs["previous_interaction_id"] = previous_interaction_id.strip()

    if override_tools:
        interaction_kwargs["tools"] = sanitize_tools(override_tools)

    env_display = interaction_kwargs.get("environment", "auto (agent base_environment)")
    # Yield initial connecting event
    yield f"data: {json.dumps({'event_type': 'connecting', 'agent': target_agent, 'environment': str(env_display)})}\n\n"

    def run_sync_stream():
        current_kwargs = dict(interaction_kwargs)
        # Ensure generous client timeout for long multi-step sandbox tool executions
        current_kwargs["timeout"] = httpx.Timeout(connect=60.0, read=600.0, write=60.0, pool=60.0)

        # Proactively ensure previous interaction has settled to 'completed' before chaining
        prev_id = current_kwargs.get("previous_interaction_id")
        if prev_id:
            for wait_attempt in range(12):
                try:
                    check_prev = client.interactions.get(id=prev_id)
                    st = getattr(check_prev, "status", None)
                    st_str = str(st).lower() if st else ""
                    if st_str in ("completed", "failed", "cancelled"):
                        logger.info(f"Previous interaction {prev_id} settled with status: {st}")
                        break
                    logger.info(f"Previous interaction {prev_id} still {st} (attempt {wait_attempt+1}/12), waiting...")
                    time.sleep(1.5)
                except Exception as get_err:
                    logger.warning(f"Could not check status of previous interaction {prev_id}: {get_err}")
                    break

        try:
            return client.interactions.create(**current_kwargs)
        except Exception as e:
            err_str = str(e)
            # Auto-heal: If previous interaction is IN_PROGRESS, poll or drop previous_interaction_id
            if "IN_PROGRESS" in err_str or "invalid state" in err_str.lower():
                logger.warning(f"Interaction creation failed due to IN_PROGRESS state: {err_str}")
                prev_id = current_kwargs.get("previous_interaction_id")
                if prev_id:
                    for _ in range(5):
                        time.sleep(2.0)
                        try:
                            check_prev = client.interactions.get(id=prev_id)
                            status = getattr(check_prev, "status", None)
                            if status and str(status).lower() not in ("in_progress", "pending"):
                                logger.info(f"Previous interaction {prev_id} now completed ({status}). Retrying with history...")
                                return client.interactions.create(**current_kwargs)
                        except Exception:
                            pass

                # If still locked, drop previous_interaction_id but KEEP environment!
                # All files, workspace state, packages, and environment remain 100% intact!
                if "previous_interaction_id" in current_kwargs:
                    logger.warning(
                        f"Dropping previous_interaction_id '{prev_id}' to clear IN_PROGRESS lock; keeping persistent environment '{current_kwargs.get('environment')}'"
                    )
                    current_kwargs.pop("previous_interaction_id", None)
                    try:
                        return client.interactions.create(**current_kwargs)
                    except Exception as retry_err:
                        return retry_err
            return e

    # Start creation in thread pool
    loop = asyncio.get_event_loop()
    stream_or_err = await loop.run_in_executor(_executor, run_sync_stream)

    if isinstance(stream_or_err, Exception):
        err_msg = str(stream_or_err)
        logger.error(f"Error creating interaction: {err_msg}", exc_info=True)
        yield f"data: {json.dumps({'event_type': 'error', 'message': err_msg})}\n\n"
        return

    stream = stream_or_err

    # Read events from the stream
    def get_next_event(iter_stream):
        try:
            return next(iter_stream), False
        except StopIteration:
            return None, True
        except Exception as e:
            return e, True

    active_env = environment_id.strip() if (environment_id and environment_id.strip()) else None
    last_interaction_id = None
    saw_completed = False
    turn_text_buffer = ""
    turn_code_buffer = ""
    emitted_file_paths = set()

    stream_iter = iter(stream)
    while True:
        event, done = await loop.run_in_executor(_executor, get_next_event, stream_iter)
        if done:
            if isinstance(event, Exception):
                logger.error(f"Error during streaming: {event}", exc_info=True)
                yield f"data: {json.dumps({'event_type': 'error', 'message': str(event)})}\n\n"
            break

        event_type = getattr(event, "event_type", "unknown")
        data: Dict[str, Any] = {"event_type": event_type}

        if event_type == "interaction.created":
            interaction = getattr(event, "interaction", None)
            if interaction:
                last_interaction_id = getattr(interaction, "id", None)
                raw_env = getattr(interaction, "environment_id", None) or getattr(interaction, "environment", None)
                if raw_env and not isinstance(raw_env, str):
                    raw_env = getattr(raw_env, "id", str(raw_env))
                if raw_env:
                    active_env = raw_env
                    try:
                        env_map = load_agent_env_map()
                        env_map[target_agent] = active_env
                        save_agent_env_map(env_map)
                    except Exception:
                        pass
                data["interaction_id"] = last_interaction_id
                data["environment_id"] = active_env
                logger.info(f"Interaction started: ID={last_interaction_id}, env={active_env}")

        elif event_type == "step.start":
            step = getattr(event, "step", None)
            data["step_type"] = getattr(step, "type", "unknown")
            data["step"] = _serialize_step(step)
            data["index"] = getattr(event, "index", 0)
            if step:
                step_type_str = str(data["step_type"]).lower()
                if "code" in step_type_str or hasattr(step, "code") or hasattr(step, "command"):
                    data["tool"] = "code_execution"
                    data["command"] = getattr(step, "command", None) or getattr(step, "code", None)
                elif "search" in step_type_str or hasattr(step, "query"):
                    data["tool"] = "google_search"
                    data["query"] = getattr(step, "query", None)
                elif hasattr(step, "name") and step.name:
                    data["tool"] = getattr(step, "name")

                for f in extract_files_from_step(step):
                    f_path = f["path"]
                    if f.get("content") and f_path not in emitted_file_paths:
                        emitted_file_paths.add(f_path)
                        if active_env:
                            ensure_env_cache(active_env)
                            _sandbox_files[active_env][f_path] = f
                            save_env_cache(active_env)
                        yield f"data: {json.dumps({'event_type': 'sandbox.file_updated', 'file': f, 'path': f['path'], 'content': f.get('content', ''), 'size': f.get('size', 0), 'language': f.get('language', 'plaintext')}, default=str)}\n\n"

                for attr in ("code", "command", "content"):
                    val = getattr(step, attr, None)
                    if val:
                        turn_code_buffer += f"\n{val}"

        elif event_type == "step.delta":
            delta = getattr(event, "delta", None)
            data["delta_type"] = getattr(delta, "type", "unknown")
            data["delta"] = _serialize_delta(delta)
            data["index"] = getattr(event, "index", 0)
            if delta:
                text_chunk = getattr(delta, "text", None) or (delta.get("text") if isinstance(delta, dict) else None)
                if text_chunk:
                    turn_text_buffer += text_chunk
                    data["text"] = text_chunk
                thought_chunk = getattr(delta, "thought", None) or (delta.get("thought") if isinstance(delta, dict) else None)
                if thought_chunk:
                    data["thought"] = thought_chunk
                for attr in ("code", "command", "output"):
                    val = getattr(delta, attr, None) or (delta.get(attr) if isinstance(delta, dict) else None)
                    if val:
                        turn_code_buffer += f"\n{val}"
                        data[attr] = val

        elif event_type == "step.stop":
            data["index"] = getattr(event, "index", 0)
            data["step_usage"] = getattr(event, "step_usage", None)
            step = getattr(event, "step", None)
            if step:
                data["step"] = _serialize_step(step)
                if hasattr(step, "output") and step.output:
                    data["result"] = step.output
                elif hasattr(step, "result") and step.result:
                    data["result"] = step.result
                for f in extract_files_from_step(step):
                    f_path = f["path"]
                    if f.get("content") and f_path not in emitted_file_paths:
                        emitted_file_paths.add(f_path)
                        if active_env:
                            ensure_env_cache(active_env)
                            _sandbox_files[active_env][f_path] = f
                            save_env_cache(active_env)
                        yield f"data: {json.dumps({'event_type': 'sandbox.file_updated', 'file': f, 'path': f['path'], 'content': f.get('content', ''), 'size': f.get('size', 0), 'language': f.get('language', 'plaintext')}, default=str)}\n\n"

            # Real-time extraction of files written during step
            new_files = extract_files_from_content(turn_code_buffer + "\n" + turn_text_buffer)
            for f in new_files:
                f_path = f["path"]
                if f_path not in emitted_file_paths and f.get("content"):
                    emitted_file_paths.add(f_path)
                    if active_env:
                        ensure_env_cache(active_env)
                        _sandbox_files[active_env][f_path] = f
                        save_env_cache(active_env)
                    yield f"data: {json.dumps({'event_type': 'sandbox.file_updated', 'file': f, 'path': f['path'], 'content': f.get('content', ''), 'size': f.get('size', 0), 'language': f.get('language', 'plaintext')}, default=str)}\n\n"

        elif event_type == "interaction.completed":
            saw_completed = True
            interaction = getattr(event, "interaction", None)
            if interaction:
                data["interaction_id"] = getattr(interaction, "id", None) or last_interaction_id
                raw_env = getattr(interaction, "environment_id", None) or getattr(interaction, "environment", None)
                if raw_env and not isinstance(raw_env, str):
                    raw_env = getattr(raw_env, "id", str(raw_env))
                data["environment_id"] = raw_env or active_env
                data["output_text"] = getattr(interaction, "output_text", None)
                data["final_output"] = data["output_text"]
                data["text"] = data["output_text"]
                usage = getattr(interaction, "usage", None)
                if usage:
                    data["usage"] = {
                        "total_tokens": getattr(usage, "total_tokens", None),
                        "total_input_tokens": getattr(usage, "total_input_tokens", None),
                        "total_output_tokens": getattr(usage, "total_output_tokens", None),
                        "total_thought_tokens": getattr(usage, "total_thought_tokens", None),
                    }

                target_env = data["environment_id"] or active_env
                if target_env:
                    active_env = target_env
                    try:
                        env_map = load_agent_env_map()
                        env_map[target_agent] = target_env
                        save_agent_env_map(env_map)
                    except Exception as ex:
                        logger.warning(f"Could not persist agent env map: {ex}")
                if target_env and data.get("interaction_id"):
                    _env_last_interaction[target_env] = data["interaction_id"]

                # Fetch full steps for complete extraction
                steps = getattr(interaction, "steps", None)
                if not steps and data.get("interaction_id"):
                    try:
                        full_interaction = client.interactions.get(id=data["interaction_id"])
                        if full_interaction and hasattr(full_interaction, "steps"):
                            steps = full_interaction.steps
                    except Exception as ex:
                        logger.warning(f"Could not fetch full steps for interaction {data['interaction_id']}: {ex}")

                if steps:
                    for s in steps:
                        for f in extract_files_from_step(s):
                            f_path = f["path"]
                            if target_env:
                                ensure_env_cache(target_env)
                                _sandbox_files[target_env][f_path] = f
                            if f_path not in emitted_file_paths and f.get("content"):
                                emitted_file_paths.add(f_path)
                                yield f"data: {json.dumps({'event_type': 'sandbox.file_updated', 'file': f, 'path': f['path'], 'content': f.get('content', ''), 'size': f.get('size', 0), 'language': f.get('language', 'plaintext')}, default=str)}\n\n"

                full_text = turn_code_buffer + "\n" + turn_text_buffer + "\n" + (data.get("output_text") or "")
                new_files = extract_files_from_content(full_text)
                if target_env:
                    ensure_env_cache(target_env)
                    if effective_env_content and ".env" not in _sandbox_files[target_env]:
                        set_sandbox_env(environment_id=target_env, env_content=effective_env_content, agent_id=target_agent)
                    for f in new_files:
                        f_path = f["path"]
                        if f.get("content") or f_path not in _sandbox_files[target_env]:
                            _sandbox_files[target_env][f_path] = f
                            if f_path not in emitted_file_paths:
                                emitted_file_paths.add(f_path)
                                yield f"data: {json.dumps({'event_type': 'sandbox.file_updated', 'file': f, 'path': f['path'], 'content': f.get('content', ''), 'size': f.get('size', 0), 'language': f.get('language', 'plaintext')}, default=str)}\n\n"
                    save_env_cache(target_env)
                    data["sandbox_files"] = list(_sandbox_files.get(target_env, {}).values())
                    data["sandbox_tree"] = build_file_tree(_sandbox_files.get(target_env, {}))

        elif event_type == "error":
            data["error"] = str(getattr(event, "error", "Unknown error"))

        yield f"data: {json.dumps(data, default=str)}\n\n"

    # Fallback polling: If stream terminated without interaction.completed, poll client.interactions.get
    if not saw_completed and last_interaction_id:
        logger.info(f"Stream ended without interaction.completed; checking status of interaction {last_interaction_id}")
        for attempt in range(6):
            try:
                def get_interaction_sync():
                    return client.interactions.get(id=last_interaction_id)

                polled = await loop.run_in_executor(_executor, get_interaction_sync)
                if polled:
                    status = getattr(polled, "status", None)
                    status_str = str(status).lower() if status else ""
                    logger.info(f"Polled interaction {last_interaction_id} (attempt {attempt+1}): status={status_str}")
                    if status_str in ("completed", "done", "succeeded", "success"):
                        saw_completed = True
                        output_text = getattr(polled, "output_text", None) or ""
                        raw_env = getattr(polled, "environment_id", None) or getattr(polled, "environment", None)
                        if raw_env and not isinstance(raw_env, str):
                            raw_env = getattr(raw_env, "id", str(raw_env))
                        target_env = raw_env or active_env

                        comp_data = {
                            "event_type": "interaction.completed",
                            "interaction_id": last_interaction_id,
                            "environment_id": target_env,
                            "output_text": output_text,
                            "final_output": output_text,
                            "text": output_text,
                        }

                        steps = getattr(polled, "steps", None)
                        if steps:
                            for s in steps:
                                for f in extract_files_from_step(s):
                                    f_path = f["path"]
                                    if target_env:
                                        ensure_env_cache(target_env)
                                        _sandbox_files[target_env][f_path] = f
                                    if f_path not in emitted_file_paths and f.get("content"):
                                        emitted_file_paths.add(f_path)
                                        yield f"data: {json.dumps({'event_type': 'sandbox.file_updated', 'file': f, 'path': f['path'], 'content': f.get('content', ''), 'size': f.get('size', 0), 'language': f.get('language', 'plaintext')}, default=str)}\n\n"

                        full_text = turn_code_buffer + "\n" + turn_text_buffer + "\n" + output_text
                        new_files = extract_files_from_content(full_text)
                        if target_env:
                            ensure_env_cache(target_env)
                            for f in new_files:
                                f_path = f["path"]
                                if f.get("content") or f_path not in _sandbox_files[target_env]:
                                    _sandbox_files[target_env][f_path] = f
                                    if f_path not in emitted_file_paths:
                                        emitted_file_paths.add(f_path)
                                        yield f"data: {json.dumps({'event_type': 'sandbox.file_updated', 'file': f, 'path': f['path'], 'content': f.get('content', ''), 'size': f.get('size', 0), 'language': f.get('language', 'plaintext')}, default=str)}\n\n"
                            save_env_cache(target_env)
                            comp_data["sandbox_files"] = list(_sandbox_files.get(target_env, {}).values())
                            comp_data["sandbox_tree"] = build_file_tree(_sandbox_files.get(target_env, {}))

                        yield f"data: {json.dumps(comp_data, default=str)}\n\n"
                        break
                    elif status_str in ("failed", "error", "cancelled"):
                        yield f"data: {json.dumps({'event_type': 'error', 'message': f'Interaction finished with status: {status_str}'})}\n\n"
                        break
            except Exception as e:
                logger.warning(f"Polling error for interaction {last_interaction_id}: {e}")
            await asyncio.sleep(2.0)

    yield "data: [DONE]\n\n"
