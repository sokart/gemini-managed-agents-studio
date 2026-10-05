import os
from typing import Dict, Any, List
from dotenv import load_dotenv

# Load variables from .env
load_dotenv()

PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "sokratis-genai-bb")
LOCATION = os.getenv("LOCATION", "global")
PORT = int(os.getenv("PORT", "8000"))
HOST = os.getenv("HOST", "0.0.0.0")
TIMEOUT_SECONDS = float(os.getenv("TIMEOUT_SECONDS", "300.0"))

DEFAULT_BASE_AGENT = "antigravity-preview-05-2026"

DEFAULT_TOOLS: List[Dict[str, str]] = [
    {"type": "code_execution"},
    {"type": "google_search"},
    {"type": "url_context"},
]

DEFAULT_ALLOWLIST = [{"domain": "*"}]

DEFAULT_SYSTEM_INSTRUCTION = (
    "You are an autonomous AI agent running inside a managed Linux sandbox. "
    "You can execute code (Python, Bash), browse the web, read/write files in the sandbox, "
    "and perform multi-step reasoning to solve complex problems."
)

DEFAULT_ENV_CONTENT = (
    "# API Configuration\n"
    "GOOGLE_GENAI_USE_VERTEXAI=0  # Set to true to use Vertex AI endpoint\n"
    "GOOGLE_API_KEY=AIzaSyDCpX2xLQ1t6RYuqjO96zbkSqFDO_KMH_8 # Set if GOOGLE_GENAI_USE_VERTEXAI=0\n\n"
    "# Project Configuration\n"
    "#GOOGLE_CLOUD_LOCATION=us-central1  # Required when GOOGLE_GENAI_USE_VERTEXAI=1\n"
    "#GOOGLE_CLOUD_PROJECT=sokratis-genai-bb\n\n"
    "MODEL=gemini-3.5-flash\n"
)
