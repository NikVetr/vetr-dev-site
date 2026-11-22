"""Measure the active hand relative to the face in the licensed PopSign references."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess

from mediapipe.python.solutions.face_mesh import FaceMesh
from mediapipe.python.solutions.hands import Hands
from mediapipe.python.solutions.pose import Pose
import numpy as np

FPS = 24
SIZE = (480, 640)
# Eye corners, nose, chin, mouth, upper and lower lids, and brows.
FACE = [33, 263, 1, 152, 13, 14, 61, 291, 159, 145, 386, 374, 105, 334]
PACK = Path(__file__).resolve().parents[2] / "data/signs/ase-cafe/pack.json"


def points(landmarks, indices):
    return [
        [
            round(landmarks.landmark[i].x * SIZE[0], 3),
            round(landmarks.landmark[i].y * SIZE[1], 3),
            round(landmarks.landmark[i].z * SIZE[0], 3),
        ]
        for i in indices
    ]


def capture(source):
    width, height = SIZE
    command = [
        "ffmpeg",
        "-loglevel",
        "error",
        "-threads",
        "2",
        "-i",
        str(source),
        "-vf",
        f"fps={FPS},scale={width}:{height}",
        "-an",
        "-threads",
        "1",
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "pipe:1",
    ]
    frames = []
    with (
        subprocess.Popen(command, stdout=subprocess.PIPE) as decoder,
        Hands(
            max_num_hands=1,
            model_complexity=1,
            min_detection_confidence=0.4,
            min_tracking_confidence=0.4,
        ) as hands,
        FaceMesh(max_num_faces=1) as faces,
        Pose(model_complexity=1, smooth_landmarks=True) as pose,
    ):
        assert decoder.stdout
        while raw := decoder.stdout.read(width * height * 3):
            image = np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 3)
            # MediaPipe constructs these named result fields from its graph at runtime.
            hand = getattr(hands.process(image), "multi_hand_landmarks")
            face = getattr(faces.process(image), "multi_face_landmarks")
            body = getattr(pose.process(image), "pose_landmarks")
            frames.append(
                {
                    "hand": points(hand[0], range(21)) if hand else None,
                    "face": points(face[0], FACE) if face else None,
                    "arm": points(body, [12, 14, 16]) if body else None,
                }
            )
        if decoder.wait():
            raise RuntimeError(f"Could not decode {source}")
    return frames


def main():
    groups = json.loads(PACK.read_text())
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sources", type=Path, help="Original <sign ID>.mp4 files")
    parser.add_argument(
        "output", type=Path, help="Scratch directory for the landmark tracks"
    )
    parser.add_argument(
        "--sign",
        choices=[s["id"] for g in groups for s in g["entries"]],
        help="Extract only this sign",
    )
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for group in groups:
        for entry in group["entries"]:
            name = entry["id"]
            if args.sign and args.sign != name:
                continue
            source = args.sources / (name + ".mp4")
            if hashlib.sha256(source.read_bytes()).hexdigest() != entry["sha256"]:
                raise ValueError(f"{name}: reference SHA-256 mismatch")
            frames = capture(source)
            track = dict(fps=FPS, frames=frames, reference=entry["sha256"])
            (args.output / (name + ".json")).write_text(
                json.dumps(track, separators=(",", ":"))
            )
            print(
                name,
                "".join("+" if frame["hand"] else "." for frame in frames),
                flush=True,
            )


if __name__ == "__main__":
    main()
