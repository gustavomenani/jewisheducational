"""
Gera PDFs educacionais pagina a pagina via Gemini (gemini-2.5-flash-image).
Cada pagina e uma imagem A4 gerada pela IA e depois montada em PDF.
"""
import base64
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Instale Pillow: pip install pillow", file=sys.stderr)
    sys.exit(1)

MODEL = "gemini-2.5-flash-image"
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"

PAGE_SPECS = [
    {
        "id": "01-capa",
        "label": "Capa",
        "build_prompt": lambda d: f"""
Crie uma CAPA de worksheet educacional judaico imprimivel (retrato A4).

Titulo grande e legivel: "{d['title']}"
Subtitulo: material para {d.get('ageRange', 'criancas')}
Estilo: colorido, amigavel, tipo Education.com, fundo claro com bordas suaves.
Inclua ilustracao central sobre o tema ({d['title']}).
Badges: idade e tempo ({d.get('duration', '30 min')}).
Rodape discreto: "Jewish Educational Resources".
Texto em portugues do Brasil. Alta qualidade para impressao.
""".strip(),
    },
    {
        "id": "02-educador",
        "label": "Guia do educador",
        "build_prompt": lambda d: f"""
Pagina 2 de worksheet judaico (retrato A4) — GUIA DO EDUCADOR.

Titulo: Guia do educador
Historia resumida: {d.get('story', '')}
Orientacao: {d.get('educator', '')}
Objetivos (lista com bullets):
{chr(10).join('- ' + o for o in d.get('objectives', []))}
Curiosidades:
{chr(10).join('- ' + f for f in d.get('funFacts', []))}
Layout limpo, caixas organizadas, tipografia clara, fundo branco/creme.
Texto em portugues. Nada cortado nas bordas — margem generosa.
""".strip(),
    },
    {
        "id": "03-atividade",
        "label": "Atividade principal",
        "build_prompt": lambda d: f"""
Pagina 3 de worksheet judaico (retrato A4) — ATIVIDADE PRINCIPAL.

Titulo: Atividade principal
Instrucoes: {d.get('activity', '')}
Grande area para COLORIR com ilustracao relacionada a: {d['title']}.
Inclua rotulo "Area para colorir" e espaco para observacao.
Estilo infantil, linhas grossas, imprimivel, portugues do Brasil.
""".strip(),
    },
    {
        "id": "04-exercicios",
        "label": "Exercicios",
        "build_prompt": lambda d: f"""
Pagina 4 de worksheet judaico (retrato A4) — EXERCICIOS.

Titulo: Exercicios e pratica
{chr(10).join(f"{i+1}. {ex['prompt']}" + chr(10) + ("Linhas para escrever" * ex.get('lines', 2)) for i, ex in enumerate(d.get('exercises', [])))}
Linhas horizontais claras para preenchimento a lapis.
Layout organizado, numeracao visivel, margens seguras, portugues.
""".strip(),
    },
    {
        "id": "05-reflexao",
        "label": "Reflexao",
        "build_prompt": lambda d: f"""
Pagina 5 de worksheet judaico (retrato A4) — REFLEXAO E GLOSSARIO.

Secao: Perguntas para discussao
{chr(10).join('- ' + q for q in d.get('questions', []))}

Secao: Desafio criativo
{d.get('creative', '')}

Secao: Glossario
{chr(10).join('- ' + g for g in d.get('glossary', []))}
Design amigavel, icones pequenos, texto legivel, portugues do Brasil.
""".strip(),
    },
]


def api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        print("Defina GEMINI_API_KEY no backend/.env", file=sys.stderr)
        sys.exit(1)
    return key


def call_gemini_image(prompt: str, key: str, retries: int = 3) -> bytes:
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                API_URL,
                data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json", "X-goog-api-key": key},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=180) as resp:
                data = json.loads(resp.read())
            for part in data["candidates"][0]["content"]["parts"]:
                if "inlineData" in part:
                    return base64.b64decode(part["inlineData"]["data"])
            raise RuntimeError("Resposta sem imagem")
        except (urllib.error.HTTPError, urllib.error.URLError, RuntimeError, KeyError) as err:
            last_err = err
            wait = 2 ** attempt
            print(f"  Tentativa {attempt + 1}/{retries} falhou: {err}. Aguardando {wait}s...", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"Gemini falhou apos {retries} tentativas: {last_err}")


def save_page_png(raw: bytes, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.open(io.BytesIO(raw))
    if img.mode in ("RGBA", "P"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        bg.paste(img, mask=img.split()[3] if img.mode == "RGBA" else None)
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")
    # A4 @ 150dpi
    img = img.resize((1240, 1754), Image.Resampling.LANCZOS)
    img.save(path, "PNG", optimize=True)
    return path


def pages_to_pdf(page_paths: list[Path], output_path: Path) -> None:
    images = [Image.open(p).convert("RGB") for p in page_paths]
    images[0].save(
        output_path,
        "PDF",
        save_all=True,
        append_images=images[1:],
        resolution=150,
    )
    for img in images:
        img.close()


def generate_pages(data: dict, cache_dir: Path, force: bool = False) -> list[Path]:
    key = api_key()
    paths: list[Path] = []

    for spec in PAGE_SPECS:
        out = cache_dir / f"{spec['id']}.png"
        if out.exists() and not force:
            print(f"  Cache: {spec['label']}")
            paths.append(out)
            continue

        print(f"  Gemini: {spec['label']}...")
        prompt = spec["build_prompt"](data)
        raw = call_gemini_image(prompt, key)
        save_page_png(raw, out)
        paths.append(out)
        time.sleep(1)

    return paths


def build_pdf(data: dict, output_path: Path, slug: str, force: bool = False) -> None:
    cache_dir = Path(output_path).parent / ".gemini-pages" / slug
    pages = generate_pages(data, cache_dir, force=force)
    pages_to_pdf(pages, Path(output_path))
    print(f"PDF gerado: {output_path} ({len(pages)} paginas)")


def main():
    if len(sys.argv) < 2:
        print("Uso: python generate-activity-gemini.py <payload.json> [--force]", file=sys.stderr)
        sys.exit(1)

    payload_path = Path(sys.argv[1])
    force = "--force" in sys.argv
    payload = json.loads(payload_path.read_text(encoding="utf-8"))
    slug = payload.get("slug") or Path(payload["output"]).stem
    build_pdf(payload["data"], payload["output"], slug, force=force)


if __name__ == "__main__":
    main()
