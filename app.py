import os
import logging
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import config
import agent_service

logger = logging.getLogger("managed_agents_app")
logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="Gemini Managed Agents Studio",
    description="Interactive Web UI and API for Google Cloud Managed Agents on Agent Platform",
    version="1.0.0"
)

# Ensure static directory exists
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class AgentInitRequest(BaseModel):
    agent_id: str = Field(..., description="Unique agent identifier")
    base_agent: str = Field(default=config.DEFAULT_BASE_AGENT)
    description: Optional[str] = Field(default="")
    system_instruction: Optional[str] = Field(default="")
    tools: Optional[List[Dict[str, Any]]] = Field(default=None)
    gcs_bucket: Optional[str] = Field(default=None)
    gcs_target: Optional[str] = Field(default="/.agent")
    skills_source: Optional[str] = Field(default=None)
    skills_type: Optional[str] = Field(default="gcs")
    skills_target: Optional[str] = Field(default="./skills")
    network_domains: Optional[List[str]] = Field(default=["*"])
    env_content: Optional[str] = Field(default=None, description="Initial .env content or API key configuration")
    api_key: Optional[str] = Field(default=None, description="Gemini API Key (GOOGLE_API_KEY)")
    project_id: Optional[str] = Field(default=None)
    location: Optional[str] = Field(default=None)


class BucketCreateRequest(BaseModel):
    bucket_name: str = Field(..., description="Google Cloud Storage bucket name (without gs://)")
    location: Optional[str] = Field(default="US", description="GCS bucket location/region, e.g. US, us-central1")
    project_id: Optional[str] = Field(default=None, description="Optional GCP project ID override")


class ChatStreamRequest(BaseModel):
    agent_id: str = Field(..., description="Target custom agent ID or base agent 'antigravity-preview-05-2026'")
    message: str = Field(..., description="User prompt")
    environment_id: Optional[str] = Field(default=None, description="Persistent sandbox environment ID")
    previous_interaction_id: Optional[str] = Field(default=None, description="Previous interaction ID")
    override_tools: Optional[List[Dict[str, Any]]] = Field(default=None)
    env_content: Optional[str] = Field(default=None, description="Sandbox .env content to ensure in workspace")
    project_id: Optional[str] = Field(default=None)
    location: Optional[str] = Field(default=None)


class SandboxSyncRequest(BaseModel):
    environment_id: str = Field(..., description="Target sandbox environment ID to sync from")
    agent_id: Optional[str] = Field(default=None, description="Agent ID to use for running sync probe")
    project_id: Optional[str] = Field(default=None)
    location: Optional[str] = Field(default=None)


class SandboxEnvRequest(BaseModel):
    environment_id: Optional[str] = Field(default=None, description="Sandbox environment ID")
    agent_id: Optional[str] = Field(default=None, description="Agent ID")
    env_content: Optional[str] = Field(default=None, description="New .env file content")
    api_key: Optional[str] = Field(default=None, description="Gemini API Key override")


class SandboxFileWriteRequest(BaseModel):
    environment_id: str = Field(..., description="Target sandbox environment ID")
    path: str = Field(..., description="File path relative to workspace")
    content: str = Field(..., description="File text content")
    agent_id: Optional[str] = Field(default=None)
    project_id: Optional[str] = Field(default=None)
    location: Optional[str] = Field(default=None)


@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse("<h1>Managed Agents Studio UI loading...</h1>")


@app.get("/api/config")
async def get_configuration():
    """Returns runtime configuration and defaults for the UI."""
    return {
        "project_id": config.PROJECT_ID,
        "location": config.LOCATION,
        "default_base_agent": config.DEFAULT_BASE_AGENT,
        "default_tools": config.DEFAULT_TOOLS,
        "default_allowlist": config.DEFAULT_ALLOWLIST,
        "default_system_instruction": config.DEFAULT_SYSTEM_INSTRUCTION,
        "default_env_content": config.DEFAULT_ENV_CONTENT,
        "timeout_seconds": config.TIMEOUT_SECONDS,
    }


@app.get("/api/agents")
async def api_list_agents(project_id: Optional[str] = None, location: Optional[str] = None):
    """List all custom agents registered in the project."""
    try:
        agents = agent_service.list_agents(project_id, location)
        return {"agents": agents, "count": len(agents)}
    except Exception as e:
        logger.error(f"Failed to list agents: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/agents/{agent_id}")
async def api_get_agent(agent_id: str, project_id: Optional[str] = None, location: Optional[str] = None):
    """Retrieve details for a specific custom agent."""
    try:
        agent = agent_service.get_agent(agent_id, project_id, location)
        return agent
    except Exception as e:
        logger.error(f"Failed to get agent {agent_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agents/initialize")
async def api_initialize_agent(req: AgentInitRequest):
    """Provision a new custom agent with the specified configuration."""
    try:
        agent = agent_service.create_agent(
            agent_id=req.agent_id,
            base_agent=req.base_agent,
            description=req.description,
            system_instruction=req.system_instruction,
            tools=req.tools,
            gcs_bucket=req.gcs_bucket,
            gcs_target=req.gcs_target,
            skills_source=req.skills_source,
            skills_type=req.skills_type,
            skills_target=req.skills_target,
            network_domains=req.network_domains,
            env_content=req.env_content,
            api_key=req.api_key,
            project_id=req.project_id,
            location=req.location,
        )
        return {"status": "success", "agent": agent}
    except Exception as e:
        logger.error(f"Failed to initialize agent {req.agent_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/agents/{agent_id}")
async def api_delete_agent(agent_id: str, project_id: Optional[str] = None, location: Optional[str] = None):
    """Delete a custom agent permanently."""
    try:
        res = agent_service.delete_agent(agent_id, project_id, location)
        return res
    except Exception as e:
        logger.error(f"Failed to delete agent {agent_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/buckets")
async def api_list_buckets(project_id: Optional[str] = None):
    """List Google Cloud Storage buckets in the specified GCP project."""
    try:
        buckets = agent_service.list_gcs_buckets(project_id)
        return {"buckets": buckets, "count": len(buckets)}
    except Exception as e:
        logger.error(f"Failed to list buckets: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/buckets")
async def api_create_bucket(req: BucketCreateRequest):
    """Create a new Google Cloud Storage bucket in the project."""
    try:
        bucket = agent_service.create_gcs_bucket(
            bucket_name=req.bucket_name,
            location=req.location or "US",
            project_id=req.project_id
        )
        return {"status": "created", "bucket": bucket}
    except Exception as e:
        logger.error(f"Failed to create bucket {req.bucket_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat/stream")
async def api_chat_stream(req: ChatStreamRequest):
    """
    Stream an interactive multi-turn session with the agent using Server-Sent Events (SSE).
    """
    try:
        generator = agent_service.stream_chat(
            agent_id=req.agent_id,
            message=req.message,
            environment_id=req.environment_id,
            previous_interaction_id=req.previous_interaction_id,
            override_tools=req.override_tools,
            env_content=req.env_content,
            project_id=req.project_id,
            location=req.location,
        )
        return StreamingResponse(
            generator,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            }
        )
    except Exception as e:
        logger.error(f"Failed to initiate chat stream: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sandbox/files")
async def api_get_sandbox_files(environment_id: Optional[str] = None, agent_id: Optional[str] = None):
    """Retrieve all discovered files and hierarchy tree for the active sandbox environment."""
    try:
        return agent_service.get_sandbox_files(environment_id, agent_id=agent_id)
    except Exception as e:
        logger.error(f"Failed to get sandbox files: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sandbox/file")
async def api_get_sandbox_file(path: str, environment_id: Optional[str] = None, agent_id: Optional[str] = None):
    """Retrieve full content and metadata for a specific sandbox file."""
    try:
        file_info = agent_service.get_sandbox_file(environment_id, path, agent_id=agent_id)
        if not file_info:
            raise HTTPException(status_code=404, detail=f"File '{path}' not found")
        return file_info
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get sandbox file '{path}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sandbox/sync")
async def api_sync_sandbox_files(req: SandboxSyncRequest):
    """Trigger an active scan of the live sandbox Linux container to discover all generated files."""
    try:
        res = agent_service.sync_sandbox_files(
            agent_id=req.agent_id or config.DEFAULT_BASE_AGENT,
            environment_id=req.environment_id,
            project_id=req.project_id,
            location=req.location,
        )
        return res
    except Exception as e:
        logger.error(f"Failed to sync sandbox files: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sandbox/file")
async def api_write_sandbox_file(req: SandboxFileWriteRequest):
    """Write or update a file directly in the sandbox container from the code editor."""
    try:
        res = agent_service.write_sandbox_file(
            agent_id=req.agent_id or config.DEFAULT_BASE_AGENT,
            environment_id=req.environment_id,
            path=req.path,
            content=req.content,
            project_id=req.project_id,
            location=req.location,
        )
        return res
    except Exception as e:
        logger.error(f"Failed to write sandbox file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sandbox/env")
async def api_set_sandbox_env(req: SandboxEnvRequest):
    """Configure or update the .env file and API key for the sandbox workspace."""
    try:
        res = agent_service.set_sandbox_env(
            environment_id=req.environment_id,
            env_content=req.env_content,
            api_key=req.api_key,
            agent_id=req.agent_id,
        )
        return res
    except Exception as e:
        logger.error(f"Failed to update sandbox .env: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "project": config.PROJECT_ID, "location": config.LOCATION}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host=config.HOST, port=config.PORT, reload=True)
