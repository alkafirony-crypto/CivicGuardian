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

const DHAKA_CENTER: [number, number] = [23.8103, 90.4125];
const DHAKA_BOUNDS: L.LatLngBoundsExpression = [[23.60, 90.25], [24.02, 90.55]];
const pin = L.divIcon({className:"",html:'<span style="display:block;width:22px;height:22px;border:4px solid white;border-radius:50%;background:#0f766e;box-shadow:0 2px 10px #0f172a55"></span>',iconSize:[22,22],iconAnchor:[11,11]});

function PickOnMap({onPick}:{onPick:(lat:number,lng:number)=>void}) {
  useMapEvents({click(e){onPick(e.latlng.lat,e.latlng.lng);}});
  return null;
}
function FollowSelection({position,zoom}:{position:[number,number];zoom:number}){const map=useMap();useEffect(()=>{map.flyTo(position,zoom,{duration:.55});setTimeout(()=>map.invalidateSize(),0);},[map,position,zoom]);return null;}

export default function LocationPicker({lat,lng,onChange,address,setAddress}:Props){
  const [busy,setBusy]=useState(false);
  const [query,setQuery]=useState("");
  const [results,setResults]=useState<Array<{display_name:string;lat:string;lon:string}>>([]);
  const [error,setError]=useState("");
  const position=useMemo<[number,number]>(()=>lat!==null&&lng!==null?[lat,lng]:DHAKA_CENTER,[lat,lng]);

  const reverse=async(nextLat:number,nextLng:number)=>{
    setError("");
    try{
      const r=await fetch(`/api/geocode/reverse?lat=${encodeURIComponent(nextLat)}&lng=${encodeURIComponent(nextLng)}`);
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Address lookup failed");
      onChange(nextLat,nextLng,d.displayName||undefined);
    }catch{ onChange(nextLat,nextLng); setError("Location selected. Address lookup is temporarily unavailable, so please enter the address manually."); }
  };

  const locate=()=>{
    if(!navigator.geolocation){setError("This browser does not support location access.");return;}
    setBusy(true);setError("");
    navigator.geolocation.getCurrentPosition(p=>{setBusy(false);void reverse(p.coords.latitude,p.coords.longitude);},e=>{setBusy(false);setError(`Could not access your location: ${e.message}`);},{enableHighAccuracy:true,timeout:10000});
  };

  const search=async(e:React.FormEvent)=>{
    e.preventDefault(); if(query.trim().length<2)return;
    setBusy(true);setError("");
    try{const r=await fetch(`/api/geocode/search?q=${encodeURIComponent(query.trim())}`);const d=await r.json();if(!r.ok)throw new Error(d.error);const rows=d.results||[];setResults(rows);if(rows[0]){const a=Number(rows[0].lat),b=Number(rows[0].lon);setAddress(rows[0].display_name);onChange(a,b,rows[0].display_name);}else setError("No matching location was found inside the Dhaka service area.");}catch{setError("Address search is temporarily unavailable. You can still click the map or use GPS.");}finally{setBusy(false);}
  };

  useEffect(()=>{ if(address && !query) setQuery(address); },[address]);

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-200 p-5">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><MapPin className="h-4 w-4 text-teal-700"/>Choose the incident location</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">Search anywhere in Dhaka, use your device location, or click the exact point on the map. Hazard type never determines location.</p>
      <form onSubmit={search} className="mt-4 flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search a road, landmark or area in Dhaka" className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-teal-700"/></div><button disabled={busy} className="rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:border-teal-600 disabled:opacity-50">Search</button><button type="button" onClick={locate} disabled={busy} className="flex items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50"><Crosshair className="h-4 w-4"/><span className="hidden sm:inline">My location</span></button></form>
      {results.length>1&&<div className="relative z-[700] mt-2 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"><div className="px-3 pt-2 text-[10px] font-black uppercase tracking-wider text-slate-400">Other matches</div>{results.slice(1).map((r,i)=><button type="button" key={`${r.lat}-${r.lon}-${i}`} onClick={()=>{const a=Number(r.lat),b=Number(r.lon);setAddress(r.display_name);setResults([]);onChange(a,b,r.display_name);}} className="block w-full border-b border-slate-100 px-3 py-2.5 text-left text-xs leading-5 text-slate-700 hover:bg-teal-50">{r.display_name}</button>)}</div>}
      {error&&<p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</p>}
    </div>
    <div className="relative z-0 h-[360px] w-full overflow-hidden"><MapContainer center={position} zoom={lat?15:11} maxBounds={DHAKA_BOUNDS} minZoom={10} style={{height:"100%",width:"100%",position:"relative",zIndex:0}} scrollWheelZoom>
      <TileLayer attribution='&copy; OpenStreetMap contributors &copy; CARTO' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"/>
      <FollowSelection position={position} zoom={lat?15:11}/>
      <PickOnMap onPick={(a,b)=>void reverse(a,b)}/>{lat!==null&&lng!==null&&<Marker position={[lat,lng]} icon={pin}/>} 
    </MapContainer></div>
    <div className="grid gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_auto]"><div><label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Selected address</label><input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Address or nearby landmark" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></div><div className="self-end rounded-lg bg-white px-3 py-2 text-[11px] font-semibold text-slate-500">{lat!==null&&lng!==null?`${lat.toFixed(5)}, ${lng.toFixed(5)}`:"No point selected"}</div></div>
  </section>;
}
