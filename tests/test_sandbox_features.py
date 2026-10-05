import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from app import app
import agent_service

client = TestClient(app)

def test_language_detection():
    assert agent_service.detect_language("app.py") == "python"
    assert agent_service.detect_language("schema.json") == "json"
    assert agent_service.detect_language("Server.java") == "java"
    assert agent_service.detect_language("script.sh") == "bash"
    assert agent_service.detect_language("README.md") == "markdown"
    assert agent_service.detect_language("deploy.yaml") == "yaml"
    assert agent_service.detect_language("query.sql") == "sql"
    assert agent_service.detect_language("index.html") == "html"
    assert agent_service.detect_language("styles.css") == "css"
    assert agent_service.detect_language("unknown.xyz", "print(1)") == "python"
    assert agent_service.detect_language("unknown.xyz", '{"a": 1}') == "json"
    assert agent_service.detect_language("unknown.xyz", "public class A {}") == "java"


def test_tree_building():
    files_map = {
        "src/models/user.py": {"path": "src/models/user.py", "content": "class User: pass", "size": 16, "language": "python"},
        "src/main.py": {"path": "src/main.py", "content": "print(1)", "size": 8, "language": "python"},
        "config.json": {"path": "config.json", "content": "{}", "size": 2, "language": "json"},
        "data/test.csv": {"path": "data/test.csv", "content": "a,b", "size": 3, "language": "csv"},
    }
    tree = agent_service.build_file_tree(files_map)
    assert len(tree) == 3 # data, src, config.json
    assert tree[0]["name"] == "data" and tree[0]["type"] == "directory"
    assert tree[1]["name"] == "src" and tree[1]["type"] == "directory"
    assert tree[2]["name"] == "config.json" and tree[2]["type"] == "file"

    src_children = tree[1]["children"]
    assert len(src_children) == 2 # models (dir), main.py (file)
    assert src_children[0]["name"] == "models" and src_children[0]["type"] == "directory"
    assert src_children[1]["name"] == "main.py" and src_children[1]["type"] == "file"


def test_sandbox_file_endpoints():
    env_id = "test_env_123"
    agent_service._sandbox_files[env_id] = {
        "hello.py": {"path": "hello.py", "content": "print('hello')", "size": 14, "language": "python", "updated_at": "2026-09-21 18:00:00"}
    }

    # Test list files
    res = client.get(f"/api/sandbox/files?environment_id={env_id}")
    assert res.status_code == 200
    data = res.json()
    assert data["environment_id"] == env_id
    assert data["count"] == 1
    assert data["files"][0]["path"] == "hello.py"
    assert len(data["tree"]) == 1

    # Test get file
    res_file = client.get(f"/api/sandbox/file?environment_id={env_id}&path=hello.py")
    assert res_file.status_code == 200
    file_info = res_file.json()
    assert file_info["path"] == "hello.py"
    assert file_info["content"] == "print('hello')"
    assert file_info["language"] == "python"

    # Test file not found
    res_404 = client.get(f"/api/sandbox/file?environment_id={env_id}&path=missing.py")
    assert res_404.status_code == 404


def test_file_extraction_from_agent_stream():
    # 1. Bash cat heredoc
    text_bash = """
I am writing the agent script now:
cat << 'EOF' > holiday_booking_agent/agent.py
import os
def book():
    return "Booked!"
EOF
"""
    extracted = agent_service.extract_files_from_content(text_bash)
    assert len(extracted) == 1
    assert extracted[0]["path"] == "holiday_booking_agent/agent.py"
    assert "def book():" in extracted[0]["content"]
    assert extracted[0]["language"] == "python"

    # 2. Python open write
    text_py = """
open("config.json", "w").write('{"status": "ok"}')
"""
    extracted_py = agent_service.extract_files_from_content(text_py)
    assert len(extracted_py) == 1
    assert extracted_py[0]["path"] == "config.json"
    assert extracted_py[0]["language"] == "json"

    # 3. Echo write
    text_echo = """
echo "Hello from container" > welcome.txt
"""
    extracted_echo = agent_service.extract_files_from_content(text_echo)
    assert len(extracted_echo) == 1
    assert extracted_echo[0]["path"] == "welcome.txt"
    assert "Hello from container" in extracted_echo[0]["content"]

if __name__ == "__main__":
    test_language_detection()
    test_tree_building()
    test_sandbox_file_endpoints()
    test_file_extraction_from_agent_stream()
    print("ALL 4 SANDBOX TEST SUITES PASSED!")
