from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "mobile-app" / "branding" / "app_icon_master.png"
OUTPUT = ROOT / "pwa" / "icons"
RESAMPLE = Image.Resampling.LANCZOS


def square(image: Image.Image) -> Image.Image:
    size = min(image.size)
    left = (image.width - size) // 2
    top = (image.height - size) // 2
    return image.crop((left, top, left + size, top + size)).convert("RGB")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source = square(Image.open(SOURCE))
    source.resize((192, 192), RESAMPLE).save(OUTPUT / "icon-192.png", optimize=True)
    source.resize((512, 512), RESAMPLE).save(OUTPUT / "icon-512.png", optimize=True)

    maskable = Image.new("RGB", (512, 512), "#15324a")
    foreground = source.resize((384, 384), RESAMPLE)
    maskable.paste(foreground, (64, 64))
    maskable.save(OUTPUT / "icon-maskable-512.png", optimize=True)


if __name__ == "__main__":
    main()
