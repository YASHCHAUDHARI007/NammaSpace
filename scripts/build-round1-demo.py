#!/usr/bin/env python3
"""Build the local Round 1 demo from the sole source video and viewer recording.

Requires ffmpeg, ffprobe, Sharp (from npm install), and the macOS `say` command. The viewer input
must be a reviewed, window-only recording of this project's browser view.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/C5304.MP4"
VIEWER = ROOT / "outputs/classroom/single-video-C5304/demo-recordings/viewer-walkthrough.mov"
WORK = ROOT / "outputs/classroom/single-video-C5304/demo-build"
OUTPUT = ROOT / "submission/round1-demonstration.mp4"


SEGMENTS = [
    dict(kind="card", duration=10, heading="ONE VIDEO. ONE ROOM.",
         lines=["Namma Space | Round 1 demonstration", "3D reconstruction and free roaming"],
         speech="Namma Space reconstructs one classroom from one continuous Sony video. This is the Round One demonstration. The room's physical dimensions were not measured."),
    dict(kind="source", start=3, duration=45,
         speech="This is the original recording, C five three zero four M P four. It is the only image source for this reconstruction. The clip is four K, fifty frames per second, and about one minute long. We sampled the first fifty five seconds at two frames per second. The camera moves through the room with overlap, but the late part of the video includes a fast pan. We did not use photographs, other clips, old camera poses, or measured room dimensions."),
    dict(kind="card", duration=20, heading="RECONSTRUCTION PIPELINE",
         lines=["110 candidate frames -> 99 coherent camera poses", "17,617 filtered starting points -> 10,000 training steps", "776,728 Gaussian splats in the browser asset"],
         speech="PyCOLMAP registered ninety nine of one hundred ten candidate frames on one continuous camera path. We rejected eleven late frames and two folded path attempts. We filtered the sparse points, trained Nerfstudio Splatfacto for ten thousand steps, then exported and cleaned the Gaussian splats."),
    dict(kind="card", duration=12, heading="RELATIVE SCALE",
         lines=["Screen height: 2 arbitrary scene units", "Physical room and screen dimensions: unknown", "Navigation boxes: visual estimates"],
         speech="The screen and floor set an arbitrary scene scale. No real length was measured. All positions and routes use scene units, and the furniture collision boxes are estimates."),
    dict(kind="viewer", start=0, duration=16,
         speech="Here is the actual web viewer. The classroom splat loads as the default scene. From this starting view, the screen, ceiling, tables, and chairs are recognizable."),
    dict(kind="viewer", start=16, duration=19,
         speech="The capture guide states the repeatable recording procedure and the actual processing steps. It also explains which frames were excluded and why the room's physical size remains unknown."),
    dict(kind="viewer", start=35, duration=18,
         speech="The collider control shows the estimated walk limits and furniture boxes. These boxes support the navigation demonstration. They are not a measured map or an accessibility survey."),
    dict(kind="viewer", start=53, duration=9,
         speech="The point of interest search starts an obstacle aware route to the projector screen."),
    dict(kind="viewer", start=75, duration=8,
         speech="Near the screen, incomplete views cause clear visual artifacts."),
    dict(kind="viewer", start=83, duration=42,
         speech="The viewer returns to the starting position and accepts keyboard movement. We walk and strafe through the room, while the camera position changes in scene units. The central classroom remains recognizable as the view moves. The model is less reliable at the image edges and from viewpoints that the source video did not cover well. The free roaming and routes are interactive, but their boundaries remain visual estimates."),
    dict(kind="card", duration=15, heading="RESULT AND LIMITS",
         lines=["One source video | 99 accepted frames | 776,728 splats", "Free roaming, route preview, and capture SOP work locally", "Ghosting remains in weakly observed views"],
         speech="The reconstruction and web walkthrough are real, with remaining ghosting shown in this video. Extra training cannot recover surfaces that the recording did not observe. See the technical abstract and source repository for methods and limits."),
]


def run(args: list[str]) -> None:
    subprocess.run(args, check=True)


def media_duration(path: Path) -> float:
    result = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "json", str(path)
    ], text=True)
    return float(json.loads(result)["format"]["duration"])


def card(path: Path, heading: str, lines: list[str]) -> None:
    rows = "".join(
        f'<text x="120" y="{520 + 105 * number}" font-family="Arial" font-size="44" fill="#e0e9de">{escape(line)}</text>'
        for number, line in enumerate(lines)
    )
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
<rect width="1920" height="1080" fill="#102920"/>
<rect width="1920" height="18" fill="#76b486"/>
<text x="120" y="115" font-family="Arial" font-size="29" font-weight="bold" fill="#93cba4">NAMMA SPACE / ROUND 1</text>
<text x="120" y="310" font-family="Arial" font-size="88" font-weight="bold" fill="#f4f3eb">{escape(heading)}</text>
<rect x="120" y="370" width="1680" height="4" fill="#629d70"/>
{rows}
<text x="120" y="990" font-family="Arial" font-size="25" fill="#9db4a3">C5304.MP4 only  |  Room dimensions unknown</text>
</svg>'''
    source = path.with_suffix(".svg")
    source.write_text(svg)
    run(["node", str(ROOT / "scripts/render-svg-card.cjs"), str(source), str(path)])


def main() -> None:
    if not SOURCE.is_file() or not VIEWER.is_file():
        raise SystemExit("Need assets/C5304.MP4 and the reviewed viewer-walkthrough.mov")
    WORK.mkdir(parents=True, exist_ok=True)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    clips = []
    for index, item in enumerate(SEGMENTS):
        stem = f"{index:02d}"
        clip = WORK / f"{stem}.mp4"
        voice = WORK / f"{stem}.aiff"
        if not voice.exists() or media_duration(voice) < 0.1:
            run(["say", "-v", "Samantha", "-r", "155", "-o", str(voice), item["speech"]])
        length = item["duration"]
        voice_length = media_duration(voice)
        if voice_length > length - 0.25:
            raise SystemExit(f"Narration {index} takes {voice_length:.1f}s; segment is {length}s")
        if item["kind"] == "card":
            still = WORK / f"{stem}.png"
            card(still, item["heading"], item["lines"])
            video_args = ["-loop", "1", "-framerate", "24", "-i", str(still)]
        else:
            source = SOURCE if item["kind"] == "source" else VIEWER
            video_args = ["-ss", str(item["start"]), "-i", str(source)]
        run([
            "ffmpeg", "-y", "-loglevel", "error", *video_args,
            "-i", str(voice), "-t", str(length),
            "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,"
                   "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=24",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
            "-ar", "48000", "-ac", "2", "-af", f"apad,atrim=0:{length}",
            "-shortest", "-movflags", "+faststart", str(clip),
        ])
        clips.append(clip)
        print(f"{stem}: {item['kind']} {media_duration(clip):.1f}s", flush=True)
    manifest = WORK / "clips.txt"
    manifest.write_text("".join(f"file '{clip}'\n" for clip in clips))
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
         "-i", str(manifest), "-c", "copy", "-movflags", "+faststart", str(OUTPUT)])
    duration = media_duration(OUTPUT)
    if not 180 <= duration <= 300:
        raise SystemExit(f"Demo must be 3–5 minutes; output is {duration:.1f}s")
    print(f"Finished {OUTPUT} ({duration:.1f}s)", flush=True)


if __name__ == "__main__":
    main()
