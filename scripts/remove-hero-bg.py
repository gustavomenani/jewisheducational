"""Remove fundo das imagens do hero e salva PNG transparente."""
from pathlib import Path
from rembg import remove
from PIL import Image
import io

HERO_DIR = Path(__file__).resolve().parent.parent / "frontend" / "public" / "images" / "hero"
FILES = ["hero-scene.png", "hero-creature.png", "hero-cat.png", "hero-bird.png", "hero-tree.png"]

for name in FILES:
    src = HERO_DIR / name
    if not src.exists():
        print(f"Pulando (nao encontrado): {name}")
        continue
    print(f"Processando {name}...")
    with open(src, "rb") as f:
        result = remove(f.read())
    img = Image.open(io.BytesIO(result)).convert("RGBA")
    img.save(src, "PNG", optimize=True)
    print(f"  OK -> {src}")

print("Fundos removidos.")
