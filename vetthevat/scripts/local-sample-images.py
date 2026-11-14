"""Generate clearly labelled local upload fixtures, never real supplier records."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1] / '.local-demo' / 'invoices'
root.mkdir(parents=True, exist_ok=True)
image = Image.new('RGB', (1200, 1500), 'white')
draw = ImageDraw.Draw(image)
font_path = Path('C:/Windows/Fonts/arial.ttf')
font = ImageFont.truetype(str(font_path), 30) if font_path.exists() else ImageFont.load_default()
lines = [
    'SYNTHETIC DEMO - NOT A REAL INVOICE',
    'Invoice image fixture SYN-IMAGE-001 | 2026-10-28',
    'Supplier: Tesco (synthetic)',
    'Product: Tomatoes - loose / Class I / unbranded',
    'Quantity: 1 pack | 6 items | 500 g per item',
    'Recorded net: GBP 6.00 | VAT rate: 0% | Gross: GBP 6.00',
    'UNSCANNED upload fixture. Review all fields manually.',
    'No stock receipt, payment or VAT claim is authorized.',
]
for index, line in enumerate(lines):
    draw.text((50, 70 + index * 95), line, font=font, fill='black')
for suffix, kind in [('png', 'PNG'), ('jpg', 'JPEG'), ('webp', 'WEBP')]:
    image.save(root / ('SYN-IMAGE-001.' + suffix), format=kind)
print('Created synthetic PNG/JPG/WEBP upload fixtures in .local-demo/invoices.')
