"""PDF simples — uma letra hebraica por folha (molde Aleph-Bet)."""
import json
import sys
from pathlib import Path

try:
    from fpdf import FPDF
except ImportError:
    print("Instale fpdf2: pip install fpdf2", file=sys.stderr)
    sys.exit(1)

FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
]


def find_font(bold=False):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    for base in ["/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/TTF"]:
        path = Path(base) / name
        if path.exists():
            return str(path)
    for path in FONT_PATHS:
        if Path(path).exists():
            return path
    return None


class LetterPDF(FPDF):
    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, "Jewish Educational Resources", align="C")


def draw_balloons(pdf):
    colors = [(255, 107, 107), (78, 205, 196), (255, 195, 0), (162, 155, 254), (255, 159, 67)]
    positions = [(25, 35), (170, 45), (30, 240), (165, 250), (95, 20), (100, 265)]
    for i, (x, y) in enumerate(positions):
        r, g, b = colors[i % len(colors)]
        pdf.set_fill_color(r, g, b)
        pdf.ellipse(x, y, 18, 22, style="F")


def generate(payload_path):
    payload = json.loads(Path(payload_path).read_text(encoding="utf-8"))
    letter = payload["hebrew"]
    latin = payload.get("latin", "")
    output = payload["output"]

    pdf = LetterPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=False)
    pdf.add_page()
    pdf.set_fill_color(240, 248, 255)
    pdf.rect(0, 0, 210, 297, style="F")

    draw_balloons(pdf)

    unicode_font = find_font()
    if unicode_font:
        pdf.add_font("DejaVu", "", unicode_font)
        bold_font = find_font(bold=True) or unicode_font
        if bold_font != unicode_font:
            pdf.add_font("DejaVu", "B", bold_font)
        else:
            pdf.add_font("DejaVu", "B", unicode_font)
        pdf.set_font("DejaVu", "B", 14)
    else:
        pdf.set_font("Helvetica", "B", 14)

    pdf.set_text_color(0, 128, 128)
    pdf.set_xy(0, 18)
    pdf.cell(0, 10, "Aleph-Bet - Letras com baloes", align="C")

    if latin:
        if unicode_font:
            pdf.set_font("DejaVu", "", 12)
        else:
            pdf.set_font("Helvetica", "", 12)
        pdf.set_text_color(80, 80, 80)
        pdf.set_xy(0, 130)
        pdf.cell(0, 10, latin, align="C")

    if unicode_font:
        pdf.set_font("DejaVu", "B", 120)
    else:
        pdf.set_font("Helvetica", "B", 48)
        letter = latin or "?"

    pdf.set_text_color(0, 105, 120)
    pdf.set_xy(0, 95)
    pdf.cell(0, 80, letter, align="C")

    if unicode_font:
        pdf.set_font("DejaVu", "", 11)
    else:
        pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(100, 100, 100)
    pdf.set_xy(20, 200)
    pdf.multi_cell(
        170,
        7,
        "Trace a letra, pinte os baloes e pratique o som. "
        "Imprima apenas esta folha ou baixe letra por letra.",
        align="C",
    )

    Path(output).parent.mkdir(parents=True, exist_ok=True)
    pdf.output(output)
    print("PDF:", output)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python generate-letter-pdf.py <payload.json>", file=sys.stderr)
        sys.exit(1)
    generate(sys.argv[1])
