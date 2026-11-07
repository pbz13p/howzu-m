#!/usr/bin/env bash
# Downloads open government data and converts school zones to simplified WGS84 GeoJSON.
set -uo pipefail
mkdir -p raw tmp
UA="Mozilla/5.0 (compatible; melb-rental-site data fetch)"

ZONES_URL="https://content.vic.gov.au/sites/default/files/2026-10/dv419_DataVic_School_Zones_2027_MAR26_0.zip"
LOC_URL="https://content.vic.gov.au/DE-School-Locations%20-2026"
VCE_URLS=(
  "https://vcaacorporateprod.prod.acquia-sites.com/sites/default/files/2025-12/2025-SeniorSecondaryCompletionandAchievementInformation.xlsx"
  "https://www.vcaa.vic.edu.au/sites/default/files/2025-12/2025-SeniorSecondaryCompletionandAchievementInformation.xlsx"
)

curl -sSL -A "$UA" -o tmp/zones.zip "$ZONES_URL" && echo "zones ok"
curl -sSL -A "$UA" -o raw/school_locations.csv "$LOC_URL" && echo "locations ok"
for u in "${VCE_URLS[@]}"; do
  if curl -sSfL -A "$UA" -o raw/vce_2025.xlsx "$u"; then echo "vce ok: $u"; break; fi
done

{
  echo "== files =="; ls -la raw tmp
  echo "== zip contents =="; unzip -l tmp/zones.zip
  echo "== locations head =="; head -c 1500 raw/school_locations.csv
} > raw/_manifest.txt 2>&1

unzip -o -q tmp/zones.zip -d tmp/zones
mkdir -p raw/zones
find tmp/zones -iname "*.shp" | while read -r shp; do
  base=$(basename "$shp" .shp)
  echo "== $base ==" >> raw/_manifest.txt
  mapshaper "$shp" -info >> raw/_manifest.txt 2>&1
  mapshaper "$shp" -proj wgs84 -simplify 8% keep-shapes -o "raw/zones/${base}.json" format=geojson precision=0.00001 >> raw/_manifest.txt 2>&1
done
# Also handle GeoJSON / other formats shipped directly
find tmp/zones -iname "*.geojson" -o -iname "*.json" | while read -r f; do
  base=$(basename "$f"); echo "== $base (geojson) ==" >> raw/_manifest.txt
  mapshaper "$f" -info >> raw/_manifest.txt 2>&1
  mapshaper "$f" -proj wgs84 -simplify 8% keep-shapes -o "raw/zones/${base%.*}.json" format=geojson precision=0.00001 >> raw/_manifest.txt 2>&1
done
ls -la raw/zones >> raw/_manifest.txt
exit 0
