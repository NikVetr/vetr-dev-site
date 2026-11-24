"""Fit a continuous surface through the skin, tank and capri leggings."""

import numpy as np
from scipy.sparse import coo_matrix, diags
from scipy.sparse.linalg import spsolve
from scipy.spatial import KDTree


def soften_joint_weights(body, triangles, rig):
    """Diffuse skin weights along the surface around shoulders, hips and knees.

    A diffusion distance in metres treats dense groin and underarm polygons
    like the larger polygons around them. Surface adjacency keeps an arm from
    inheriting the nearby chest's weights, or a thigh its neighbour's weights.
    """
    positions = body[:, :3]
    points = positions[triangles]
    twice_area = np.linalg.norm(np.cross(points[:, 1]-points[:, 0], points[:, 2]-points[:, 0]), axis=1)
    mass = np.bincount(triangles.ravel(), weights=np.repeat(twice_area/6, 3), minlength=len(body))
    edges, conductance = [], []
    for a, b, opposite in ((0, 1, 2), (1, 2, 0), (2, 0, 1)):
        # Cotangent Laplacian with nonnegative conductances. This prevents an
        # obtuse triangle from introducing a negative bone weight at a seam.
        dot = np.einsum("ij,ij->i", points[:, a]-points[:, opposite], points[:, b]-points[:, opposite])
        weight = .5 * np.maximum(0, dot) / np.maximum(1e-12, twice_area)
        edges.extend([triangles[:, [a, b]], triangles[:, [b, a]]])
        conductance.extend([weight, weight])
    ij = np.vstack(edges)
    graph = coo_matrix((np.concatenate(conductance), ij.T), shape=(len(body), len(body))).tocsr()
    laplacian = diags(np.asarray(graph.sum(axis=1)).ravel()) - graph

    def joint_falloff(bone, scale, inner, outer):
        centers = [rig["restHeads"][rig["boneNames"].index(f"mixamorig:{side}{bone}")] for side in ("Right", "Left")]
        radius = np.minimum.reduce([np.linalg.norm((positions-c) * scale, axis=1) for c in centers])
        t = np.clip((outer-radius)/(outer-inner), 0, 1)
        return t*t*(3-2*t)

    shoulder = .036 * joint_falloff("Arm", [.9, 1.24, .9], .12, .20)
    hip = .055 * joint_falloff("UpLeg", [.82, .8, .95], .16, .27)
    knee = .025 * joint_falloff("Leg", [1, 1, 1], .07, .135)
    radius = np.maximum.reduce([shoulder, hip, knee])
    mass = np.maximum(mass, 1e-12)
    matrix = diags(mass) + diags(radius**2) @ laplacian
    weights = np.asarray(spsolve(matrix.tocsc(), mass[:, None] * body[:, 6:]))
    body[:, 6:] = weights / np.maximum(weights.sum(axis=1, keepdims=True), 1e-12)


def fit_drape(points, reference, triangles, torso):
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

    if not torso:
        return offsets

    # Project the ribcage and abdomen horizontally onto the garment. This
    # retains its drape over the bust and abdomen down to the hem.
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


def fit_outfit(compiler, template, original, faces, parents, body, garments, transforms, fitter):
    """Partition the body at the authored neckline, armholes, waist and cuffs.

    The helper tank and leggings overlap at the waist in the source. Using
    the visible tank hem as a shared edge lets both garments follow the same
    blend of pelvis, spine and thigh while an athlete bends or sits down.
    """
    source = np.full((len(body), 3), [0., 10., 0.])
    for face, parent in zip(faces, parents):
        if parent >= 0:
            source[face] = template[original[parent]]
    waist = 1.05
    hem = -4.85  # native capri hem in the supplied garment fitter
    tank_distance = np.minimum.reduce([
        source[:, 1] - waist,
        fitter._armhole_distance(source) - .11,
        fitter._neck_distance(source),
    ])
    cuff_distance = source[:, 1] - hem
    attributes = list(body)
    crossings = {}

    def divide(triangle, distances, contour):
        outside, inside = [], []
        for a, b in zip(triangle[-1:] + triangle[:-1], triangle):
            a_in, b_in = distances[a] >= 0, distances[b] >= 0
            if a_in != b_in:
                edge = (contour, min(a, b), max(a, b))
                if edge not in crossings:
                    t = distances[a] / (distances[a] - distances[b])
                    crossings[edge] = len(attributes)
                    attributes.append((1 - t) * body[a] + t * body[b])
                vertex = crossings[edge]
                outside.append(vertex)
                inside.append(vertex)
            (inside if b_in else outside).append(b)
        return outside, inside

    skin, tank, leggings = [], [], []
    for polygon, parent in zip(faces, parents):
        for n in range(1, len(polygon) - 1):
            triangle = [polygon[0], polygon[n], polygon[n + 1]]
            # Waist, arms and cuffs are separated in the source A pose. At a
            # calf the only cut is its cuff. At the waist the skin-side half
            # of the shirt cut belongs to the pants, using the same vertices.
            if parent >= 0 and np.max(source[triangle, 1]) < waist:
                below, above = divide(triangle, cuff_distance, "cuff")
                if len(below) >= 3:
                    skin.append(below)
                if len(above) >= 3:
                    leggings.append(above)
            else:
                outside, inside = divide(triangle, tank_distance, "top")
                if len(outside) >= 3:
                    crosses_waist = np.min(source[triangle, 1]) < waist
                    (leggings if crosses_waist else skin).append(outside)
                if len(inside) >= 3:
                    tank.append(inside)

    fitted = np.asarray(attributes)
    triangles = {key: compiler.triangulate(polygons) for key, polygons in
                 (("body", skin), ("tank", tank), ("leggings", leggings))}
    rim = np.fromiter(crossings.values(), dtype=int)
    for name in ("tank", "leggings"):
        garment = garments[name]
        panel = np.unique(triangles[name])
        reference_faces = compiler.triangulate(garment["faces"])
        stencil = compiler.subdivision_stencil(len(garment["female"]), garment["faces"])[0]
        for shape, column in (("female", 0), ("male", 3)):
            positions = fitted[:, column:column + 3]
            authored = garment[shape] * transforms[shape]["scale"] + transforms[shape]["offset"]
            authored = (stencil @ authored)[:len(authored)]
            offset = fit_drape(positions[panel], authored, reference_faces, name == "tank")
            # Preserve bind landmarks along the cuts. Away from them, recover
            # the fitted garment's thickness and shape from its source mesh.
            t = np.clip(KDTree(positions[rim]).query(positions[panel])[0] / .018, 0, 1)
            positions[panel] += (t * t * (3 - 2 * t))[:, None] * offset
    return fitted, triangles
