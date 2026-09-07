"""Gera PDFs educacionais com layout premium, imagens em alta qualidade e mais paginas."""
import json
import sys
from pathlib import Path

try:
    from fpdf import FPDF
except ImportError:
    print("Instale fpdf2: pip install fpdf2", file=sys.stderr)
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    Image = None

# Cores da marca (RGB)
BRAND = (42, 146, 154)
BRAND_DARK = (30, 110, 118)
TEXT = (44, 62, 80)
TEXT_BODY = (60, 72, 88)
MUTED = (120, 130, 145)
PANEL_BG = (244, 249, 252)
ACCENT = (255, 193, 77)


def find_font():
    script_dir = Path(__file__).parent
    fonts_dir = script_dir.parent / "fonts"
    regular = fonts_dir / "DejaVuSans.ttf"
    bold = fonts_dir / "DejaVuSans-Bold.ttf"
    if regular.exists() and bold.exists() and regular.read_bytes()[:4] in (b"\x00\x01\x00\x00", b"OTTO", b"true"):
        return str(regular), str(bold)
    win_regular = Path(r"C:\Windows\Fonts\arial.ttf")
    win_bold = Path(r"C:\Windows\Fonts\arialbd.ttf")
    if win_regular.exists() and win_bold.exists():
        return str(win_regular), str(win_bold)
    return None, None


class ActivityPDF(FPDF):
    def __init__(self, title):
        super().__init__()
        self.doc_title = title
        self.regular_font = "Helvetica"
        self.bold_font = "Helvetica"
        regular, bold = find_font()
        if regular:
            self.add_font("AppFont", "", regular)
            self.add_font("AppFont", "B", bold)
            self.regular_font = "AppFont"
            self.bold_font = "AppFont"

    def footer(self):
        self.set_y(-14)
        self.set_font(self.regular_font, size=8)
        self.set_text_color(*MUTED)
        self.cell(0, 8, f"Jewish Educational Resources  |  Pagina {self.page_no()}/{{nb}}", align="C")


def ensure_margin(pdf):
    pdf.set_x(pdf.l_margin)


def image_size(path, max_w_mm, max_h_mm=None):
    """Calcula largura/altura em mm mantendo proporcao."""
    if Image:
        with Image.open(path) as img:
            iw, ih = img.size
    else:
        iw, ih = 800, 600
    aspect = ih / iw
    w = min(max_w_mm, 170)
    h = w * aspect
    if max_h_mm and h > max_h_mm:
        h = max_h_mm
        w = h / aspect
    return w, h


def place_image(pdf, path, max_w=170, max_h=None, caption=None):
    """Insere imagem centralizada em alta qualidade."""
    if not path or not Path(path).exists():
        return 0
    try:
        w, h = image_size(path, max_w, max_h)
        x = pdf.l_margin + (pdf.epw - w) / 2
        y = pdf.get_y()
        pdf.image(str(path), x=x, y=y, w=w)
        pdf.set_y(y + h + 3)
        if caption:
            ensure_margin(pdf)
            pdf.set_font(pdf.regular_font, size=9)
            pdf.set_text_color(*MUTED)
            pdf.multi_cell(0, 5, caption, align="C")
            pdf.ln(2)
        return h
    except Exception:
        return 0


def header_band(pdf, title, subtitle=None):
    """Faixa colorida no topo da pagina."""
    pdf.set_fill_color(*BRAND)
    pdf.rect(0, 0, 210, 22, style="F")
    pdf.set_xy(pdf.l_margin, 6)
    pdf.set_font(pdf.bold_font, "B", 14)
    pdf.set_text_color(255, 255, 255)
    pdf.multi_cell(0, 7, title)
    if subtitle:
        pdf.set_xy(pdf.l_margin, 14)
        pdf.set_font(pdf.regular_font, size=9)
        pdf.set_text_color(230, 245, 247)
        pdf.cell(0, 5, subtitle)
    pdf.set_y(28)


def section_title(pdf, text):
    ensure_margin(pdf)
    y = pdf.get_y()
    pdf.set_fill_color(*BRAND)
    pdf.rect(pdf.l_margin, y, 3, 9, style="F")
    pdf.set_x(pdf.l_margin + 6)
    pdf.set_font(pdf.bold_font, "B", 13)
    pdf.set_text_color(*TEXT)
    pdf.multi_cell(0, 8, text)
    pdf.ln(3)


def body_text(pdf, text):
    if not text:
        return
    ensure_margin(pdf)
    pdf.set_font(pdf.regular_font, size=11)
    pdf.set_text_color(*TEXT_BODY)
    pdf.multi_cell(0, 6.5, text)
    pdf.ln(2)


def bullet_list(pdf, items):
    if not items:
        return
    pdf.set_font(pdf.regular_font, size=11)
    pdf.set_text_color(*TEXT_BODY)
    for item in items:
        ensure_margin(pdf)
        pdf.set_fill_color(*PANEL_BG)
        y = pdf.get_y()
        pdf.rect(pdf.l_margin, y, pdf.epw, 8, style="F")
        pdf.set_xy(pdf.l_margin + 3, y + 1)
        pdf.multi_cell(pdf.epw - 6, 6.5, f"  •  {item}")
    pdf.ln(2)


def info_panel(pdf, title, text):
    ensure_margin(pdf)
    y = pdf.get_y()
    pdf.set_fill_color(*PANEL_BG)
    pdf.set_draw_color(200, 220, 230)
    pdf.rect(pdf.l_margin, y, pdf.epw, 28, style="FD")
    pdf.set_xy(pdf.l_margin + 5, y + 4)
    pdf.set_font(pdf.bold_font, "B", 10)
    pdf.set_text_color(*BRAND_DARK)
    pdf.cell(0, 5, title)
    pdf.set_xy(pdf.l_margin + 5, y + 10)
    pdf.set_font(pdf.regular_font, size=10)
    pdf.set_text_color(*TEXT_BODY)
    pdf.multi_cell(pdf.epw - 10, 5.5, text)
    pdf.set_y(y + 32)


def meta_badges(pdf, data):
    badges = []
    if data.get("ageRange"):
        badges.append(f"Idade: {data['ageRange']}")
    if data.get("duration"):
        badges.append(f"Tempo: {data['duration']}")
    if not badges:
        return
    ensure_margin(pdf)
    pdf.set_font(pdf.regular_font, size=9)
    x = pdf.l_margin
    for label in badges:
        w = pdf.get_string_width(label) + 10
        pdf.set_fill_color(*ACCENT)
        pdf.set_text_color(80, 55, 10)
        pdf.set_xy(x, pdf.get_y())
        pdf.cell(w, 7, label, fill=True)
        x += w + 4
    pdf.ln(10)


def draw_exercise_lines(pdf, count):
    pdf.set_draw_color(180, 195, 210)
    for _ in range(count):
        y = pdf.get_y() + 9
        pdf.line(pdf.l_margin + 2, y, pdf.l_margin + pdf.epw - 2, y)
        pdf.ln(11)


def coloring_frame(pdf, path, label="Area para colorir"):
    """Caixa tracejada com imagem grande para colorir."""
    if pdf.get_y() > 200:
        pdf.add_page()
    section_title(pdf, label)
    place_image(pdf, path, max_w=pdf.epw, max_h=95, caption="Use lapis de cor, giz ou marcador.")
    pdf.ln(2)


def build_pdf(data, image_path, output_path, extra_images=None):
    extra_images = extra_images or {}
    landscape = extra_images.get("landscape")
    mascot = extra_images.get("mascot")
    gallery = [p for p in (data.get("gallery") or []) if Path(p).exists()]
    if image_path and Path(image_path).exists() and image_path not in gallery:
        gallery.insert(0, image_path)

    pdf = ActivityPDF(data["title"])
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=18)

    # --- Pagina 1: Capa premium ---
    pdf.add_page()
    pdf.set_fill_color(*BRAND)
    pdf.rect(0, 0, 210, 45, style="F")
    pdf.set_xy(pdf.l_margin, 12)
    pdf.set_font(pdf.bold_font, "B", 20)
    pdf.set_text_color(255, 255, 255)
    pdf.multi_cell(0, 10, data["title"], align="C")
    pdf.set_y(50)
    meta_badges(pdf, data)
    place_image(pdf, image_path, max_w=175, max_h=120, caption="Ilustracao principal — observe, colorir e discuta.")
    if data.get("story"):
        section_title(pdf, "Historia em poucas palavras")
        body_text(pdf, data["story"])

    # --- Pagina 2: Educador + objetivos + imagem decorativa ---
    pdf.add_page()
    header_band(pdf, "Guia do educador", "Orientacoes para conduzir a atividade em sala ou em casa")
    if mascot and Path(mascot).exists():
        y0 = pdf.get_y()
        place_image(pdf, mascot, max_w=38, max_h=38)
        pdf.set_xy(pdf.l_margin + 44, y0)
        pdf.set_font(pdf.bold_font, "B", 11)
        pdf.set_text_color(*BRAND_DARK)
        pdf.multi_cell(pdf.epw - 44, 6, "Dica do educador")
        pdf.set_xy(pdf.l_margin + 44, pdf.get_y())
        pdf.set_font(pdf.regular_font, size=10)
        pdf.set_text_color(*TEXT_BODY)
        pdf.multi_cell(pdf.epw - 44, 5.5, data.get("educator", ""))
        pdf.ln(4)
    else:
        section_title(pdf, "Para o educador")
        body_text(pdf, data.get("educator", ""))

    if landscape and Path(landscape).exists():
        place_image(pdf, landscape, max_w=pdf.epw, max_h=35, caption="Cenario ilustrado — use para introduzir o tema.")

    section_title(pdf, "Objetivos de aprendizagem")
    bullet_list(pdf, data.get("objectives", []))

    if data.get("funFacts"):
        section_title(pdf, "Curiosidades")
        bullet_list(pdf, data["funFacts"])

    # --- Pagina 3: Atividade + imagem grande ---
    pdf.add_page()
    header_band(pdf, "Atividade principal", "Observe a ilustracao e complete os exercicios")
    section_title(pdf, "Instrucoes")
    body_text(pdf, data.get("activity", ""))
    coloring_frame(pdf, image_path, "Ilustracao para colorir e explorar")

    # Imagens extras da galeria
    for i, img in enumerate(gallery[1:3], start=2):
        if pdf.get_y() > 210:
            pdf.add_page()
        place_image(pdf, img, max_w=pdf.epw - 10, max_h=75, caption=f"Imagem complementar {i}")

    # --- Pagina 4: Exercicios ---
    pdf.add_page()
    header_band(pdf, "Exercicios e pratica", "Escreva com calma — nao ha resposta unica certa")
    if data.get("exercises"):
        for i, ex in enumerate(data["exercises"], 1):
            if pdf.get_y() > 240:
                pdf.add_page()
                header_band(pdf, "Exercicios (continuacao)")
            ensure_margin(pdf)
            pdf.set_font(pdf.bold_font, "B", 11)
            pdf.set_text_color(*TEXT)
            pdf.multi_cell(0, 7, f"{i}. {ex['prompt']}")
            pdf.ln(1)
            if ex.get("image") and Path(ex["image"]).exists():
                place_image(pdf, ex["image"], max_w=100, max_h=55)
            if ex.get("lines"):
                draw_exercise_lines(pdf, ex["lines"])
            pdf.ln(3)

    # --- Pagina 5: Reflexao + glossario ---
    pdf.add_page()
    header_band(pdf, "Reflexao e vocabulario", "Converse em grupo ou em familia")
    section_title(pdf, "Perguntas para discussao")
    bullet_list(pdf, data.get("questions", []))

    section_title(pdf, "Desafio criativo")
    body_text(pdf, data.get("creative", ""))

    if landscape and Path(landscape).exists() and pdf.get_y() < 200:
        place_image(pdf, landscape, max_w=120, max_h=40)

    section_title(pdf, "Glossario")
    bullet_list(pdf, data.get("glossary", []))

    # Pagina bonus se houver mais imagens
    remaining = gallery[3:]
    if remaining:
        pdf.add_page()
        header_band(pdf, "Galeria de ilustracoes", "Materiais visuais extras para imprimir")
        for img in remaining:
            if pdf.get_y() > 200:
                pdf.add_page()
            place_image(pdf, img, max_w=pdf.epw, max_h=90)

    pdf.output(str(output_path))


def main():
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    build_pdf(
        payload["data"],
        payload.get("image"),
        payload["output"],
        payload.get("extraImages"),
    )


if __name__ == "__main__":
    main()
