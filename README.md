# 好租 Howzu (howzu.com.au)

Enter a Melbourne address → zoned government primary/secondary school (2027 zones), nearby schools, VCE 2025 results.

- `index.html` – static site (GitHub Pages)
- `scripts/fetch_raw.sh` – downloads DataVic school zones + school locations, VCAA SSCAI
- `scripts/build_data.py` – builds `data/*.json`
- `.github/workflows/fetch-data.yml` – runs monthly; update URLs when new zone/VCE files are released

Data: © State of Victoria (Department of Education), CC BY 4.0; © VCAA; geocoding/map © OpenStreetMap contributors.
