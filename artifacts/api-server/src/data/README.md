# Georgia location source

`georgia-locations.json` contains the 676 Georgia incorporated places and census-designated places in the U.S. Census Bureau's 2025 Gazetteer national places file:

https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip

IDs are Census GEOIDs. Legal place-type suffixes (city, town, CDP, consolidated government) are removed for display, while IDs remain unchanged. These are places, not ZIP-code mailing names or every unincorporated community. The API validates submitted IDs against this list and derives city/state server-side. Refresh this dataset deliberately when adopting a newer Gazetteer; retain IDs for existing listings.
