"""Export a compact, posed-at-runtime trainer from the supplied Form / Motion source.

Pass the extracted form-motion-source folder as the only argument. Uses the
archive's original rig fitter, clothing fitter, face surface and wrist geometry.
"""
import argparse
import base64
import importlib.util
import json
from pathlib import Path

import numpy as np
from scipy.spatial import KDTree

OUTPUT = Path(__file__).resolve().parents[2] / "stretch-snack" / "form-motion"


def smooth_attributes(compiler, attributes, faces):
    # Sample one subdivision at the source control vertices. The smaller topology
    # preserves individual fingers while keeping live software playback practical.
    stencil, _, _ = compiler.subdivision_stencil(len(attributes), faces)
    return (stencil @ attributes)[:len(attributes)]


def compact_mesh(compiler, smooth, triangles):
    used, remapped = np.unique(triangles, return_inverse=True)
    joints, weights = compiler.top_four_weights(smooth[used, 6:])
    weights = np.rint(weights * 255).astype(int)
    dominant = np.argmax(weights, axis=1)
    weights[np.arange(len(used)), dominant] += 255 - weights.sum(axis=1)
    fields = {
        "positions": np.rint(smooth[used, :3] * 10000).astype("<i2"),
        "joints": joints.astype("u1"),
        "weights": weights.astype("u1"),
        "faces": remapped.astype("<u2"),
    }
    assert len(used) < 65536 and np.all((weights >= 0) & (weights <= 255))
    return {key: base64.b64encode(a.tobytes()).decode() for key, a in fields.items()}


def vertex_normals(points, faces):
    triangles = points[faces]
    areas = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    normals = np.zeros_like(points)
    for column in faces.T:
        np.add.at(normals, column, areas)
    return normals / np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)


def fit_armholes(tank, tank_faces, body, body_faces, bones):
    """Bind the tank near the moving upper arms to the fitted anatomical surface."""
    arm_ids = [bones.index(f"mixamorig:{side}Arm") for side in ("Left", "Right")]
    arm_influence = np.clip(tank[:, 6 + np.asarray(arm_ids)].sum(axis=1) / 0.20, 0, 1)
    region = np.flatnonzero(arm_influence)
    body_points = body[:, :3]
    # Search the full body before clothing masks are applied. Around the armpit,
    # two adjacent skin surfaces can face away from each other.
    skin_normals = vertex_normals(body_points, body_faces)
    cloth_normals = vertex_normals(tank[:, :3], tank_faces)[region]
    distance, adjacent = KDTree(body_points, leafsize=16).query(tank[region, :3], k=6)
    facing = np.einsum("ijk,ik->ij", skin_normals[adjacent], cloth_normals)
    sample = (np.maximum(0, facing) / (0.003 + distance)) ** 2
    totals = sample.sum(axis=1, keepdims=True)
    sample /= np.maximum(totals, 1e-12)
    weights = np.einsum("ij,ijk->ik", sample, body[adjacent, 6:])
    # Fade back to authored weights away from the tight-fitting armhole rim.
    mix = arm_influence[region] * np.clip((0.04 - distance[:, 0]) / 0.016, 0, 1)
    mix *= totals[:, 0] > 0
    tank[region, 6:] += mix[:, None] * (weights - tank[region, 6:])


def build(source):
    spec = importlib.util.spec_from_file_location("compiler", source / "compile-human.py")
    if spec is None or spec.loader is None:
        raise ValueError("Could not read compile-human.py from the Form / Motion source")
    compiler = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(compiler)
    # The supplied compiler adds its own anatomy-assets directory to sys.path.
    build_clothes = importlib.import_module("clothing_import").build_clothes
    refine_body = importlib.import_module("morphology_refine").refine_body
    minimal_body = importlib.import_module("minimal_surface").minimal_body

    obj, raw, world, rigs, transforms = compiler.shapes()
    rig = rigs["female"]
    weights = compiler.skin_weights(len(obj["vertices"]), rig["boneNames"])
    ids = obj["group_vertices"]["body"]
    inverse = np.full(len(weights), -1)
    inverse[ids] = np.arange(len(ids))
    original = np.asarray(obj["face_groups"]["body"])
    shapes = [refine_body(world[s][ids], rigs[s], weights[ids]) for s in ("female", "male")]
    attrs, faces, parents = minimal_body(np.column_stack((*shapes, weights[ids])), inverse[original])
    garments = build_clothes(obj, raw, weights)
    covered = set(garments["tank"]["delete_verts"]) | set(garments["leggings"]["delete_verts"])
    hidden = np.r_[[all(int(i) in covered for i in f) for f in original], False]
    body = smooth_attributes(compiler, attrs, faces)
    body_faces = compiler.triangulate(faces)
    visible = [f for f, hide in zip(faces, hidden[parents]) if not hide]
    meshes = {"body": compact_mesh(compiler, body, compiler.triangulate(visible))}
    for name in ("tank", "leggings"):
        g = garments[name]
        endpoints = [g[s] * transforms[s]["scale"] + transforms[s]["offset"] for s in ("female", "male")]
        attr = np.column_stack((*endpoints, g["weights"]))
        fitted = smooth_attributes(compiler, attr, g["faces"])
        triangles = compiler.triangulate(g["faces"])
        if name == "tank":
            fit_armholes(fitted, triangles, body, body_faces, rig["boneNames"])
        meshes[name] = compact_mesh(compiler, fitted, triangles)
    fields = ("boneNames", "restHeads", "restTails")
    data = {key: rig[key] for key in fields}
    def encode(value):
        return json.dumps(value, separators=(",", ":"), allow_nan=False)
    (OUTPUT / "model.js").write_text("// Generated by scripts/form-motion/build.py from Form / Motion.\n"
                                      f"export const rig = {encode(data)};\n"
                                      f"export const meshes = {encode(meshes)};\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    build(parser.parse_args().source.resolve())
