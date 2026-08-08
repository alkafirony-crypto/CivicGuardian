export const DHAKA_SERVICE_BOUNDS={minLat:23.60,maxLat:24.02,minLng:90.25,maxLng:90.55} as const;
export function insideDhakaServiceArea(lat:number,lng:number){const b=DHAKA_SERVICE_BOUNDS;return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=b.minLat&&lat<=b.maxLat&&lng>=b.minLng&&lng<=b.maxLng;}
