import argparse
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import tempfile
from threading import Lock
from urllib.parse import urlsplit
import webbrowser


ROOT = Path(__file__).resolve().parent
INDEX = ROOT / "poker_lab_v02.html"
PUBLIC_DIRS = tuple(ROOT / directory for directory in ("css", "js", "assets"))
HISTORY_FILE = ROOT / "Data" / "poker-lab-historia.json"
HISTORY_PATH = "/api/history"
SCHEMA_VERSION = 1
HISTORY_LOCK = Lock()
MAX_UPLOAD = 16 * 1024 * 1024
ADDRESS = ("127.0.0.1", 8765)


def is_amount(value):
    return type(value) is int and 0 <= value <= 2**53 - 1


def valid_cards(cards, lengths):
    return isinstance(cards, list) and len(cards) in lengths and all(
        isinstance(card, dict) and is_amount(card.get("r"))
        and 2 <= card["r"] <= 14 and card.get("s") in ("♠", "♥", "♦", "♣")
        for card in cards
    )


def valid_hand(hand):
    if not isinstance(hand, dict) or not all(
        isinstance(hand.get(field), str) for field in ("id", "sessionId", "finishedAt")
    ):
        return False
    try:
        datetime.fromisoformat(hand["finishedAt"].replace("Z", "+00:00"))
    except ValueError:
        return False
    if hand.get("ending") not in ("fold", "showdown") or not valid_cards(hand.get("board"), (0, 3, 4, 5)):
        return False
    table_fields = ("handNumber", "pot", "dealerSeat", "smallBlindSeat", "bigBlindSeat", "smallBlind", "bigBlind")
    if not all(is_amount(hand.get(field)) for field in table_fields):
        return False

    hero = hand.get("hero")
    if not isinstance(hero, dict) or not valid_cards(hero.get("cards"), (2,)):
        return False
    chip_fields = ("startingStack", "endingStack", "contributed", "payout")
    if not all(is_amount(hero.get(field)) for field in chip_fields) or not isinstance(hero.get("folded"), bool):
        return False
    actions = hero.get("actions")
    if not isinstance(actions, list) or not all(
        isinstance(action, dict) and action.get("street") in ("preflop", "flop", "turn", "river")
        and action.get("type") in ("fold", "check", "call", "raise")
        and all(is_amount(action.get(field)) for field in ("chips", "betTo", "toCall"))
        for action in actions
    ):
        return False
    opponents = hand.get("opponents")
    return isinstance(opponents, list) and all(
        isinstance(player, dict) and isinstance(player.get("name"), str)
        and is_amount(player.get("seat")) and isinstance(player.get("revealed"), bool)
        and ("cards" in player and player["cards"] is None and not player["revealed"]
             or valid_cards(player.get("cards"), (2,)))
        for player in opponents
    )


def decode_archive(raw):
    archive = json.loads(raw)
    if (
        not isinstance(archive, dict) or type(archive.get("schemaVersion")) is not int
        or archive["schemaVersion"] != SCHEMA_VERSION or not isinstance(archive.get("hands"), list)
        or not all(valid_hand(hand) for hand in archive["hands"])
    ):
        raise ValueError("Nieobsługiwany format historii.")
    return archive


def read_archive(path):
    try:
        text = path.read_text(encoding="utf-8-sig")
    except FileNotFoundError:
        text = ""
    return decode_archive(text) if text.strip() else {"schemaVersion": SCHEMA_VERSION, "hands": []}


def write_archive(path, archive):
    path.parent.mkdir(exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, prefix=".poker-history-", delete=False
        ) as output:
            temporary = Path(output.name)
            json.dump(archive, output, ensure_ascii=False, indent=2, allow_nan=False)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)


class PokerHandler(SimpleHTTPRequestHandler):
    history_file = HISTORY_FILE

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def allowed_host(self):
        host, port = self.server.server_address
        return self.headers.get("Host") == f"{host}:{port}"

    def send_json(self, body, status=200):
        content = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def send_head(self):
        if not self.allowed_host():
            self.send_error(403)
            return None
        if urlsplit(self.path).path == "/":
            self.path = "/" + INDEX.name
        file = Path(self.translate_path(self.path)).resolve()
        if file != INDEX and not any(file.is_relative_to(folder) and file.is_file() for folder in PUBLIC_DIRS):
            self.send_error(404)
            return None
        return super().send_head()

    def do_GET(self):
        if urlsplit(self.path).path != HISTORY_PATH:
            return super().do_GET()
        if not self.allowed_host():
            return self.send_error(403)
        try:
            with HISTORY_LOCK:
                archive = read_archive(self.history_file)
        except ValueError:
            return self.send_json({"error": "invalid_history"}, 409)
        except OSError:
            return self.send_json({"error": "history_unavailable"}, 500)
        self.send_json(archive)

    def do_POST(self):
        if urlsplit(self.path).path != HISTORY_PATH:
            return self.send_error(404)
        host, port = self.server.server_address
        if not self.allowed_host() or self.headers.get("Origin") not in (None, f"http://{host}:{port}"):
            return self.send_error(403)
        if self.headers.get_content_type() != "application/json":
            return self.send_error(415)
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.send_error(400)
        if not 0 < length <= MAX_UPLOAD:
            return self.send_error(400 if length <= 0 else 413)
        try:
            incoming = decode_archive(self.rfile.read(length))["hands"]
        except (ValueError, RecursionError):
            return self.send_json({"error": "invalid_upload"}, 400)
        try:
            with HISTORY_LOCK:
                archive = read_archive(self.history_file)
                hands = {hand["id"]: hand for hand in archive["hands"]}
                previous_count = len(hands)
                for hand in incoming:
                    hands.setdefault(hand["id"], hand)
                if len(hands) != previous_count:
                    archive["hands"] = sorted(hands.values(), key=lambda hand: (hand["finishedAt"], hand["id"]))
                    write_archive(self.history_file, archive)
        except ValueError:
            return self.send_json({"error": "invalid_history"}, 409)
        except OSError:
            return self.send_json({"error": "history_unavailable"}, 500)
        self.send_json({"saved": len(hands) - previous_count})


def main():
    parser = argparse.ArgumentParser(description="Lokalny Poker Lab z zapisem historii do folderu Data.")
    parser.add_argument("--open", action="store_true", help="Otwórz grę w domyślnej przeglądarce.")
    args = parser.parse_args()
    with ThreadingHTTPServer(ADDRESS, PokerHandler) as server:
        url = f"http://{ADDRESS[0]}:{ADDRESS[1]}/"
        print(f"Poker Lab działa pod adresem {url}", flush=True)
        if args.open:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
