# Stretch Snack trainer asset

The runtime mesh comes from the supplied `form-motion-source.zip` (SHA-256 `da88d957db7aa6b1e5f5e6db069dd14a05168b35c23e36cf43e64fd46ce5072b`). To regenerate it, extract the archive into a working directory and run the exporter with Python, NumPy and SciPy installed.

```sh
python3 scripts/form-motion/build.py /path/to/form-motion-source
```

The exporter uses Form / Motion’s fitted MakeHuman body, smooth face, wrist proportions and clothing. It exports the female and male MakeHuman fits and their joint landmarks with the tank and capri outfit. The androgynous trainer interpolates the two fits halfway, including the clothing and skeleton. It smooths the control mesh once, removes body surfaces covered by fabric, and retains four rig influences per vertex. Vertices are stored at 0.1 mm precision. The generated module is ready to serve with the static site.

The exporter uses the source garments to fit a continuous surface through the skin, tank and capri leggings. The neckline, armholes, waistband and calf cuffs share vertices across their material boundaries. Both sides of each seam inherit identical fitted positions and joint weights, so the waistband stays attached through a deep fold. Before cutting these boundaries, the exporter smooths joint weights over the connected surface around the shoulders, hips and knees. The smoothing distance is measured in metres so densely tessellated areas like the groin flex smoothly with the surrounding cloth. During a reach the collar carries the shoulder socket up and out. When a hand must stay at the head or across the chest, the elbow flexes to retain contact. The player also uses the selected body’s heel and forefoot geometry to place the sole on the floor during supported movements.

Stretch Snack animates the mannequin from its catalog poses. The neck release and supported calf stretch adapt the studio’s entry, hold and release timing. The calf exercise retains its fixed handhold. This lets the same anatomy work in a chair, at a support rail, and on the floor. For the sources and rights of the geometry see the [asset credits](../../stretch-snack/form-motion/CREDITS.md).
