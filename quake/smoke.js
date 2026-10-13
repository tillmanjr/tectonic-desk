const {JSDOM,VirtualConsole}=require("jsdom");const fs=require("fs");
let html=fs.readFileSync("tectonic-desk.html","utf8")
 .replace(/<script src="[^"]*d3[^"]*"><\/script>/,()=>"<script>"+fs.readFileSync("node_modules/d3/dist/d3.min.js","utf8")+"</script>")
 .replace(/<script src="[^"]*topojson[^"]*"><\/script>/,()=>"<script>"+fs.readFileSync("node_modules/topojson/dist/topojson.min.js","utf8")+"</script>");
const vc=new VirtualConsole();const errs=[];vc.on("jsdomError",e=>errs.push(e.message+" "+(e.detail&&e.detail.stack||"").split("\n").slice(0,3).join("|")));vc.on("error",e=>errs.push(String(e)));
const dom=new JSDOM("<!doctype html><html><head></head><body>"+html+"</body></html>",{runScripts:"dangerously",virtualConsole:vc,pretendToBeVisual:true,beforeParse(w){
  w.matchMedia=()=>({matches:false,addEventListener(){}});
  w.HTMLCanvasElement.prototype.getContext=function(){return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},beginPath(){},arc(){},stroke(){},fill(){},fillText(){},set font(v){},set textAlign(v){},set textBaseline(v){},set lineWidth(v){},set strokeStyle(v){},set fillStyle(v){}}};
  w.HTMLCanvasElement.prototype.toDataURL=()=>"data:image/png;base64,x";
  w.SVGElement.prototype.getBBox=()=>({x:0,y:0,width:10,height:10});
}});
setTimeout(()=>{const d=dom.window.document;
 console.log("errors:",errs.length?errs:"none");
 console.log("stats:",d.querySelector("#stats").textContent.replace(/\s+/g," ").trim());
 console.log("major cards:",d.querySelectorAll(".mcard").length,"| first:",d.querySelector(".mcard")&&d.querySelector(".mcard").textContent.replace(/\s+/g," ").trim().slice(0,200));
 console.log("circles:",d.querySelectorAll("#map circle").length,"beachballs:",d.querySelectorAll("#map g.bb").length,"plate paths:",d.querySelectorAll("#map g path").length);
 console.log("rows:",d.querySelectorAll("#cat tbody tr").length);
 console.log("cap-gr:",d.querySelector("#cap-gr").textContent.slice(0,80), "| b:", d.querySelector("#c-gr text:last-of-type")&&[...d.querySelectorAll("#c-gr text")].pop().textContent);
 console.log("cap-time:",d.querySelector("#cap-time").textContent);
 // open detail on M7.7
 d.querySelector(".mcard").click();
 console.log("detail:",d.querySelector("#d-body").textContent.replace(/\s+/g," ").slice(0,700));
 // switch region
 d.querySelector("#tab-wc").click();
 setTimeout(()=>{console.log("WC stats:",d.querySelector("#stats").textContent.replace(/\s+/g," ").trim());
  console.log("WC circles:",d.querySelectorAll("#map circle").length,"bb:",d.querySelectorAll("#map g.bb").length,"b:",[...d.querySelectorAll("#c-gr text")].pop().textContent);
  const r=[...d.querySelectorAll("#cat tbody tr")].find(t=>t.dataset.id==="nc75444322");r.click();
  console.log("WC detail:",d.querySelector("#d-body").textContent.replace(/\s+/g," ").slice(0,500));
  console.log("errors after:",errs.length?errs:"none");process.exit(0);},500);
},1500);
