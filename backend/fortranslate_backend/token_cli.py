from __future__ import annotations

import argparse
import json

from .config import Settings
from .database import Database


def parser() -> argparse.ArgumentParser:
    command_parser = argparse.ArgumentParser(description="Manage ForTranslate access tokens")
    commands = command_parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create", help="Create a token and display it once")
    create.add_argument("name")
    commands.add_parser("list", help="List tokens without revealing secrets")
    for command in ("enable", "disable", "revoke"):
        item = commands.add_parser(command)
        item.add_argument("id", type=int)
    return command_parser


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    database = Database(Settings.from_env().database_path)
    database.initialize()
    if args.command == "create":
        record, token = database.create_access_token(args.name)
        print(json.dumps(record, ensure_ascii=False))
        print(f"token={token}")
        print("Save this token now. It will not be shown again.")
        return 0
    if args.command == "list":
        print(json.dumps(database.list_access_tokens(), ensure_ascii=False, indent=2))
        return 0
    if args.command == "enable":
        changed = database.set_access_token_enabled(args.id, True)
    elif args.command == "disable":
        changed = database.set_access_token_enabled(args.id, False)
    else:
        changed = database.revoke_access_token(args.id)
    if not changed:
        command_parser.error(f"token id {args.id} was not found")
    print(json.dumps({"id": args.id, "status": args.command}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
