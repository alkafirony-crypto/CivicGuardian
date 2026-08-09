import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Crosshair, MapPin, Search } from "lucide-react";
import "leaflet/dist/leaflet.css";

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number, addressSuggestion?: string) => void;
  address: string;
  setAddress: (value: string) => void;
}

type SearchResult = { display_name: string; lat: string; lon: string; type?: string; addressType?: string; zoom?: number };

const BANGLADESH_CENTER: [number, number] = [23.685, 90.3563];
const BANGLADESH_BOUNDS: L.LatLngBoundsExpression = [[20.55, 88.0], [26.7, 92.75]];
const pin = L.divIcon({ className: "", html: '<span style="display:block;width:22px;height:22px;border:4px solid white;border-radius:50%;background:#0f766e;box-shadow:0 2px 10px #0f172a55"></span>', iconSize: [22, 22], iconAnchor: [11, 11] });

function PickOnMap({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(event) { onPick(event.latlng.lat, event.latlng.lng); } });
  return null;
}

function FollowSelection({ position, zoom }: { position: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, zoom, { animate: false });
    window.setTimeout(() => map.invalidateSize(), 0);
  }, [map, position, zoom]);
  return null;
}

export default function LocationPicker({ lat, lng, onChange, address, setAddress }: Props) {
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedZoom, setSelectedZoom] = useState(15);
  const [error, setError] = useState("");
  const position = useMemo<[number, number]>(() => lat !== null && lng !== null ? [lat, lng] : BANGLADESH_CENTER, [lat, lng]);

  const reverse = async (nextLat: number, nextLng: number, zoom = 18) => {
    setError(""); setSelectedZoom(zoom);
    try {
      const response = await fetch(`/api/geocode/reverse?lat=${encodeURIComponent(nextLat)}&lng=${encodeURIComponent(nextLng)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Address lookup failed");
      onChange(nextLat, nextLng, data.displayName || undefined);
    } catch (caught) {
      onChange(nextLat, nextLng);
      setError(caught instanceof Error ? caught.message : "Location selected, but the address could not be identified. Please enter it manually.");
    }
  };

  const locate = () => {
    if (!navigator.geolocation) { setError("This browser does not support location access."); return; }
    setBusy(true); setError("");
    navigator.geolocation.getCurrentPosition(positionResult => {
      setBusy(false);
      void reverse(positionResult.coords.latitude, positionResult.coords.longitude, 17);
    }, locationError => {
      setBusy(false); setError(`Could not access your location: ${locationError.message}`);
    }, { enableHighAccuracy: true, timeout: 10_000 });
  };

  const chooseResult = (result: SearchResult, clearResults = true) => {
    const nextLat = Number(result.lat);
    const nextLng = Number(result.lon);
    setSelectedZoom(result.zoom || 15);
    setAddress(result.display_name);
    if (clearResults) setResults([]);
    onChange(nextLat, nextLng, result.display_name);
  };

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/geocode/search?q=${encodeURIComponent(query.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const rows: SearchResult[] = data.results || [];
      setResults(rows);
      if (rows[0]) chooseResult(rows[0], false);
      else setError("No matching location was found in Bangladesh. Include the road number plus area, city, or district.");
    } catch {
      setError("Address search is temporarily unavailable. You can still click the map or use GPS.");
    } finally { setBusy(false); }
  };

  useEffect(() => { if (address && !query) setQuery(address); }, [address, query]);

  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-200 p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><MapPin className="h-4 w-4 text-teal-700" />Choose the incident location</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">Search anywhere in Bangladesh by road number, road name, landmark, area, city, or district. The first match is selected and zoomed immediately.</p>
      <form onSubmit={search} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Road 12, Dhanmondi, Dhaka" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-teal-700" /></div>
        <button disabled={busy || query.trim().length < 2} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-teal-600 disabled:opacity-50">Search</button>
        <button type="button" onClick={locate} disabled={busy} className="flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50"><Crosshair className="h-4 w-4" />My location</button>
      </form>
      {results.length > 1 && <div className="relative z-[700] mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"><div className="px-3 pt-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Other Bangladesh matches</div>{results.slice(1, 7).map((result, index) => <button type="button" key={`${result.lat}-${result.lon}-${index}`} onClick={() => chooseResult(result)} className="block w-full border-b border-slate-100 px-3 py-2.5 text-left text-xs leading-5 text-slate-700 hover:bg-teal-50">{result.display_name}</button>)}</div>}
      {error && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">{error}</p>}
    </div>
    <div className="relative z-0 h-[340px] w-full overflow-hidden">
      <MapContainer center={BANGLADESH_CENTER} zoom={7} maxBounds={BANGLADESH_BOUNDS} maxBoundsViscosity={0.85} minZoom={6} style={{ height: "100%", width: "100%", position: "relative", zIndex: 0 }} scrollWheelZoom>
        <TileLayer attribution='&copy; OpenStreetMap contributors &copy; CARTO' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
        <FollowSelection position={position} zoom={lat !== null ? selectedZoom : 7} />
        <PickOnMap onPick={(nextLat, nextLng) => void reverse(nextLat, nextLng)} />
        {lat !== null && lng !== null && <Marker position={[lat, lng]} icon={pin} />}
      </MapContainer>
    </div>
    <div className="grid gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_auto]"><div><label className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Selected address</label><input value={address} onChange={event => setAddress(event.target.value)} placeholder="Address or nearby landmark" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></div><div className="self-end rounded-lg bg-white px-3 py-2 text-[10px] font-semibold text-slate-500">{lat !== null && lng !== null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "No point selected"}</div></div>
  </section>;
}
