#!/usr/bin/env python3
"""Build the local Round 1 demo from the sole source video and viewer recording.

Requires ffmpeg, ffprobe, Sharp (from npm install), and the macOS `say` command. The viewer input
must be a reviewed recording of this project's full-screen browser view.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/C5306.MP4"
VIEWER = ROOT / "outputs/classroom/single-video-C5306/demo-recordings/viewer-walkthrough.mov"
WORK = ROOT / "outputs/classroom/single-video-C5306/demo-build"
OUTPUT = ROOT / "submission/round1-demonstration.mp4"


SEGMENTS = [
    dict(kind="card", duration=10, heading="ONE VIDEO. ONE ROOM.",
         lines=["Namma Space | Round 1 demonstration", "3D reconstruction and free roaming"],
         speech="This classroom was reconstructed from one continuous Sony video. The browser lets us walk through the result."),
    dict(kind="source", start=1, duration=47,
         speech="This is C five three zero six M P four, the sole image source. The camera records the floor, stage and seating from one continuous path. It points down for much of the clip, so the upper walls and ceiling have weak coverage. No photographs or frames from another video were used."),
    dict(kind="card", duration=24, heading="RECONSTRUCTION PIPELINE",
         lines=["198 of 198 frames registered at 4 fps", "VGGT depth validated against video camera poses", "20,000 training steps | 873,736 Gaussian splats"],
         speech="All one hundred ninety eight sampled frames registered on one camera route. VGGT supplied depth for validated points. We used the video camera poses because they were more consistent. Nerfstudio trained the model for twenty thousand steps on the N S T cluster."),
    dict(kind="card", duration=15, heading="RELATIVE SCALE",
         lines=["Floor aligned to the viewer", "Physical room dimensions: unknown", "Walk limits and route: visual estimates"],
         speech="The floor sets the scene orientation. No physical length was measured. Positions and routes use relative scene units."),
    dict(kind="viewer", start=0, duration=20,
         speech="This is the actual local web viewer. The C five three zero six classroom loads by default. The stage, desks, chairs, and aisle are visible."),
    dict(kind="viewer", start=21, duration=17,
         speech="The capture guide names the sole source video and describes the processing steps. It also states the coverage and navigation limits."),
    dict(kind="viewer", start=38, duration=17,
         speech="The viewer can search for a point of interest and display a route along the recorded front aisle."),
    dict(kind="viewer", start=55, duration=15,
         speech="The route uses relative scene units. It is a visual guide, not a measured clearance map."),
    dict(kind="viewer", start=95, duration=10,
         speech="Walking beyond well observed views exposes dark gaps and ghosting. This is the current coverage limit."),
    dict(kind="viewer", start=104, duration=12,
         speech="Reset returns to the recognizable room. The viewer also shows the source and method in its guide."),
    dict(kind="card", duration=25, heading="RESULT AND LIMITS",
         lines=["C5306.MP4 only | 198 frames | 873,736 splats", "Code and model on GitHub main | viewer runs locally", "Upper walls and unsupported views still need coverage"],
         speech="The model and viewer show a clear central room with less ghosting than the earlier trial. The code and model are on GitHub main. Upper surfaces remain incomplete because the video did not observe them well. The technical abstract records the method and limits."),
]


def run(args: list[str]) -> None:
    subprocess.run(args, check=True)


def media_duration(path: Path) -> float:
    result = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "json", str(path)
    ], text=True)
    return float(json.loads(result).get("format", {}).get("duration", 0))


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
<text x="120" y="990" font-family="Arial" font-size="25" fill="#9db4a3">C5306.MP4 only  |  Room dimensions unknown</text>
</svg>'''
    source = path.with_suffix(".svg")
    source.write_text(svg)
    run(["node", str(ROOT / "scripts/render-svg-card.cjs"), str(source), str(path)])


def main() -> None:
    if not SOURCE.is_file() or not VIEWER.is_file():
        raise SystemExit("Need assets/C5306.MP4 and the reviewed viewer-walkthrough.mov")
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
            "-i", str(voice), "-map", "0:v:0", "-map", "1:a:0", "-t", str(length),
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
