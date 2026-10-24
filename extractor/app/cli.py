"""Run extraction from the command line: python -m app.cli path/to/report.pdf"""

import json
import sys
from pathlib import Path

from .pdf_io import read_pdf
from .providers import extract


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: python -m app.cli report.pdf")
    result = extract(read_pdf(Path(sys.argv[1]).read_bytes()))
    print(json.dumps(result.to_dict(), indent=2))


if __name__ == "__main__":
    main()
