import asyncio
import json
import sys
from pathlib import Path
from typing import List, Dict, AsyncGenerator
from loguru import logger

# POINT TO THE NEW SCRIPT
SCRIPT_PATH = Path(
    "/app/app_gateway/py_scripts/scripts/jsnapy_runner/run_jsnapy_module.py"
)


class JSNAPyServiceV2:
    @staticmethod
    async def run_job(
        hosts: List[str],
        username: str,
        password: str,
        tests: List[str],
        mode: str = "check",
        tag: str = "snap",
    ) -> asyncio.subprocess.Process:
        if not SCRIPT_PATH.exists():
            raise FileNotFoundError(f"Runner script missing at {SCRIPT_PATH}")

        # Clean test paths (remove 'tests/' prefix if present)
        cleaned_tests = [t.strip().replace("tests/", "") for t in tests]

        cmd = [
            sys.executable,
            "-u",  # Unbuffered
            str(SCRIPT_PATH),
            "--hostname",
            hosts[0],
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

        logger.info(f"Starting JSNAPy Module V2: {cmd}")

        return await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )

    @staticmethod
    async def stream_events(
        process: asyncio.subprocess.Process,
    ) -> AsyncGenerator[Dict, None]:
        # Standard line-by-line JSON streaming
        while True:
            line = await process.stdout.readline()
            if not line:
                break

            try:
                yield json.loads(line.decode().strip())
            except json.JSONDecodeError:
                pass  # Ignore non-JSON noise

        await process.wait()
