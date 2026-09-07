#!/usr/bin/env python3
import base64
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request


def load_api_key() -> str:
    candidates = [
        os.environ.get("GOOGLE_API_KEY", ""),
        pathlib.Path("/mnt/c/Users/user/.cursor/scripts/ai.env"),
        pathlib.Path.home() / ".cursor" / "scripts" / "ai.env",
    ]
    key = candidates[0]
    if key:
        return key.strip()
    for env_file in candidates[1:]:
        if not isinstance(env_file, pathlib.Path) or not env_file.exists():
            continue
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("GOOGLE_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: transcribe_audio.py <audio-file>", file=sys.stderr)
        return 1

    audio_path = pathlib.Path(sys.argv[1])
    if not audio_path.exists():
        print(f"File not found: {audio_path}", file=sys.stderr)
        return 1

    api_key = load_api_key()
    if not api_key:
        print("GOOGLE_API_KEY not found", file=sys.stderr)
        return 1

    data = base64.b64encode(audio_path.read_bytes()).decode()
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": (
                            "Transcreva este audio em portugues com fidelidade. "
                            "Retorne apenas a transcricao literal, sem comentarios."
                        )
                    },
                    {"inline_data": {"mime_type": "audio/ogg", "data": data}},
                ]
            }
        ]
    }
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.0-flash:generateContent?key={api_key}"
    )
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            out = json.load(resp)
        print(out["candidates"][0]["content"]["parts"][0]["text"].strip())
        return 0
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code}: {body[:800]}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
