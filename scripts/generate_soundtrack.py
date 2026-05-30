#!/usr/bin/env python3
"""
VeritasAudit Lyria Soundtrack Generator
Engineered by Antigravity

Generates high-fidelity background soundtracks using Google DeepMind's Lyria AI music models.
"""

import os
import sys
import argparse
import json
import base64
import urllib.request
import urllib.error

# Beautiful console logger formatting
class Logger:
    @staticmethod
    def info(msg):
        print(f"\033[94m🚀 [INFO] {msg}\033[0m")
    
    @staticmethod
    def action(msg):
        print(f"\033[96m⚙️  [EXEC] {msg}\033[0m")
        
    @staticmethod
    def success(msg):
        print(f"\033[92m✅ [SUCCESS] {msg}\033[0m")
        
    @staticmethod
    def warn(msg):
        print(f"\033[93m⚠️  [WARN] {msg}\033[0m")
        
    @staticmethod
    def error(msg):
        print(f"\033[91m❌ [ERROR] {msg}\033[0m")

def generate_via_raw_http(model_name, prompt, api_key, out_path):
    """
    Method A: Directly contacts the Gemini API using python built-in libraries.
    Requires no pip packages and is extremely robust.
    """
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
    
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": prompt
                    }
                ]
            }
        ]
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    Logger.action(f"Connecting to Gemini API endpoint for Lyria...")
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            
            # Extract audio from response parts
            candidates = res_data.get("candidates", [])
            if not candidates:
                Logger.error("No generation candidates returned from the API.")
                return False
                
            parts = candidates[0].get("content", {}).get("parts", [])
            audio_data_b64 = None
            
            for part in parts:
                inline_data = part.get("inlineData", {})
                mime_type = inline_data.get("mimeType", "")
                if "audio" in mime_type or part.get("inlineData"):
                    audio_data_b64 = inline_data.get("data")
                    break
            
            if not audio_data_b64:
                # Alternate structures check
                if "outputAudio" in res_data:
                    audio_data_b64 = res_data["outputAudio"]
                elif "audioContent" in res_data:
                    audio_data_b64 = res_data["audioContent"]
                else:
                    # Let's inspect the raw parts if we couldn't find it directly
                    Logger.warn("Analyzing alternate JSON response structure...")
                    for candidate in candidates:
                        content_parts = candidate.get("content", {}).get("parts", [])
                        for p in content_parts:
                            if "data" in p:
                                audio_data_b64 = p["data"]
                                break
            
            if not audio_data_b64:
                Logger.error("Could not locate audio bytes in the Lyria API response JSON.")
                Logger.info("Raw response structure: " + json.dumps(res_data)[:400] + "...")
                return False
            
            # Decode and write to output file
            audio_bytes = base64.b64decode(audio_data_b64)
            with open(out_path, "wb") as audio_file:
                audio_file.write(audio_bytes)
                
            return True
            
    except urllib.error.HTTPError as e:
        error_msg = e.read().decode("utf-8")
        Logger.error(f"HTTP Error {e.code}: {e.reason}")
        try:
            parsed_err = json.loads(error_msg)
            Logger.error(parsed_err.get("error", {}).get("message", "Unknown API error."))
        except Exception:
            Logger.error(error_msg[:300])
        return False
    except Exception as e:
        Logger.error(f"Failed during HTTP generation: {str(e)}")
        return False

def generate_via_sdk(model_name, prompt, out_path):
    """
    Method B & C: Fallback to official Google GenAI or GenerativeAI SDKs if installed.
    """
    # Try new Google GenAI SDK first
    try:
        from google import genai
        Logger.info("Attempting generation using modern 'google-genai' SDK...")
        client = genai.Client()
        # For Lyria, we call model content generation
        response = client.models.generate_content(
            model=model_name,
            contents=prompt
        )
        # Attempt to capture audio bytes
        if hasattr(response, "output_audio") and response.output_audio:
            with open(out_path, "wb") as f:
                f.write(response.output_audio)
            return True
    except ImportError:
        pass
    except Exception as e:
        Logger.warn(f"Modern SDK call failed: {str(e)}. Pivoting...")

    # Try legacy Google GenerativeAI SDK next
    try:
        import google.generativeai as legacy_genai
        Logger.info("Attempting generation using legacy 'google-generativeai' SDK...")
        legacy_genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
        model = legacy_genai.GenerativeModel(model_name)
        response = model.generate_content(prompt)
        
        # Check parts for audio
        for part in response.parts:
            if hasattr(part, "inline_data") and part.inline_data:
                with open(out_path, "wb") as f:
                    f.write(part.inline_data.data)
                return True
    except ImportError:
        pass
    except Exception as e:
        Logger.warn(f"Legacy SDK call failed: {str(e)}")
        
    return False

def main():
    parser = argparse.ArgumentParser(
        description="⚖️ VeritasAudit Lyria Soundtrack Generator",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument(
        "--prompt", 
        default="A low-volume, upbeat ambient synth track, futuristic and high-tech, perfect for an enterprise AI SecOps walk-through video.",
        help="Description of the music style and mood you want Lyria to generate."
    )
    
    parser.add_argument(
        "--model",
        default="lyria-3-clip-preview",
        choices=["lyria-3-clip-preview", "lyria-3-pro-preview"],
        help="Lyria model size: 'lyria-3-clip-preview' (30-second loop/preview) or 'lyria-3-pro-preview' (full song)."
    )
    
    parser.add_argument(
        "--out",
        default="./audio_segments/veritas_lyria_soundtrack.mp3",
        help="Output path to save the generated audio file."
    )
    
    parser.add_argument(
        "--key",
        help="Your Gemini API key (optional if GEMINI_API_KEY environment variable is set)."
    )

    args = parser.parse_args()

    print("\033[95m===================================================\033[0m")
    print("\033[95m⚖️  VeritasAudit: Lyria AI Music Generation Pipeline\033[0m")
    print("\033[95m===================================================\033[0m")

    # Resolve API Key
    api_key = args.key or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        Logger.error("API Key not found!")
        Logger.info("Please set the GEMINI_API_KEY environment variable or pass it with '--key <your_key>'")
        Logger.info("You can obtain a free API key at https://aistudio.google.com/")
        sys.exit(1)

    # Clean output path and create directories if missing
    out_path = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    Logger.info(f"Target Model:  \033[1m{args.model}\033[0m")
    Logger.info(f"Music Prompt:  \"{args.prompt}\"")
    Logger.info(f"Output File:   {out_path}")

    # Step 1: Try Zero-Dependency raw HTTP requests first
    Logger.info("Triggering Method A: Direct API Integration (Zero-Dependency)...")
    success = generate_via_raw_http(args.model, args.prompt, api_key, out_path)
    
    # Step 2: Fall back to SDK methods if Method A encountered an interface block
    if not success:
        Logger.warn("Direct HTTP endpoint failed or is not available. Falling back to SDK implementations...")
        success = generate_via_sdk(args.model, args.prompt, out_path)

    if success:
        Logger.success("Music generation completed successfully!")
        Logger.success(f"Generated soundtrack saved to: {out_path}")
        print("\033[95m===================================================\033[0m")
    else:
        Logger.error("Failed to generate soundtrack using all available pipelines.")
        Logger.info("Please verify that your GEMINI_API_KEY has enabled preview access to the 'lyria-3' model suite in Google AI Studio.")
        sys.exit(1)

if __name__ == "__main__":
    main()
