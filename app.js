"use strict";
(() => {
  const byId = id => document.getElementById(id);
  const broadcastCases = window.BROADCAST_REPLAYS ?? {};
  const replays = { ...window.REPLAYS, ...broadcastCases };
  const firstBroadcast = Object.keys(broadcastCases)[0];
  const first = "case07_A4";
  const scene = byId("scene"), screen = byId("overlay");
  const video = byId("video"), slider = byId("seek"), play = byId("play");
  const film = byId("research-film");
  const mediaSeekVersions = new WeakMap();
  async function playAt(player, seconds){
    const version=(mediaSeekVersions.get(player)||0)+1;
    mediaSeekVersions.set(player,version);
    if(player.readyState===0){
      const metadata=new Promise((resolve,reject)=>{
        function clear(){player.removeEventListener("loadedmetadata",ready);player.removeEventListener("error",failed);}
        function ready(){clear();resolve();}
        function failed(){clear();reject(new Error("Media could not load"));}
        player.addEventListener("loadedmetadata",ready);player.addEventListener("error",failed);
      });
      player.load();await metadata;
    }
    if(mediaSeekVersions.get(player)!==version)return;
    player.currentTime=seconds;
    await player.play();
  }
  const players = [video, film];
  players.forEach(player => player.addEventListener("play",()=>{
    pendingPlay=false;
    players.forEach(other=>{if(other!==player){other.pause();mediaSeekVersions.set(other,(mediaSeekVersions.get(other)||0)+1);}});
  }));
  document.querySelectorAll("[data-long-time]").forEach(button=>button.addEventListener("click",async()=>{
    try {await playAt(film,Number(button.dataset.longTime));} catch {film.focus();}
  }));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const timelineCanvas = byId("timeline-canvas");
  const timelinePlot = byId("timeline-plot");
  const referenceHeight = byId("reference-height");
  const fitHeight = byId("fit-height");
  let timelineData;
  let cameraAnimation = 0;
  let sample, frame = 0, yaw = -.64, elevation = .52, side = false;
  let sourceVersion = 0, dragging = null, clock = null, pendingPlay = false, pendingSeek = null;
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
  function setTimeline(data) {
    const pairs = data.xyz.map((point, i) => ({fit: point[2], reference: data.ref[i]?.[2]}));
    const values = pairs.flatMap(pair => [pair.fit, pair.reference]).filter(Number.isFinite);
    const minimum = Math.floor(Math.min(0, ...values));
    const maximum = Math.ceil(Math.max(1, ...values));
    timelineData = { pairs, minimum, maximum };
    byId("timeline-max").textContent = `${maximum} m`;
    byId("timeline-min").textContent = `${minimum} m`;
    byId("reference-value").hidden = Boolean(data.broadcast);
    byId("timeline-note").textContent = data.broadcast
      ? "Drag or use the arrow keys to scrub the reconstructed flight."
      : "Gaps in the reference trace mark frames without a stereo match. Drag or use arrow keys to scrub.";
    const duration = (pairs.length - 1) / data.fps;
    const axis = byId("timeline-axis");
    axis.replaceChildren(...[0, .25, .5, .75, 1].map(fraction => {
      const tick = document.createElement("span");
      tick.textContent = `${(fraction * duration).toFixed(fraction === 0 ? 0 : 2)} s`;
      return tick;
    }));
    drawTimeline();
  }
  function drawTimeline() {
    const surface = context(timelineCanvas);
    if (!surface || !timelineData) return;
    const {ctx, w, h} = surface;
    const {pairs, minimum, maximum} = timelineData;
    const x = index => 2 + (w - 4) * index / (pairs.length - 1);
    const y = value => h - 7 - (h - 14) * (value - minimum) / (maximum - minimum);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#364252";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const column = x(i * (pairs.length - 1) / 4);
      ctx.moveTo(column, 7);
      ctx.lineTo(column, h - 7);
    }
    for (let i = 0; i <= 2; i++) {
      const row = y(minimum + i * (maximum - minimum) / 2);
      ctx.moveTo(0, row);
      ctx.lineTo(w, row);
    }
    ctx.stroke();
    for (const [key, color, dash] of [["reference", "#e2efff", [3, 3]], ["fit", "#ffb17b", []]]) {
      if (key==="reference" && (sample.broadcast || !byId("showReference").checked)) continue;
      if (key==="fit" && !byId("showFinal").checked) continue;
      ctx.strokeStyle = ctx.fillStyle = color;
      ctx.lineWidth = 1.8;
      ctx.setLineDash(dash);
      ctx.beginPath();
      pairs.forEach((pair, index) => {
        if (!Number.isFinite(pair[key])) return;
        const plotX = x(index), plotY = y(pair[key]);
        if (Number.isFinite(pairs[index - 1]?.[key])) ctx.lineTo(plotX, plotY);
        else ctx.moveTo(plotX, plotY);
        if (!Number.isFinite(pairs[index - 1]?.[key]) && !Number.isFinite(pairs[index + 1]?.[key])) ctx.fillRect(plotX - 1, plotY - 1, 2, 2);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  function updateTimeline() {
    const pair = timelineData.pairs[frame];
    timelinePlot.style.setProperty("--playhead", `${100 * frame / (sample.xyz.length - 1)}%`);
    referenceHeight.textContent = Number.isFinite(pair.reference) ? `${pair.reference.toFixed(2)} m` : "—";
    fitHeight.textContent = `${pair.fit.toFixed(2)} m`;
    slider.setAttribute("aria-valuetext", `${(frame / sample.fps).toFixed(2)} seconds, frame ${frame + 1}. Estimated height ${fitHeight.textContent}.`);
  }
  function court(canvas, data, current, angle, tilt, options = {}) {
    const base=context(canvas);
    if (!base) return;
    const {ctx,w,h}=base;
    const { fitted = true, reference = true, futureAlpha = .42 } = options;
    const cos=Math.cos(angle), sin=Math.sin(angle), pitch=Math.cos(tilt), rise=Math.sin(tilt);
    const rot=([x,y,z])=>[y*cos+x*sin, (x*cos-y*sin)*rise-z*pitch];
    const paths = [...corners, ...data.xyz, ...data.ref.filter(Boolean)];
    const coordinates=paths.map(rot);
    const xs=coordinates.map(p=>p[0]), ys=coordinates.map(p=>p[1]);
    const left=Math.min(...xs), right=Math.max(...xs), top=Math.min(...ys), bottom=Math.max(...ys);
    const scale=Math.min(w*.90/(right-left), h*.82/(bottom-top));
    const project=p=>{const [x,y]=rot(p);return [(x-(left+right)/2)*scale+w*.50,(y-(top+bottom)/2)*scale+h*.505];};
    const stroke=(points,color,width,fill)=>{ctx.beginPath();points.forEach((p,i)=>{const [x,y]=project(p);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)});if(fill){ctx.closePath();ctx.fillStyle=fill;ctx.fill()}ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();};
    const dot=(p,r,color)=>{const [x,y]=project(p);ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();};
    const line=(a,b,color,width=1)=>stroke([a,b],color,width);
    ctx.clearRect(0,0,w,h);
    const wash=ctx.createLinearGradient(0,0,w,h);wash.addColorStop(0,"#273448");wash.addColorStop(1,"#131b26");
    ctx.fillStyle=wash;ctx.fillRect(0,0,w,h);
    stroke(corners,"#a0b9d8",1.2,"#2e4967");
    for(const x of [-2.59,2.59]) line([x,-6.7,0],[x,6.7,0],"#849dbf");
    for(const y of [-5.94,-1.98,1.98,5.94]) line([-3.05,y,0],[3.05,y,0],"#849dbf");
    line([0,-6.7,0],[0,-1.98,0],"#849dbf");line([0,1.98,0],[0,6.7,0],"#849dbf");
    stroke([[-3.05,0,0],[-3.05,0,1.55],[3.05,0,1.55],[3.05,0,0]],"#9bb2cf",1.2,"#a7c6ff20");
    ctx.lineJoin="round";ctx.lineCap="round";
    function trail(points, color, dash) {
      ctx.setLineDash(dash);
      ctx.globalAlpha = futureAlpha;
      stroke(points, color, 1.7);
      ctx.globalAlpha = 1;
      stroke(points.slice(0, current + 1), color, 2.6);
      ctx.setLineDash([]);
    }
    if (fitted) trail(data.xyz, "#ffb17b", []);
    if (reference) data.ref.forEach((point, index) => {
      if (point) dot(point, 1.65, index > current ? "#e2efff70" : "#e2efff");
    });
    const pose=data.xyz[current], ground=[pose[0],pose[1],0];
    if(fitted){
      ctx.setLineDash([3,4]);line(ground,pose,"#efcc93a6",1);ctx.setLineDash([]);
      dot(pose,5,"#f9f8ed");dot(pose,3.2,"#ff914d");
    }
    if(reference && data.ref[current]) dot(data.ref[current],3.1,"#f3f7ff");
  }
  function drawReplayCourt() {
    court(scene, sample, frame, yaw, elevation, {
      fitted: byId("showFinal").checked,
      reference: !sample.broadcast && byId("showReference").checked
    });
  }
  function update(frameNumber) {
    if (!sample) return;
    frame=bounds(frameNumber,0,sample.xyz.length-1);
    slider.value=String(frame);
    updateTimeline();
    byId("time").textContent=(frame/sample.fps).toFixed(2)+" / "+((sample.xyz.length-1)/sample.fps).toFixed(2)+" s";
    const surface=context(screen);
    if (surface){
      const {ctx,w,h}=surface;ctx.clearRect(0,0,w,h);const point=sample.obs[frame];
      if(point){const x=point[0]*w/sample.size[0], y=point[1]*h/sample.size[1];
        ctx.beginPath();ctx.arc(x,y,Math.max(5,w*.012),0,Math.PI*2);ctx.strokeStyle="#ffe1a0";ctx.lineWidth=3.8;ctx.stroke();ctx.strokeStyle="#ce5d16";ctx.lineWidth=1.7;ctx.stroke();}
    }
    const observation = sample.broadcast
      ? (sample.obs[frame] ? "2D observation available" : "no 2D observation")
      : (sample.ref[frame] ? "stereo pair available" : "no stereo pair");
    byId("obsInfo").textContent = `Frame ${frame + 1} / ${sample.xyz.length} · ${observation}`;
    drawReplayCourt();
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
    play.textContent=video.paused?"Play":"Pause";
    play.setAttribute("aria-label",video.paused?"Play rally":"Pause rally");
  }
  async function start(){
    const version=sourceVersion;
    if(video.ended || frame===sample.xyz.length-1){pendingSeek=null;video.currentTime=0;update(0);}
    try{await video.play();if(version===sourceVersion)byId("videoError").hidden=true;}
    catch(error){if(version===sourceVersion && error.name!=="AbortError"){const el=byId("videoError");el.hidden=false;el.textContent="Playback could not start. Try Play again, or inspect individual frames with the slider.";}}
  }
  function selectCase(id, autoplay=false){
    ++sourceVersion;stopFrames();video.pause();sample=replays[id];frame=0;pendingPlay=autoplay;pendingSeek=null;
    setTimeline(sample);
    document.querySelectorAll("[data-case]").forEach(button=>{
      button.setAttribute("aria-pressed",String(button.dataset.case===id));
    });
    slider.max=sample.xyz.length-1;video.poster="assets/"+id+".jpg";
    const formats = sample.broadcast ? ["webm", "mp4"] : ["mp4"];
    const sources = formats.map(ext => {
      const source = document.createElement("source");
      source.type = "video/"+ext;
      source.src = "assets/"+id+"."+ext;
      return source;
    });
    const version=sourceVersion;
    sources.at(-1).addEventListener("error",()=>{if(version===sourceVersion) showMediaError();});
    video.replaceChildren(...sources);
    const readings={case07_A4:"S6 · Inspect the side view at 0.33 s to compare the fitted flight with the stereo points.",case05_A8:"S5 · Near the overall mean. The clip mean uses only stereo-matched frames.",case20_A1:"S15 · Above-average error. The smooth orange path can still differ in depth from the pale reference points."};
    const broadcast = sample.broadcast;
    byId("caseInfo").textContent = broadcast
      ? `${sample.n} 2D observations · ${Number(sample.fps.toFixed(2))} fps`
      : `Mean reference distance ${sample.mean.toFixed(3)} m · ${sample.n} paired frames`;
    byId("caseReading").textContent = broadcast ? broadcast.title : readings[id];
    byId("input-camera").textContent = broadcast ? "Broadcast camera" : "Phone A";
    byId("input-kind").textContent = broadcast ? "Match footage" : "Monocular footage";
    video.setAttribute("aria-label", broadcast ? `${broadcast.title} · broadcast footage` : "Input footage from phone A");
    byId("reference-toggle").hidden = Boolean(broadcast);
    byId("reference-note").hidden = Boolean(broadcast);
    byId("broadcast-note").hidden = !broadcast;
    if (broadcast) {
      byId("broadcast-protocol").textContent = broadcast.protocol;
      byId("broadcast-source").href = broadcast.source;
      byId("broadcast-trajectory").href = `assets/${id}-trajectory.csv`;
    }
    byId("inspectDepth").hidden=id!=="case07_A4";
    byId("videoError").hidden=true;video.load();update(0);playState();
    if(autoplay) start();
  }
  for (const [id, data] of Object.entries(broadcastCases)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.case = id;
    button.setAttribute("aria-pressed", "false");
    const image = document.createElement("img");
    image.src = `assets/${id}.jpg`;
    image.alt = "";
    image.width = 96;
    image.height = 54;
    image.loading = "lazy";
    const label = document.createElement("span");
    const title = document.createElement("b");
    title.textContent = data.broadcast.name;
    const event = document.createElement("small");
    event.textContent = data.broadcast.event;
    label.append(title, event);
    button.append(image, label);
    byId("broadcast-cases").append(button);
  }
  byId("broadcasts").hidden = !firstBroadcast;
  document.querySelector(".viewer").addEventListener("click",event=>{
    const button=event.target.closest("[data-case]");
    if(button && button.getAttribute("aria-pressed")!=="true")selectCase(button.dataset.case,!video.paused||pendingPlay);
  });
  play.addEventListener("click",()=>{pendingPlay=false;if(video.paused)start();else video.pause();});
  function linkedCase(hash) {
    if (hash === "#broadcasts") return firstBroadcast;
    return byId(hash.slice(1))?.dataset.case;
  }
  document.querySelector(".evidence-clips").addEventListener("click", event => {
    const link = event.target.closest("a");
    if (link?.hash === location.hash && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey)
      selectCase(linkedCase(link.hash));
  });
  const rateButtons = [...document.querySelectorAll("[data-rate]")];
  rateButtons.forEach(button => button.addEventListener("click", () => {
    video.defaultPlaybackRate = Number(button.dataset.rate);
    video.playbackRate = video.defaultPlaybackRate;
    rateButtons.forEach(choice => choice.setAttribute("aria-pressed", String(choice === button)));
  }));
  video.addEventListener("loadedmetadata",()=>{if(pendingSeek!==null)video.currentTime=pendingSeek/sample.fps;});
  video.addEventListener("loadeddata",()=>{
    if(pendingSeek!==null){video.currentTime=pendingSeek/sample.fps;update(pendingSeek);}
    else update(Math.round(video.currentTime*sample.fps));
  });
  video.addEventListener("playing",()=>{playState();requestFrames();});
  video.addEventListener("pause",()=>{stopFrames();playState();});
  video.addEventListener("ended",()=>{stopFrames();update(sample.xyz.length-1);playState();});
  function showMediaError(){pendingPlay=false;byId("videoError").textContent="The replay could not load. Reload the page or select another clip.";byId("videoError").hidden=false;}
  video.addEventListener("error",showMediaError);
  video.addEventListener("seeked",()=>{
    const actual=Math.round(video.currentTime*sample.fps);
    if(pendingSeek!==null && actual!==pendingSeek)return;
    pendingSeek=null;update(actual);requestFrames();
  });
  video.addEventListener("timeupdate",()=>{if(pendingSeek===null && (!video.requestVideoFrameCallback || video.paused))update(Math.round(video.currentTime*sample.fps));});
  slider.addEventListener("input",()=>seekFrame(Number(slider.value)));
  function seekFrame(next){
    pendingPlay=false;video.pause();next=bounds(next,0,sample.xyz.length-1);
    pendingSeek=next;
    if(video.readyState>0)video.currentTime=next/sample.fps;
    update(next);
  }
  byId("prevFrame").addEventListener("click",()=>seekFrame(frame-1));
  byId("nextFrame").addEventListener("click",()=>seekFrame(frame+1));
  function resetView(){cancelAnimationFrame(cameraAnimation);yaw=-.64;elevation=.52;side=false;byId("view").textContent="Side view";refresh();}
  byId("resetView").addEventListener("click",resetView);
  byId("inspectDepth").addEventListener("click",()=>{
    seekFrame(10);cancelAnimationFrame(cameraAnimation);yaw=0;elevation=.08;side=true;byId("view").textContent="Elevated view";refresh();
  });
  ["showFinal","showReference"].forEach(id=>byId(id).addEventListener("change",()=>{refresh();drawTimeline();}));
  scene.tabIndex=0;
  scene.addEventListener("keydown",event=>{
    if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home"].includes(event.key))return;
    event.preventDefault();cancelAnimationFrame(cameraAnimation);
    if(event.key==="Home"){resetView();return;}
    if(event.key==="ArrowLeft")yaw-=.10;if(event.key==="ArrowRight")yaw+=.10;
    if(event.key==="ArrowUp")elevation=bounds(elevation+.08,.05,1.45);
    if(event.key==="ArrowDown")elevation=bounds(elevation-.08,.05,1.45);
    refresh();
  });
  byId("view").addEventListener("click",()=>{
    cancelAnimationFrame(cameraAnimation);
    side=!side;
    byId("view").textContent=side?"Elevated view":"Side view";
    const targetYaw=side?0:-.64, targetElevation=side?.08:.52;
    const startYaw=yaw, startElevation=elevation, started=performance.now();
    const angle=targetYaw-startYaw;
    const turn=Math.atan2(Math.sin(angle),Math.cos(angle));
    function turnCamera(now){
      const fraction=reducedMotion.matches?1:bounds((now-started)/180,0,1);
      const eased=1-(1-fraction)**3;
      yaw=startYaw+turn*eased;
      elevation=startElevation+(targetElevation-startElevation)*eased;
      drawReplayCourt();
      if(fraction<1)cameraAnimation=requestAnimationFrame(turnCamera);
    }
    turnCamera(started);
  });
  scene.addEventListener("pointerdown",e=>{cancelAnimationFrame(cameraAnimation);dragging=[e.clientX,e.clientY,yaw,elevation];scene.setPointerCapture(e.pointerId);});
  scene.addEventListener("pointermove",e=>{if(!dragging)return;yaw=dragging[2]+(e.clientX-dragging[0])*.009;elevation=bounds(dragging[3]-(e.clientY-dragging[1])*.008,.05,1.45);update(frame);});
  scene.addEventListener("lostpointercapture",()=>dragging=null);
  const rows=[
    ["Uplifting",1.958,1.979,1.969,2.893],["SpinTraj.",1.782,1.894,1.838,1.581],
    ["TT4D",1.411,1.521,1.466,1.324],["Main network",1.645,1.966,1.805,1.254],
    ["Network + stabilization",1.271,1.277,1.274,1.078],["MonoTrack core",3.188,4.302,3.745,3.318],
    ["MonoTrack oracle",.691,.709,.700,2.175],["Physics only",.574,1.909,1.241,.579],
    ["Complete method",.191,.806,.498,.398]
  ];
  const split={
    real:[4,"Mean distance to stereo reference (m)","Phone A only. 15 clips from 12 windows, with 1,600 of 2,415 frames paired and weighted equally."],
    all:[3,"Mean 3D position error (m)","56 independently rendered rallies in two batches, weighted equally. Shared detections and calibration."],
    matched:[1,"Mean 3D position error (m)","28 rallies with calibration and dynamics matching the fitter."],
    mismatch:[2,"Mean 3D position error (m)","28 rallies with perturbed calibration. Some also vary drag, exposure, or visibility near contacts."]
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
    const [col,title,note]=split[key];byId("chartUnit").textContent=title+" · lower is better";byId("chartNote").textContent=note;
    bars.forEach(({row,fill,value})=>{
      fill.style.transform="scaleX("+row[col]/2+")";
      value.textContent=row[col].toFixed(3);
    });
    document.querySelectorAll("[data-set]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.set===key)));
  }
  byId("metricTabs").addEventListener("click",e=>{const button=e.target.closest("[data-set]");if(button)chart(button.dataset.set);});
  const body=byId("fullTable").tBodies[0];
  rows.forEach((row,i)=>{const tr=body.insertRow();if(i===8)tr.classList.add("accentrow");row.forEach((v,j)=>{tr.insertCell().textContent=j?v.toFixed(3):v;});});
  function setupMethodDiagram() {
    const picker = byId("method-picker");
    const method = byId("method");
    const options = [...picker.querySelectorAll("input")];
    const panels = options.map(option => byId(option.getAttribute("aria-controls")));

    function showStage(option) {
      method.dataset.stage = option.value;
      options.forEach((item, index) => {
        const current = item === option;
        panels[index].classList.toggle("is-current", current);
        panels[index].inert = !current;
      });
    }

    picker.hidden = false;
    panels.forEach(panel => { panel.hidden = false; });
    showStage(options.find(option => option.checked));
    picker.addEventListener("change", event => showStage(event.target));
  }

  function setupPrecisionPlot() {
    const duration = byId("flight-duration");
    const output = byId("flightPrecision");
    const canvas = byId("precision-chart");
    const standardDeviation = (seconds, frames = 30 * seconds) =>
      2 * Math.sqrt(180) * 2 * 20 ** 2 / (1313 * 9 * Math.sqrt(frames) * seconds ** 2);

    function drawPrecision() {
      const seconds = duration.valueAsNumber;
      const frames = Math.round(30 * seconds);
      const deviation = standardDeviation(seconds, frames);
      output.textContent = `${seconds.toFixed(1)} s · ${frames} frames · ${deviation.toFixed(2)} m`;
      duration.setAttribute("aria-valuetext", `${seconds.toFixed(1)} seconds`);
      const drawing = context(canvas);
      if (!drawing) return;
      const { ctx, w, h } = drawing;
      const left = 37, right = w - 18, top = 14, bottom = h - 32;
      const x = time => left + (time - .5) * (right - left);
      const y = uncertainty => bottom - uncertainty * (bottom - top) / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.font = "12px system-ui";
      ctx.fillStyle = "#4c5662";
      ctx.strokeStyle = "#d9dce1";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (const tick of [0, .5, 1, 1.5, 2]) {
        const row = y(tick);
        ctx.beginPath();
        ctx.moveTo(left, row);
        ctx.lineTo(right, row);
        ctx.stroke();
        ctx.fillText(tick.toFixed(1), left - 7, row);
      }
      ctx.textAlign = "center";
      for (const tick of [.5, 1, 1.5]) {
        ctx.fillText(`${tick.toFixed(1)} s`, x(tick), bottom + 17);
      }
      ctx.beginPath();
      ctx.moveTo(x(.5), y(standardDeviation(.5)));
      for (let index = 1; index <= 64; index++) {
        const time = .5 + index / 64;
        ctx.lineTo(x(time), y(standardDeviation(time)));
      }
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = "#914520";
      ctx.stroke();
      ctx.lineWidth = 1;
      const pointX = x(seconds), pointY = y(deviation);
      ctx.beginPath();
      ctx.moveTo(pointX, pointY);
      ctx.lineTo(pointX, bottom);
      ctx.strokeStyle = "#a55c39";
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(pointX, pointY, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#914520";
      ctx.fill();
    }

    duration.closest(".precision-control").hidden = false;
    canvas.closest(".precision-plot").hidden = false;
    duration.addEventListener("input", drawPrecision);
    new ResizeObserver(drawPrecision).observe(canvas);
    drawPrecision();
  }

  function setupClipExplorer() {
    const chart = byId("clip-chart");
    const all = byId("clip-overall");
    const link = byId("clip-replay-link");
    const title = byId("clip-selection-title");
    const before = byId("clip-before");
    const after = byId("clip-after");
    const coverage = byId("clip-coverage");
    const clips = Array.from(byId("clip-table").tBodies[0].rows, row => ({
      id: row.dataset.clip,
      label: row.cells[0].textContent,
      before: Number(row.cells[1].textContent),
      after: Number(row.cells[2].textContent),
      coverage: row.cells[3].textContent
    }));
    const axisMaximum = Math.ceil(Math.max(...clips.map(clip => clip.before)) * 2) / 2;
    const positions = value => `${value / axisMaximum * 100}%`;
    const axis = byId("clip-axis");
    for (let index = 0; index <= 4; index++) {
      const tick = document.createElement("span");
      tick.textContent = (axisMaximum * index / 4).toFixed(1);
      tick.style.left = `${index * 25}%`;
      axis.append(tick);
    }

    const rows = byId("clip-rows");
    const buttons = clips.map(clip => {
      const button = document.createElement("button");
      const label = document.createElement("span");
      const range = document.createElement("span");
      button.type = "button";
      button.className = "clip-row";
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-label", `${clip.label}: ${clip.before.toFixed(3)} meters before fitting, ${clip.after.toFixed(3)} after fitting`);
      label.textContent = clip.label;
      range.className = "clip-range";
      range.setAttribute("aria-hidden", "true");
      range.style.setProperty("--fitted", positions(clip.after));
      range.style.setProperty("--network", positions(clip.before));
      button.append(label, range);
      rows.append(button);
      button.addEventListener("click", () => selectClip(clip));
      return button;
    });

    const overall = { title: title.textContent, before: before.textContent, after: after.textContent, coverage: coverage.textContent };
    let selected;
    function selectClip(clip) {
      selected = clip;
      title.textContent = clip ? clip.label : overall.title;
      before.textContent = clip ? `${clip.before.toFixed(3)} m` : overall.before;
      after.textContent = clip ? `${clip.after.toFixed(3)} m` : overall.after;
      coverage.textContent = clip ? `${clip.coverage} input frames paired with the stereo reference.` : overall.coverage;
      buttons.forEach((button, index) => button.setAttribute("aria-pressed", String(clips[index] === clip)));
      all.setAttribute("aria-pressed", String(!clip));
      link.hidden = !clip || !Object.hasOwn(replays, clip.id);
    }
    all.addEventListener("click", () => selectClip());
    link.addEventListener("click", () => { if (selected) selectCase(selected.id); });
    selectClip();
    byId("clip-instruction").hidden = false;
    chart.hidden = false;
    all.hidden = false;
  }

  const overview=byId("overviewDialog");
  const zoom=byId("zoomOverview");
  const viewport=overview.querySelector(".figure-scroll");
  function setZoom(enlarged){
    viewport.classList.toggle("zoom",enlarged);
    zoom.setAttribute("aria-pressed",String(enlarged));
    zoom.textContent=enlarged?"Fit to window":"Zoom in";
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
    const initialAnchor=byId(location.hash.slice(1));
    const seen=new WeakSet();
    function settle(target){
      target.classList.remove("tracing");
      figures.unobserve(target);
    }
    const figures=new IntersectionObserver(entries=>{
      for(const entry of entries){
        const target=entry.target;
        if(!entry.isIntersecting && seen.has(target)){settle(target);continue;}
        if(!entry.isIntersecting || seen.has(target))continue;
        seen.add(target);
        if(reducedMotion.matches || initialAnchor?.contains(target)){settle(target);continue;}
        target.classList.add("tracing");
      }
    },{rootMargin:"0px 0px 12% 0px"});
    const targets=[...tables,byId("bars")];
    targets.forEach(target=>figures.observe(target));
    function settleVisible(){
      targets.filter(target=>seen.has(target)).forEach(settle);
    }
    reducedMotion.addEventListener("change",event=>{if(event.matches)settleVisible();});
    document.addEventListener("visibilitychange",()=>{if(document.hidden)settleVisible();});
    window.addEventListener("beforeprint",settleVisible);
  }
  function setupStoryMotion(navigation) {
    const page = document.documentElement;
    const intro = byId("overview");
    const chapters = [...document.querySelectorAll("[data-story-reveal]")]
      .map(element => ({ element, top: 0, progress: 0 }));
    let navHeight = 0;
    let introTop = 0;
    let introHeight = 0;
    let introExit = -1;
    let visualScroll = window.scrollY;
    let lastFrameTime = 0;
    let frameId = 0;
    let needsMeasure = true;

    function schedule() {
      if (!frameId) frameId = requestAnimationFrame(update);
    }

    function invalidate() {
      needsMeasure = true;
      schedule();
    }

    function measure(scroll) {
      const height = navigation.offsetHeight;
      if (height !== navHeight) {
        navHeight = height;
        page.style.setProperty("--project-nav-height", `${height}px`);
      }
      const introRect = intro.getBoundingClientRect();
      introTop = introRect.top + scroll;
      introHeight = introRect.height;
      for (const chapter of chapters) {
        chapter.top = chapter.element.getBoundingClientRect().top + scroll;
      }
      needsMeasure = false;
    }

    function update(now) {
      frameId = 0;
      const scroll = window.scrollY;
      if (needsMeasure) measure(scroll);
      if (reducedMotion.matches) {
        visualScroll = scroll;
        lastFrameTime = 0;
        return;
      }

      const height = window.innerHeight;
      const gap = scroll - visualScroll;
      const elapsed = lastFrameTime ? Math.min(now - lastFrameTime, 50) : 16;
      // Follow native scrolling with a short easing tail. Distant anchor jumps settle at once.
      visualScroll = Math.abs(gap) > height || Math.abs(gap) < .5
        ? scroll
        : scroll - gap * Math.exp(-elapsed / 72);
      const departure = bounds((visualScroll + navHeight - introTop) / Math.max(1, introHeight * .8), 0, 1);
      if (departure !== introExit) {
        introExit = departure;
        intro.style.setProperty("--intro-exit", departure.toFixed(4));
      }

      const entranceTravel = Math.max(160, (height - navHeight) * .42);
      for (const chapter of chapters) {
        if (chapter.progress === 1) continue;
        const progress = bounds((visualScroll + height * 1.04 - chapter.top) / entranceTravel, 0, 1);
        if (progress <= chapter.progress) continue;
        const arrived = chapter.progress < .22 && progress >= .22;
        chapter.progress = progress;
        chapter.element.style.setProperty("--story-progress", progress.toFixed(4));
        if (arrived) chapter.element.classList.add("story-arrived");
      }

      lastFrameTime = visualScroll === scroll ? 0 : now;
      if (lastFrameTime) schedule();
    }

    function syncPreference() {
      page.classList.toggle("story-motion", !reducedMotion.matches);
      invalidate();
    }

    const layout = new ResizeObserver(invalidate);
    layout.observe(navigation);
    layout.observe(document.body);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", invalidate);
    reducedMotion.addEventListener("change", syncPreference);
    syncPreference();
    measure(window.scrollY);
  }

  function openLinkedDetails() {
    const target = byId(location.hash.slice(1));
    if (!target) return;

    let opened = false;
    for (let parent = target; parent; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement && !parent.open) {
        parent.open = true;
        opened = true;
      }
    }
    if (opened) target.scrollIntoView({behavior: "instant"});
  }

  const observer = new ResizeObserver(refresh);
  observer.observe(scene);
  new ResizeObserver(drawTimeline).observe(timelineCanvas);
  const navigation=document.querySelector(".nav");
  const navLinks=Array.from(document.querySelectorAll(".nav nav a"));
  const sections=navLinks.map(link=>document.querySelector(link.hash));
  let activeSection=-1, navigationFrame=0;
  function updateNavigation(){
    navigationFrame=0;
    const scrollRange=document.documentElement.scrollHeight-window.innerHeight;
    const nearBottom=window.scrollY>=scrollRange-2;
    const anchorTop = (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || navigation.offsetHeight) + 1;
    navigation.style.setProperty("--read-progress",scrollRange>0?bounds(window.scrollY/scrollRange,0,1):0);
    let current=sections.length-1;
    while(!nearBottom && current>=0 && sections[current].getBoundingClientRect().top>anchorTop)current--;
    current=Math.max(0,current);
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
  selectCase(linkedCase(location.hash) || first);
  window.addEventListener("hashchange", () => {
    const id = linkedCase(location.hash);
    if (id && sample !== replays[id]) selectCase(id);
  });
  chart("real");refresh();
  setupPrecisionPlot();
  setupClipExplorer();
  setupScrollFigures();
  setupMethodDiagram();
  openLinkedDetails();
  window.addEventListener("hashchange", openLinkedDetails);
  setupStoryMotion(navigation);
})();
