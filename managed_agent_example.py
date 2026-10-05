#!/usr/bin/env python3
"""
Managed Agents API Example (Python)
Gemini Enterprise Agent Platform / Vertex AI

Based on:
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/build/managed-agents
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/build/managed-agents/create-manage
- https://github.com/GoogleCloudPlatform/generative-ai/blob/main/agents/managed-agents/intro_managed_agents_python.ipynb

Usage:
    python managed_agent_example.py
"""

import os
import time
import uuid
from google import genai
import config

PROJECT_ID = config.PROJECT_ID
LOCATION = config.LOCATION


def get_client() -> genai.Client:
    """Initialize Vertex AI GenAI Client for Managed Agents API."""
    print(f"Connecting to Google Cloud Project: {PROJECT_ID} (Location: {LOCATION})...")
    client = genai.Client(
        vertexai=True,
        project=PROJECT_ID,
        location=LOCATION,
        http_options={"timeout": int(config.TIMEOUT_SECONDS * 1000)}
    )
    return client


def demo_base_agent(client: genai.Client):
    """
    Step 1: Interact directly with the foundational base agent ('antigravity-preview-05-2026').
    No custom agent registration required.
    """
    print("\n" + "=" * 70)
    print("STEP 1: INTERACTION WITH FOUNDATIONAL BASE AGENT")
    print("=" * 70)

    prompt = "Write a python snippet to compute the first 10 Fibonacci numbers and execute it in bash."
    print(f"User Prompt: {prompt}")
    print("Sending interaction request (streaming)...")

    stream = client.interactions.create(
        agent="antigravity-preview-05-2026",
        input=prompt,
        environment={"type": "remote"},
        stream=True,
        background=True,
        store=True,
    )

    env_id = None
    last_interaction_id = None

    for event in stream:
        etype = getattr(event, "event_type", None)
        if etype == "step.start":
            step = getattr(event, "step", None)
            step_type = getattr(step, "type", "unknown")
            print(f"\n[Step Start: {step_type}]")
        elif etype == "step.delta":
            delta = getattr(event, "delta", None)
            if hasattr(delta, "text") and delta.text:
                print(delta.text, end="", flush=True)
            elif hasattr(delta, "thought_summary") and delta.thought_summary:
                print(f" [Thinking: {delta.thought_summary}]", flush=True)
            elif hasattr(delta, "code") and delta.code:
                print(f" [Code: {delta.code}]", flush=True)
            elif hasattr(delta, "output") and delta.output:
                print(f" [Output: {delta.output}]", flush=True)
        elif etype == "interaction.completed":
            interaction = getattr(event, "interaction", None)
            if interaction:
                env_id = getattr(interaction, "environment_id", None)
                last_interaction_id = getattr(interaction, "id", None)
                print(f"\n\n--> Interaction Completed!")
                print(f"--> Interaction ID: {last_interaction_id}")
                print(f"--> Persistent Environment ID: {env_id}")

    return env_id, last_interaction_id


def wait_for_interaction_completion(
    client: genai.Client,
    interaction_id: str,
    max_wait: float = 30.0,
    interval: float = 1.5
) -> bool:
    """
    Waits until the interaction transitions from 'in_progress' to 'completed'.
    The Managed Agents API requires the previous interaction to be fully completed
    before a subsequent turn can chain off it via previous_interaction_id.
    """
    print(f"\nWaiting for previous interaction {interaction_id} to complete on backend...", end="", flush=True)
    start_time = time.time()
    while time.time() - start_time < max_wait:
        try:
            interaction = client.interactions.get(id=interaction_id)
            status = getattr(interaction, "status", None)
            status_str = str(status).lower() if status else ""
            if status_str in ("completed", "failed", "cancelled"):
                print(f" [Ready: {status}]")
                return True
        except Exception:
            pass
        print(".", end="", flush=True)
        time.sleep(interval)
    print(" [Timeout reached, proceeding]")
    return False


def demo_multi_turn_session(client: genai.Client, env_id: str, prev_id: str):
    """
    Step 2: Multi-turn interaction reusing the existing sandbox environment.
    All files and session context in the Linux container are preserved!
    """
    print("\n" + "=" * 70)
    print("STEP 2: MULTI-TURN SESSION REUSING ENVIRONMENT ID")
    print("=" * 70)

    # Ensure previous interaction is completed before chaining
    if prev_id:
        wait_for_interaction_completion(client, prev_id)

    prompt = "What did we just compute? Now save those numbers into a file called fib.txt and verify with cat."
    print(f"User Prompt: {prompt}")
    print(f"Reusing Environment ID: {env_id}")
    print(f"Previous Interaction ID: {prev_id}")

    stream = client.interactions.create(
        agent="antigravity-preview-05-2026",
        input=prompt,
        environment=env_id,  # Pass the string environment_id to reuse container!
        previous_interaction_id=prev_id,
        stream=True,
        background=True,
        store=True,
    )

    for event in stream:
        etype = getattr(event, "event_type", None)
        if etype == "step.start":
            step = getattr(event, "step", None)
            step_type = getattr(step, "type", "unknown")
            print(f"\n[Step Start: {step_type}]")
        elif etype == "step.delta":
            delta = getattr(event, "delta", None)
            if hasattr(delta, "text") and delta.text:
                print(delta.text, end="", flush=True)
            elif hasattr(delta, "thought_summary") and delta.thought_summary:
                print(f" [Thinking: {delta.thought_summary}]", flush=True)
            elif hasattr(delta, "code") and delta.code:
                print(f" [Code: {delta.code}]", flush=True)
            elif hasattr(delta, "output") and delta.output:
                print(f" [Output: {delta.output}]", flush=True)
        elif etype == "interaction.completed":
            interaction = getattr(event, "interaction", None)
            if interaction:
                last_interaction_id = getattr(interaction, "id", None)
                print(f"\n\n--> Multi-turn Step Completed! Interaction ID: {last_interaction_id}")


def demo_create_custom_agent(client: genai.Client, gcs_bucket: str = None) -> str:
    """
    Step 3: Create and provision a custom Managed Agent via client.agents.create().
    Configures tools, GCS bucket mount, and remote sandbox allowlist.
    """
    print("\n" + "=" * 70)
    print("STEP 3: CREATE CUSTOM MANAGED AGENT")
    print("=" * 70)

    agent_id = f"demo-analyst-{uuid.uuid4().hex[:6]}"
    print(f"Registering Agent ID: {agent_id}")

    # Build sources list
    sources = []
    if gcs_bucket:
        sources.append({
            "type": "gcs",
            "source": gcs_bucket if gcs_bucket.startswith("gs://") else f"gs://{gcs_bucket}",
            "target": "/.agent",
        })

    base_environment = {
        "type": "remote",
        "network": {
            "allowlist": [{"domain": "*"}]
        }
    }
    if sources:
        base_environment["sources"] = sources

    # Built-in first-party tools recognized by Managed Agents API
    tools = [
        {"type": "code_execution"},
        {"type": "google_search"},
        {"type": "url_context"},
    ]

    agent = client.agents.create(
        id=agent_id,
        base_agent="antigravity-preview-05-2026",
        description="Autonomous data analyst agent with code execution and web search.",
        system_instruction=(
            "You are an expert Python data analyst. "
            "Write modular code, inspect files in your sandbox, and explain your findings clearly."
        ),
        tools=tools,
        base_environment=base_environment,
    )

    print(f"Agent creation initiated for ID: {agent_id}")
    print("Waiting for custom agent to become active on control plane...", end="", flush=True)
    for attempt in range(15):
        try:
            ag = client.agents.get(id=agent_id)
            if ag and getattr(ag, "id", None):
                print(f" [Ready: {ag.id}]")
                break
        except Exception:
            pass
        print(".", end="", flush=True)
        time.sleep(1.5)

    # Allow brief window for interaction worker propagation
    time.sleep(3.0)

    # Note: On turn 1 for a custom agent, do NOT pass environment={"type": "remote"}.
    # The custom agent automatically provisions its container from its preconfigured base_environment.
    print("\nTesting first turn with the newly registered custom agent...")
    stream = client.interactions.create(
        agent=agent_id,
        input="Write a python snippet that calculates 2**10 and print the answer.",
        stream=True,
        background=True,
        store=True,
    )
    for event in stream:
        etype = getattr(event, "event_type", None)
        if etype == "step.start":
            step = getattr(event, "step", None)
            step_type = getattr(step, "type", "unknown")
            print(f"\n[Step Start: {step_type}]")
        elif etype == "step.delta":
            delta = getattr(event, "delta", None)
            if hasattr(delta, "text") and delta.text:
                print(delta.text, end="", flush=True)
            elif hasattr(delta, "thought_summary") and delta.thought_summary:
                print(f" [Thinking: {delta.thought_summary}]", flush=True)
            elif hasattr(delta, "code") and delta.code:
                print(f" [Code: {delta.code}]", flush=True)
            elif hasattr(delta, "output") and delta.output:
                print(f" [Output: {delta.output}]", flush=True)
        elif etype == "interaction.completed":
            print("\n--> Custom Agent Interaction Completed!")

    print()
    return agent_id


def demo_list_and_cleanup(client: genai.Client, agent_id: str):
    """
    Step 4: List all agents and delete the test agent.
    """
    print("\n" + "=" * 70)
    print("STEP 4: LIST AND CLEANUP AGENTS")
    print("=" * 70)

    resp = client.agents.list()
    print("Current Registered Agents in Project:")
    if resp.agents:
        for i, ag in enumerate(resp.agents, 1):
            print(f"  [{i}] ID: {ag.id} | Base: {ag.base_agent} | Desc: {ag.description}")
    else:
        print("  No custom agents found.")

    print(f"\nCleaning up test agent: {agent_id}...")
    for attempt in range(6):
        try:
            client.agents.delete(id=agent_id)
            print("Agent deleted successfully.")
            break
        except Exception as e:
            if attempt < 5:
                print(f"Waiting for agent to be deletable ({e})...")
                time.sleep(2.0)
            else:
                print(f"Could not delete agent {agent_id}: {e}")


def main():
    client = get_client()

    # 1. Test base agent
    env_id, prev_id = demo_base_agent(client)

    # 2. Test multi-turn follow-up using persistent sandbox environment
    if env_id:
        demo_multi_turn_session(client, env_id, prev_id)

    # 3. Create custom agent
    custom_agent_id = demo_create_custom_agent(client)

    # 4. List and cleanup
    demo_list_and_cleanup(client, custom_agent_id)

    print("\nAll Managed Agents API demo steps completed successfully!")


if __name__ == "__main__":
    main()
