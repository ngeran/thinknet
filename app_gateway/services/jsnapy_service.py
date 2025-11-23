import asyncio
import json
import sys
from pathlib import Path
from typing import List, Dict, Any, AsyncGenerator
from loguru import logger

# Configuration
# This is the entry point for the worker script inside the Docker container
SCRIPT_PATH = Path("/app/app_gateway/py_scripts/scripts/jsnapy_runner/run.py")


class JSNAPyService:
    """
    Central service for invoking JSNAPy operations via the separate runner script.
    """

    @staticmethod
    async def discover_tests() -> List[Dict[str, str]]:
        """
        Returns a list of available test files from disk.
        Invokes run.py with --list_tests flag.
        """
        if not SCRIPT_PATH.exists():
            raise FileNotFoundError(f"Runner script missing at {SCRIPT_PATH}")

        cmd = [sys.executable, str(SCRIPT_PATH), "--list_tests"]

        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            logger.error(f"Discovery failed: {stderr.decode()}")
            raise RuntimeError("Failed to discover tests")

        try:
            return json.loads(stdout.decode()).get("discovered_tests", [])
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON from discovery: {stdout.decode()}")
            return []

    @staticmethod
    async def run_job(
        hosts: List[str],
        username: str,
        password: str,
        tests: List[str],
        mode: str = "check",
        tag: str = "snap",
    ) -> asyncio.subprocess.Process:
        """
        Starts the worker process and returns the process object.
        """
        if not SCRIPT_PATH.exists():
            raise FileNotFoundError(f"Runner script missing at {SCRIPT_PATH}")

        # ------------------------------------------------------------------
        # PATH FIX: Sanitize Test Paths
        # The frontend sends paths like "tests/system/test_version.yml"
        # The runner script mounts the base at "/app/shared/data/tests"
        # We must strip the leading "tests/" to avoid "tests/tests/..."
        # ------------------------------------------------------------------
        cleaned_tests = []
        for t in tests:
            t = t.strip()  # Remove whitespace
            if t.startswith("tests/"):
                cleaned_tests.append(t[6:])  # Remove 'tests/' prefix
            else:
                cleaned_tests.append(t)

        logger.info(f"Sanitized test paths: {cleaned_tests}")

        # Construct arguments
        cmd = [
            sys.executable,
            "-u",  # Unbuffered stdout is critical for real-time streaming
            str(SCRIPT_PATH),
            "--username",
            username,
            "--password",
            password,
            "--tests",
            ",".join(cleaned_tests),
            "--mode",
            mode,
            "--tag",
            tag,
        ]

        # Handle single host (run.py needs update for multi-host args if needed)
        if len(hosts) == 1:
            cmd.extend(["--hostname", hosts[0]])
        elif len(hosts) > 1:
            # If the script supports multiple hosts via comma, join them here
            # Otherwise, this remains a placeholder for future logic
            cmd.extend(["--hostname", ",".join(hosts)])
        else:
            raise ValueError("At least one hostname is required")

        logger.info(f"Starting JSNAPy Job: {cmd}")

        # Create subprocess
        return await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )

    @staticmethod
    async def stream_events(
        process: asyncio.subprocess.Process,
    ) -> AsyncGenerator[Dict, None]:
        """
        Helper generator that yields JSON events from the running process.
        This reads stdout line-by-line.
        """
        while True:
            line = await process.stdout.readline()
            if not line:
                break

            line_str = line.decode().strip()
            if not line_str:
                continue

            try:
                # Attempt to parse line as JSON
                yield json.loads(line_str)
            except json.JSONDecodeError:
                # If script prints non-JSON debug info, wrap it or log it
                logger.debug(f"Raw output: {line_str}")
                yield {"type": "log", "message": line_str, "level": "INFO"}

        # Check for errors after completion
        await process.wait()
        if process.returncode != 0:
            stderr = await process.stderr.read()
            err_msg = stderr.decode().strip()
            if err_msg:
                yield {"type": "error", "message": err_msg}
