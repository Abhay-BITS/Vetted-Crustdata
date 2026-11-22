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
    ac = sub.add_parser("actions")
    ac.add_argument("--status")
    ap = sub.add_parser("decide")
    ap.add_argument("action_id")
    ap.add_argument("verdict", choices=["approve", "hold", "block"])
    ap.add_argument("--approver", required=True)
    ap.add_argument("--reason", default="")
    sub.add_parser("execute")
    rz = sub.add_parser("reset")
    rz.add_argument("--all", action="store_true", help="also clear the response cache")
    pg = sub.add_parser("purge")
    pg.add_argument("--days", type=float)
    mi = sub.add_parser("import-master")
    mi.add_argument("csv_file")
    sh = sub.add_parser("show")
    sh.add_argument("run_id")
    sh.add_argument("--md", action="store_true")
    args = p.parse_args(argv)

    if args.cmd == "run":
        if args.file:
            with open(args.file) as f:
                req = json.load(f)
            if isinstance(req, dict) and req.get("vendors"):
                from .batch import expand
                bid, reqs = expand(Store(), req)
                results = [run(r, on_step=_print_step) for r in reqs]
                for x in results:
                    print(f"{x['decision']:<15} {x['vendor']}  ({x['cost']['full_inr']} Rs full cost)")
                return 0
        else:
            req = {k: v for k, v in {"vendor_name": args.name, "website": args.website, "cin": args.cin,
                                     "gstin": args.gstin, "pan": args.pan, "city": args.city,
                                     "directors": args.director, "bank_account": args.bank_account,
                                     "ifsc": args.ifsc, "text": args.text}.items() if v}
        res = run(req, run_id=args.run_id, on_step=_print_step)
    elif args.cmd in ("reset", "purge"):
        st = Store()
        if args.cmd == "reset":
            st.reset_demo(keep_cache=not args.all)
            print("demo data cleared" + (" (cache too)" if args.all else " (cache kept)"))
        else:
            from .config import load_policy
            days = args.days if args.days is not None else load_policy()["privacy"]["retention_days"]
            print(json.dumps(st.purge_older_than(days)))
        return 0
    elif args.cmd in ("actions", "decide", "execute", "import-master"):
        from . import actions as act
        st = Store()
        if args.cmd == "actions":
            out = act.list_actions(st, status=args.status)
        elif args.cmd == "decide":
            out = act.decide_action(st, args.action_id, args.verdict, args.approver, args.reason)
        elif args.cmd == "execute":
            out = act.execute_approved(st)
        else:
            from .api import import_vendor_master_csv
            out = {"imported": import_vendor_master_csv(st, open(args.csv_file).read())}
        print(json.dumps(out, indent=2, default=str))
        return 0
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
