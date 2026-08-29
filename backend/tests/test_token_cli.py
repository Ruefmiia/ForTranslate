import json

from fortranslate_backend.token_cli import main


def test_token_cli_lifecycle(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("FORTRANSLATE_DATABASE_PATH", str(tmp_path / "tokens.db"))
    assert main(["create", "手机用户"]) == 0
    created_output = capsys.readouterr().out.splitlines()
    record = json.loads(created_output[0])
    token = created_output[1].removeprefix("token=")
    assert token.startswith("ft_")

    assert main(["list"]) == 0
    listed_output = capsys.readouterr().out
    assert "手机用户" in listed_output
    assert token not in listed_output

    for command in ("disable", "enable", "revoke"):
        assert main([command, str(record["id"])]) == 0
        capsys.readouterr()
