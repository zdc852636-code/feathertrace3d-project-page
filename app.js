"use strict";
(() => {
  const byId = id => document.getElementById(id);
  const replays = window.REPLAYS;
  const first = "case07_A4";
  const scene = byId("scene"), screen = byId("overlay");
  const video = byId("video"), slider = byId("seek"), play = byId("play");
  const film = byId("research-film"), filmPanel = byId("film-panel");
  function openLinkedFilm(){
    if(location.hash==="#research-film")filmPanel.open=true;
  }
  openLinkedFilm();
  window.addEventListener("hashchange",openLinkedFilm);
  document.querySelector('a[href="#research-film"]').addEventListener("click",()=>{filmPanel.open=true;});
  filmPanel.addEventListener("toggle",()=>{if(!filmPanel.open)film.pause();});
  film.addEventListener("play",()=>{pendingPlay=false;video.pause();});
  video.addEventListener("play",()=>film.pause());
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let cameraAnimation = 0;
  let sample, frame = 0, yaw = -.64, elevation = .52, side = false;
  let sourceVersion = 0, dragging = null, clock = null, pendingPlay = false;
  const corners = [[-3.05,-6.70,0],[3.05,-6.70,0],[3.05,6.70,0],[-3.05,6.70,0]];
  const bounds = (n, lo, hi) => Math.min(hi, Math.max(lo,n));
  function context(canvas) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return null;
    const dpi = Math.min(window.devicePixelRatio || 1, 2);
    const pxw = Math.round(w*dpi), pxh = Math.round(h*dpi);
    if (canvas.width !== pxw || canvas.height !== pxh) {canvas.width=pxw; canvas.height=pxh;}
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpi,0,0,dpi,0,0);
    return {ctx,w,h};
  }
  function court(canvas, data, current, angle, tilt) {
    const base=context(canvas);
    if (!base) return;
    const {ctx,w,h}=base;
    const cos=Math.cos(angle), sin=Math.sin(angle), pitch=Math.cos(tilt), rise=Math.sin(tilt);
    const rot=([x,y,z])=>[y*cos+x*sin, (x*cos-y*sin)*rise-z*pitch];
    const coordinates=[...corners,...data.xyz,...data.ref.filter(Boolean)].map(rot);
    const xs=coordinates.map(p=>p[0]), ys=coordinates.map(p=>p[1]);
    const left=Math.min(...xs), right=Math.max(...xs), top=Math.min(...ys), bottom=Math.max(...ys);
    const scale=Math.min(w*.90/(right-left), h*.82/(bottom-top));
    const project=p=>{const [x,y]=rot(p);return [(x-(left+right)/2)*scale+w*.50,(y-(top+bottom)/2)*scale+h*.505];};
    const stroke=(points,color,width,fill)=>{ctx.beginPath();points.forEach((p,i)=>{const [x,y]=project(p);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)});if(fill){ctx.closePath();ctx.fillStyle=fill;ctx.fill()}ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();};
    const dot=(p,r,color)=>{const [x,y]=project(p);ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();};
    const line=(a,b,color,width=1)=>stroke([a,b],color,width);
    ctx.clearRect(0,0,w,h);
    const wash=ctx.createLinearGradient(0,0,w,h);wash.addColorStop(0,"#1b4241");wash.addColorStop(1,"#0c282b");
    ctx.fillStyle=wash;ctx.fillRect(0,0,w,h);
    stroke(corners,"#84ae99",1.2,"#26524c");
    for(const x of [-2.59,2.59]) line([x,-6.7,0],[x,6.7,0],"#659080");
    for(const y of [-5.94,-1.98,1.98,5.94]) line([-3.05,y,0],[3.05,y,0],"#659080");
    line([0,-6.7,0],[0,-1.98,0],"#659080");line([0,1.98,0],[0,6.7,0],"#659080");
    stroke([[-3.05,0,0],[-3.05,0,1.55],[3.05,0,1.55],[3.05,0,0]],"#8da69b",1.2,"#9ab9ac14");
    ctx.lineJoin="round";ctx.lineCap="round";
    stroke(data.xyz,"#ffa462",2.4);
    data.ref.forEach(p=>{if(p) dot(p,1.65,"#c1e9e1");});
    const pose=data.xyz[current], ground=[pose[0],pose[1],0];
    ctx.setLineDash([3,4]);line(ground,pose,"#efcc93a6",1);ctx.setLineDash([]);
    dot(pose,5,"#f9f8ed");dot(pose,3.2,"#ff914d");
    if(data.ref[current]) dot(data.ref[current],3.1,"#bcefe0");
  }
  function update(frameNumber) {
    if (!sample) return;
    frame=bounds(frameNumber,0,sample.xyz.length-1);
    slider.value=String(frame);
    byId("time").textContent=(frame/sample.fps).toFixed(2)+" / "+((sample.xyz.length-1)/sample.fps).toFixed(2)+" s";
    const surface=context(screen);
    if (surface){
      const {ctx,w,h}=surface;ctx.clearRect(0,0,w,h);const point=sample.obs[frame];
      if(point){const x=point[0]*w/sample.size[0], y=point[1]*h/sample.size[1];
        ctx.beginPath();ctx.arc(x,y,Math.max(5,w*.012),0,Math.PI*2);ctx.strokeStyle="#ffe1a0";ctx.lineWidth=3.8;ctx.stroke();ctx.strokeStyle="#ce5d16";ctx.lineWidth=1.7;ctx.stroke();}
    }
    byId("obsInfo").textContent="第 "+(frame+1)+" / "+sample.xyz.length+" 帧 · "+(sample.ref[frame]?"有双目配对":"无双目配对");
    court(scene,sample,frame,yaw,elevation);
  }
  function refresh(){update(frame);}
  function requestFrames(){
    if(clock!==null || !video.requestVideoFrameCallback || video.paused)return;
    const version=sourceVersion;
    clock=video.requestVideoFrameCallback((_,metadata)=>{
      clock=null;if(version!==sourceVersion)return;
      update(Math.round(metadata.mediaTime*sample.fps));requestFrames();
    });
  }
  function stopFrames(){if(clock!==null){video.cancelVideoFrameCallback(clock);clock=null;}}
  function playState(){
    play.textContent=video.paused?"播放":"暂停";
    play.setAttribute("aria-label",video.paused?"播放回合":"暂停回合");
  }
  async function start(){
    const version=sourceVersion;
    if(video.ended || frame===sample.xyz.length-1){video.currentTime=0;update(0);}
    try{await video.play();if(version===sourceVersion)byId("videoError").hidden=true;}
    catch(error){if(version===sourceVersion && error.name!=="AbortError"){const el=byId("videoError");el.hidden=false;el.textContent="浏览器未能开始播放。请再次点击播放，或使用进度条逐帧查看。";}}
  }
  function selectCase(id, autoplay=false){
    ++sourceVersion;stopFrames();video.pause();sample=replays[id];frame=0;pendingPlay=autoplay;
    document.querySelectorAll("[data-case]").forEach(button=>{
      button.setAttribute("aria-pressed",String(button.dataset.case===id));
    });
    slider.max=sample.xyz.length-1;video.poster="assets/"+id+".jpg";video.src="assets/"+id+".mp4";
    byId("caseInfo").textContent="本段平均参考偏差 "+sample.mean.toFixed(3)+" m · "+sample.n+" 个配对帧";
    byId("videoError").hidden=true;video.load();update(0);playState();
  }
  document.querySelector(".case-gallery").addEventListener("click",event=>{
    const button=event.target.closest("[data-case]");
    if(button && button.getAttribute("aria-pressed")!=="true")selectCase(button.dataset.case,!video.paused||pendingPlay);
  });
  play.addEventListener("click",()=>{pendingPlay=false;if(video.paused)start();else video.pause();});
  video.addEventListener("loadeddata",()=>{update(Math.round(video.currentTime*sample.fps));if(pendingPlay){pendingPlay=false;start();}});
  video.addEventListener("playing",()=>{playState();requestFrames();});
  video.addEventListener("pause",()=>{stopFrames();playState();});
  video.addEventListener("ended",()=>{stopFrames();update(sample.xyz.length-1);playState();});
  video.addEventListener("error",()=>{byId("videoError").textContent="本机浏览器无法解码此视频。可切换片段或逐帧查看右侧轨迹。";byId("videoError").hidden=false;});
  video.addEventListener("seeked",()=>{update(Math.round(video.currentTime*sample.fps));requestFrames();});
  video.addEventListener("timeupdate",()=>{if(!video.requestVideoFrameCallback || video.paused)update(Math.round(video.currentTime*sample.fps));});
  slider.addEventListener("input",()=>{pendingPlay=false;video.pause();frame=Number(slider.value);if(video.readyState>0)video.currentTime=frame/sample.fps;update(frame);});
  byId("view").addEventListener("click",()=>{
    cancelAnimationFrame(cameraAnimation);
    side=!side;
    byId("view").textContent=side?"恢复斜视":"切换到侧视";
    const targetYaw=side?0:-.64, targetElevation=side?.08:.52;
    const startYaw=yaw, startElevation=elevation, started=performance.now();
    const angle=targetYaw-startYaw;
    const turn=Math.atan2(Math.sin(angle),Math.cos(angle));
    function turnCamera(now){
      const fraction=reducedMotion.matches?1:bounds((now-started)/300,0,1);
      const eased=1-(1-fraction)**3;
      yaw=startYaw+turn*eased;
      elevation=startElevation+(targetElevation-startElevation)*eased;
      court(scene,sample,frame,yaw,elevation);
      if(fraction<1)cameraAnimation=requestAnimationFrame(turnCamera);
    }
    turnCamera(started);
  });
  scene.addEventListener("pointerdown",e=>{cancelAnimationFrame(cameraAnimation);dragging=[e.clientX,e.clientY,yaw,elevation];scene.setPointerCapture(e.pointerId);});
  scene.addEventListener("pointermove",e=>{if(!dragging)return;yaw=dragging[2]+(e.clientX-dragging[0])*.009;elevation=bounds(dragging[3]-(e.clientY-dragging[1])*.008,.05,1.45);update(frame);});
  scene.addEventListener("lostpointercapture",()=>dragging=null);
  const rows=[
    ["Uplifting",1.958,1.979,1.969,2.893],["SpinTraj.",1.782,1.894,1.838,1.581],
    ["TT4D",1.411,1.521,1.466,1.324],["主网络",1.645,1.966,1.805,1.254],
    ["网络＋稳定处理",1.271,1.277,1.274,1.078],["MonoTrack core",3.188,4.302,3.745,3.318],
    ["MonoTrack oracle",.691,.709,.700,2.175],["仅物理拟合",.574,1.909,1.241,.579],
    ["完整方法",.191,.806,.498,.398]
  ];
  const split={
    real:[4,"与双目参考的平均距离（米）","手持 A 机输入。12 个录制窗口切出 15 段，2,415 个输入帧中有 1,600 个通过配对，按帧等权。"],
    all:[3,"平均三维位置误差（米）","两批独立生成的渲染视频共 56 个回合，各回合等权。检测与标定由各方法共享。"],
    matched:[1,"平均三维位置误差（米）","28 个回合的标定与飞行模型都与拟合器假设匹配。"],
    mismatch:[2,"平均三维位置误差（米）","另 28 个回合扰动了标定，部分回合还改变了阻力、曝光和击球时的可见性。"]
  };
  const bars=[2,4,7,8].map(index=>{
    const row=rows[index], node=document.createElement("div");
    node.className="bar-row"+(index===8?" focus":"");
    const name=document.createElement("span");name.textContent=row[0];
    const track=document.createElement("div"), fill=document.createElement("div");
    track.className="track";fill.className="fill";track.append(fill);
    const value=document.createElement("b");
    node.append(name,track,value);byId("bars").append(node);
    return {row,fill,value};
  });
  function chart(key){
    const [col,title,note]=split[key];byId("chartUnit").textContent=title+" · 越低越好";byId("chartNote").textContent=note;
    bars.forEach(({row,fill,value})=>{
      fill.style.transform="scaleX("+row[col]/2+")";
      value.textContent=row[col].toFixed(3);
    });
    document.querySelectorAll("[data-set]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.set===key)));
  }
  byId("metricTabs").addEventListener("click",e=>{const button=e.target.closest("[data-set]");if(button)chart(button.dataset.set);});
  const body=byId("fullTable").tBodies[0];
  rows.forEach((row,i)=>{const tr=body.insertRow();if(i===8)tr.classList.add("accentrow");row.forEach((v,j)=>{tr.insertCell().textContent=j?v.toFixed(3):v;});});
  const flightTimes=byId("flightTimes");
  function showFlightPrecision(seconds){
    const frames=Math.round(30*seconds);
    const depthSigma=2*Math.sqrt(180)*2*20**2/(1313*9*Math.sqrt(frames)*seconds**2);
    byId("flightPrecision").textContent=frames+" 帧 · 深度标准差约 "+depthSigma.toFixed(2)+" 米";
    flightTimes.querySelectorAll("button").forEach(button=>{
      button.setAttribute("aria-pressed",String(Number(button.dataset.duration)===seconds));
    });
  }
  flightTimes.addEventListener("click",event=>{
    const button=event.target.closest("button[data-duration]");
    if(button)showFlightPrecision(Number(button.dataset.duration));
  });
  showFlightPrecision(.5);
  const overview=byId("overviewDialog");
  const zoom=byId("zoomOverview");
  const viewport=overview.querySelector(".figure-scroll");
  function setZoom(enlarged){
    viewport.classList.toggle("zoom",enlarged);
    zoom.setAttribute("aria-pressed",String(enlarged));
    zoom.textContent=enlarged?"适应窗口":"放大细节";
    viewport.scrollTo(0,0);
  }
  byId("enlargeOverview").addEventListener("click",()=>{
    overview.showModal();
    setZoom(false);
  });
  zoom.addEventListener("click",()=>setZoom(!viewport.classList.contains("zoom")));
  byId("closeOverview").addEventListener("click",()=>overview.close());
  overview.addEventListener("click",event=>{
    if(event.target!==overview)return;
    const box=overview.getBoundingClientRect();
    if(event.clientX<box.left||event.clientY<box.top||event.clientX>box.right||event.clientY>box.bottom)overview.close();
  });
  function countResults(group){
    const counters=Array.from(group.querySelectorAll(".stat-number"),node=>{
      const label=node.textContent.trim();
      const ticker=document.createElement("span");
      const decimals=(label.split(".")[1]||"").length;
      ticker.className="stat-ticker";
      ticker.setAttribute("aria-hidden","true");
      ticker.dataset.reading=(0).toFixed(decimals);
      node.append(ticker);
      node.classList.add("counting");
      return {node,ticker,decimals,value:Number(label)};
    });
    const start=performance.now();
    let frameId;
    function finish(){
      cancelAnimationFrame(frameId);
      counters.forEach(({node,ticker})=>{
        node.classList.remove("counting");
        ticker.remove();
      });
    }
    function advance(now){
      const progress=bounds((now-start)/720,0,1);
      if(progress===1){finish();return;}
      const eased=1-(1-progress)**2;
      counters.forEach(({ticker,decimals,value})=>{
        ticker.dataset.reading=(value*eased).toFixed(decimals);
      });
      frameId=requestAnimationFrame(advance);
    }
    frameId=requestAnimationFrame(advance);
    return finish;
  }
  function setupScrollFigures(){
    const tables=document.querySelectorAll("#neural .ablation table,#physical .evidence table");
    tables.forEach(table=>{
      const cells=Array.from(table.querySelectorAll("tbody td:not(:first-child)"));
      const values=cells.map(cell=>parseFloat(cell.textContent));
      const maximum=Math.max(...values);
      if(!(maximum>0))return;
      cells.forEach((cell,i)=>{
        cell.dataset.meter="";
        cell.style.setProperty("--extent",(100*values[i]/maximum)+"%");
      });
    });
    if(!("IntersectionObserver" in window))return;
    const metrics=document.querySelector(".metrics-grid");
    const initialAnchor=byId(location.hash.slice(1));
    const seen=new WeakSet();
    let finishCounting;
    function settle(target){
      if(target===metrics && finishCounting){finishCounting();finishCounting=null;}
      target.classList.remove("tracing");
      figures.unobserve(target);
    }
    const figures=new IntersectionObserver(entries=>{
      for(const entry of entries){
        const target=entry.target;
        if(!entry.isIntersecting && seen.has(target)){settle(target);continue;}
        if(entry.intersectionRatio<.2 || seen.has(target))continue;
        seen.add(target);
        if(reducedMotion.matches || initialAnchor?.contains(target)){settle(target);continue;}
        if(target===metrics)finishCounting=countResults(target);
        else target.classList.add("tracing");
      }
    },{threshold:[0,.2]});
    const targets=[...tables,metrics,byId("bars")];
    targets.forEach(target=>figures.observe(target));
    function settleVisible(){
      targets.filter(target=>seen.has(target)).forEach(settle);
    }
    reducedMotion.addEventListener("change",event=>{if(event.matches)settleVisible();});
    document.addEventListener("visibilitychange",()=>{if(document.hidden)settleVisible();});
    window.addEventListener("beforeprint",settleVisible);
  }
  const observer=new ResizeObserver(refresh);observer.observe(scene);
  const navigation=document.querySelector(".nav");
  const navLinks=Array.from(document.querySelectorAll(".nav nav a"));
  const sections=navLinks.map(link=>document.querySelector(link.hash));
  let activeSection=-1, navigationFrame=0;
  function updateNavigation(){
    navigationFrame=0;
    const scrollRange=document.documentElement.scrollHeight-window.innerHeight;
    const nearBottom=window.scrollY>=scrollRange-2;
    navigation.style.setProperty("--read-progress",scrollRange>0?bounds(window.scrollY/scrollRange,0,1):0);
    let current=sections.length-1;
    while(!nearBottom && current>=0 && sections[current].getBoundingClientRect().top>80)current--;
    if(current===activeSection)return;
    if(activeSection>=0)navLinks[activeSection].removeAttribute("aria-current");
    if(current>=0)navLinks[current].setAttribute("aria-current","location");
    activeSection=current;
  }
  function scheduleNavigation(){
    if(!navigationFrame)navigationFrame=requestAnimationFrame(updateNavigation);
  }
  window.addEventListener("scroll",scheduleNavigation,{passive:true});
  const layoutObserver=new ResizeObserver(scheduleNavigation);
  layoutObserver.observe(document.body);
  window.addEventListener("resize",scheduleNavigation);
  updateNavigation();
  selectCase(first);chart("real");refresh();
  setupScrollFigures();
})();
