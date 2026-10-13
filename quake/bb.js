const R=Math.PI/180;
function sdrToM(s,d,r){s*=R;d*=R;r*=R;const sd=Math.sin(d),cd=Math.cos(d),s2d=Math.sin(2*d),c2d=Math.cos(2*d),sr=Math.sin(r),cr=Math.cos(r),ss=Math.sin(s),cs=Math.cos(s),s2s=Math.sin(2*s),c2s=Math.cos(2*s);
return [[-(sd*cr*s2s+s2d*sr*ss*ss), sd*cr*c2s+0.5*s2d*sr*s2s, -(cd*cr*cs+c2d*sr*ss)],
[0, sd*cr*s2s-s2d*sr*cs*cs, -(cd*cr*ss-c2d*sr*cs)],[0,0,s2d*sr]].map((row,i,a)=>row);}
function full(m){return [[m[0][0],m[0][1],m[0][2]],[m[0][1],m[1][1],m[1][2]],[m[0][2],m[1][2],m[2][2]]];}
function axv(az,pl){az*=R;pl*=R;return [Math.cos(pl)*Math.cos(az),Math.cos(pl)*Math.sin(az),Math.sin(pl)];}
function axesToM(ta,tp,pa,pp){const t=axv(ta,tp),p=axv(pa,pp);return [0,1,2].map(i=>[0,1,2].map(j=>t[i]*t[j]-p[i]*p[j]));}
function planeFrom(n,d){if(n[2]>0){n=n.map(x=>-x);d=d.map(x=>-x);}const dip=Math.acos(-n[2]);let st=Math.atan2(-n[0],n[1]);if(st<0)st+=2*Math.PI;
const sl=-d[2]/Math.sin(dip),cl=d[0]*Math.cos(st)+d[1]*Math.sin(st);return [st/R,dip/R,Math.atan2(sl,cl)/R];}
function axesToPlanes(ta,tp,pa,pp){const t=axv(ta,tp),p=axv(pa,pp);const n=t.map((x,i)=>(x+p[i])/Math.SQRT2),d=t.map((x,i)=>(x-p[i])/Math.SQRT2);return [planeFrom(n,d),planeFrom(d,n)];}
module.exports={sdrToM,full,axesToM,axesToPlanes};
