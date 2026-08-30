from __future__ import annotations

import argparse
from decimal import Decimal, InvalidOperation
import json

from .config import Settings
from .database import Database


UNITS_PER_YUAN = Decimal("1000000")


def yuan(value: str) -> Decimal:
    try:
        amount = Decimal(value)
    except InvalidOperation as exc:
        raise argparse.ArgumentTypeError("amount must be a number") from exc
    if amount < 0:
        raise argparse.ArgumentTypeError("amount must not be negative")
    return amount


def to_units(amount: Decimal) -> int:
    return int((amount * UNITS_PER_YUAN).to_integral_value())


def with_quota_display(record: dict) -> dict:
    result = dict(record)
    quota_units = int(result.get("quota_units", 0))
    used_units = int(result.get("used_units", 0))
    result["quota_yuan"] = f"{Decimal(quota_units) / UNITS_PER_YUAN:.6f}"
    result["used_yuan"] = f"{Decimal(used_units) / UNITS_PER_YUAN:.6f}"
    result["remaining_yuan"] = f"{Decimal(max(0, quota_units - used_units)) / UNITS_PER_YUAN:.6f}"
    if "recent" in result:
        result["recent"] = [
            item | {"cost_yuan": f"{Decimal(item['billing_units']) / UNITS_PER_YUAN:.6f}"}
            for item in result["recent"]
        ]
    return result


def parser() -> argparse.ArgumentParser:
    command_parser = argparse.ArgumentParser(description="Manage ForTranslate access tokens")
    commands = command_parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create", help="Create a token and display it once")
    create.add_argument("name")
    create.add_argument("--quota-yuan", type=yuan)
    commands.add_parser("list", help="List tokens without revealing secrets")
    for command in ("enable", "disable", "revoke"):
        item = commands.add_parser(command)
        item.add_argument("id", type=int)
    usage = commands.add_parser("usage", help="Show quota and recent usage for a token")
    usage.add_argument("id", type=int)
    for command in ("quota-add", "quota-set"):
        item = commands.add_parser(command)
        item.add_argument("id", type=int)
        item.add_argument("yuan", type=yuan)
    reset = commands.add_parser("quota-reset", help="Reset current billed amount while retaining usage history")
    reset.add_argument("id", type=int)
    return command_parser


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    settings = Settings.from_env()
    database = Database(settings.database_path)
    database.initialize()
    if args.command == "create":
        amount = args.quota_yuan if args.quota_yuan is not None else settings.default_token_quota_yuan
        record, token = database.create_access_token(args.name, to_units(amount))
        print(json.dumps(with_quota_display(record), ensure_ascii=False))
        print(f"token={token}")
        print("Save this token now. It will not be shown again.")
        return 0
    if args.command == "list":
        print(json.dumps([with_quota_display(item) for item in database.list_access_tokens()], ensure_ascii=False, indent=2))
        return 0
    if args.command == "usage":
        record = database.token_usage(args.id)
        if record is None:
            command_parser.error(f"token id {args.id} was not found")
        print(json.dumps(with_quota_display(record), ensure_ascii=False, indent=2))
        return 0
    if args.command == "quota-add":
        if args.yuan == 0:
            command_parser.error("quota-add amount must be greater than zero")
        changed = database.add_token_quota(args.id, to_units(args.yuan))
    elif args.command == "quota-set":
        changed = database.set_token_quota(args.id, to_units(args.yuan))
    elif args.command == "quota-reset":
        changed = database.reset_token_usage(args.id)
    if args.command == "enable":
        changed = database.set_access_token_enabled(args.id, True)
    elif args.command == "disable":
        changed = database.set_access_token_enabled(args.id, False)
    elif args.command == "revoke":
        changed = database.revoke_access_token(args.id)
    if not changed:
        command_parser.error(f"token id {args.id} was not found")
    output = {"id": args.id, "status": args.command}
    if args.command in {"quota-add", "quota-set"}:
        output["quota"] = with_quota_display(database.token_usage(args.id))
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
