"use client"

import { MapContainer, TileLayer, Marker } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { useTheme } from "next-themes"

const icon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [0, -41],
    shadowSize: [41, 41],
})

interface Props {
    lat: number
    lng: number
    zoom: number
    label: string
}

export default function StaticLeafletMap({ lat, lng, zoom, label }: Props) {
    const { resolvedTheme } = useTheme()

    return (
        <div className="size-full pointer-events-none select-none">
            <MapContainer
                center={[lat, lng]}
                zoom={zoom}
                style={{ width: "100%", height: "100%" }}
                zoomControl={false}
                dragging={false}
                touchZoom={false}
                doubleClickZoom={false}
                scrollWheelZoom={false}
                boxZoom={false}
                keyboard={false}
                attributionControl={false}
                fadeAnimation={false}
            >
                <TileLayer
                    url={`https://{s}.basemaps.cartocdn.com/${resolvedTheme === "dark" ? "dark_nolabels" : "light_nolabels"}/{z}/{x}/{y}{r}.png`}
                    attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>'
                />
                <Marker position={[lat, lng]} icon={icon} title={label} />
            </MapContainer>
        </div>
    )
}
