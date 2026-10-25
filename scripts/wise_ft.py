"""Write a WiSE-FT verifier: alpha * fine-tuned + (1 - alpha) * base weights."""

import argparse

from vrag.verifier.wise import wise_ft


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("tuned", help="fine-tuned CrossEncoder directory")
    ap.add_argument("out", help="output directory")
    ap.add_argument("--base", default="cross-encoder/ms-marco-MiniLM-L6-v2")
    ap.add_argument("--alpha", type=float, default=0.7)
    args = ap.parse_args()
    wise_ft(args.base, args.tuned, args.alpha, args.out)
    print(f"saved alpha={args.alpha} to {args.out}")


if __name__ == "__main__":
    main()
