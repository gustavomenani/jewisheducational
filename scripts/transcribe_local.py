#!/usr/bin/env python3
import sys
import os
from faster_whisper import WhisperModel

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 transcribe_local.py <audio-file>", file=sys.stderr)
        return 1

    audio_path = sys.argv[1]
    if not os.path.exists(audio_path):
        print(f"File not found: {audio_path}", file=sys.stderr)
        return 1

    print("Loading model...", file=sys.stderr)
    # Using 'small' model for good Portuguese transcription quality and fast download/execution on CPU
    model = WhisperModel("small", device="cpu", compute_type="int8")

    print("Transcribing...", file=sys.stderr)
    segments, info = model.transcribe(audio_path, beam_size=5, language="pt")

    print(f"Detected language: {info.language} (prob: {info.language_probability:.2f})", file=sys.stderr)
    
    print("\n--- Transcription ---")
    for segment in segments:
        print(segment.text)
    print("---------------------\n")
    return 0

if __name__ == "__main__":
    sys.exit(main())
