"""Bind the anatomical shoulder and its fitted tank to one continuous surface."""

import numpy as np
from scipy.sparse import csr_matrix
from scipy.spatial import KDTree


def soften_shoulder_weights(body, triangles, rig):
    """Spread abrupt weight changes along the skin at the shoulder, including the armpit.

    A surface neighbourhood keeps the inside of an arm separate from the nearby
    chest. Working before the material cut gives both sides of the armhole the
    same transitions. The original weights are retained beyond each shoulder.
    """
    edges = np.vstack([triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]])
    edges = np.unique(np.vstack([edges, edges[:, ::-1]]), axis=0)
    adjacent = csr_matrix((np.ones(len(edges)), (edges[:, 0], edges[:, 1])), shape=(len(body), len(body)))
    mean = adjacent.multiply(1 / np.maximum(1, np.asarray(adjacent.sum(axis=1)))).tocsr()
    centers = [rig["restHeads"][rig["boneNames"].index(f"mixamorig:{side}Arm")] for side in ("Right", "Left")]
    radius = np.minimum.reduce([np.linalg.norm((body[:, :3] - c) * [.9, 1.24, .9], axis=1) for c in centers])
    t = np.clip((.18 - radius) / .10, 0, 1)
    amount = (.57 * t * t * (3 - 2 * t))[:, None]
    weights = body[:, 6:]
    for _ in range(9):
        weights += amount * (mean @ weights - weights)


def fit_drape(points, reference, triangles):
    """Transfer the authored cloth surface to the anatomical mesh in metres."""
    surface = reference[triangles]
    normals = np.cross(surface[:, 1] - surface[:, 0], surface[:, 2] - surface[:, 0])
    normals /= np.maximum(1e-12, np.linalg.norm(normals, axis=1, keepdims=True))
    centers = surface.mean(1)
    distance, near = KDTree(centers).query(points, k=5)
    weight = 1 / (.004 + distance) ** 2
    weight /= weight.sum(axis=1, keepdims=True)
    depth = np.einsum("ijk,ijk->ij", centers[near] - points[:, None, :], normals[near])
    offsets = np.einsum("ij,ijk->ik", weight * depth, normals[near])

    # Project the ribcage and abdomen horizontally onto the garment. This
    # retains its drape over the bust and its overlap with the leggings.
    lo = surface[:, :, 1].min(1)
    hi = surface[:, :, 1].max(1)
    for i, (x, y, z) in enumerate(points):
        blend = np.clip((.16 - abs(x)) / .04, 0, 1) * np.clip((1.44 - y) / .09, 0, 1)
        radius = np.hypot(x, z)
        if not blend or radius <= 1e-12:
            continue
        slice_faces = surface[(lo <= y) & (y <= hi)]
        if not len(slice_faces):
            continue
        ray = np.array([x, 0, z]) / radius
        origin = np.array([0, y, 0])
        a, b, c = slice_faces.transpose(1, 0, 2)
        edge1, edge2 = b - a, c - a
        h = np.cross(ray, edge2)
        det = np.einsum("ij,ij->i", edge1, h)
        det = np.where(abs(det) > 1e-10, det, np.nan)
        delta = origin - a
        u = np.einsum("ij,ij->i", delta, h) / det
        q = np.cross(delta, edge1)
        v = q @ ray / det
        depth = np.einsum("ij,ij->i", edge2, q) / det
        hits = depth[(u >= 0) & (v >= 0) & (u + v <= 1) & (abs(depth - radius) < .040)]
        if len(hits):
            projected = origin + hits[np.argmin(abs(hits - radius))] * ray
            offsets[i] += blend * (projected - points[i] - offsets[i])
    return offsets


def split_tank(compiler, template, original, faces, parents, body, tank, transforms, leg_mask, fitter):
    """Cut skin and fabric panels at shared edges of the supplied athletic top."""
    # Parents map the simplified facial surface back to the untouched body.
    # New facial vertices lie outside the neckline.
    source = np.full((len(body), 3), [0., 10., 0.])
    for face, parent in zip(faces, parents):
        if parent >= 0:
            source[face] = template[original[parent]]
    distance = np.minimum.reduce([
        source[:, 1] - 1.05,
        fitter._armhole_distance(source) - .11,  # 11 mm inset leaves the cap of the deltoid exposed
        fitter._neck_distance(source),
    ])
    covered = set(leg_mask)
    hidden = np.r_[[all(int(i) in covered for i in f) for f in original], False]
    attrs = list(body)
    crossings = {}

    def cut(a, b):
        key = tuple(sorted((a, b)))
        if key not in crossings:
            t = distance[a] / (distance[a] - distance[b])
            crossings[key] = len(attrs)
            attrs.append((1 - t) * body[a] + t * body[b])
        return crossings[key]

    skin, cloth = [], []
    for polygon, parent in zip(faces, parents):
        # A cut may cross all four sides of a quad at the narrow straps. Split
        # along the source diagonal first so both materials use the same seam.
        for n in range(1, len(polygon) - 1):
            face = [polygon[0], polygon[n], polygon[n + 1]]
            panels = [[], []]
            for a, b in zip(face[-1:] + face[:-1], face):
                if (distance[a] >= 0) != (distance[b] >= 0):
                    edge = cut(a, b)
                    panels[0].append(edge)
                    panels[1].append(edge)
                panels[int(distance[b] >= 0)].append(b)
            if not hidden[parent] and len(panels[0]) >= 3:
                skin.append(panels[0])
            if len(panels[1]) >= 3:
                cloth.append(panels[1])

    fitted = np.asarray(attrs)
    cloth_faces = compiler.triangulate(cloth)
    garment = fitted.copy()
    panel_vertices = np.unique(cloth_faces)
    rim = np.fromiter(crossings.values(), dtype=int)
    reference_faces = compiler.triangulate(tank["faces"])
    stencil = compiler.subdivision_stencil(len(tank["female"]), tank["faces"])[0]
    for shape, column in (("female", 0), ("male", 3)):
        positions = fitted[:, column:column + 3]
        authored = tank[shape] * transforms[shape]["scale"] + transforms[shape]["offset"]
        authored = (stencil @ authored)[:len(authored)]
        offset = fit_drape(positions[panel_vertices], authored, reference_faces)
        # A turned hem meets the skin, then eases into the original fabric
        # volume over 18 mm. Both copies of each rim vertex have identical
        # bind positions, morph endpoints and bone weights.
        t = np.clip(KDTree(positions[rim]).query(positions[panel_vertices])[0] / .018, 0, 1)
        garment[panel_vertices, column:column + 3] += (t * t * (3 - 2 * t))[:, None] * offset
    return fitted, compiler.triangulate(skin), garment, cloth_faces
