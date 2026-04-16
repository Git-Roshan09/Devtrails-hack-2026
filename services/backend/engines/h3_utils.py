import h3


def latlng_to_cell(lat: float, lng: float, resolution: int) -> str:
    """
    Compatibility wrapper for h3-py API differences:
    - newer: h3.latlng_to_cell
    - older: h3.geo_to_h3
    """
    if hasattr(h3, "latlng_to_cell"):
        return h3.latlng_to_cell(lat, lng, resolution)
    return h3.geo_to_h3(lat, lng, resolution)


def cell_to_latlng(cell: str) -> tuple[float, float]:
    """
    Compatibility wrapper for h3-py API differences:
    - newer: h3.cell_to_latlng
    - older: h3.h3_to_geo
    """
    if hasattr(h3, "cell_to_latlng"):
        return h3.cell_to_latlng(cell)
    return h3.h3_to_geo(cell)
