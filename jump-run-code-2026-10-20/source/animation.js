/* Deterministic two-bone skinning. The original artwork is the only character texture. */
(() => {
  'use strict';
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d', { alpha: true });
  const W=1280,H=720,DURATION=6.4,FLOOR=610,TAU=Math.PI*2;
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,p)=>a+(b-a)*p;
  const mix=(a,b,p)=>[lerp(a[0],b[0],p),lerp(a[1],b[1],p)];
  const smooth=p=>{p=clamp(p);return p*p*(3-2*p);};
  const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const frac=x=>x-Math.floor(x);
  const plus=(a,b)=>[a[0]+b[0],a[1]+b[1]];
  const polar=(a,l)=>[Math.cos(a)*l,Math.sin(a)*l];
  const assets={};
  const names=['character','body','rear-leg','front-leg','rear-arm','front-arm'];
  const ready=Promise.all(names.map(name=>new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>{assets[name]=image;resolve();};
    image.onerror=()=>reject(new Error('Missing character layer: '+name));
    image.src=(window.spriteAssetUrls||{})[name]||'assets/'+name+'.png';
  })));
  const sourceRig={
    'rear-leg':{joints:[[126,195],[82,219],[44,248],[60,279]]},
    'front-leg':{joints:[[133,195],[169,219],[187,259],[230,253]]},
    'rear-arm':{joints:[[108,117],[75,121],[46,150]]},
    'front-arm':{joints:[[181,150],[204,174],[243,153]]},
  };
  const meshes={};
  function makeMesh(name){
    const image=assets[name],tmp=document.createElement('canvas');
    tmp.width=image.width;tmp.height=image.height;
    const tc=tmp.getContext('2d');tc.drawImage(image,0,0);
    const pixels=tc.getImageData(0,0,tmp.width,tmp.height).data,mesh=[],step=9;
    for(let y=0;y<tmp.height;y+=step)for(let x=0;x<tmp.width;x+=step){
      const x2=Math.min(x+step,tmp.width),y2=Math.min(y+step,tmp.height);let used=false;
      for(let yy=y;yy<y2&&!used;yy++)for(let xx=x;xx<x2;xx++)if(pixels[(yy*tmp.width+xx)*4+3]>0){used=true;break;}
      if(!used)continue;
      const a=[x,y],b=[x2,y],c=[x2,y2],d=[x,y2];mesh.push([a,b,c],[a,c,d]);
    }
    return mesh;
  }
  function transformBone(point,fromA,fromB,toA,toB){
    const sa=Math.atan2(fromB[1]-fromA[1],fromB[0]-fromA[0]);
    const ta=Math.atan2(toB[1]-toA[1],toB[0]-toA[0]);
    const ratio=dist(toA,toB)/dist(fromA,fromB),a=ta-sa,c=Math.cos(a)*ratio,s=Math.sin(a)*ratio;
    const x=point[0]-fromA[0],y=point[1]-fromA[1];
    return[toA[0]+x*c-y*s,toA[1]+x*s+y*c];
  }
  function projection(point,a,b){
    const dx=b[0]-a[0],dy=b[1]-a[1];
    return clamp(((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy));
  }
  function skinPoint(point,original,target){
    let bone=0,best=Infinity;
    for(let i=0;i<original.length-1;i++){
      const q=mix(original[i],original[i+1],projection(point,original[i],original[i+1]));
      const d=dist(point,q);if(d<best){best=d;bone=i;}
    }
    let mapped=transformBone(point,original[bone],original[bone+1],target[bone],target[bone+1]);
    for(let joint=1;joint<original.length-1;joint++){
      const p=original[joint],before=original[joint-1],after=original[joint+1];
      const axis=[after[0]-before[0],after[1]-before[1]],len=Math.hypot(...axis);
      const signed=((point[0]-p[0])*axis[0]+(point[1]-p[1])*axis[1])/len,radius=joint===2?8:13;
      if(Math.abs(signed)<radius&&dist(point,p)<34){
        const a=transformBone(point,before,p,target[joint-1],target[joint]);
        const b=transformBone(point,p,after,target[joint],target[joint+1]);
        mapped=mix(a,b,smooth((signed+radius)/(radius*2)));
      }
    }
    return mapped;
  }
  function triangle(image,s,d){
    const[a,b,c]=s,[u,v,w]=d;
    const det=a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]);if(Math.abs(det)<1e-8)return;
    const m=z=>[
      (z[0]*(b[1]-c[1])+z[1]*(c[1]-a[1])+z[2]*(a[1]-b[1]))/det,
      (z[0]*(c[0]-b[0])+z[1]*(a[0]-c[0])+z[2]*(b[0]-a[0]))/det,
      (z[0]*(b[0]*c[1]-c[0]*b[1])+z[1]*(c[0]*a[1]-a[0]*c[1])+z[2]*(a[0]*b[1]-b[0]*a[1]))/det
    ];
    const mx=m([u[0],v[0],w[0]]),my=m([u[1],v[1],w[1]]);
    const center=[(u[0]+v[0]+w[0])/3,(u[1]+v[1]+w[1])/3];
    const expanded=d.map(p=>{const l=dist(p,center)||1;return[p[0]+(p[0]-center[0])*.85/l,p[1]+(p[1]-center[1])*.85/l];});
    ctx.save();ctx.beginPath();ctx.moveTo(...expanded[0]);ctx.lineTo(...expanded[1]);ctx.lineTo(...expanded[2]);ctx.closePath();ctx.clip();
    ctx.transform(mx[0],my[0],mx[1],my[1],mx[2],my[2]);ctx.drawImage(image,0,0);ctx.restore();
  }
  function layer(name,target){
    const original=sourceRig[name].joints,cache=new Map();
    for(const tri of meshes[name]){
      const dest=tri.map(p=>{const key=p.join(',');if(!cache.has(key))cache.set(key,skinPoint(p,original,target));return cache.get(key);});
      triangle(assets[name],tri,dest);
    }
  }
  function ik(hip,ankle,l1,l2){
    const d=clamp(dist(hip,ankle),1,l1+l2-.2),a=Math.atan2(ankle[1]-hip[1],ankle[0]-hip[0]);
    const offset=Math.acos(clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1));return plus(hip,polar(a-offset,l1));
  }
  function legPose(name,phase,jump){
    const ref=sourceRig[name].joints,hip=ref[0],p=frac(phase),stance=.56,near=name==='front-leg',ankleBase=near?269:281;let ankle,angle;
    if(p<stance){const q=p/stance;ankle=[hip[0]+lerp(44,-44,q),ankleBase];angle=lerp(-.12,.16,q);}
    else{const q=(p-stance)/(1-stance);ankle=[hip[0]+lerp(-44,44,smooth(q)),ankleBase-45*Math.sin(Math.PI*q)];angle=-.12-.5*Math.sin(Math.PI*q);}
    const tuck=[hip[0]+(near?23:-33),hip[1]+(near?51:57)];
    ankle=mix(ankle,tuck,jump);angle=lerp(angle,near?-.25:.24,jump);
    const knee=ik(hip,ankle,dist(ref[0],ref[1]),dist(ref[1],ref[2]));
    return[hip,knee,ankle,plus(ankle,polar(angle,dist(ref[2],ref[3])))];
  }
  function armPose(name,phase,jump){
    const ref=sourceRig[name].joints,near=name==='front-arm',swing=Math.cos(phase*TAU+(near?0:Math.PI));
    let a=(98+48*swing)*Math.PI/180,b=a-(near?105:115)*Math.PI/180;
    a=lerp(a,near?.18:2.05,jump);b=lerp(b,near?-.7:3.6,jump);
    const elbow=plus(ref[0],polar(a,dist(ref[0],ref[1])));
    return[ref[0],elbow,plus(elbow,polar(b,dist(ref[1],ref[2])))];
  }
  function polygon(points,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);ctx.closePath();ctx.fill();}
  function scene(t){
    ctx.fillStyle='#f5efdf';ctx.fillRect(0,0,W,H);
    for(let i=0;i<6;i++){
      const x=((i*283-t*19+180)%1600+1600)%1600-180,y=70+(i%3)*48;
      ctx.fillStyle='#fffaf0';ctx.fillRect(x,y,104,18);ctx.fillRect(x+24,y-18,56,18);ctx.fillRect(x+14,y+18,120,12);
    }
    ctx.fillStyle='#e4dcc6';ctx.beginPath();ctx.moveTo(0,480);
    for(let x=-300;x<1600;x+=90){const n=Math.floor((x+t*18)/90);ctx.lineTo(x,385+(n%4)*22);ctx.lineTo(x+45,385+(n%4)*22);}
    ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill();
    for(let i=-1;i<6;i++){const x=i*360-(t*48)%360;polygon([[x,560],[x+50,490],[x+90,490],[x+90,450],[x+170,450],[x+170,480],[x+210,480],[x+270,560]],'#dfd2b5');}
    ctx.fillStyle='#c5c5a1';ctx.fillRect(0,574,W,36);
    for(let i=-1;i<22;i++){const x=i*77-(t*110)%77;ctx.fillStyle='#a8b38a';ctx.fillRect(x,590,34,20);ctx.fillRect(x+9,581,7,12);}
    ctx.fillStyle='#4d3630';ctx.fillRect(0,FLOOR+12,W,H-FLOOR-12);ctx.fillStyle='#7a8c64';ctx.fillRect(0,FLOOR,W,12);ctx.fillStyle='#99a67b';ctx.fillRect(0,FLOOR,W,4);
    for(let i=-1;i<20;i++){
      const x=i*83-(t*260)%83;ctx.fillStyle='#725449';ctx.fillRect(x,FLOOR+26,57,23);ctx.fillStyle='#62463e';ctx.fillRect(x+29,FLOOR+61,54,17);ctx.fillStyle='#a2876c';ctx.fillRect(x+9,FLOOR+29,8,5);
    }
    const x=1270-t*260;ctx.fillStyle='#4d3630';ctx.fillRect(x,FLOOR-57,68,57);ctx.fillStyle='#a17e53';ctx.fillRect(x+5,FLOOR-52,58,48);ctx.fillStyle='#c5a26b';ctx.fillRect(x+5,FLOOR-52,58,8);ctx.fillStyle='#79583e';ctx.fillRect(x+12,FLOOR-33,44,6);ctx.fillRect(x+29,FLOOR-43,8,31);
  }
  function dust(t,x,landing){
    if(landing>0){
      for(let i=0;i<7;i++){const age=t-3.46;if(age<0||age>.45)continue;const dx=(i%2?1:-1)*(18+age*(90+i*18));ctx.globalAlpha=(1-age/.45)*.7;ctx.fillStyle='#c5ad87';ctx.fillRect(x+dx,FLOOR-5-age*30-i%3*4,7+i%3*3,7);ctx.globalAlpha=1;}
    }else if(t<2.13||t>3.65){
      for(let i=0;i<3;i++){const q=frac(t*3.125+i*.33);ctx.globalAlpha=(1-q)*.4;ctx.fillStyle='#b5a17e';ctx.fillRect(x-70-q*70,FLOOR-3-q*14,5,5);ctx.globalAlpha=1;}
    }
  }
  function draw(t,transparent=false){
    t=clamp(t,0,DURATION);ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);ctx.imageSmoothingEnabled=false;if(!transparent)scene(t);
    const airborne=t>=2.26&&t<=3.46,u=clamp((t-2.26)/1.2);
    const airHeight=airborne?166*4*u*(1-u):0,tuck=airborne?Math.pow(Math.sin(Math.PI*u),.65):0;
    const prep=(t>2.08&&t<2.26)?Math.sin((t-2.08)/.18*Math.PI):0,land=(t>3.46&&t<3.7)?Math.sin((t-3.46)/.24*Math.PI):0;
    const phase=t/.64,bob=airborne?0:-4*Math.cos(phase*TAU*2),heroX=500+16*t,scale=1.37;
    const hipY=FLOOR-(297-195)*scale-airHeight+prep*13+land*14+bob;
    if(!transparent){ctx.globalAlpha=lerp(.18,.065,airHeight/166);ctx.fillStyle='#4d3630';ctx.beginPath();ctx.ellipse(heroX+10,FLOOR-2,lerp(72,46,airHeight/166),9,0,0,TAU);ctx.fill();ctx.globalAlpha=1;dust(t,heroX,land);}
    ctx.save();ctx.translate(heroX,hipY);ctx.scale(scale,scale);ctx.translate(-139,-195);
    const blend=smooth(t/.2),target=(name,p)=>sourceRig[name].joints.map((v,i)=>mix(v,p[i],blend));
    layer('rear-arm',target('rear-arm',armPose('rear-arm',phase,tuck)));
    layer('rear-leg',target('rear-leg',legPose('rear-leg',phase+.5,tuck)));
    layer('front-leg',target('front-leg',legPose('front-leg',phase,tuck)));
    ctx.fillStyle='#46302f';ctx.beginPath();ctx.ellipse(119,137,27,31,-.18,0,TAU);ctx.fill();
    ctx.drawImage(assets.body,0,0);layer('front-arm',target('front-arm',armPose('front-arm',phase,tuck)));ctx.restore();
    window.__lastPose={time:t,airborne,airHeight,tuck,heroX,hipY};
  }
  const prepared=ready.then(()=>{for(const n of Object.keys(sourceRig))meshes[n]=makeMesh(n);draw(0);});
  document.addEventListener('DOMContentLoaded',()=>{
    if(window.__hyperframes?.registerFrameSource){
      window.__hyperframes.registerFrameSource({element:canvas,ready:prepared,render:t=>draw(t),sourceRange:{start:0,duration:DURATION,fps:30}});
    }
  },{once:true});
  window.spriteAnimation={ready:prepared,draw,duration:DURATION,canvas};
})();
