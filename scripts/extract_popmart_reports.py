from pathlib import Path
from pypdf import PdfReader


SOURCE_DIR = Path("tmp/pdfs/popmart-history")


def main() -> None:
    for pdf_path in sorted(SOURCE_DIR.glob("*.pdf")):
        reader = PdfReader(str(pdf_path))
        text_path = pdf_path.with_suffix(".txt")
        pages = []
        for index, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            pages.append(f"\n\n===== PDF PAGE {index} =====\n{text}")
        text_path.write_text("".join(pages), encoding="utf-8")
        print(f"{pdf_path.name}: {len(reader.pages)} pages -> {text_path.name}")


if __name__ == "__main__":
    main()
