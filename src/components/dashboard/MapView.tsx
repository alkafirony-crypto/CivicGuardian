import React, { useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { Crosshair, MapPin, Search, ShieldCheck } from "lucide-react";
import { categoryOptions } from "../../config/civicCategories";
import type { CivicIssue } from "../../types";
import "leaflet/dist/leaflet.css";

const BANGLADESH_CENTER: [number, number] = [23.685, 90.3563];
const BANGLADESH_BOUNDS: L.LatLngBoundsExpression = [[20.55, 88.0], [26.7, 92.75]];
const colors: Record<string, string> = { Critical: "#dc2626", High: "#ea580c", Medium: "#d97706", Low: "#0f766e", Unassessed: "#64748b" };
const marker = (severity: string) => L.divIcon({ className: "", html: `<span style="display:block;width:20px;height:20px;border:3px solid white;border-radius:999px;background:${colors[severity] || colors.Medium};box-shadow:0 2px 9px #0f172a55"></span>`, iconSize: [20, 20], iconAnchor: [10, 10] });
const searchMarker = L.divIcon({ className: "", html: '<span style="display:block;width:25px;height:25px;border:5px solid white;border-radius:999px;background:#0284c7;box-shadow:0 3px 14px #0f172a66"></span>', iconSize: [25, 25], iconAnchor: [12, 12] });

type SearchResult = { display_name: string; lat: string; lon: string; type?: string; addressType?: string; zoom?: number };

function inBangladeshBounds(lat: number, lng: number) {
  return lat >= 20.55 && lat <= 26.7 && lng >= 88 && lng <= 92.75;
}

function Locate({ onError }: { onError: (message: string) => void }) {
  const map = useMap();
  const locate = () => {
    if (!navigator.geolocation) { onError("This browser does not support location access."); return; }
    navigator.geolocation.getCurrentPosition(position => {
      const point: [number, number] = [position.coords.latitude, position.coords.longitude];
      if (!inBangladeshBounds(point[0], point[1])) { onError("Your current location is outside the Bangladesh service area."); return; }
      onError("");
      map.setView(point, 16, { animate: false });
    }, () => onError("Location permission was not granted. You can still search the map."), { enableHighAccuracy: true, timeout: 10_000 });
  };
  return <button type="button" onClick={locate} className="absolute right-3 top-3 z-[500] flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow"><Crosshair className="h-3.5 w-3.5 text-teal-700" />My location</button>;
}

function FocusSearch({ point, zoom }: { point: [number, number] | null; zoom: number }) {
  const map = useMap();
  React.useEffect(() => {
    if (!point) return;
    map.setView(point, zoom, { animate: false });
    window.setTimeout(() => map.invalidateSize(), 0);
  }, [map, point, zoom]);
  return null;
}

export default function MapView({ issues, onSelectIssue }: { issues: CivicIssue[]; onSelectIssue: (issue: CivicIssue) => void }) {
  const [category, setCategory] = useState("All");
  const [severity, setSeverity] = useState("All");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchPoint, setSearchPoint] = useState<[number, number] | null>(null);
  const [searchZoom, setSearchZoom] = useState(15);
  const [placeName, setPlaceName] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const categories = useMemo(() => categoryOptions(issues.map(issue => issue.category)), [issues]);
  React.useEffect(() => { if (!categories.includes(category)) setCategory("All"); }, [categories, category]);
  const filtered = useMemo(() => issues.filter(issue => (category === "All" || issue.category === category) && (severity === "All" || (issue.analysis?.vision?.severity || "Medium") === severity)), [issues, category, severity]);

  const chooseResult = (result: SearchResult) => {
    const point: [number, number] = [Number(result.lat), Number(result.lon)];
    setSearchPoint(point);
    setSearchZoom(result.zoom || 15);
    setPlaceName(result.display_name);
    setSearchError("");
  };

  const searchPlace = async (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true); setSearchError("");
    try {
      const response = await fetch(`/api/geocode/search?q=${encodeURIComponent(query.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const rows: SearchResult[] = data.results || [];
      setResults(rows);
      if (!rows[0]) { setSearchError("No matching location was found in Bangladesh. Add the area, city, or district and try again."); setSearchPoint(null); setPlaceName(""); return; }
      chooseResult(rows[0]);
    } catch {
      setSearchError("Location search is temporarily unavailable. Please try again.");
    } finally { setSearching(false); }
  };

  return <div className="grid min-w-0 gap-3 lg:grid-cols-[230px_minmax(0,1fr)]">
    <aside className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.15em] text-sky-700"><ShieldCheck className="h-3.5 w-3.5" />Bangladesh coverage</div>
      <h3 className="mt-1.5 text-base font-black text-slate-900">Live hazard map</h3>
      <p className="mt-1 text-[11px] leading-5 text-slate-500">Search any Bangladesh road, road number, landmark, area, city, or district. The best result is marked and zoomed immediately.</p>
      <form onSubmit={searchPlace} className="mt-4 space-y-2">
        <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Road 12, Dhanmondi, Dhaka" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-sky-600" /></div>
        <button disabled={searching || query.trim().length < 2} className="w-full rounded-lg bg-sky-700 px-3 py-2 text-[11px] font-black text-white hover:bg-sky-600 disabled:opacity-40">{searching ? "Searching..." : "Find and zoom"}</button>
      </form>
      {placeName && <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-[11px] leading-4 text-sky-950"><strong>Marked:</strong> {placeName}</div>}
      {results.length > 1 && <div className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white"><div className="px-2.5 pt-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Other matches</div>{results.slice(1, 6).map((result, index) => <button type="button" key={`${result.lat}-${result.lon}-${index}`} onClick={() => chooseResult(result)} className="block w-full border-b border-slate-100 px-2.5 py-2 text-left text-[10px] leading-4 text-slate-600 hover:bg-sky-50">{result.display_name}</button>)}</div>}
      {searchError && <div className="mt-3 text-[11px] leading-4 text-red-600" role="alert">{searchError}</div>}
      <label className="mt-4 block text-[9px] font-bold uppercase tracking-wider text-slate-400">Category</label>
      <select value={category} onChange={event => setCategory(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">{categories.map(item => <option key={item} value={item}>{item}</option>)}</select>
      <label className="mt-3 block text-[9px] font-bold uppercase tracking-wider text-slate-400">Severity</label>
      <select value={severity} onChange={event => setSeverity(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">{["All", "Critical", "High", "Medium", "Low"].map(item => <option key={item} value={item}>{item}</option>)}</select>
      <div className="mt-4 rounded-lg bg-sky-50 p-2.5 text-[11px] text-sky-900"><strong>{filtered.length}</strong> visible reports in the current filters.</div>
    </aside>
    <div className="relative z-0 h-[460px] min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
      <MapContainer center={BANGLADESH_CENTER} zoom={7} maxBounds={BANGLADESH_BOUNDS} maxBoundsViscosity={0.85} minZoom={6} style={{ height: "100%", width: "100%", position: "relative", zIndex: 0 }} scrollWheelZoom>
        <TileLayer attribution='&copy; OpenStreetMap contributors &copy; CARTO' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
        <Locate onError={setSearchError} />
        <FocusSearch point={searchPoint} zoom={searchZoom} />
        {searchPoint && <Marker position={searchPoint} icon={searchMarker}><Popup><strong>{placeName || "Search result"}</strong></Popup></Marker>}
        {filtered.filter(issue => issue.lat !== undefined && issue.lng !== undefined).map(issue => { const issueSeverity = issue.analysis?.vision?.severity || "Unassessed"; return <Marker key={issue.id} position={[issue.lat!, issue.lng!]} icon={marker(issueSeverity)}><Popup><div className="min-w-52"><div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colors[issueSeverity] }}>{issueSeverity} · {issue.category}</div><strong className="mt-1 block text-sm">{issue.title}</strong><div className="mt-1 flex gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3 shrink-0" />{issue.address}</div><button type="button" onClick={() => onSelectIssue(issue)} className="mt-3 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-bold text-white">Open report</button></div></Popup></Marker>; })}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] max-w-[calc(100%-1.5rem)] rounded-lg bg-white/95 px-3 py-2 text-[9px] font-semibold text-slate-500 shadow">Bangladesh service view · English place search · Map data © OpenStreetMap contributors, CARTO</div>
    </div>
  </div>;
}
