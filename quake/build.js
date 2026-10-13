const fs=require("fs");
const data=fs.readFileSync("catalog.js","utf8")+
"\nconst WORLD="+fs.readFileSync("node_modules/world-atlas/countries-50m.json","utf8")+
";\nconst WCLAND="+fs.readFileSync("wc_land.json","utf8")+
";\nconst WCSTATES="+fs.readFileSync("wc_states.json","utf8")+
";\nconst PLATES="+fs.readFileSync("plates.json","utf8")+";\n";
const out=fs.readFileSync("template.html","utf8").replace("/*__DATA__*/",()=>data);
fs.writeFileSync("tectonic-desk.html",out);console.log(out.length);
