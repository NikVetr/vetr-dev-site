"""Render one-handed ASL using an original studio mannequin and the measured motion."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

import moderngl
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
PACK = HERE.parents[1] / "data/signs/ase-cafe/pack.json"
SIZE = (560, 640)
VERTEX = """#version 330
in vec2 position;
out vec2 screen;
void main() { screen=position; gl_Position=vec4(position,0.,1.); }
"""


def unit(vector):
    length = np.linalg.norm(vector)
    if length < 1e-6:
        raise ValueError("Degenerate model axis")
    return vector / length


def track_values(frames, key, start, end):
    good = [i for i in range(start, end + 1) if frames[i][key] is not None]
    if not good or good[0] != start or good[-1] != end or np.max(np.diff(good)) > 4:
        raise ValueError(
            f"{key}: incomplete capture in reference interval {start}–{end}"
        )
    data = np.array([frames[i][key] for i in good])
    times = np.arange(start, end + 1)
    columns = [np.interp(times, good, col) for col in data.reshape(len(good), -1).T]
    return np.array(columns).T.reshape((len(times), *data.shape[1:]))


def retarget_hand(name, hand):
    """Keep the measured wrist motion while constraining occluded finger contacts."""
    bases = hand[[5, 9, 13, 17]]
    side = unit(hand[5] - hand[17])
    palm = unit(np.cross(side, bases.mean(axis=0) - hand[0]))
    forward = unit(np.cross(palm, side))
    size = np.median(np.linalg.norm(bases - hand[0], axis=1))
    if name in ("coffee", "cold", "yes", "milk"):
        # The camera cannot see through a fist. Keep the four fingers folded
        # against the palm rather than extending the inferred hidden fingertips.
        middle = hand[9:13]
        length = np.linalg.norm(np.diff(middle, axis=0), axis=1).sum()
        reach = np.linalg.norm(middle[3] - middle[0]) / length
        closed = np.clip((0.92 - reach) / 0.42, 0.0, 1.0) if name == "milk" else 1.0
        target = hand.copy()
        # A foreshortened, closed hand often has noisy individual MCP depths.
        # Use a common knuckle arch in the measured palm basis.
        center = bases.mean(axis=0)
        width = size * 0.82
        for finger, lateral, rise in (
            (5, 0.48, 0.01),
            (9, 0.16, 0.07),
            (13, -0.17, 0.025),
            (17, -0.49, -0.085),
        ):
            target[finger] = center + side * width * lateral + forward * size * rise
        for finger, factor in zip((5, 9, 13, 17), (1.0, 1.04, 0.95, 0.78)):
            length = size * factor
            target[finger + 1] = target[finger] + length * (
                0.41 * palm + 0.19 * forward
            )
            target[finger + 2] = target[finger + 1] + length * (
                0.065 * palm - 0.32 * forward
            )
            target[finger + 3] = target[finger + 2] + length * (
                -0.17 * palm - 0.12 * forward
            )
        # Thumb pad crosses the curled index and middle fingers.
        target[2] = target[5] + size * (0.20 * side - 0.30 * forward + 0.26 * palm)
        target[3] = target[6] + size * (0.11 * side - 0.23 * forward + 0.17 * palm)
        target[4] = target[10] + size * (-0.12 * side - 0.19 * forward + 0.18 * palm)
        return (1.0 - closed) * hand + closed * target
    if name == "no":
        # The index and middle pads meet the thumb together at the closure.
        tips = hand[[4, 8, 12]]
        close = np.clip(
            1.0 - np.linalg.norm(tips[0] - tips[1:].mean(axis=0)) / (size * 0.44),
            0.0,
            1.0,
        )
        contact = tips.mean(axis=0)
        for tip in (4, 8, 12):
            offset = (contact - hand[tip]) * close
            hand[tip] += offset
            hand[tip - 1] += offset * 0.38
    if name == "water":
        # An edge-on W hides two fingers from the reference camera. Keep the
        # index side at the tracked chin contact and fan the three extended rays.
        tracked_tip = hand[8].copy()
        direction = unit((hand[8] - hand[5]) + (hand[12] - hand[9]))
        spread = unit(side - np.dot(side, direction) * direction)
        for i, length, angle in ((5, 0.98, 0.32), (9, 1.06, 0.00), (13, 1.0, -0.34)):
            ray = unit(direction + angle * spread) * size * length
            for joint, fraction in enumerate((0.44, 0.76, 1.0), start=1):
                hand[i + joint] = hand[i] + fraction * ray
        hand += tracked_tip - hand[8]
        # Monocular hand depth is wrist-relative. Set the contact depth against
        # the model's chin, keeping the measured timing of the in/out motion.
        depth_shift = 0.30
        above_wrist = np.clip(
            (hand[:, 1] - hand[0, 1]) / (hand[8, 1] - hand[0, 1]), 0.0, 1.0
        )
        hand[:, 2] -= depth_shift * (0.35 + 0.65 * above_wrist)
        # Stabilize the thumb/little-finger contact of the W handshape.
        gap = hand[4] - hand[20]
        hand[4] -= gap * 0.48
        hand[20] += gap * 0.52
        hand[3] -= gap * 0.18
        hand[19] += gap * 0.20
    return hand


def motion(entry, track):
    if track["reference"] != entry["sha256"]:
        raise ValueError(f"{entry['id']}: capture and reference differ")
    start, end = entry["sourceFrames"]
    raw = track["frames"]
    if track["fps"] != 24 or not 0 <= start < end < len(raw):
        raise ValueError(f"{entry['id']}: invalid 24 fps capture interval")
    if entry["view"] not in ("hand", "upper-body"):
        raise ValueError(f"{entry['id']}: unknown camera framing")
    hand = track_values(raw, "hand", start, end)
    face = track_values(raw, "face", start, end)
    arm = track_values(raw, "arm", start, end)
    eye = (face[:, 0] + face[:, 1]) / 2
    eye_span = np.median(np.linalg.norm(face[:, 0, :2] - face[:, 1, :2], axis=1))
    scale_x = 0.69 / eye_span
    scale_y = 0.87 / np.median(face[:, 3, 1] - eye[:, 1])

    def xy(points):
        # Stabilize against camera movement. Preserve the original screen handedness.
        return (points[:, :, :2] - eye[:, None, :2]) * [scale_x, -scale_y] + [0.0, 0.12]

    hands_xy = xy(hand)
    lengths = np.linalg.norm((hand[:, 9] - hand[:, 0]) * scale_x, axis=1)
    wrist_z = 0.54 + np.clip((lengths - 0.52) * 0.7, -0.08, 0.32)
    hands_z = wrist_z[:, None] - hand[:, :, 2] * scale_x
    hands = np.array(
        [retarget_hand(entry["id"], h) for h in np.dstack((hands_xy, hands_z))]
    )
    if entry["view"] == "hand":
        # A close-up uses one hand size even as finger occlusion changes the
        # tracker's palm-length estimate. Keep the measured wrist trajectory.
        roots = hands[:, :1].copy()
        metacarpals = hands[:, [5, 9, 13, 17]] - roots
        sizes = np.median(np.linalg.norm(metacarpals, axis=2), axis=1)
        hands = roots + (hands - roots) * (np.median(sizes) / sizes)[:, None, None]
    arms = xy(arm)
    elbows = np.column_stack((arms[:, 1], np.full(len(arms), 0.13)))
    shoulders = np.column_stack(
        (
            np.clip(arms[:, 0, 0], -1.01, -0.66),
            np.clip(arms[:, 0, 1], -1.28, -0.92),
            np.full(len(arms), -0.15),
        )
    )
    if entry["view"] == "upper-body":
        # Fit the captured arm to the mannequin's shoulder width. Keep wrist,
        # fingertips and their contacts fixed while giving the elbow clearance.
        shoulders[:, 0] = np.clip(shoulders[:, 0] - 0.10, -1.00, -0.87)
        elbows[:, 0] = np.minimum(elbows[:, 0], shoulders[:, 0] - 0.22)
        elbows[:, 2] = 0.31
    eye_line = face[:, 1] - face[:, 0]
    head_roll = np.clip(np.arctan2(-eye_line[:, 1], eye_line[:, 0]), -0.25, 0.25)
    # Frame the entire trajectory with one stationary camera, including fingertip clearance.
    yaw = np.deg2rad(entry.get("yaw", 0))
    projected = hands[:, :, :2].copy()
    projected[:, :, 0] = hands[:, :, 0] * np.cos(yaw) - (
        hands[:, :, 2] - 0.38
    ) * np.sin(yaw)
    lo, hi = projected.min(axis=(0, 1)), projected.max(axis=(0, 1))
    if entry["view"] == "upper-body":
        elbow_x = elbows[:, 0] * np.cos(yaw) - (elbows[:, 2] - 0.38) * np.sin(yaw)
        lo = np.minimum(lo, [min(-1.1, elbow_x.min() - 0.15), elbows[:, 1].min() - 0.15])
        hi = np.maximum(hi, [1.20, 0.89])
        pad = 0.16
    else:
        pad = 0.17
        lo[1] -= 0.12
    half = max(
        (hi[1] - lo[1]) * 0.5 + pad, ((hi[0] - lo[0]) * 0.5 + pad) * SIZE[1] / SIZE[0]
    )
    center = (lo + hi) * 0.5
    camera = (*center, half * SIZE[0] / SIZE[1], half)
    return hands, elbows, shoulders, head_roll, camera


class Studio:
    def __init__(self):
        # ModernGL's external 5.x stub gives backend the wrong type (a dict).
        self.ctx = moderngl.create_standalone_context(backend="egl")  # pyright: ignore[reportArgumentType]
        self.program = self.ctx.program(
            vertex_shader=VERTEX, fragment_shader=(HERE / "signer.frag").read_text()
        )
        self.uniforms = {
            key: member
            for key in self.program
            if isinstance(member := self.program[key], moderngl.Uniform)
        }
        geometry = np.array([[-1, -1], [3, -1], [-1, 3]], dtype="f4")
        self.triangle = self.ctx.simple_vertex_array(
            self.program, self.ctx.buffer(geometry.tobytes()), "position"
        )
        self.frame = self.ctx.simple_framebuffer(SIZE, components=3)
        self.frame.use()

    def draw(self, hand, elbow, shoulder, head_roll, camera, bust, yaw):
        p = self.uniforms
        knuckles = hand[[5, 9, 13, 17]]
        side = unit(hand[5] - hand[17])
        middle = knuckles.mean(axis=0)
        forward = middle - hand[0]
        normal = unit(np.cross(side, forward))
        up = unit(np.cross(normal, side))
        size = np.median(np.linalg.norm(knuckles - hand[0], axis=1))
        center = hand[0] + forward * 0.56
        p["joints"].write(hand.astype("f4").tobytes())
        for key, value in {
            "palmX": side,
            "palmY": up,
            "palmZ": normal,
            "palmCenter": center,
            "palmSize": (
                np.linalg.norm(hand[5] - hand[17]) * 0.60,
                np.dot(forward, up) * 0.59,
                size * 0.21,
            ),
            "handMin": hand.min(axis=0) - size * 0.29,
            "handMax": hand.max(axis=0) + size * 0.29,
            "elbow": elbow,
            "shoulder": shoulder,
            "camera": camera,
        }.items():
            p[key].value = tuple(value)
        p["bust"].value = bust
        p["yaw"].value = np.deg2rad(yaw)
        p["handSize"].value = size
        p["headRoll"].value = head_roll
        self.triangle.render()
        return Image.frombytes(
            "RGB", SIZE, self.frame.read(components=3, alignment=1), "raw", "RGB", 0, -1
        )


def export(studio, entry, track, output):
    hands, elbows, shoulders, head_roll, camera = motion(entry, track)
    fps = track["fps"]
    start = entry["sourceFrames"][0]
    picks = [round(t * fps) - start for t in entry["frames"]]
    if not 0 <= picks[0] < picks[1] < len(hands):
        raise ValueError(f"{entry['id']}: print frames fall outside the animation")
    with tempfile.TemporaryDirectory(dir=output) as stage:
        temp = Path(stage)
        clip = temp / "clip.mp4"
        command = [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-s",
            f"{SIZE[0]}x{SIZE[1]}",
            "-r",
            str(fps),
            "-i",
            "pipe:0",
            "-an",
            "-c:v",
            "libx264",
            "-threads",
            "2",
            "-crf",
            "19",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(clip),
        ]
        with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
            assert encoder.stdin
            for i, hand in enumerate(hands):
                image = studio.draw(
                    hand,
                    elbows[i],
                    shoulders[i],
                    head_roll[i],
                    camera,
                    entry["view"] == "upper-body",
                    entry.get("yaw", 0),
                )
                if i in picks:
                    image.save(
                        temp / f"{picks.index(i) + 1}.jpg", quality=94, subsampling=0
                    )
                # Brief holds at the first and last measured poses make short signs easier to follow.
                encoder.stdin.write(
                    image.tobytes() * (6 if i in (0, len(hands) - 1) else 1)
                )
            encoder.stdin.close()
            if encoder.wait():
                raise RuntimeError(f"{entry['id']}: animation encoding failed")
        files = [clip, temp / "1.jpg", temp / "2.jpg"]
        digest = hashlib.sha256(
            b"".join(part.read_bytes() for part in files)
        ).hexdigest()[:12]
        stem = entry["id"] + "-" + digest
        for file, ext in zip(files, ("mp4", "1.jpg", "2.jpg")):
            file.replace(output / (stem + "." + ext))
        return stem


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tracks", type=Path)
    parser.add_argument(
        "output", type=Path, help="Staging directory for the rendered pack"
    )
    parser.add_argument("--pack", type=Path, default=PACK)
    args = parser.parse_args()
    groups = json.loads(args.pack.read_text())
    args.output.mkdir(exist_ok=True, parents=True)
    studio = Studio()
    for group in groups:
        for entry in group["entries"]:
            track = json.loads((args.tracks / (entry["id"] + ".json")).read_text())
            entry["media"] = export(studio, entry, track, args.output)
            print(entry["media"], flush=True)
    (args.output / "pack.json").write_text(json.dumps(groups, indent=2) + "\n")


if __name__ == "__main__":
    main()
