"""Annotate the Stravl catalog using GeoNames populated places, Natural Earth, WorldClim and WDI."""

import argparse
import json
import struct
from pathlib import Path
from zipfile import ZipFile
from osgeo import gdal, ogr, osr

# Geographic identifiers disambiguate the populated place used for each Stravl label.
PLACES = {
    "356": "256952",
    "338": "2844588",
    "821": "745044",
    "207": "146214",
    "732": "3128760",
    "49": "2761593",
    "439": "3175081",
    "275": "2985947",
    "212": "3067696",
    "189": "3190261",
    "327": "2891122",
    "274": "3029090",
}
REGIONS = {
    "AT": "Western Europe",
    "FR": "Western Europe",
    "DE": "Western Europe",
    "CZ": "Eastern Europe",
    "GR": "Southern Europe",
    "HR": "Southern Europe",
    "IT": "Southern Europe",
    "ES": "Southern Europe",
    "TR": "Western Asia",
    "CY": "Western Asia",
}


def generate(root, catalog):
    root = root.resolve()
    data = json.loads(catalog.read_text())
    with ZipFile(root / "cities500.zip") as z, z.open("cities500.txt") as src:
        places = {}
        for line in src:
            f = line.decode().split("\t")
            if f[0] in PLACES.values():
                places[f[0]] = f
    gdp = {
        r["country"]["id"]: r["value"]
        for r in json.loads((root / "gdp.json").read_text())[1]
        if r["date"] == "2023"
    }
    coast = ogr.Open(f"/vsizip/{root}/coast.zip/ne_10m_coastline.shp")
    layer = coast.GetLayer()
    rasters = [
        gdal.Open(f"/vsizip/{root}/climate.zip/wc2.1_10m_bio_{k}.tif") for k in (1, 12)
    ]
    for it in data["items"]:
        f = places[PLACES[it["itemId"]]]
        lat, lon = map(float, f[4:6])
        crs = osr.SpatialReference()
        crs.ImportFromProj4(
            f"+proj=aeqd +lat_0={lat} +lon_0={lon} +datum=WGS84 +units=m"
        )
        source = layer.GetSpatialRef().Clone()
        source.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
        reproject = osr.CoordinateTransformation(source, crs)
        layer.SetSpatialFilterRect(lon - 1, lat - 1, lon + 1, lat + 1)
        origin = ogr.CreateGeometryFromWkt("POINT (0 0)")
        coastal = False
        for feature in layer:
            geom = feature.GetGeometryRef().Clone()
            geom.Transform(reproject)
            if geom.Distance(origin) <= 25000:
                coastal = True
                break
        a = dict(
            country=it["title"].split(", ")[-1],
            region=REGIONS[f[8]],
            placeId=f[0],
            coast="Within 25 km of coast" if coastal else "Over 25 km from coast",
            gdp=round(gdp[f[8]]),
        )
        # Stravl's Milos can refer to the island. Avoid using village population for the island.
        if it["itemId"] != "356":
            a["population"] = int(f[14])
        for key, raster in zip(("temperature", "precipitation"), rasters):
            col, row = gdal.ApplyGeoTransform(
                gdal.InvGeoTransform(raster.GetGeoTransform()), lon, lat
            )
            band = raster.GetRasterBand(1)
            (v,) = struct.unpack(
                "=d",
                band.ReadRaster(int(col), int(row), 1, 1, buf_type=gdal.GDT_Float64),
            )
            if v != band.GetNoDataValue():
                a[key] = round(v, 1)
        it["annotations"] = a
    catalog.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("root", type=Path)
    p.add_argument("catalog", type=Path)
    args = p.parse_args()
    generate(args.root, args.catalog)
