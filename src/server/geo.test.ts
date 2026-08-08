import {describe,expect,it} from "vitest";
import {insideDhakaServiceArea} from "./geo";
describe("Dhaka geographic boundary",()=>{
 it("accepts points across the north, central, east, west and south service area",()=>{for(const p of [[23.8759,90.3795],[23.8103,90.4125],[23.7806,90.4255],[23.7662,90.3589],[23.7104,90.4074]])expect(insideDhakaServiceArea(p[0],p[1])).toBe(true);});
 it("rejects coordinates outside configured Dhaka coverage",()=>{expect(insideDhakaServiceArea(24.45,90.78)).toBe(false);expect(insideDhakaServiceArea(22.36,91.78)).toBe(false);});
});
