import {describe,expect,it} from "vitest";
import {validateVisionResult} from "./gemini";
const valid={issueType:"Road Damage",severity:"High",confidenceScore:82,safetyRisk:"Visible surface break may pose a traffic hazard.",priority:"High",description:"Road surface damage is visible.",observedEvidence:["Broken road surface"],imageQuality:"Good",needsHumanReview:false};
describe("Gemini structured output safety",()=>{
 it("accepts a complete allowed result",()=>expect(validateVisionResult(valid)).toBe(true));
 it("rejects invented category and out-of-range confidence",()=>{expect(validateVisionResult({...valid,issueType:"Alien attack"})).toBe(false);expect(validateVisionResult({...valid,confidenceScore:140})).toBe(false);});
});
