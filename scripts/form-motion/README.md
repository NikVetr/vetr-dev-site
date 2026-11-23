# Stretch Snack trainer asset

The runtime mesh comes from the supplied `form-motion-source.zip` (SHA-256 `da88d957db7aa6b1e5f5e6db069dd14a05168b35c23e36cf43e64fd46ce5072b`). To regenerate it, extract the archive into a working directory and run the exporter with Python, NumPy and SciPy installed.

```sh
python3 scripts/form-motion/build.py /path/to/form-motion-source
```

The exporter uses Form / Motion’s fitted MakeHuman body, smooth face, wrist proportions and clothing. It selects the first body shape and the tank and capri outfit. It smooths the control mesh once, removes body surfaces covered by fabric, and retains four rig influences per vertex. Vertices are stored at 0.1 mm precision. The generated module is ready to serve with the static site.

The exporter blends the tank’s armhole weights with those of nearby, similarly oriented skin on the fitted body. This reduces skin showing through when the shoulder rotates and preserves the authored neckline, armholes and hems. The fabric follows the skeleton during playback, so close contact can still produce small intersections.

Stretch Snack animates the mannequin from its catalog poses. The neck release and supported calf stretch adapt the studio’s entry, hold and release timing. The calf exercise retains its fixed handhold. This lets the same anatomy work in a chair, at a support rail, and on the floor. For the sources and rights of the geometry see the [asset credits](../../stretch-snack/form-motion/CREDITS.md).
