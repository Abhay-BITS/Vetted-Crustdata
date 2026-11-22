"""Command line: run, resume, show.

  python -m vetted run --name "Delhivery Limited" --website delhivery.com
  python -m vetted run --text "Here is a new vendor: ..."
  python -m vetted run --file request.json
  python -m vetted resume <run_id>
  python -m vetted show <run_id> [--md]
"""
from __future__ import annotations

import argparse
import json
import sys

from .report import to_markdown
from .runner import run
from .store import Store


def _print_step(name, status, out):
    print(f"  [{status:>7}] {name}", file=sys.stderr, flush=True)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="vetted")
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--name")
    r.add_argument("--website")
    r.add_argument("--cin")
    r.add_argument("--gstin")
    r.add_argument("--pan")
    r.add_argument("--city")
    r.add_argument("--director", action="append", default=[])
    r.add_argument("--bank-account")
    r.add_argument("--ifsc")
    r.add_argument("--text")
    r.add_argument("--file")
    r.add_argument("--run-id")
    r.add_argument("--md", action="store_true")
    rs = sub.add_parser("resume")
    rs.add_argument("run_id")
    rs.add_argument("--md", action="store_true")
    sh = sub.add_parser("show")
    sh.add_argument("run_id")
    sh.add_argument("--md", action="store_true")
    args = p.parse_args(argv)

    if args.cmd == "run":
        if args.file:
            with open(args.file) as f:
                req = json.load(f)
        else:
            req = {k: v for k, v in {"vendor_name": args.name, "website": args.website, "cin": args.cin,
                                     "gstin": args.gstin, "pan": args.pan, "city": args.city,
                                     "directors": args.director, "bank_account": args.bank_account,
                                     "ifsc": args.ifsc, "text": args.text}.items() if v}
        res = run(req, run_id=args.run_id, on_step=_print_step)
    elif args.cmd == "resume":
        res = run({}, run_id=args.run_id, on_step=_print_step)
    else:
        rec = Store().get_run(args.run_id)
        if not rec:
            print("no such run", file=sys.stderr)
            return 1
        res = rec["result"] or rec
    print(to_markdown(res) if getattr(args, "md", False) else json.dumps(res, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
