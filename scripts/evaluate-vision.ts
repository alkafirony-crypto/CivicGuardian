import fs from "fs";
import path from "path";
import { analyzeVisionAgent } from "../src/services/gemini";
type Row={image:string;description:string;title?:string;expectedCategory:string;expectedSeverity:string};
const input=process.argv[2];
if(!input){console.error("Usage: npm run eval:vision -- evaluation/dhaka-vision.json");process.exit(1);}
const rows:Row[]=JSON.parse(fs.readFileSync(input,"utf8"));
let categoryHits=0,severityHits=0,reviewFlags=0,confidence=0;
for(const row of rows){
 const imagePath=path.resolve(path.dirname(input),row.image);const ext=path.extname(imagePath).toLowerCase();const mime=ext===".png"?"image/png":"image/jpeg";
 const image=`data:${mime};base64,${fs.readFileSync(imagePath).toString("base64")}`;const r=await analyzeVisionAgent(image,row.description,row.title,1);
 categoryHits+=Number(r.issueType===row.expectedCategory);severityHits+=Number(r.severity===row.expectedSeverity);reviewFlags+=Number(!!r.needsHumanReview);confidence+=r.confidenceScore;
}
const pct=(n:number)=>rows.length?`${(100*n/rows.length).toFixed(1)}%`:"n/a";
console.log(JSON.stringify({examples:rows.length,categoryAccuracy:pct(categoryHits),severityAgreement:pct(severityHits),humanReviewRate:pct(reviewFlags),averageConfidence:rows.length?Number((confidence/rows.length).toFixed(1)):0},null,2));
