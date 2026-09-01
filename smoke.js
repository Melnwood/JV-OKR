/* Headless smoke test — run before every commit:  node smoke.js
   Stubs the DOM, loads the app script, seeds mock data, renders every view.
   Prints which view throws, if any. Not a real browser — CSS/SVG-coordinate
   errors won't surface here, but JS runtime errors in view functions will. */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const body = html.match(/<script>([\s\S]*)<\/script>/)[1];
const el = () => ({innerHTML:"",className:"",style:{},dataset:{},setAttribute(){},
  classList:{add(){},remove(){},toggle(){},contains(){return false}},
  appendChild(){},append(){},insertAdjacentHTML(){},querySelectorAll:()=>[],
  querySelector:()=>null,closest:()=>null,focus(){},setSelectionRange(){},
  addEventListener(){},onclick:null,onchange:null,oninput:null,value:"",
  textContent:"",checked:false,remove(){},setPointerCapture(){},
  getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})});
global.document={getElementById:()=>el(),querySelectorAll:()=>[],querySelector:()=>null,
  addEventListener(){},createElement:()=>el(),body:el()};
global.window={};global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.fetch=()=>Promise.resolve({json:()=>({}),ok:true,text:()=>""});
global.scrollTo=()=>{};global.setTimeout=()=>{};global.setInterval=()=>0;global.clearInterval=()=>{};
global.google={accounts:{id:{initialize(){},renderButton(){},disableAutoSelect(){}}}};
new Function(body + `;globalThis.__V=V;globalThis.__LENS=LENS;globalThis.__DB=DB;globalThis.__A=a=>{AUTH=a};globalThis.__M=m=>{ME=m}`)();

const u={id:"u",fields:{Name:"Poland",Type:"Country",Active:true}};
const jv={id:"jv",fields:{Title:"JV 2030",Scope:"JV 5-year"}};
const k0={id:"k0",fields:{Title:"JV KR1",Objective:["jv"],"Current value":42,"Target value":80,Progress:.53,Confidence:"On track"}};
const o={id:"o",fields:{Title:"Coach team leads",Scope:"Country","Org Unit":["u"],"Parent Key Result":["k0"],Alignment:"Ladders to a JV key result",Owner:["p"],Confidence:"On track",Progress:.62,Cycle:["c"]}};
const k1={id:"k1",fields:{Title:"Leads with a plan",Objective:["o"],"Current value":8,"Target value":12,Progress:.67,Confidence:"On track"}};
const t1={id:"t1",fields:{Title:"Sit with each lead",Status:"Open","Key Result":["k1"],Owner:["p"],"Due date":"2026-08-05"}};
const o2={id:"o2",fields:{Title:"Build intern pipeline",Scope:"Country","Org Unit":["u"],Alignment:"Standalone",Owner:["p"],Confidence:"On track",Progress:.3,Cycle:["c"]}};
const p={id:"p",fields:{Name:"Mel",Role:"Executive","Org Unit":["u"]}};
const c={id:"c",fields:{Name:"FY2026",Type:"Annual"}};
Object.assign(global.__DB,{people:[p],cycles:[c],units:[u],objectives:[jv,o,o2],krs:[k0,k1],tasks:[t1],checkins:[],reviews:[],responses:[],decisions:[],notes:[],resources:[],shares:[]});
global.__A({id:"p",name:"Mel",role:"Executive"});global.__M(p);

let ok=true;
for(const n of ["jv","okrs","objective","mine","team","teamcheckin","meetings","org","archive","coaching","checkin","reviews"]){
  try{ global.__V[n](); process.stdout.write(n+" ✓ "); }
  catch(e){ ok=false; console.log("\n"+n+" ✗ "+e.message); }
}
for(const n of ["dashboard","map","browse"]){
  try{ global.__LENS[n](); process.stdout.write("lens:"+n+" ✓ "); }
  catch(e){ ok=false; console.log("\nlens:"+n+" ✗ "+e.message); }
}
console.log("\n"+(ok?"ALL VIEWS RENDER":"SOME FAILED"));
process.exit(ok?0:1);
