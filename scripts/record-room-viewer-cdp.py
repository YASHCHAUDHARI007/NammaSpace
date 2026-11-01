"""Record a real local browser walkthrough through Chrome DevTools Protocol.

Start the local app, then start Chrome with --remote-debugging-port=9227 and
the classroom URL. Install websocket-client in the Python environment used
for this script. The script drives the app's normal controls and records the
rendered browser viewport; it does not synthesize room images.
"""

from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path
import subprocess
import tempfile
import time
from urllib.request import urlopen

import websocket


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--port", type=int, default=9227)
    parser.add_argument("--duration", type=float, default=116)
    parser.add_argument("--fps", type=float, default=5)
    parser.add_argument("--capture-mode", choices=("screencast", "screenshot"),
                        default="screenshot")
    args = parser.parse_args()
    if args.duration < 5 or args.fps < 1:
        parser.error("Duration must be at least 5 seconds and fps must be positive")
    with urlopen(f"http://127.0.0.1:{args.port}/json/list", timeout=10) as response:
        pages = json.load(response)
    page = next((item for item in pages if item.get("type") == "page"
                 and "127.0.0.1:3107" in item.get("url", "")), None)
    if page is None:
        raise RuntimeError("Open the local viewer in the selected Chrome session first")
    connection = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=60,
                                             suppress_origin=True)
    sequence = 0
    frame_dir: Path | None = None
    number = 0

    def receive_event(reply: dict) -> None:
        nonlocal sequence, number
        if reply.get("method") != "Page.screencastFrame":
            return
        params = reply["params"]
        if frame_dir is not None:
            (frame_dir / f"{number:05d}.jpg").write_bytes(
                base64.b64decode(params["data"]))
            number += 1
        sequence += 1
        connection.send(json.dumps({"id": sequence, "method": "Page.screencastFrameAck",
                                    "params": {"sessionId": params["sessionId"]}}))

    def call(method: str, params: dict | None = None) -> dict:
        nonlocal sequence
        sequence += 1
        requested_id = sequence
        connection.send(json.dumps({"id": requested_id, "method": method,
                                    "params": params or {}}))
        while True:
            reply = json.loads(connection.recv())
            receive_event(reply)
            if reply.get("id") == requested_id:
                if "error" in reply:
                    raise RuntimeError(f"{method}: {reply['error']}")
                return reply.get("result", {})

    def evaluate(expression: str):
        result = call("Runtime.evaluate", {"expression": expression,
                                           "returnByValue": True,
                                           "awaitPromise": True})
        if "exceptionDetails" in result:
            raise RuntimeError(result["exceptionDetails"])
        return result.get("result", {}).get("value")

    def send_input(method: str, params: dict) -> None:
        nonlocal sequence
        sequence += 1
        connection.send(json.dumps({"id": sequence, "method": method, "params": params}))

    def key(code: str, pressed: bool) -> None:
        letter = code.removeprefix("Key")
        send_input("Input.dispatchKeyEvent", {
            "type": "keyDown" if pressed else "keyUp", "code": code,
            "key": letter.lower(), "windowsVirtualKeyCode": ord(letter),
            "nativeVirtualKeyCode": ord(letter),
        })

    def mouse(event: str, x: int, y: int) -> None:
        send_input("Input.dispatchMouseEvent", {"type": event, "x": x, "y": y,
                                          "button": "left", "buttons": 0 if event == "mouseReleased" else 1,
                                          "clickCount": 1})

    call("Page.enable")
    call("Runtime.enable")
    call("Page.bringToFront")
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        if evaluate("/\\d[\\d,]+ splats/.test(document.body.innerText)"):
            break
        time.sleep(0.5)
    else:
        raise RuntimeError("The room model did not load in the browser")
    evaluate("Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Explore the space'))?.click()")
    time.sleep(1)
    if evaluate("Boolean(document.pointerLockElement)"):
        call("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Escape", "code": "Escape",
                                        "windowsVirtualKeyCode": 27})
        call("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Escape", "code": "Escape",
                                        "windowsVirtualKeyCode": 27})
    key("KeyR", True)
    key("KeyR", False)
    time.sleep(0.3)

    actions: list[tuple[float, str, object]] = [
        (8, "keyDown", "KeyW"), (9.2, "keyUp", "KeyW"),
        (23, "keyDown", "KeyS"), (24.4, "keyUp", "KeyS"),
        (33, "keyDown", "KeyR"), (33.1, "keyUp", "KeyR"),
        (55, "guideOpen", None), (69, "guideClose", None),
        (74, "keyDown", "KeyW"), (75.2, "keyUp", "KeyW"),
        (102, "keyDown", "KeyR"), (102.1, "keyUp", "KeyR"),
    ]
    for start, pixels in ((15, 190), (41, -380), (82, 280), (91, -280)):
        actions.append((start, "mousePressed", (950, 490)))
        for step in range(1, 13):
            actions.append((start + step * 0.12, "mouseMoved",
                            (round(950 + pixels * step / 12), 490)))
        actions.append((start + 1.6, "mouseReleased", (950 + pixels, 490)))
    actions.sort(key=lambda item: item[0])
    action_index = 0
    interval = 1 / args.fps
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="namma-room-walkthrough-") as folder:
        frame_dir = Path(folder)
        if args.capture_mode == "screencast":
            call("Page.startScreencast", {"format": "jpeg", "quality": 78,
                                          "maxWidth": 1600, "maxHeight": 900,
                                          "everyNthFrame": 2})
        start = time.monotonic()
        last_reported = 0
        while True:
            elapsed = time.monotonic() - start
            if elapsed >= args.duration:
                break
            while action_index < len(actions) and actions[action_index][0] <= elapsed:
                _, event, payload = actions[action_index]
                if event in ("keyDown", "keyUp"):
                    key(payload, event == "keyDown")
                elif event.startswith("mouse"):
                    mouse(event, *payload)
                elif event == "guideOpen":
                    evaluate("Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Capture SOP'))?.click()")
                elif event == "guideClose":
                    evaluate("document.querySelector('button[aria-label=\"Close Guide\"]')?.click()")
                action_index += 1
            if args.capture_mode == "screenshot":
                call("Page.bringToFront")
                shot = call("Page.captureScreenshot", {"format": "jpeg", "quality": 82,
                                                       "captureBeyondViewport": False})
                (frame_dir / f"{number:05d}.jpg").write_bytes(base64.b64decode(shot["data"]))
                number += 1
            else:
                connection.settimeout(0.1)
                try:
                    receive_event(json.loads(connection.recv()))
                except websocket.WebSocketTimeoutException:
                    pass
                finally:
                    connection.settimeout(60)
            if number >= last_reported + 80:
                last_reported = number
                print(f"Recorded {number} browser frames in {elapsed:.1f}s", flush=True)
            if args.capture_mode == "screenshot":
                time.sleep(max(0, start + number * interval - time.monotonic()))
        elapsed = time.monotonic() - start
        if args.capture_mode == "screencast":
            call("Page.stopScreencast")
        for code in ("KeyW", "KeyS"):
            key(code, False)
        if number < min(25, args.duration * 2):
            raise RuntimeError(f"Too few browser frames were recorded: {number} in {elapsed:.1f}s")
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-framerate", f"{number / elapsed:.6f}",
            "-i", str(frame_dir / "%05d.jpg"), "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            str(args.output),
        ], check=True)
        print(f"Recorded {number} browser frames over {elapsed:.1f}s to {args.output}",
              flush=True)
    connection.close()


if __name__ == "__main__":
    main()
