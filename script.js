(function(){
"use strict";

/* ============================================================
   0. CONFIG — everything the couple would actually edit lives here.
   Matches the fields from the master spec, plus a few additive,
   clearly-marked extras (dressCode / schedule) needed by Scene 11
   ("Dress Code" / "Schedule") that weren't in the original object.
   ============================================================ */
const wedding = {
  groom:"Harsha",
  bride:"Lekhana",
  groomCity:"Munich",
  groomCountry:"Germany",
  groomTimeZone:"Europe/Berlin",
  brideCity:"Bangalore",
  brideCountry:"India",
  brideTimeZone:"Asia/Kolkata",
  weddingDate:"2026-11-30",
  weddingDateDisplay:"30 November 2026",
  venue:"Sri Lakshmi Kalyana Mantapa",
  venueAddress:"Hoskote, Bangalore, India",
  mapLink:"https://maps.app.goo.gl/HZXWvWaQQnxGUJPHA",
  poster:"poster.png",
  music:"music.mp3",
  bridePhoto:"Bride.jpg",
  groomPhoto:"groom.jpg",
  theme:{
    background:"#050505",
    gold:"#D4AF37",
    ivory:"#F8F6F2",
    accent:"#E8C77A"
  },
  /* additive, optional — safe to leave blank */
  dressCode:"",
  /* every time below is wall-clock time in `eventTimeZone`. The calendar
     file converts them to absolute instants, so a guest anywhere sees the
     event at the correct local time on their own device. `location` is
     optional and only overrides the venue where an event isn't held there. */
  eventTimeZone:"Asia/Kolkata",
  schedule:[
    { date:"2026-11-27", label:"Haldi",     time:"11:00", durationHours:3, location:"At respective houses" },
    { date:"2026-11-29", label:"Reception", time:"18:00", durationHours:4 },
    { date:"2026-11-30", label:"Wedding",   time:"09:30", durationHours:3 },
  ],
  features:{
    earth:true,
    dynamicTimezones:true,
    particles:true,
    countdown:true,
    posterReveal:true,
    musicToggle:true,
    smoothScroll:true,
    mouseParallax:true,
    gyroscope:true
  }
};
window.WEDDING_CONFIG = wedding;

/* ============================================================
   1. ENVIRONMENT / CAPABILITY DETECTION
   ============================================================ */
const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const IS_TOUCH = matchMedia('(hover: none), (pointer: coarse)').matches;
const IS_SMALL = window.innerWidth < 760;
const CORES = navigator.hardwareConcurrency || 4;
const LOW_POWER = CORES <= 4 || IS_SMALL;
let WEBGL_OK = true;
try{
  const c = document.createElement('canvas');
  WEBGL_OK = !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
}catch(e){ WEBGL_OK = false; }

if(REDUCED_MOTION){ document.body.classList.add('reduced-motion'); }

/* device performance tier drives particle counts / pixel ratio across the whole app */
const TIER = REDUCED_MOTION ? 'low' : (LOW_POWER ? 'mid' : 'high');
const TIER_PARTICLES = { low: 0.15, mid: 0.5, high: 1 }[TIER];
document.documentElement.setAttribute('data-tier', TIER);
const MAX_PIXEL_RATIO = TIER === 'high' ? Math.min(devicePixelRatio||1, 2) : 1.4;

/* ============================================================
   2. UTILITIES
   ============================================================ */
const $ = (sel, ctx) => (ctx||document).querySelector(sel);
const $$ = (sel, ctx) => Array.from((ctx||document).querySelectorAll(sel));
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerp = (a,b,t) => a + (b-a)*t;

function latLonToVector3(lat, lon, radius){
  const phi = (90 - lat) * (Math.PI/180);
  const theta = (lon + 180) * (Math.PI/180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/* real subsolar point (lat/long where the sun is directly overhead) —
   standard low-precision solar position approximation, good to a
   fraction of a degree, plenty for an ambient day/night lighting cue */
function subsolarPoint(date){
  const rad = Math.PI/180;
  const ms = date.getTime();
  const dayMs = 86400000;
  const jd = ms/dayMs + 2440587.5;
  const d = jd - 2451545.0;
  const g = (357.529 + 0.98560028*d) % 360;
  const q = (280.459 + 0.98564736*d) % 360;
  const L = (q + 1.915*Math.sin(g*rad) + 0.020*Math.sin(2*g*rad)) % 360;
  const e = 23.439 - 0.00000036*d;
  const decl = Math.asin(Math.sin(e*rad)*Math.sin(L*rad)) / rad;
  const utcHours = date.getUTCHours() + date.getUTCMinutes()/60 + date.getUTCSeconds()/3600;
  const lon = -(utcHours - 12) * 15;
  return { lat: decl, lon: lon };
}

function cityLocalTime(tz){
  try{
    return new Intl.DateTimeFormat('en-GB', { hour:'2-digit', minute:'2-digit', timeZone: tz }).format(new Date());
  }catch(e){ return '--:--'; }
}

function cityLocalHour(tz){
  try{
    return parseInt(new Intl.DateTimeFormat('en-GB', { hour:'2-digit', hour12:false, timeZone: tz }).format(new Date()), 10);
  }catch(e){ return 12; }
}

function cityLocalDate(tz){
  try{
    return new Intl.DateTimeFormat('en-GB', { weekday:'short', day:'numeric', month:'short', timeZone: tz }).format(new Date());
  }catch(e){ return ''; }
}

function cityIsNight(tz){
  const h = cityLocalHour(tz);
  return h < 6 || h >= 20;
}

/* a short, human "how it feels right now" descriptor — used for the
   earth-scene captions. Never guesses at actual weather (we have no live
   feed for that); this is ambience only, exactly as the brief asks for. */
function cityWeatherFeeling(tz){
  const h = cityLocalHour(tz);
  if(h >= 0 && h < 5) return 'Deep night, city lights';
  if(h >= 5 && h < 7) return 'Blue hour, before sunrise';
  if(h >= 7 && h < 9) return 'Sunrise, warm and gold';
  if(h >= 9 && h < 17) return 'Bright daylight';
  if(h >= 17 && h < 19) return 'Golden hour';
  if(h >= 19 && h < 21) return 'Dusk settling in';
  return 'Night, moonlit and quiet';
}

function greatCircleKm(lat1, lon1, lat2, lon2){
  const R = 6371, rad = Math.PI/180;
  const dLat = (lat2-lat1)*rad, dLon = (lon2-lon1)*rad;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;
  return Math.round(R * 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

const MUNICH_LATLON = [48.1351, 11.5820];
const BANGALORE_LATLON = [12.9716, 77.5946];
const DISTANCE_KM = greatCircleKm(MUNICH_LATLON[0], MUNICH_LATLON[1], BANGALORE_LATLON[0], BANGALORE_LATLON[1]);
(function syncEarthDistanceLabel(){
  document.addEventListener('DOMContentLoaded', function(){
    const el = document.getElementById('earthDistanceKm');
    if(el) el.textContent = DISTANCE_KM.toLocaleString('en-US') + ' km apart';
  });
})();

function onVisible(el, cb, opts){
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(en => { if(en.isIntersecting){ cb(en); } });
  }, Object.assign({ threshold:0.15 }, opts||{}));
  io.observe(el);
  return io;
}

/* ============================================================
   2b. GYROSCOPE — real device-orientation tilt, normalised to
   -1..1 on each axis. This is what actually backs the
   `wedding.features.gyroscope` flag: on touch devices it's the
   only source of parallax input (mouse events don't fire there),
   so without this the flag was previously true in name only.
   iOS 13+ requires the permission request to originate from a
   genuine user gesture, so it's requested on first touch.
   ============================================================ */
const Gyro = (function(){
  let x = 0, y = 0, enabled = false, requested = false;
  const subs = [];
  function handle(e){
    if(e.beta === null || e.gamma === null) return;
    x = Math.max(-1, Math.min(1, e.gamma / 28));
    y = Math.max(-1, Math.min(1, (e.beta - 45) / 28));
    subs.forEach(fn => fn(x, y));
  }
  function enable(){
    if(enabled) return;
    enabled = true;
    window.addEventListener('deviceorientation', handle, { passive:true });
  }
  function request(){
    if(requested || !wedding.features.gyroscope) return;
    requested = true;
    if(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'){
      DeviceOrientationEvent.requestPermission().then(state => { if(state === 'granted') enable(); }).catch(()=>{});
    } else if(typeof DeviceOrientationEvent !== 'undefined'){
      enable();
    }
  }
  function subscribe(fn){ subs.push(fn); }
  if(IS_TOUCH && wedding.features.gyroscope){
    window.addEventListener('touchend', request, { once:true, passive:true });
  }
  return { subscribe, get x(){ return x; }, get y(){ return y; } };
})();

/* ============================================================
   3. REAL COASTLINE DATA — a compact land/ocean grid (2\u00b0 steps,
   180 x 89 points) derived from Natural Earth 110m land polygons,
   used to build an accurate dot-matrix globe with zero external
   image requests (keeps the site self-contained and fast).
   ============================================================ */
const LANDMASK = {
  lonStep:2, latStep:2, lonStart:-180, latStart:-88, lonCount:180, latCount:89,
  b64:"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAH//////////////////////////wAAP///////B/////////////////8AAAB/////8Aj4D///////////////4AAB///////AAQf///////////////+AAAB//////wAAAP//////////////8AAAAAAkH///AAAB///////////////AAAAAAAGAB3AAAAf/////+////////wAAAAAAAAAeAAAAACWH//+f//////wAAAAAAAAAAEAAAAAAAAB/+B/////wAAAAAAAAAAACAAAAAAAAAGAAACEAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8AAAAAAAAAAAAAAAAAAAAAAAAAAAAB4AAAAAAAAAAAAAAAAAAAwAAAAAAAAA8AAAAAAAAAAAAAAAAAAAYAAAAAAAAB8AAAAAAAAAAAAAAAAAYAMAAAAAAAAA+AAAAAAAAAAAAAAAAAAACAAAAAAAAA/wAAAAAAAAAAAAAAABwADAAAAAAAAA/wAAAAAAAAAAAAAAAD8AEAAAAAAAAAf8AAAAADAAAAAAADAP8AAAAAAAAAAAf+AAAAAD4AAAAAAD+f+AAAAAAAAAAAf+AAAAAH8AAAAAAD//+AAAAAAAAAAAf/AAAAAP+AAAAAAD//+AAAAAAAAAAAf/AAAAAP+AAAAAAH//+AAAAAAAAAAAf/gAAAAP/DAAAAAH//8AAAAAAAAAAAf/8AAAAP/DgAAAAD//4BAAAAAAAAAAf/8AAAAf/BgAAAAA//4AAAAAAAAAAAf/+AAAA//hgAAAAAP/wABAAAAAAAAB//+AAAA//5gAAAAAH5gAAAAAAAAAAD//+AAAAf/4wAAAAABxAAAAAAAAAAAD///AAAAf/4AAAAAAAZAAAAAAAAAAAH///gAAAf/wAAAAAAoAMAAAAAAAAAAH///gAAAf/wAAAAAMAHYAAAAAAAAAAP///gAAAf/wAAAABAAD0AAAAAAAAAAP//+AAAA//wAAAACAwPgAAAAAAAAAAP//wAAAB//4AAAAGOgUAAAAAAAAAAAP/+AAAAB//8AAAAMeiAAAAAAAAAAAAH/+AAAAB//+AAAAKOAAAAAAAAAAAAAD/+AAAAB///AAAAUGAAAAAAAAAAAAAD/wAAAfn///gAAAEAAAAAAAAAAAAAAH/gAAA/////wACAIAMAAAAAAAAAAAAh+AAAB/////wAEABAAAAAAAAAAAAABgwAAAD////8AAMADgAAAAAAAAAAAAHgAAAAD////7gAOAPgQAAAAAAAAAAA9AAAAAD////z4AeAfggAAAAAAAAAAH8AEAAAD////3+AfA/AQAAAAAAAAAAPGCAAAAD////n+Afx/QAAAAAAAAAAAPAsAAAAD////v/B///4AAAAAAAAAABfAAAAAAB////P+D///+AAAAAAAAAAC/AAAAAAB////fx/////AAAAAAAAAAF/AQAAAAA/////v/////gAAAAAAAAAD/8QAAAAAP////v/////gAAAAAAAAAP//wAAAAAP/zg///////gAAAAAAAAAf//8AAAAAH/AA///////g4AAAAAAAA///+AAAAAAfAAf//////iOAAAAAAAB///8AAAAAPAZv/n/////GCAAAAAAAD///+AAAAAPgLv/n/////cCAAAAAAAD////wAAAAPwzxHn//////CAAAAAAAD////0AAAAA/v4PP//////xgAAAAAAB////+gAAAA//9fn//////4AAAAAAAD////8cAAAD///////////9AAAAAAAP////4IAAAAf//////////+gAAAAAAH///3/4AAALn///////////AQAAAAA////n/wAAAJBv/////////6A4AACAA///+D/AAAACBx/////////4A8AAAgB///wD+AAAACA4f////////+AcAAf0f///gDwAAAAAH8n//////////GAAP/////wPAA4AAAH5///////////98AD/////9w8B8AcAB+/////////////A///////////////gA4AAAAAAAAAAAP///////////////wAGwAQAAAAAAAAAH/gYP94/4H//gAAB8AAD///////wAAAAADfTH+AH//gAAAAAMBn///+D4AAAAAADwAYAAP//wAAAAADAAP/wAAAAAAAAABMnIAA///4AAAAAA8AB/4AHAAAAAAAADCA8////4AAdAAAAAAIAAAAAAAAAAAAA//n///8AALwAAAABwAAAAAAAAAAAAAH/+//+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
};
function decodeLandmask(){
  const binary = atob(LANDMASK.b64);
  const bytes = new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  const total = LANDMASK.lonCount * LANDMASK.latCount;
  const points = [];
  for(let i=0;i<total;i++){
    const bit = (bytes[i>>3] >> (7-(i%8))) & 1;
    if(!bit) continue;
    const latI = Math.floor(i / LANDMASK.lonCount);
    const lonI = i % LANDMASK.lonCount;
    points.push([ LANDMASK.latStart + latI*LANDMASK.latStep, LANDMASK.lonStart + lonI*LANDMASK.lonStep ]);
  }
  return points;
}

/* ============================================================
   4. GENERIC PARTICLE FIELD
   A single reusable canvas particle engine used for every ambient
   layer on the site (opening stars, Munich "schematic lines",
   Bangalore petals/dust, save-the-date motes, ending fireflies +
   lanterns). Kept as one class so behaviour stays consistent and
   there is only one animation-loop implementation to optimise.
   ============================================================ */
class ParticleField{
  constructor(canvas, opts){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = Object.assign({
      count: 80,
      kind: 'dot',            // 'dot' | 'line' | 'petal' | 'firefly' | 'lantern'
      color: '248,246,242',
      speed: 0.12,
      sizeMin: 0.6,
      sizeMax: 1.8,
      driftY: -1,             // -1 up, 1 down, 0 none
      twinkle: true,
      parallax: 0,            // 0..1, how much mouse/scroll shifts the field
      running: true
    }, opts||{});
    this.particles = [];
    this.mouse = {x:0,y:0};
    this.running = false;
    this._resize = this._resize.bind(this);
    this._tick = this._tick.bind(this);
    this._resize();
    this._seed();
    window.addEventListener('resize', this._resize, {passive:true});
    if(this.opts.parallax){
      if(IS_TOUCH){
        Gyro.subscribe((gx, gy)=>{ this.mouse.x = gx * 0.5; this.mouse.y = gy * 0.5; });
      } else if(wedding.features.mouseParallax){
        window.addEventListener('mousemove', (e)=>{
          this.mouse.x = (e.clientX/window.innerWidth - .5);
          this.mouse.y = (e.clientY/window.innerHeight - .5);
        }, {passive:true});
      }
    }
  }
  _resize(){
    const r = this.canvas.getBoundingClientRect();
    this.w = this.canvas.width = Math.round(r.width * Math.min(devicePixelRatio||1, MAX_PIXEL_RATIO));
    this.h = this.canvas.height = Math.round(r.height * Math.min(devicePixelRatio||1, MAX_PIXEL_RATIO));
  }
  _seed(){
    const n = Math.max(4, Math.round(this.opts.count * TIER_PARTICLES));
    this.particles = new Array(n).fill(0).map(()=> this._spawn());
  }
  _spawn(edge){
    const o = this.opts;
    return {
      x: Math.random()*this.w,
      y: edge ? (o.driftY < 0 ? this.h + 10 : -10) : Math.random()*this.h,
      r: lerp(o.sizeMin, o.sizeMax, Math.random()) * Math.min(devicePixelRatio||1, MAX_PIXEL_RATIO),
      vy: (o.driftY) * lerp(0.15, 1, Math.random()) * o.speed * 2,
      vx: (Math.random()-0.5) * o.speed,
      a: Math.random(),
      aDir: Math.random() > .5 ? 1 : -1,
      wobble: Math.random()*Math.PI*2,
      angle: Math.random()*Math.PI*2
    };
  }
  start(){ if(this.running) return; this.running = true; this._raf = requestAnimationFrame(this._tick); }
  stop(){ this.running = false; if(this._raf) cancelAnimationFrame(this._raf); }
  _tick(){
    if(!this.running) return;
    this._draw();
    this._raf = requestAnimationFrame(this._tick);
  }
  _draw(){
    const ctx = this.ctx, o = this.opts;
    ctx.clearRect(0,0,this.w,this.h);
    const px = this.mouse.x * this.w * o.parallax;
    const py = this.mouse.y * this.h * o.parallax;
    for(const p of this.particles){
      p.x += p.vx; p.y += p.vy; p.wobble += 0.01;
      if(o.twinkle){ p.a += 0.006*p.aDir; if(p.a<=0.15||p.a>=1){ p.aDir*=-1; } }
      const wob = Math.sin(p.wobble) * (o.kind==='petal'||o.kind==='firefly' ? 6 : 1);
      const x = p.x + wob + px, y = p.y + py;
      if(p.y < -20 || p.y > this.h+20 || p.x < -20 || p.x > this.w+20){
        Object.assign(p, this._spawn(true));
        continue;
      }
      ctx.globalAlpha = clamp01(p.a);
      if(o.kind === 'dot' || o.kind === 'firefly'){
        const grd = ctx.createRadialGradient(x,y,0,x,y,p.r*(o.kind==='firefly'?5:3));
        grd.addColorStop(0, `rgba(${o.color},${o.kind==='firefly'?0.9:0.85})`);
        grd.addColorStop(1, `rgba(${o.color},0)`);
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(x,y,p.r*(o.kind==='firefly'?5:3),0,Math.PI*2); ctx.fill();
      } else if(o.kind === 'line'){
        ctx.strokeStyle = `rgba(${o.color},${0.5*p.a})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x + Math.cos(p.angle)*p.r*6, y + Math.sin(p.angle)*p.r*6); ctx.stroke();
      } else if(o.kind === 'petal'){
        ctx.fillStyle = `rgba(${o.color},${0.75*p.a})`;
        ctx.beginPath();
        ctx.ellipse(x, y, p.r*2.4, p.r*1.3, p.wobble, 0, Math.PI*2);
        ctx.fill();
      } else if(o.kind === 'lantern'){
        const grd = ctx.createRadialGradient(x,y,0,x,y,p.r*7);
        grd.addColorStop(0, `rgba(${o.color},${0.55*p.a})`);
        grd.addColorStop(1, `rgba(${o.color},0)`);
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.ellipse(x,y,p.r*3.2,p.r*4.2,0,0,Math.PI*2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

/* pause/resume every particle field when its canvas leaves/enters view,
   and whenever the tab is hidden — keeps idle CPU near zero */
const ALL_FIELDS = [];
function registerField(field, canvas){
  ALL_FIELDS.push(field);
  onVisible(canvas, ()=>{ if(document.visibilityState==='visible') field.start(); });
  const io2 = new IntersectionObserver((entries)=>{
    entries.forEach(en => { if(!en.isIntersecting) field.stop(); });
  }, {threshold:0});
  io2.observe(canvas);
}
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='hidden'){ ALL_FIELDS.forEach(f=>f.stop()); }
});

/* ============================================================
   5. CITY SKYLINES (Munich / Bangalore) — abstracted silhouettes,
   no logos or literal building reproductions: Munich reads as
   modern towers + a distant alpine ridge; Bangalore reads as a
   domed rotunda silhouette + garden foliage. Built as generated
   SVG paths so they scale losslessly and need no image assets.
   ============================================================ */
/* ============================================================
   5c. BIRDS — a few small silhouettes crossing each city scene,
   drawn as simple flapping wing-strokes rather than sprites.
   ============================================================ */
function initBirds(canvas, color){
  if(!canvas || TIER === 'low' || REDUCED_MOTION) return;
  const ctx = canvas.getContext('2d');
  let w=0, h=0, birds=[], running=false, raf=null;

  function spawnBird(atStart){
    return {
      x: atStart ? -40 - Math.random()*260 : Math.random()*w,
      y: h*0.10 + Math.random()*h*0.28,
      speed: 0.35 + Math.random()*0.3,
      wingPhase: Math.random()*Math.PI*2,
      scale: 0.7 + Math.random()*0.6
    };
  }
  function resize(){
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio||1, MAX_PIXEL_RATIO);
    canvas.width = Math.round(r.width*dpr); canvas.height = Math.round(r.height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    w = r.width; h = r.height;
    birds = new Array(3).fill(0).map(()=>spawnBird(true));
  }
  function draw(){
    ctx.clearRect(0,0,w,h);
    birds.forEach(b=>{
      b.x += b.speed;
      b.wingPhase += 0.16;
      if(b.x > w+40){ Object.assign(b, spawnBird(true)); }
      const flap = Math.sin(b.wingPhase) * 5 * b.scale;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(b.x-6*b.scale, b.y-flap);
      ctx.quadraticCurveTo(b.x, b.y+3*b.scale, b.x+6*b.scale, b.y-flap);
      ctx.stroke();
    });
  }
  function frame(){ if(!running) return; draw(); raf = requestAnimationFrame(frame); }
  function start(){ if(running) return; running = true; frame(); }
  function stop(){ running = false; if(raf) cancelAnimationFrame(raf); }

  resize();
  window.addEventListener('resize', resize, {passive:true});
  onVisible(canvas, start);
  const io = new IntersectionObserver(es=>es.forEach(e=>{ if(!e.isIntersecting) stop(); }), {threshold:0});
  io.observe(canvas);
}

/* ============================================================
   5d. DRIFTING CLOUDS (Munich) — soft blurred shapes moving
   slowly across the sky, independent of the parallax layers.
   ============================================================ */
function initCityClouds(canvas){
  if(!canvas || TIER === 'low' || REDUCED_MOTION) return;
  const ctx = canvas.getContext('2d');
  let w=0, h=0, blobs=[], running=false, raf=null;

  function resize(){
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio||1, MAX_PIXEL_RATIO);
    canvas.width = Math.round(r.width*dpr); canvas.height = Math.round(r.height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    w = r.width; h = r.height;
    const n = Math.max(3, Math.round(6*TIER_PARTICLES));
    blobs = new Array(n).fill(0).map(()=>({
      x: Math.random()*w*1.4 - w*0.2, y: h*0.08 + Math.random()*h*0.3,
      r: 50+Math.random()*90, speed: 0.05+Math.random()*0.08, a: 0.05+Math.random()*0.07
    }));
  }
  function draw(){
    ctx.clearRect(0,0,w,h);
    blobs.forEach(b=>{
      b.x += b.speed;
      if(b.x - b.r > w) b.x = -b.r;
      const g = ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);
      g.addColorStop(0, `rgba(248,246,242,${b.a})`);
      g.addColorStop(1, 'rgba(248,246,242,0)');
      ctx.beginPath(); ctx.ellipse(b.x,b.y,b.r,b.r*0.45,0,0,Math.PI*2);
      ctx.fillStyle = g; ctx.fill();
    });
  }
  function frame(){ if(!running) return; draw(); raf = requestAnimationFrame(frame); }
  function start(){ if(running) return; running = true; frame(); }
  function stop(){ running = false; if(raf) cancelAnimationFrame(raf); }

  resize();
  window.addEventListener('resize', resize, {passive:true});
  onVisible(canvas, start);
  const io = new IntersectionObserver(es=>es.forEach(e=>{ if(!e.isIntersecting) stop(); }), {threshold:0});
  io.observe(canvas);
}

/* ============================================================
   6. LIVING EARTH — Three.js dot-matrix globe built from the real
   coastline grid decoded above. Day/night shading on every land
   point is computed once from the real current subsolar point, so
   Munich and Bangalore are genuinely lit by their own local time
   the moment the page loads (per feature flag dynamicTimezones).
   ============================================================ */
const EarthScene = (function(){
  const RADIUS = 140;
  const FOV = 42;
  const FOV_TAN = Math.tan(FOV * Math.PI / 360);   // tan(fov/2)
  /* A perspective camera's projection is driven by the *vertical* FOV, so on a
     portrait phone the sphere comes out wider than the frame — the captions then
     have nowhere to sit and get pushed off the sides. Pull the camera back until
     the globe is inscribed in the shorter edge instead. min() picks the height
     term on anything wider than ~5:4, so desktop keeps its existing framing
     (1440x800 resolves to 480, the distance that was hard-coded here). */
  let camScale = 1;
  function frameScale(rect){
    const w = Math.max(rect.width,1), h = Math.max(rect.height,1);
    const wantedRadiusPx = Math.min(w*0.475, h*0.38);
    return Math.max(1, (RADIUS/FOV_TAN) * (h/2) / wantedRadiusPx / 480);
  }
  /* the globe reads hard against the top edge with a lot of empty space
     below it by the time the scene has zoomed in. Two prior attempts at this
     (curve-fit against 2-3 sampled viewports) both misjudged how MUCH room
     there actually is to work with and ended up pushing the globe's far edge
     straight past the frame — confirmed by the numbers: at this scene's most
     zoomed-in frame (t=1) the sphere already fills all but ~1.5deg of the
     42deg vertical FOV, symmetric top and bottom. Any shift bigger than that
     ~1.5deg clips one edge outright, and the previous formula was asking for
     up to ~7.6deg there — nearly 5x over budget.
     This version computes the real available slack from the actual FOV /
     sphere-angular-size geometry every frame, and only ever spends a
     bounded share of it, so the far edge always keeps a guaranteed margin
     regardless of viewport or scroll position — no more curve-fitting
     against a handful of sampled screens. Aiming slightly above the globe's
     true center pushes its rendered position down in frame without moving
     the camera itself, so the markers/arc (which key off the same lookAt)
     stay geometrically correct. */
  const HALF_VFOV = (FOV * Math.PI/180) / 2;
  const SAFE_SLACK_SHARE = 0.6;   // leaves >=40% of the available margin untouched, always
  function placeCamera(progress){
    const t = clamp01(progress*1.3);
    const camY = lerp(30, 6, t) * camScale;
    const camZ = lerp(480, 420, t) * camScale;
    camera.position.z = camZ;
    camera.position.y = camY;

    const dist = Math.hypot(camY, camZ);
    const angRadius = Math.asin(clamp01(RADIUS / dist));
    const slack = Math.max(0, HALF_VFOV - angRadius);   // symmetric margin at dead-center, in radians
    const baseAngle = Math.atan2(-camY, camZ);          // branch-cut-safe: measured off +Z, never near +-180deg
    const targetAngle = baseAngle + slack * SAFE_SLACK_SHARE * t;
    const targetY = camY + camZ * Math.tan(targetAngle);
    camera.lookAt(0, targetY, 0);
  }
  let scene, camera, renderer, globe, landPoints3D, starField, cloudField, arcLine, arcPulse, arcPulsePoints, canvas;
  let munichMarker, bangaloreMarker;
  let raf = null, visible = false, supported = WEBGL_OK && wedding.features.earth;
  let idleAngle = 0, lastProgress = 0;
  /* canvas2D fallback state (only used when WebGL is unavailable) */
  let fbCtx = null, fbRotation = -1.773, fbStars = [], fbW = 0, fbH = 0, fbRaf = null, fbVisible = false, fbProgress = 0;

  function glowTexture(inner, outer, size){
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    ctx.fillStyle = g; ctx.fillRect(0,0,size,size);
    return new THREE.CanvasTexture(c);
  }

  function build(){
    canvas = document.getElementById('earthCanvas');
    const rect = canvas.getBoundingClientRect();
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(FOV, rect.width/Math.max(rect.height,1), 1, 4000);
    camScale = frameScale(rect);
    placeCamera(0);

    renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, MAX_PIXEL_RATIO));
    renderer.setSize(rect.width, rect.height, false);

    globe = new THREE.Group();
    scene.add(globe);

    /* soft atmospheric halo (reads as atmosphere without a custom shader) */
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(92,130,174,0.35)', 'rgba(92,130,174,0)', 512),
      transparent:true, depthWrite:false, blending: THREE.AdditiveBlending
    }));
    halo.scale.set(RADIUS*2.9, RADIUS*2.9, 1);
    scene.add(halo);

    /* ocean sphere */
    const ocean = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x070c15, transparent:true, opacity:0.97 })
    );
    globe.add(ocean);

    /* real coastline dots, shaded by actual current sun position */
    const pts = decodeLandmask();
    const positions = new Float32Array(pts.length*3);
    const colors = new Float32Array(pts.length*3);
    const sun = subsolarPoint(new Date());
    const sunVec = latLonToVector3(sun.lat, sun.lon, 1).normalize();
    const DAY = [0.80,0.84,0.90], NIGHT = [0.34,0.24,0.10];
    pts.forEach((p,i)=>{
      const v = latLonToVector3(p[0], p[1], RADIUS+0.8);
      positions[i*3]=v.x; positions[i*3+1]=v.y; positions[i*3+2]=v.z;
      const day = wedding.features.dynamicTimezones ? clamp01(v.clone().normalize().dot(sunVec)*2.4+0.2) : 0.6;
      colors[i*3]   = lerp(NIGHT[0], DAY[0], day);
      colors[i*3+1] = lerp(NIGHT[1], DAY[1], day);
      colors[i*3+2] = lerp(NIGHT[2], DAY[2], day);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
    landPoints3D = new THREE.Points(geo, new THREE.PointsMaterial({
      size:2.1, vertexColors:true, transparent:true, opacity:0.95, sizeAttenuation:true
    }));
    globe.add(landPoints3D);

    /* Munich + Bangalore markers — fixed colors (blue / green) so each city
       always reads as the same identity, rather than shifting with day/night */
    function marker(lat, lon, color, colorFade){
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(color, colorFade, 256),
        transparent:true, depthWrite:false, blending: THREE.AdditiveBlending
      }));
      const v = latLonToVector3(lat, lon, RADIUS+2);
      s.position.copy(v);
      s.scale.set(16,16,1);
      return s;
    }
    munichMarker = marker(MUNICH_LATLON[0], MUNICH_LATLON[1], 'rgba(92,130,174,1)', 'rgba(92,130,174,0)');
    bangaloreMarker = marker(BANGALORE_LATLON[0], BANGALORE_LATLON[1], 'rgba(96,181,140,1)', 'rgba(96,181,140,0)');
    globe.add(munichMarker, bangaloreMarker);

    /* dormant arc between the two cities — the thread the whole site follows */
    const a = latLonToVector3(MUNICH_LATLON[0], MUNICH_LATLON[1], RADIUS+1);
    const b = latLonToVector3(BANGALORE_LATLON[0], BANGALORE_LATLON[1], RADIUS+1);
    const arcPts = [];
    for(let i=0;i<=64;i++){
      const t = i/64;
      const p = new THREE.Vector3().copy(a).lerp(b, t).normalize().multiplyScalar(RADIUS + 1 + Math.sin(t*Math.PI)*26);
      arcPts.push(p);
    }
    const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPts);
    arcLine = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color:0xD4AF37, transparent:true, opacity:0.28 }));
    globe.add(arcLine);

    /* a small pulse of light that travels the arc every few seconds —
       the connection is alive, not just a static line */
    arcPulse = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(248,246,242,1)', 'rgba(212,175,55,0)', 128),
      transparent:true, depthWrite:false, blending: THREE.AdditiveBlending, opacity:0
    }));
    arcPulse.scale.set(9,9,1);
    arcPulsePoints = arcPts;
    globe.add(arcPulse);

    /* starfield background */
    const starCount = Math.round(1200 * TIER_PARTICLES);
    const starPos = new Float32Array(starCount*3);
    for(let i=0;i<starCount;i++){
      const r = 900 + Math.random()*900;
      const theta = Math.random()*Math.PI*2, phi = Math.acos((Math.random()*2)-1);
      starPos[i*3] = r*Math.sin(phi)*Math.cos(theta);
      starPos[i*3+1] = r*Math.sin(phi)*Math.sin(theta);
      starPos[i*3+2] = r*Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos,3));
    starField = new THREE.Points(starGeo, new THREE.PointsMaterial({ color:0xffffff, size:1.1, transparent:true, opacity:0.55 }));
    scene.add(starField);

    /* cloud layer — sits just above the coastline dots, drifts independently
       of the globe's own rotation (see update()) so it reads as genuine
       weather movement rather than a texture painted on the sphere */
    const cloudCount = Math.round(150 * TIER_PARTICLES);
    const cloudPos = new Float32Array(cloudCount*3);
    for(let i=0;i<cloudCount;i++){
      const lat = (Math.random()-0.5)*150;      // biased away from the poles, like real cloud bands
      const lon = Math.random()*360 - 180;
      const v = latLonToVector3(lat, lon, RADIUS + 4.5);
      cloudPos[i*3]=v.x; cloudPos[i*3+1]=v.y; cloudPos[i*3+2]=v.z;
    }
    const cloudGeo = new THREE.BufferGeometry();
    cloudGeo.setAttribute('position', new THREE.BufferAttribute(cloudPos,3));
    cloudField = new THREE.Points(cloudGeo, new THREE.PointsMaterial({
      color:0xF8F6F2, size:2.6, transparent:true, opacity:0.2, sizeAttenuation:true
    }));
    cloudField.rotation.y = -1.773;
    scene.add(cloudField);

    /* base rotation so Munich faces the camera at rest (progress 0) */
    globe.rotation.y = -1.773;

    window.addEventListener('resize', onResize, {passive:true});
    onVisible(canvas, ()=>start());
    const io = new IntersectionObserver((entries)=>{ entries.forEach(en=>{ if(!en.isIntersecting) stop(); }); }, {threshold:0});
    io.observe(canvas);
  }

  function onResize(){
    if(!renderer) return;
    const rect = canvas.getBoundingClientRect();
    camera.aspect = rect.width/Math.max(rect.height,1);
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
    /* a rotation is an aspect change too, so re-fit rather than keeping the
       distance that was right for the previous orientation */
    camScale = frameScale(rect);
    placeCamera(lastProgress);
  }

  /* ---------------------------------------------------------------
     Canvas2D fallback — used only when WebGL isn't available. Keeps
     the scene alive (rotating wireframe globe, real starfield, the
     two city pins, a connecting arc that brightens with scroll
     progress) instead of leaving a flat, empty gradient.
     --------------------------------------------------------------- */
  function fbResize(){
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio||1, MAX_PIXEL_RATIO);
    canvas.width = Math.round(rect.width*dpr);
    canvas.height = Math.round(rect.height*dpr);
    fbCtx.setTransform(dpr,0,0,dpr,0,0);
    fbW = rect.width; fbH = rect.height;
    const count = Math.max(20, Math.round(140 * TIER_PARTICLES));
    fbStars = new Array(count).fill(0).map(()=>({
      x: Math.random()*fbW, y: Math.random()*fbH, r: Math.random()*1.1+0.2,
      phase: Math.random()*Math.PI*2, speed: 0.5+Math.random()*1.2
    }));
  }
  function fbDraw(t){
    const ctx = fbCtx, cx = fbW/2, cy = fbH/2, R = Math.min(fbW,fbH)*0.32;
    ctx.clearRect(0,0,fbW,fbH);
    fbStars.forEach(s=>{
      const a = 0.2+0.5*(0.5+0.5*Math.sin(t*0.001*s.speed+s.phase));
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
      ctx.fillStyle = `rgba(248,246,242,${a.toFixed(3)})`; ctx.fill();
    });
    const grad = ctx.createRadialGradient(cx-R*0.35,cy-R*0.35,R*0.08,cx,cy,R);
    grad.addColorStop(0,'rgba(92,130,174,0.18)');
    grad.addColorStop(0.55,'rgba(20,22,18,0.88)');
    grad.addColorStop(1,'rgba(5,5,5,0.98)');
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.fillStyle = grad; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(212,175,55,0.22)';
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.stroke();
    [-0.66,-0.33,0,0.33,0.66].forEach(o=>{
      const rx = R*Math.sqrt(Math.max(0,1-o*o));
      ctx.beginPath(); ctx.ellipse(cx,cy+o*R,rx,R*0.055,0,0,Math.PI*2);
      ctx.strokeStyle = 'rgba(248,246,242,0.07)'; ctx.stroke();
    });
    for(let m=0;m<6;m++){
      const phase = (m/6)*Math.PI + fbRotation;
      const rx = Math.abs(R*Math.sin(phase));
      const alpha = 0.05+0.16*Math.max(0, Math.cos(phase));
      ctx.beginPath(); ctx.ellipse(cx,cy,Math.max(0.6,rx),R,0,0,Math.PI*2);
      ctx.strokeStyle = `rgba(212,175,55,${alpha.toFixed(3)})`; ctx.stroke();
    }
    const munichPt = [cx-R*0.42, cy-R*0.18], bangalorePt = [cx+R*0.4, cy+R*0.32];
    ctx.strokeStyle = `rgba(212,175,55,${(0.2+0.5*fbProgress).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(munichPt[0], munichPt[1]);
    ctx.quadraticCurveTo(cx, cy - R*0.75, bangalorePt[0], bangalorePt[1]);
    ctx.stroke();
    [munichPt, bangalorePt].forEach(pt=>{
      const g = ctx.createRadialGradient(pt[0],pt[1],0,pt[0],pt[1],14);
      g.addColorStop(0,'rgba(212,175,55,0.9)'); g.addColorStop(1,'rgba(212,175,55,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pt[0],pt[1],14,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#F8F6F2'; ctx.beginPath(); ctx.arc(pt[0],pt[1],3,0,Math.PI*2); ctx.fill();
    });
  }
  function fbFrame(t){
    if(!fbVisible) return;
    fbDraw(t||0);
    if(!REDUCED_MOTION) fbRotation += 0.0018;
    fbRaf = requestAnimationFrame(fbFrame);
  }
  function fbStart(){ if(fbVisible) return; fbVisible = true; fbFrame(); }
  function fbStop(){ fbVisible = false; if(fbRaf) cancelAnimationFrame(fbRaf); }
  function fbInit(){
    canvas = document.getElementById('earthCanvas');
    fbCtx = canvas.getContext('2d');
    fbResize();
    window.addEventListener('resize', fbResize, {passive:true});
    onVisible(canvas, fbStart);
    const io = new IntersectionObserver(es=>es.forEach(e=>{ if(!e.isIntersecting) fbStop(); }), {threshold:0});
    io.observe(canvas);
  }

  /* Bangalore's caption becomes visible at this progress — the globe's own
     rotation freezes here too, so the two cities hold steady in frame for
     the rest of the scene instead of continuing to spin past them */
  const BANGALORE_REVEAL = 0.5;
  /* called continuously by ScrollTrigger with 0..1 progress through the pinned scene */
  function update(progress){
    lastProgress = progress;
    if(supported){
      const rotProgress = Math.min(progress, BANGALORE_REVEAL);
      if(progress < BANGALORE_REVEAL) idleAngle += REDUCED_MOTION ? 0 : 0.0009;
      /* rotate from Munich-facing toward Bangalore-facing as progress advances (~66°, the real
         longitude gap between the two cities) — idle drift nudges the same direction, not against it */
      globe.rotation.y = -1.773 - idleAngle + rotProgress * -1.152;
      if(cloudField) cloudField.rotation.y = -1.773 - idleAngle*1.6 + rotProgress * -1.35;
      /* zoom target kept far enough that the sphere (radius 140, 42° vertical
         FOV) always stays fully inscribed in the frame — closer than ~390
         and the bottom/top edges clip past the viewport. camScale widens that
         margin again on frames that are taller than they are wide. */
      placeCamera(progress);
      arcLine.material.opacity = lerp(0.3, 0.85, progress);
    } else {
      fbProgress = progress;
    }

    const distLbl = document.getElementById('earthDistance');
    distLbl.classList.toggle('is-visible', progress > 0.62 && progress < 0.95);
  }

  /* keeps the Munich/Bangalore captions pinned to their actual marker on the
     rotating globe, rather than sitting at a fixed screen position that only
     lined up by coincidence at one particular rotation. Hides the caption
     entirely once its marker has rotated onto the far side of the sphere. */
  const _labelWorldPos = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  const _labelScratch = (typeof THREE !== 'undefined') ? new THREE.Vector3() : null;
  /* pins each caption to its marker, then pushes it radially outward past the
     globe's own screen-space silhouette so it always lands on the black
     background rather than overlapping the dot grid (worst near the poles,
     e.g. Munich, where the sphere curves away sharply and leaves little room) */
  function pinLabel(labelEl, markerObj){
    if(!labelEl || !markerObj) return;
    markerObj.getWorldPosition(_labelWorldPos);
    const toCam = camera.position.clone().normalize();
    const facing = _labelWorldPos.clone().normalize().dot(toCam) > 0.08;
    const proj = _labelWorldPos.clone().project(camera);
    const rect = canvas.getBoundingClientRect();
    const onScreen = proj.z < 1 && proj.x > -1.2 && proj.x < 1.2 && proj.y > -1.2 && proj.y < 1.2;
    const visible = facing && onScreen;
    labelEl.classList.toggle('is-visible', visible);
    if(!visible) return;
    const x = (proj.x*0.5+0.5) * rect.width;
    const y = (1-(proj.y*0.5+0.5)) * rect.height;

    const centerProj = _labelScratch.set(0,0,0).project(camera);
    const cx = (centerProj.x*0.5+0.5) * rect.width;
    const cy = (1-(centerProj.y*0.5+0.5)) * rect.height;
    const edgeProj = _labelScratch.set(RADIUS,0,0).project(camera);
    const ex = (edgeProj.x*0.5+0.5) * rect.width;
    const ey = (1-(edgeProj.y*0.5+0.5)) * rect.height;
    const screenRadius = Math.hypot(ex-cx, ey-cy);

    let dx = x-cx, dy = y-cy;
    const len = Math.hypot(dx,dy) || 1;
    dx /= len; dy /= len;
    const targetDist = screenRadius + 26;
    const lx = cx + dx*targetDist;
    const ly = cy + dy*targetDist;

    labelEl.style.right = 'auto';
    labelEl.style.bottom = 'auto';
    labelEl.style.top = ly+'px';
    labelEl.style.left = lx+'px';
    labelEl.style.textAlign = dx >= 0 ? 'left' : 'right';
    labelEl.style.transform = `translate(${dx>=0?'0%':'-100%'}, ${dy>=0?'0%':'-100%'})`;

    nudgeIntoFrame(labelEl, rect, lx, ly);
  }
  /* pushed away from its marker, a label can overshoot the canvas edge on
     tighter viewports — nudge it back fully on-screen without undoing the
     offset where there's room for it */
  const EDGE_PAD = 10;
  function nudgeIntoFrame(labelEl, rect, lx, ly){
    const box = labelEl.getBoundingClientRect();
    let shiftX = 0, shiftY = 0;
    if(box.left < rect.left+EDGE_PAD) shiftX = (rect.left+EDGE_PAD) - box.left;
    else if(box.right > rect.right-EDGE_PAD) shiftX = (rect.right-EDGE_PAD) - box.right;
    if(box.top < rect.top+EDGE_PAD) shiftY = (rect.top+EDGE_PAD) - box.top;
    else if(box.bottom > rect.bottom-EDGE_PAD) shiftY = (rect.bottom-EDGE_PAD) - box.bottom;
    if(shiftX || shiftY){
      labelEl.style.left = (lx+shiftX)+'px';
      labelEl.style.top = (ly+shiftY)+'px';
    }
  }
  /* Bangalore's marker sits mid-globe with plenty of clear space already, so
     it keeps the original simple pin: right at the marker with a small fixed
     gap, anchored to its given side. Only Munich (near the pole, cramped
     against the sphere's own curve) needs the outside-the-globe treatment. */
  function pinLabelSimple(labelEl, markerObj, side){
    if(!labelEl || !markerObj) return;
    markerObj.getWorldPosition(_labelWorldPos);
    const toCam = camera.position.clone().normalize();
    const facing = _labelWorldPos.clone().normalize().dot(toCam) > 0.08;
    const proj = _labelWorldPos.clone().project(camera);
    const rect = canvas.getBoundingClientRect();
    const onScreen = proj.z < 1 && proj.x > -1.2 && proj.x < 1.2 && proj.y > -1.2 && proj.y < 1.2;
    const visible = facing && onScreen;
    labelEl.classList.toggle('is-visible', visible);
    if(!visible) return;
    const x = (proj.x*0.5+0.5) * rect.width;
    const y = (1-(proj.y*0.5+0.5)) * rect.height;
    const gap = 22;
    /* `side` is the preference, not a rule: on a narrow frame the marker can sit
       close enough to that edge that the caption would hang off it, so fall back
       to the opposite side while it still has room there */
    const boxW = labelEl.offsetWidth;
    let placeLeft = side !== 'left';
    if(placeLeft && x - gap - boxW < EDGE_PAD) placeLeft = false;
    else if(!placeLeft && x + gap + boxW > rect.width - EDGE_PAD) placeLeft = true;

    const lx = placeLeft ? x-gap : x+gap;
    labelEl.style.right = 'auto';
    labelEl.style.bottom = 'auto';
    labelEl.style.top = y+'px';
    labelEl.style.left = lx+'px';
    labelEl.style.textAlign = placeLeft ? 'right' : 'left';
    labelEl.style.transform = placeLeft ? 'translate(-100%,-50%)' : 'translateY(-50%)';
    nudgeIntoFrame(labelEl, rect, lx, y);
  }
  function updateLabels(){
    if(!supported) return;
    const munichWindowOk = lastProgress > 0.22 && lastProgress < 0.78;
    const bangaloreWindowOk = lastProgress > BANGALORE_REVEAL && lastProgress < 0.95;
    if(munichWindowOk) pinLabel(document.getElementById('earth-label-munich'), munichMarker);
    else document.getElementById('earth-label-munich').classList.remove('is-visible');
    if(bangaloreWindowOk) pinLabelSimple(document.getElementById('earth-label-bangalore'), bangaloreMarker, 'right');
    else document.getElementById('earth-label-bangalore').classList.remove('is-visible');
  }

  function render(){
    if(!visible) return;
    if(arcPulse && arcPulsePoints && arcPulsePoints.length && !REDUCED_MOTION){
      const cycle = 4200;
      const t = (performance.now() % cycle) / cycle;
      const idx = Math.min(arcPulsePoints.length-1, Math.floor(t * arcPulsePoints.length));
      arcPulse.position.copy(arcPulsePoints[idx]);
      arcPulse.material.opacity = Math.max(0, Math.sin(t * Math.PI)) * 0.9;
    }
    renderer.render(scene, camera);
    updateLabels();
    if(REDUCED_MOTION){ visible = false; return; }
    raf = requestAnimationFrame(render);
  }
  function start(){ if(!supported || visible) return; visible = true; render(); }
  function stop(){ visible = false; if(raf) cancelAnimationFrame(raf); }

  function init(){
    if(!supported){
      fbInit();
      return;
    }
    build();
  }
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState==='hidden'){ stop(); fbStop(); }
    else if(supported){ start(); } else { fbStart(); }
  });

  return { init, update, updateLabels, get supported(){ return supported; } };
})();

/* ============================================================
   7. CONNECTION SCENE — two golden lights (Harsha / Lekhana; no
   human figures, per spec) cross the distance, merge into an
   infinity symbol, then resolve into two interlocking rings.
   Position is always derived from `progress` directly (never
   accumulated frame-to-frame) so scrubbing backward looks correct.
   ============================================================ */
const ConnectionScene = (function(){
  let canvas, ctx, w, h, raf, visible = false, progress = 0;
  /* every fixed-pixel dot/glow radius below is specified in canvas (already
     dpr-scaled) space, same as `w`/`h` — dpr itself has to be scaled through
     too, matching how ParticleField already does it, or a "10" is only 10
     *device* pixels: 5 real CSS pixels on an ordinary 2x phone screen, a
     third of that on 3x. That's the whole story scene reading tiny on
     exactly the devices most guests will actually open this on. */
  let dpr = 1;
  const ease = t => t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;

  /* phase boundaries across the single continuous 0..1 progress —
     the whole relationship, told once, in one unbroken animation.

     Story phases sit on a shared grid so that no phase gets more screen time
     than another regardless of how long its line of copy is, and the scene
     keeps one steady rhythm instead of racing through short beats and dwelling
     on long ones. The grid is offset by INTRO so the two lights hold still for
     a moment before anything begins.

     These boundaries are also exactly the caption slot boundaries (see
     CAPTION_BEATS): phase N's last frame is phase N+1's first frame, and
     the caption for phase N hands over at that same instant. Every
     position function below is written so the orbs' end point in one
     phase IS their start point in the next — verified, not approximated.

     One beat is deliberately not a full slot. The video-call beat (29 June)
     holds two still lights and a travelling wave — less motion than any other
     phase — and at a full slot it was the one place the scene asked you to keep
     scrolling with nothing new arriving. It runs at half a slot. The scene's
     own height in style.css comes down by the matching amount, so every *other*
     beat keeps exactly the scroll distance it had; shortening one beat here
     would otherwise just hand its progress to its neighbours. */
  const INTRO = 0.02;
  const BEAT_WEIGHTS = [1, 1, 1, 1, 1, 0.5, 1, 1];
  const SLOT = 0.90 / BEAT_WEIGHTS.reduce((a,b)=>a+b, 0);   // one full-weight beat
  /* progress at the start of beat i; the last entry is the end of the last beat */
  const EDGE = BEAT_WEIGHTS.reduce((acc,wt)=>{ acc.push(acc[acc.length-1] + wt*SLOT); return acc; }, [INTRO]);
  const PH = {
    intro_end:      EDGE[0],           // both lights hold at their far corners
    spark_end:      EDGE[1],           // phase 1: converging from opposite corners
    discovery_end:  EDGE[2],           // phase 2: first particles travel between them
    /* phase 3 carries one caption across two movements — the gap closing and
       the orbit forming — because they belong to the same sentence now */
    closing_end:    EDGE[3],           // phase 3: the gap shortens, then an orbit forms
    promise_end:    EDGE[4],           // phase 4: the two lights draw a heart
    flight_end:     EDGE[5],           // phase 5: one light departs as an aircraft
    videocall_end:  EDGE[6],           // phase 6: travelling light-waves grow stronger
    converge_end:   EDGE[7],           // phase 7: both lights merge to one at center
    infinity_end:   EDGE[7] + (EDGE[8]-EDGE[7])*0.45,  // phase 8a: the merged point traces infinity
    rings_end:      EDGE[8]            // phase 8b: infinity resolves into two rings
    // rings_end -> 1.00: the rings dissolve into a firework that gathers to one point
  };

  /* each beat now holds at full opacity between pk and hold, rather than
     peaking for a single instant, and windows are stretched to track their
     matching PH phase's duration (crossfading straight into the next beat
     wherever possible) so the text stays legible for as long as the visual
     beat itself lasts, instead of flashing past mid-motion.

     rise/fall no longer share one flat linear ramp for every beat, and
     each beat has its own curve (EASES below). Motion is defined by 10
     shared waypoints (WP) rather than 18 independent per-beat enter/exit
     values: beat N's `exit` and beat N+1's `enter` point at the exact same
     waypoint object, so at the instant a scroll-driven crossfade flips
     which beat is dominant, both beats resolve to the identical transform
     (same x/y/scale/blur/letter-spacing) — the container never jumps, it
     just keeps moving through the point where one line's motion becomes
     the next line's. Only WP[0] (before the first beat) and WP[8] (after
     the last) are unshared, since there's nothing to hand off to/from
     there. */
  const EASES = {
    linear: t => t,
    in:     t => t*t*t,
    out:    t => 1-Math.pow(1-t,3),
    inout:  ease,
    snap:   t => 1-Math.pow(1-t,6),
    /* settles past identity and eases back — a firm little landing bounce,
       used only for "We chose forever" so that one beat reads as the most
       decisive arrival in the sequence */
    drop:   t => { const c1=1.70158, c3=c1+1, m=t-1; return 1 + c3*m*m*m + c1*m*m; }
  };
  const WP = [
    /* WP0 — story rising into view, blurred, coming into focus */
    { y:22, blur:8 },
    /* WP1 — beat1 -> beat2: drifts on up-and-left as "two worlds" begin reaching in */
    { x:-22, y:-6 },
    /* WP2 — beat2 -> beat3: the conversation carries on right, lifting into a message's pop */
    { x:24, y:10, scale:1.08 },
    /* WP3 — beat3 -> beat4: rises up small, ready to drop back in decisively */
    { y:-20, scale:0.82 },
    /* WP4 — beat4 -> beat5: sinks and drifts left into the distance, blurring */
    { x:-30, y:14, blur:9 },
    /* WP5 — beat5 -> beat6: the blurred drift carries on right, sharpening into a screen-flicker pop */
    { x:30, y:0, blur:12, scale:1.05 },
    /* WP6 — beat6 -> beat7: the screen fades down-left, converging into the final approach */
    { x:-26, y:8, scale:0.97 },
    /* WP7 — beat7 -> beat8: settles low, tracking tightening, ready to rise into the finale */
    { y:14, scale:0.95, ls:-0.03 },
    /* WP8 — beat8's own departure: drifts up and away, ceremonial, nothing follows it */
    { y:-14 }
  ];
  /* every beat is built from the same three numbers, so no line can end up
     with more or less time than any other: a FADE-wide rise, a hold that
     fills the rest of its SLOT, and a FADE-wide fall. A beat's fall window
     is *exactly* the next beat's rise window, so the two always crossfade
     across the shared phase boundary — never a gap, never an overlap of
     unequal length. Longer copy does not buy extra time; the hold is sized
     once, for the longest line in the sequence, and every beat gets it. */
  const FADE = 0.022;
  function slot(i){
    const start = EDGE[i], end = EDGE[i+1];
    return { s:start-FADE/2, pk:start+FADE/2, hold:end-FADE/2, e:end+FADE/2 };
  }
  const CAPTION_BEATS = [
    Object.assign(slot(0), { date:'18 May 2026',     text:'A first glimpse in Bangalore.',
      rise:'inout', fall:'linear', enter:WP[0], exit:WP[1] }),
    Object.assign(slot(1), { date:'24 May 2026',     text:'A first conversation, and something quietly changed.',
      rise:'out',   fall:'linear', enter:WP[1], exit:WP[2] }),
    Object.assign(slot(2), { date:'31 May 2026',     text:'A first message that found its own rhythm.',
      rise:'snap',  fall:'in',     enter:WP[2], exit:WP[3] }),
    Object.assign(slot(3), { date:'25 June 2026',    text:'A promise made in Bangalore.',
      rise:'drop',  fall:'in',     enter:WP[3], exit:WP[4] }),
    Object.assign(slot(4), { date:'28 June 2026',    text:'Then came the miles — Bangalore to Munich.',
      rise:'inout', fall:'inout',  enter:WP[4], exit:WP[5] }),
    Object.assign(slot(5), { date:'29 June 2026',    text:'Different skies. Different clocks. The story continued.',
      rise:'snap',  fall:'linear', enter:WP[5], exit:WP[6] }),
    /* the last two beats carry the dated timeline into the countdown that
       follows — the table leaves the final connection line open, so these
       stay deliberately plain rather than inventing a new flourish */
    Object.assign(slot(6), { date:'',                text:'Every mile since has been bringing them closer.',
      rise:'out',   fall:'in',     enter:WP[6], exit:WP[7] }),
    Object.assign(slot(7), { date:'30 November 2026',text:'A new chapter begins.',
      rise:'inout', fall:'linear', enter:WP[7], exit:WP[8] })
  ];
  function captionEnvelope(b, p){
    if(b.sustain){ return p < b.s ? 0 : clamp01((p-b.s)/((b.pk-b.s)||1)); }
    if(p<=b.s || p>=b.e) return 0;
    const hold = b.hold != null ? b.hold : b.pk;
    const riseEase = EASES[b.rise] || EASES.linear;
    const fallEase = EASES[b.fall] || EASES.linear;
    if(p<=b.pk) return riseEase(clamp01((p-b.s)/((b.pk-b.s)||1)));
    if(p<=hold) return 1;
    return 1-fallEase(clamp01((p-hold)/((b.e-hold)||1)));
  }
  function updateCaption(p){
    const wrap = document.getElementById('connectionCaption');
    const dateEl = document.getElementById('connectionCaptionDate');
    const textEl = document.getElementById('connectionCaptionText');
    let bestBeat = null, bestOpacity = 0;
    CAPTION_BEATS.forEach(b=>{
      const o = captionEnvelope(b, p);
      if(o > bestOpacity){ bestOpacity = o; bestBeat = b; }
    });
    if(bestBeat){
      dateEl.textContent = bestBeat.date || '';
      textEl.textContent = bestBeat.text;
    }
    /* still rising (p < pk) -> approach identity from `enter`; already past
       peak -> approach identity from `hold`, or recede into `exit`. Both
       sides land on the exact same identity at bestOpacity===1, so there's
       no snap when the active side switches mid-hold. */
    const target = bestBeat ? (p < bestBeat.pk ? (bestBeat.enter||{}) : (bestBeat.exit||{})) : {};
    const tx = lerp(target.x||0, 0, bestOpacity);
    const ty = lerp(target.y||0, 0, bestOpacity);
    const sc = lerp(target.scale!=null ? target.scale : 1, 1, bestOpacity);
    const bl = lerp(target.blur||0, 0, bestOpacity);
    const ls = lerp(target.ls||0, 0, bestOpacity);
    wrap.style.opacity = String(bestOpacity);
    wrap.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${sc.toFixed(3)})`;
    wrap.style.filter = bl > 0.05 ? `blur(${bl.toFixed(2)}px)` : 'none';
    textEl.style.letterSpacing = Math.abs(ls) > 0.003 ? `${ls.toFixed(3)}em` : 'normal';
  }

  function resize(){
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio||1, MAX_PIXEL_RATIO);
    w = canvas.width = r.width*dpr; h = canvas.height = r.height*dpr;
    ctx.setTransform(1,0,0,1,0,0);
    /* cached finale particle positions are in absolute pixel space — stale on resize */
    finaleParticles = null;
    ringGradCache = {};
  }

  function quadPoint(p0,p1,cp,t){
    const x = (1-t)*(1-t)*p0[0] + 2*(1-t)*t*cp[0] + t*t*p1[0];
    const y = (1-t)*(1-t)*p0[1] + 2*(1-t)*t*cp[1] + t*t*p1[1];
    return [x,y];
  }

  /* ---- the fixed anchor points every phase begins and ends on. Phases
     only ever travel *between* these, so a boundary can never introduce a
     jump: whatever point ends one phase is the literal same expression
     that starts the next.

     Light A is Bangalore, light B is Munich, and the scene is laid out the way
     the two cities actually sit on the globe overhead: Munich up and to the
     left, Bangalore down and to the right. So A lives right of centre through
     the whole sequence and B left of it, and the flight in phase 6 leaves
     towards the top-left corner rather than away from it. ---- */
  function farA(){ return [w*0.88, h*0.68]; }
  function farB(){ return [w*0.12, h*0.32]; }
  function nearA(){ return [w*0.5 + w*0.11,   h*0.5 + h*0.03]; }
  function nearB(){ return [w*0.5 - w*0.11,   h*0.5 - h*0.03]; }
  function closeA(){ return [w*0.5 + w*0.045, h*0.5 + h*0.012]; }
  function closeB(){ return [w*0.5 - w*0.045, h*0.5 - h*0.012]; }
  /* Lekhana stays here; the flight departs from just beside her, so the
     aircraft's first frame is exactly where the orbit left the second light */
  /* 0 on any landscape-ish frame, 1 on a phone held upright. The two rest
     points were composed against a wide canvas; on a tall one they collapse
     into a short diagonal across the middle and leave the top and the whole
     left side of the screen empty. They spread apart as this rises. Every
     phase reads its endpoints from these same functions, so moving them moves
     the whole sequence together and the hand-offs stay exact. */
  function tallness(){ return clamp01((h/Math.max(w,1) - 1.15) / 0.55); }
  function bangaloreRestPoint(){
    const t = tallness();
    return [w*(0.56 + 0.14*t), h*(0.51 + 0.07*t)];
  }
  function departPoint(){ const b = bangaloreRestPoint(); return [b[0] - w*0.035, b[1] - h*0.012]; }
  function munichRestPoint(){
    const t = tallness();
    return [w*(0.12 + 0.04*t), h*(0.30 - 0.08*t)];
  }
  function screenCenter(){ return [w/2, h/2]; }
  function midPoint(p,q){ return [(p[0]+q[0])/2, (p[1]+q[1])/2]; }

  /* ---- the orbit is expressed as (centre, radius, angle) in a vertically
     squashed frame. `orbitSolve` inverts that: given where light A must
     sit, it returns the exact radius/angle that puts it there — which is
     how the orbit can begin precisely on closeA/closeB and end precisely
     on bangaloreRestPoint/departPoint with no easing fudge. Light B is
     always the antipode, so it lands on its own anchor for free. ---- */
  const ORBIT_SQUASH = 0.55;
  function orbitSolve(centre, target){
    const vx = target[0]-centre[0], vy = (target[1]-centre[1])/ORBIT_SQUASH;
    return { R: Math.hypot(vx,vy), theta: Math.atan2(vy,vx) };
  }
  function orbitPair(centre, R, theta){
    const ox = Math.cos(theta)*R, oy = Math.sin(theta)*R*ORBIT_SQUASH;
    return { a:[centre[0]+ox, centre[1]+oy], b:[centre[0]-ox, centre[1]-oy] };
  }
  function shortestTurn(to, from){
    return ((to - from + Math.PI*3) % (Math.PI*2)) - Math.PI;
  }
  const GROW_SPIN = Math.PI*1.15, SETTLE_SPIN = Math.PI*1.25;

  /* --- phase 1: two lights, converging from opposite corners toward a
     near-center resting distance (not fully merged — later phases still
     need two distinct points to work with) --- */
  function sparkPositions(prog){
    const t = ease(clamp01((prog-PH.intro_end)/(PH.spark_end-PH.intro_end)));
    const Acp = [w*0.30, h*0.30], Bcp = [w*0.70, h*0.70];
    return { a: quadPoint(farA(), nearA(), Acp, t), b: quadPoint(farB(), nearB(), Bcp, t) };
  }

  /* --- phase 2: discovery — the lights idle gently in place; the golden
     particles travelling between them (drawConversationParticles) do the
     storytelling here, not the lights' own motion. The bob is a whole
     number of half-cycles so it returns to exactly zero at both ends. --- */
  function discoveryPositions(prog){
    const p = clamp01((prog-PH.spark_end)/(PH.discovery_end-PH.spark_end));
    const bob = Math.sin(p*Math.PI*3) * h*0.006;
    const a = nearA(), b = nearB();
    return { a:[a[0], a[1]+bob], b:[b[0], b[1]-bob] };
  }

  /* --- phase 3: one phase, two movements, one caption. First the distance
     visibly shortens as the lights drift from their "near" resting points to
     their "close" ones; then that drift becomes a true orbit that widens as
     it turns. The join between the two is exact — the orbit is solved to open
     on closeA/closeB, the very points the drift ends on. --- */
  const CLOSE_SPLIT = 0.45;
  function closingPositions(prog){
    const p = clamp01((prog-PH.discovery_end)/(PH.closing_end-PH.discovery_end));
    if(p < CLOSE_SPLIT){
      const t = ease(clamp01(p/CLOSE_SPLIT));
      const a0 = nearA(), a1 = closeA(), b0 = nearB(), b1 = closeB();
      return { a:[lerp(a0[0],a1[0],t), lerp(a0[1],a1[1],t)], b:[lerp(b0[0],b1[0],t), lerp(b0[1],b1[1],t)] };
    }
    const t = ease(clamp01((p-CLOSE_SPLIT)/(1-CLOSE_SPLIT)));
    const centre = screenCenter();
    const base = orbitSolve(centre, closeA());
    return orbitPair(centre, base.R*lerp(1, 1.3, t), base.theta + GROW_SPIN*t);
  }

  /* --- phase 5: the promise. The one beat that draws a figure instead of
     orbiting — the previous phase is already an orbit, and two orbits back
     to back read as the same beat twice. Here the two lights leave the
     orbit, meet at the notch at the top of a heart, trace it down opposite
     sides, meet again at its point, and only then settle onto Bangalore. --- */
  const HEART_SPAN = 28.75;   // the curve's own height in its unit space
  const HEART_MID  = -2.625;  // ...and its vertical midpoint, so it sits centred
  function heartUnit(t){
    return [ 16*Math.pow(Math.sin(t),3),
             13*Math.cos(t) - 5*Math.cos(2*t) - 2*Math.cos(3*t) - Math.cos(4*t) ];
  }
  /* u in [-1,1]: 0 is the notch at the top, ±1 the point at the bottom.
     Negative u sweeps the left lobe, positive the right, and both ends
     land on the identical point — which is what lets the two lights meet. */
  function heartPoint(u){
    const c = screenCenter();
    /* 0.30 of the short edge fills a wide frame, but on a phone the short edge
       *is* the width, so the figure came out barely a third of the screen with
       the whole height empty around it. It grows with the frame instead. */
    const s = Math.min(w,h)*(0.30 + 0.17*tallness())/HEART_SPAN;
    const q = heartUnit(u*Math.PI);
    return [ c[0] + q[0]*s, c[1] - (q[1]-HEART_MID)*s ];
  }
  const HEART_MEET = 0.18, HEART_DRAWN = 0.82;
  function orbitHandoff(){
    const c0 = screenCenter();
    const base = orbitSolve(c0, closeA());
    return orbitPair(c0, base.R*1.3, base.theta + GROW_SPIN);
  }
  function promisePath(prog){
    const p = clamp01((prog-PH.closing_end)/(PH.promise_end-PH.closing_end));
    if(p < HEART_MEET){
      /* leave the orbit exactly where phase 4 ended it, and gather to the notch */
      const t = ease(clamp01(p/HEART_MEET));
      const from = orbitHandoff(), n = heartPoint(0);
      return {
        a:[lerp(from.a[0],n[0],t), lerp(from.a[1],n[1],t)],
        b:[lerp(from.b[0],n[0],t), lerp(from.b[1],n[1],t)]
      };
    }
    if(p < HEART_DRAWN){
      const u = ease(clamp01((p-HEART_MEET)/(HEART_DRAWN-HEART_MEET)));
      /* A takes the right lobe and B the left, matching the side each of them
         lives on — otherwise both cross the centre line to trace the heart */
      return { a: heartPoint(u), b: heartPoint(-u) };
    }
    /* from the heart's point, down onto the two cities the flight needs */
    const t = ease(clamp01((p-HEART_DRAWN)/(1-HEART_DRAWN)));
    const tip = heartPoint(1), bang = bangaloreRestPoint(), dep = departPoint();
    return {
      a:[lerp(tip[0],bang[0],t), lerp(tip[1],bang[1],t)],
      b:[lerp(tip[0],dep[0],t),  lerp(tip[1],dep[1],t)]
    };
  }
  /* the heart the two lights are drawing, stroked in behind them and faded
     out again as they settle — so the figure is actually readable rather
     than only implied by two moving dots */
  function drawHeartTrace(prog){
    const p = clamp01((prog-PH.closing_end)/(PH.promise_end-PH.closing_end));
    if(p < HEART_MEET) return;
    let u = 1, alpha = 1;
    if(p < HEART_DRAWN) u = ease(clamp01((p-HEART_MEET)/(HEART_DRAWN-HEART_MEET)));
    else alpha = 1 - ease(clamp01((p-HEART_DRAWN)/(1-HEART_DRAWN)));
    if(alpha <= 0.01 || u <= 0.002) return;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(212,175,55,0.6)';
    ctx.lineWidth = 2;
    const steps = Math.max(2, Math.round(90*u));
    [-1, 1].forEach(dir=>{
      ctx.beginPath();
      for(let i=0;i<=steps;i++){
        const pt = heartPoint(dir*u*i/steps);
        if(i===0) ctx.moveTo(pt[0],pt[1]); else ctx.lineTo(pt[0],pt[1]);
      }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  /* --- phase 6: the aircraft's own curved route, departPoint -> Munich.
     Smoothstep rather than the site's cubic in-out: the cubic's mid-flight
     slope is twice as steep, which made the take-off snap away far faster
     than the rest of the scene moves. --- */
  function flightPoint(prog){
    const p6 = clamp01((prog-PH.promise_end)/(PH.flight_end-PH.promise_end));
    const t = p6*p6*(3-2*p6);
    const p0 = departPoint();
    const p1 = munichRestPoint();
    const cp = [(p0[0]+p1[0])/2, Math.min(p0[1],p1[1]) - h*0.2];
    return quadPoint(p0, p1, cp, t);
  }

  /* --- phase 8: both lights ease off their cities and merge to one point
     at centre, which is exactly where the infinity trace begins --- */
  function convergePositions(prog){
    const p = ease(clamp01((prog-PH.videocall_end)/(PH.converge_end-PH.videocall_end)));
    const c = screenCenter(), bang = bangaloreRestPoint(), mun = munichRestPoint();
    return {
      a:[lerp(bang[0],c[0],p), lerp(bang[1],c[1],p)],
      b:[lerp(mun[0],c[0],p),  lerp(mun[1],c[1],p)]
    };
  }

  /* ---- one function that answers "where are the two lights at progress
     X" for the whole journey, by dispatching to whichever phase owns X.
     Trails sample this rather than an individual phase's function, so a
     trail drawn across a boundary follows the real path through it
     instead of snapping to the new phase's start. ---- */
  function orbAt(prog){
    const p = clamp01(prog);
    if(p <= PH.intro_end)      return { a: farA(), b: farB() };
    if(p < PH.spark_end)       return sparkPositions(p);
    if(p < PH.discovery_end)   return discoveryPositions(p);
    if(p < PH.closing_end)     return closingPositions(p);
    if(p < PH.promise_end)     return promisePath(p);
    if(p < PH.flight_end)      return { a: bangaloreRestPoint(), b: flightPoint(p) };
    if(p < PH.videocall_end)   return { a: bangaloreRestPoint(), b: munichRestPoint() };
    if(p < PH.converge_end)    return convergePositions(p);
    return { a: screenCenter(), b: screenCenter() };
  }

  /* --- phase 2/3: golden particles travelling back and forth between the
     two lights — the conversations, becoming more frequent over time --- */
  function drawConversationParticles(a, b, timeSec, count){
    const midX = (a[0]+b[0])/2, midY = (a[1]+b[1])/2 - Math.abs(b[0]-a[0])*0.06;
    const period = 1.4;
    for(let i=0;i<count;i++){
      const dir = i%2===0 ? 1 : -1;
      const raw = ((timeSec/period) + i/count) % 1;
      const tt = dir===1 ? raw : 1-raw;
      const from = dir===1 ? a : b, to = dir===1 ? b : a;
      const pt = quadPoint(from, to, [midX,midY], tt);
      const alpha = Math.sin(tt*Math.PI) * 0.9;
      const a2 = Math.max(0,alpha);
      /* a soft halo under the crisp core — every other light in this scene
         glows; these were the one flat, hard-edged dot, and at their old
         1.8px core alone they read as barely-there specks rather than as
         points of the same light everything else in the scene is made of */
      drawGlow(pt[0], pt[1], 2.6, `rgba(212,175,55,${a2.toFixed(3)})`);
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], 2.6*dpr, 0, Math.PI*2);
      ctx.fillStyle = `rgba(212,175,55,${a2.toFixed(3)})`;
      ctx.fill();
    }
  }

  /* --- phase 6: travelling light-waves along the thread, standing in for
     the video call — count and brightness grow with `strength` (0..1) --- */
  function drawTravelingWaves(a, b, timeSec, strength){
    const waveCount = 1 + Math.round(strength*2);
    const period = 1.7;
    for(let i=0;i<waveCount;i++){
      const t = ((timeSec/period) + i/waveCount) % 1;
      const x = lerp(a[0],b[0],t), y = lerp(a[1],b[1],t);
      const alpha = (0.35 + 0.65*strength) * Math.sin(t*Math.PI);
      drawGlow(x, y, 5 + 3*strength, `rgba(248,246,242,${Math.max(0,alpha).toFixed(3)})`);
    }
  }
  function flightAngle(prog){
    const a = flightPoint(clamp01(prog-0.004));
    const b = flightPoint(clamp01(prog+0.004));
    return Math.atan2(b[1]-a[1], b[0]-a[0]);
  }
  function drawAircraft(x,y,angle){
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(248,246,242,0.95)';
    ctx.beginPath();
    ctx.moveTo(9,0); ctx.lineTo(-6,4); ctx.lineTo(-3,0); ctx.lineTo(-6,-4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    drawGlow(x,y,7,'rgba(92,130,174,1)');
  }

  function lemniscate(t, cx, cy, scale){
    const denom = 1 + Math.sin(t)*Math.sin(t);
    return [ cx + (scale*Math.cos(t))/denom, cy + (scale*Math.sin(t)*Math.cos(t))/denom ];
  }

  function drawMoonDisc(x, y, r, alpha){
    if(alpha <= 0) return;
    r *= dpr;
    ctx.globalAlpha = alpha;
    const glow = ctx.createRadialGradient(x,y,0,x,y,r*4);
    glow.addColorStop(0, 'rgba(234,240,246,0.28)'); glow.addColorStop(1, 'rgba(234,240,246,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x,y,r*4,0,Math.PI*2); ctx.fill();
    const disc = ctx.createRadialGradient(x-r*0.3,y-r*0.3,0,x,y,r);
    disc.addColorStop(0, '#EAF0F6'); disc.addColorStop(0.65, '#b9c4d1'); disc.addColorStop(1, 'rgba(185,196,209,0.4)');
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* --- the finale: the rings dissolve into a firework — sparks thrown
     from the ring circumference out across the whole screen, then every
     one of them gathers back into a single point of light. The DOM hero
     at the top of the next section (#scene-savedate) is what actually
     names the couple and the date; this canvas beat is purely the
     visual crescendo that hands off into it. --- */

  /* each particle gets its own firework attributes: a burst angle/distance
     for the initial explosive kick, a staggered ignite delay so the burst
     reads as scattered sparks rather than one uniform pulse, and a twinkle
     phase/speed so the whole formation shimmers rather than sitting flat --- */
  function fireworkAttrs(){
    return {
      burstAngle: Math.random()*Math.PI*2,
      burstDist: 0.5+Math.random()*0.9,
      igniteDelay: Math.random()*0.22,
      twinklePhase: Math.random()*Math.PI*2,
      twinkleSpeed: 3+Math.random()*4,
      size: (1+Math.random()*1.6)*dpr
    };
  }
  let finaleParticles = null;
  function ensureFinaleParticles(cx, cy, r, off){
    if(finaleParticles) return finaleParticles;
    const COUNT = 160;
    finaleParticles = new Array(COUNT).fill(0).map((_,i)=>{
      const ringSel = i%2===0 ? -1 : 1;
      const angle = (i*137.5)*(Math.PI/180);
      return Object.assign({
        home: [cx + ringSel*off + Math.cos(angle)*r, cy + Math.sin(angle)*r],
        target: [cx, cy]
      }, fireworkAttrs());
    });
    return finaleParticles;
  }
  /* firework motion: staggered ignition -> a fast explosive burst outward
     from the home point -> a gravity-arced settle back onto the shared
     target point, all while twinkling. */
  function drawParticleSet(set, p, alpha, timeSec, burstRadius){
    if(alpha <= 0) return;
    set.forEach(pt=>{
      const lp = clamp01((p - pt.igniteDelay) / (1-pt.igniteDelay));
      if(lp <= 0) return;
      let x, y, sizeMul;
      if(lp < 0.45){
        const bt = lp/0.45;
        const outEase = 1-Math.pow(1-bt,3);
        const dist = burstRadius * pt.burstDist * outEase;
        x = pt.home[0] + Math.cos(pt.burstAngle)*dist;
        y = pt.home[1] + Math.sin(pt.burstAngle)*dist;
        sizeMul = lerp(1, 1.7, outEase);
      } else {
        const st = clamp01((lp-0.45)/0.55);
        const se = ease(st);
        const peakX = pt.home[0] + Math.cos(pt.burstAngle)*burstRadius*pt.burstDist;
        const peakY = pt.home[1] + Math.sin(pt.burstAngle)*burstRadius*pt.burstDist;
        const gravityDip = Math.sin(st*Math.PI) * burstRadius*0.14;
        x = lerp(peakX, pt.target[0], se);
        y = lerp(peakY, pt.target[1], se) + gravityDip*(1-se);
        sizeMul = lerp(1.7, 1, se);
      }
      const twinkle = 0.55 + 0.45*Math.sin(timeSec*pt.twinkleSpeed + pt.twinklePhase);
      const a = Math.min(1, alpha * (0.65+0.35*twinkle));
      if(a <= 0.02) return;
      ctx.beginPath();
      ctx.arc(x, y, pt.size*sizeMul, 0, Math.PI*2);
      ctx.fillStyle = `rgba(212,175,55,${a.toFixed(3)})`;
      ctx.fill();
    });
  }
  function drawTitleFormation(p8, cx, cy, r, off, timeSec){
    /* the burst travels most of the way across the viewport — real
       firework sparks fill the sky before gathering back in, rather
       than fanning out inside a tight little circle at center */
    const burstRadius = Math.max(w,h)*0.5;
    /* burst in, hold bright through the converge, then fade out to nothing —
       the convergence point itself must not linger once it's reached */
    let envelope;
    if(p8 < 0.3) envelope = clamp01(p8/0.3);
    else if(p8 < 0.8) envelope = 1;
    else envelope = clamp01(1 - (p8-0.8)/0.2);
    drawParticleSet(ensureFinaleParticles(cx,cy,r,off), p8, envelope, timeSec, burstRadius);
  }

  /* a handful of faint, always-present twinkling stars — drawn every
     frame regardless of phase, so the canvas is never a true void once
     the finale fades out. Without this, the ~1 viewport of scroll it
     takes to fully hand off into the next section (a normal side effect
     of the pin releasing) reads as a jarring blank gap instead of a
     settled, still-alive backdrop. */
  let ambientStars = null, ambientStarsDims = null;
  function ensureAmbientStars(){
    if(ambientStars && ambientStarsDims && ambientStarsDims[0]===w && ambientStarsDims[1]===h) return ambientStars;
    ambientStarsDims = [w,h];
    ambientStars = new Array(40).fill(0).map(()=>({
      x: Math.random()*w, y: Math.random()*h,
      size: (0.6+Math.random()*1.1)*dpr,
      phase: Math.random()*Math.PI*2,
      speed: 0.4+Math.random()*0.6
    }));
    return ambientStars;
  }
  function drawAmbientStars(timeSec){
    ensureAmbientStars().forEach(s=>{
      const a = 0.06 + 0.09*(0.5+0.5*Math.sin(timeSec*s.speed + s.phase));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI*2);
      ctx.fillStyle = `rgba(248,246,242,${a.toFixed(3)})`;
      ctx.fill();
    });
  }

  function draw(){
    ctx.clearRect(0,0,w,h);
    const cx = w/2, cy = h/2;
    const time = performance.now()/1000;
    const p = progress;
    drawAmbientStars(time);

    if(p < PH.intro_end){
      const pos = orbAt(p);
      drawGlow(pos.a[0], pos.a[1], 10, 'rgba(96,181,140,1)');
      drawGlow(pos.b[0], pos.b[1], 10, 'rgba(92,130,174,1)');
    }
    else if(p < PH.spark_end){
      const pos = sparkPositions(p);
      drawTrail(back=>orbAt(back).a, p, [96,181,140]);
      drawTrail(back=>orbAt(back).b, p, [92,130,174]);
      drawGlow(pos.a[0], pos.a[1], 10, 'rgba(96,181,140,1)');
      drawGlow(pos.b[0], pos.b[1], 10, 'rgba(92,130,174,1)');
    }
    else if(p < PH.discovery_end){
      const pos = discoveryPositions(p);
      const p2 = clamp01((p-PH.spark_end)/(PH.discovery_end-PH.spark_end));
      drawGlow(pos.a[0], pos.a[1], 10, 'rgba(96,181,140,1)');
      drawGlow(pos.b[0], pos.b[1], 10, 'rgba(92,130,174,1)');
      drawConversationParticles(pos.a, pos.b, time, 3 + Math.round(p2*3));
    }
    else if(p < PH.closing_end){
      const p3 = clamp01((p-PH.discovery_end)/(PH.closing_end-PH.discovery_end));
      const pos = closingPositions(p);
      /* trails only once the orbit takes over — during the straight drift
         they'd just smear along the same line the lights are already on */
      if(p3 >= CLOSE_SPLIT){
        drawTrail(back=>orbAt(back).a, p, [96,181,140]);
        drawTrail(back=>orbAt(back).b, p, [92,130,174]);
      }
      drawGlow(pos.a[0], pos.a[1], 10, 'rgba(96,181,140,1)');
      drawGlow(pos.b[0], pos.b[1], 10, 'rgba(92,130,174,1)');
      /* the exchange builds as the gap closes, then thins as the orbit forms */
      const density = p3 < CLOSE_SPLIT
        ? 6 + Math.round((p3/CLOSE_SPLIT)*6)
        : Math.max(2, 12 - Math.round(((p3-CLOSE_SPLIT)/(1-CLOSE_SPLIT))*10));
      drawConversationParticles(pos.a, pos.b, time, density);
    }
    else if(p < PH.promise_end){
      drawHeartTrace(p);
      drawTrail(back=>orbAt(back).a, p, [96,181,140]);
      drawTrail(back=>orbAt(back).b, p, [92,130,174]);
      const pos = promisePath(p);
      drawGlow(pos.a[0], pos.a[1], 9, 'rgba(96,181,140,1)');
      drawGlow(pos.b[0], pos.b[1], 9, 'rgba(92,130,174,1)');
    }
    else if(p < PH.flight_end){
      const p6 = clamp01((p-PH.promise_end)/(PH.flight_end-PH.promise_end));
      /* rises just above where the flight is heading — mirrored along with the
         anchors so it still marks the sky Munich is arriving into */
      if(p6 > 0.42){ drawMoonDisc(w*0.18, h*0.16, 13, clamp01((p6-0.42)/0.4)); }

      /* no thread drawn here on purpose — the aircraft's own dotted trail
         already draws the route, and a second gold line over the top of it
         just doubled the same information */
      const bang = bangaloreRestPoint();
      const planePos = flightPoint(p);
      const pulse = 8 + Math.sin(time*2.4)*1.5;
      drawGlow(bang[0], bang[1], pulse, 'rgba(96,181,140,1)');
      drawTrail(back=>orbAt(back).b, p, [92,130,174]);
      drawAircraft(planePos[0], planePos[1], flightAngle(p));
    }
    else if(p < PH.videocall_end){
      const p7 = clamp01((p-PH.flight_end)/(PH.videocall_end-PH.flight_end));
      const bang = bangaloreRestPoint(), mun = munichRestPoint();
      /* no drawn line between them — the travelling waves are the connection,
         and they read as light crossing the gap rather than a wire */
      drawTravelingWaves(bang, mun, time, p7);
      const pulse = 9 + Math.sin(time*(3+p7*2))*(2+p7*2);
      drawGlow(bang[0],bang[1],pulse,'rgba(96,181,140,1)');
      drawGlow(mun[0],mun[1],pulse,'rgba(92,130,174,1)');
    }
    else {
      if(p < PH.converge_end){
        const pos = convergePositions(p);
        drawGlow(pos.a[0],pos.a[1],9,'rgba(96,181,140,1)');
        drawGlow(pos.b[0],pos.b[1],9,'rgba(92,130,174,1)');
      }
      else if(p < PH.infinity_end){
        const p6 = clamp01((p-PH.converge_end)/(PH.infinity_end-PH.converge_end));
        const scale = Math.min(w,h)*0.16;
        /* the lemniscate passes through the exact center at t=PI/2 — start
           the trace there so it picks up precisely where the two lights
           just finished converging, instead of jumping out to the curve's
           t=0 point first */
        const phaseShift = Math.PI/2;
        ctx.strokeStyle = 'rgba(212,175,55,0.55)'; ctx.lineWidth = 2;
        ctx.beginPath();
        const steps = Math.max(2, Math.round(240*p6));
        for(let i=0;i<=steps;i++){
          const t = phaseShift + (i/240)*Math.PI*2;
          const [x,y] = lemniscate(t, cx, cy, scale);
          if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.stroke();
        const head = lemniscate(phaseShift + p6*Math.PI*2, cx, cy, scale);
        drawGlow(head[0], head[1], 12 + Math.sin(time*4)*2, 'rgba(212,175,55,1)');
      }
      else if(p < PH.rings_end){
        /* the rings finish growing at 55% through this phase, then simply
           hold — fully formed and fully visible — for the rest of it, so
           there's a real pause to look at them before anything else starts */
        const p9raw = clamp01((p-PH.infinity_end)/(PH.rings_end-PH.infinity_end));
        const p9 = clamp01(p9raw/0.55);
        /* the completed infinity doesn't vanish the instant the rings
           begin — it holds under them and dissolves as they take shape,
           so the symbol becomes the rings instead of being replaced by
           them (the same end-is-the-next-beginning rule as every other
           boundary in this scene) */
        const lemFade = 1 - clamp01(p9raw/0.45);
        if(lemFade > 0.01){
          const scale = Math.min(w,h)*0.16;
          const phaseShift = Math.PI/2;
          ctx.globalAlpha = lemFade;
          ctx.strokeStyle = 'rgba(212,175,55,0.55)'; ctx.lineWidth = 2;
          ctx.beginPath();
          for(let i=0;i<=240;i++){
            const t = phaseShift + (i/240)*Math.PI*2;
            const [x,y] = lemniscate(t, cx, cy, scale);
            if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        const r = Math.min(w,h)*0.095 * lerp(0.8,1,p9);
        const off = r*0.62;
        drawWeddingRingPair(cx, cy, r, off, p9);
      }
      else {
        const p8 = clamp01((p-PH.rings_end)/(1-PH.rings_end));
        const r = Math.min(w,h)*0.095, off = r*0.62;
        if(p8 < 0.12){
          const ringFade = 1 - clamp01(p8/0.12);
          drawWeddingRingPair(cx, cy, r, off, ringFade);
        }
        drawTitleFormation(p8, cx, cy, r, off, time);
      }
    }

    updateCaption(p);
  }

  function drawGlow(x,y,r,color){
    r *= dpr;
    const g = ctx.createRadialGradient(x,y,0,x,y,r*6);
    /* strip the trailing alpha number (integer OR decimal) down to 0 so the
       gradient always fades to fully transparent — a plain 'X)' -> '0)'
       string replace only matched a literal alpha of "1", so any computed
       decimal alpha (e.g. "0.950)") silently failed to fade at all and
       rendered as a hard-edged flat disc instead of a soft glow */
    const c = color.replace(/[\d.]+\)$/, '0)');
    g.addColorStop(0,color); g.addColorStop(1,c);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x,y,r*6,0,Math.PI*2); ctx.fill();
  }
  /* a pair of physically-shaded wedding-ring bands. Each ring is a torus:
     brightness depends on BOTH where you are across the band's rounded
     cross-section (profile, outer->inner) AND where you are around its
     circumference relative to a single fixed light source (so both rings
     look lit by the same "photo studio" light despite their different
     tilt/rotation) — plus a tight specular hot-spot for a real jewelry
     glint, instead of a flat linear gradient. The two rings get distinct
     squash/rotation (one lying flatter, one more upright) so they read as
     looped through each other at an angle. Back ring drawn first so the
     front ring's band reads as passing over it. */
  const RING_LIGHT_ANGLE = -2.25;
  const RING_PROFILE = [0.3, 0.52, 0.82, 1.0, 0.7, 0.44, 0.3];
  function wrapAngle(a){
    return (((a+Math.PI) % (Math.PI*2)) + Math.PI*2) % (Math.PI*2) - Math.PI;
  }
  function ringShade(worldAngle, localLight, profileVal){
    const base = 0.5 + 0.5*Math.cos(worldAngle-localLight);
    const specDist = Math.abs(wrapAngle(worldAngle-localLight));
    const spec = Math.max(0, 1-specDist/0.28);
    const shade = Math.min(1, base*0.78 + spec*spec*0.95);
    return profileVal*(0.4+0.8*shade);
  }
  function mixGold(bright, alpha){
    const shadow=[92,64,16], mid=[184,138,42], hi=[255,238,196];
    bright = Math.max(0, Math.min(1, bright));
    let r,g,b;
    if(bright<0.5){
      const t=bright/0.5;
      r=lerp(shadow[0],mid[0],t); g=lerp(shadow[1],mid[1],t); b=lerp(shadow[2],mid[2],t);
    } else {
      const t=(bright-0.5)/0.5;
      r=lerp(mid[0],hi[0],t); g=lerp(mid[1],hi[1],t); b=lerp(mid[2],hi[2],t);
    }
    return `rgba(${r|0},${g|0},${b|0},${alpha})`;
  }
  const SUPPORTS_CONIC = typeof HTMLCanvasElement!=='undefined' && !!(document.createElement('canvas').getContext('2d').createConicGradient);
  /* the conic gradients are pure angle->color functions (radius/position
     independent once centered at the local origin), and each ring's own
     rotation is a fixed constant — so per-band gradients only ever need to
     be built once and reused every frame, with the frame's fade-in alpha
     applied via globalAlpha instead. Rebuilding ~340 gradient stops from
     scratch on every animation frame was the previous version's actual
     perf bug (visible as the page hanging while scrolling this phase). */
  let ringGradCache = {};
  function ringGradientsFor(key, angle){
    let cached = ringGradCache[key];
    if(cached) return cached;
    const localLight = RING_LIGHT_ANGLE - angle;
    cached = RING_PROFILE.map(profileVal=>{
      if(!SUPPORTS_CONIC) return null;
      const grad = ctx.createConicGradient(0, 0, 0);
      const stops = 48;
      for(let i=0;i<=stops;i++){
        const tt = i/stops;
        grad.addColorStop(tt, mixGold(ringShade(tt*Math.PI*2, localLight, profileVal), 1));
      }
      return grad;
    });
    ringGradCache[key] = cached;
    return cached;
  }
  function drawRingBand(key, x, y, r, ry, angle, alpha){
    const bandWidth = r*0.155;
    const grads = ringGradientsFor(key, angle);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    RING_PROFILE.forEach((profileVal, b)=>{
      const t = b/(RING_PROFILE.length-1);
      const rOff = bandWidth/2 - t*bandWidth;
      const curR = Math.max(0.5, r+rOff);
      const curRy = Math.max(0.5, ry+rOff*(ry/r));
      const lw = Math.max(1.1, bandWidth/RING_PROFILE.length*1.4);
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.ellipse(0, 0, curR, curRy, 0, 0, Math.PI*2);
      if(SUPPORTS_CONIC){
        ctx.strokeStyle = grads[b];
      } else {
        /* older-browser fallback: a plain vertical gradient approximating
           the same top-lit look, without per-angle shading */
        const grad = ctx.createLinearGradient(0, -curRy, 0, curRy);
        grad.addColorStop(0, mixGold(profileVal*1.0, 1));
        grad.addColorStop(0.5, mixGold(profileVal*0.5, 1));
        grad.addColorStop(1, mixGold(profileVal*0.85, 1));
        ctx.strokeStyle = grad;
      }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.restore();
    /* a tiny bright glint at the point on the band that faces the light
       directly — the small detail that reads as "real polished metal"
       rather than a flat painted shape */
    const localLight = RING_LIGHT_ANGLE - angle;
    const hotR = r+bandWidth*0.15, hotRy = ry+bandWidth*0.15*(ry/r);
    const hlx = Math.cos(localLight)*hotR, hly = Math.sin(localLight)*hotRy;
    const hotX = x + hlx*Math.cos(angle) - hly*Math.sin(angle);
    const hotY = y + hlx*Math.sin(angle) + hly*Math.cos(angle);
    drawGlow(hotX, hotY, 3, `rgba(255,250,235,${alpha*0.85})`);
  }
  function drawWeddingRingPair(cx, cy, r, off, alpha){
    /* back ring: lying flatter, angled down-left */
    drawRingBand('back', cx-off*0.7, cy+off*0.4, r*1.05, r*0.46, -0.22, alpha);
    /* front ring: more upright, angled up-right, slightly larger and drawn
       on top so it visibly loops through the back ring */
    drawRingBand('front', cx+off*0.55, cy-off*0.42, r*1.12, r*0.86, 0.16, alpha);
  }
  /* generic trailing-dots renderer — takes any point-generator function of
     "progress so far", used across every phase's own moving light/aircraft */
  const TRAIL_DOTS = 10, TRAIL_SPAN = 0.036;
  function drawTrail(pointFn, prog, rgb){
    ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    for(let i=0;i<TRAIL_DOTS;i++){
      const pt = pointFn(clamp01(prog - (i/TRAIL_DOTS)*TRAIL_SPAN));
      ctx.globalAlpha = (1-i/TRAIL_DOTS) * 0.5;
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], 2.4*dpr, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function loop(){
    if(!visible) return;
    draw();
    if(REDUCED_MOTION){ visible = false; return; }
    raf = requestAnimationFrame(loop);
  }
  function start(){ if(visible) return; visible = true; loop(); }
  function stop(){ visible = false; if(raf) cancelAnimationFrame(raf); }

  function update(p){ progress = p; }

  function init(){
    canvas = document.getElementById('connectionCanvas');
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize, {passive:true});
    onVisible(canvas, start);
    const io = new IntersectionObserver(es=>es.forEach(e=>{ if(!e.isIntersecting) stop(); }), {threshold:0});
    io.observe(canvas);
    document.addEventListener('visibilitychange', ()=>{ document.visibilityState==='hidden' ? stop() : start(); });
  }

  return { init, update };
})();

/* ============================================================
   9. COUNTDOWN — luxury flip clock, ticking against the real
   wedding date every second. Falls back to a plain "Forever
   begins" state once the date has passed.
   ============================================================ */
const Countdown = (function(){
  const units = [ ['days','DAYS',2], ['hours','HRS',2], ['minutes','MIN',2], ['seconds','SEC',2] ];
  const faces = {};
  function build(){
    const grid = document.getElementById('countdownGrid');
    units.forEach(([key,label,digits])=>{
      const unit = document.createElement('div'); unit.className = 'flip-unit';
      const card = document.createElement('div'); card.className = 'flip-card';
      const face = document.createElement('div'); face.className = 'flip-face'; face.textContent = '00';
      card.appendChild(face);
      const lbl = document.createElement('div'); lbl.className = 'flip-unit-label'; lbl.textContent = label;
      unit.appendChild(card); unit.appendChild(lbl);
      grid.appendChild(unit);
      faces[key] = face;
    });
  }
  function tick(){
    const target = new Date(wedding.weddingDate + 'T00:00:00');
    const now = new Date();
    let diff = target - now;
    if(diff <= 0){
      document.getElementById('countdownGrid').style.display = 'none';
      document.getElementById('countdownMarried').style.display = 'block';
      return;
    }
    const s = Math.floor(diff/1000);
    const vals = {
      days: Math.floor(s/86400),
      hours: Math.floor((s%86400)/3600),
      minutes: Math.floor((s%3600)/60),
      seconds: s%60
    };
    Object.keys(vals).forEach(k=>{
      const text = String(vals[k]).padStart(k==='days' ? String(vals.days).length : 2, '0');
      if(faces[k].textContent !== text){
        faces[k].textContent = text;
        if(!REDUCED_MOTION){
          faces[k].style.transition = 'none';
          faces[k].style.transform = 'rotateX(90deg)';
          requestAnimationFrame(()=>{
            faces[k].style.transition = 'transform .35s var(--ease-out)';
            faces[k].style.transform = 'rotateX(0deg)';
          });
        }
      }
    });
  }
  function init(){ build(); tick(); setInterval(tick, 1000); }
  return { init };
})();

/* ============================================================
   11. WEDDING DETAILS — data-driven, graceful placeholders for
   any field the couple hasn't filled in yet. No RSVP, per spec.
   ============================================================ */
const DetailsRenderer = (function(){
  /* "09:30" -> "9:30 AM". Shown as the local time of the celebration itself
     (IST), which is what a printed invitation would say — the calendar file
     is what translates it to each guest's own timezone. */
  function prettyTime(hhmm){
    const [h, m] = String(hhmm).split(':').map(Number);
    const period = h < 12 ? 'AM' : 'PM';
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:${String(m).padStart(2,'0')} ${period}`;
  }
  function card(title, primary, secondary){
    const hasContent = primary && String(primary).trim().length;
    return `<div class="details-card will-reveal">
      <h3>${title}</h3>
      <p class="${hasContent ? '' : 'placeholder'}">${hasContent ? primary : 'Details to follow.'}</p>
      ${secondary ? `<div class="sub">${secondary}</div>` : ''}
    </div>`;
  }
  function init(){
    const grid = document.getElementById('detailsGrid');
    let html = '';

    if(wedding.schedule && wedding.schedule.length){
      wedding.schedule.forEach(item=>{
        const d = new Date(item.date+'T00:00:00');
        const label = d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' });
        /* time and place sit together on the card's sub line, so an event
           held somewhere other than the venue says so right under its date */
        const sub = [item.time ? prettyTime(item.time) : '', item.location || '']
          .filter(Boolean).join(' &middot; ');
        html += card(item.label, label, sub);
      });
    }
    html += card('Venue', wedding.venue, wedding.venueAddress);
    if(wedding.dressCode){ html += card('Dress Code', wedding.dressCode); }
    grid.innerHTML = html;

    const frame = document.getElementById('mapFrame');
    if(wedding.mapLink && wedding.venue){
      /* the share link itself (maps.app.goo.gl) can't be used as an iframe src —
         Google blocks it from being framed. Build a proper embeddable query URL
         from the real venue name instead, and keep the real share link as the
         guaranteed-working "open in maps" action underneath. */
      const embedSrc = 'https://www.google.com/maps?q=' + encodeURIComponent(wedding.venue + ', ' + wedding.venueAddress) + '&output=embed';
      frame.innerHTML = `
        <iframe src="${embedSrc}" loading="lazy" title="Map to ${wedding.venue}" referrerpolicy="no-referrer-when-downgrade"></iframe>
        <a class="map-link" href="${wedding.mapLink}" target="_blank" rel="noopener noreferrer">Open in Google Maps &#8599;</a>`;
    }
  }
  return { init };
})();

/* ============================================================
   12. POSTER REVEAL — tries the real save-the-date image first;
   falls back to a designed HTML poster if poster.jpg isn't
   present yet, so the scene never breaks before the photo exists.
   ============================================================ */
const PosterScene = (function(){
  function init(){
    const img = document.getElementById('posterImg');
    const frame = document.getElementById('posterFrame');
    img.addEventListener('error', ()=>{
      img.remove();
      const fallback = document.createElement('div');
      fallback.className = 'poster-fallback';
      fallback.innerHTML = `
        <div class="pf-names">${wedding.groom}<span class="pf-amp">&#9829;</span>${wedding.bride}</div>
        <div class="pf-date">${wedding.weddingDateDisplay}</div>`;
      frame.insertBefore(fallback, frame.firstChild);
    }, { once:true });
    img.src = wedding.poster;
  }
  return { init };
})();

/* ============================================================
   13. AMBIENT PARTICLE FIELDS — one ParticleField per scene,
   matching the two visual languages established in the creative
   direction: fine cool "schematic" lines for Munich, warm petals/
   dust for Bangalore, merged gold dust + fireflies + lanterns
   for the ending.
   ============================================================ */
function initAmbientFields(){
  if(!wedding.features.particles) return;
  const fields = [
    ['starsCanvasGate',    { count:150, kind:'dot', color:'248,246,242', speed:0.015, sizeMin:0.4, sizeMax:1.6, driftY:0, parallax:0.02 }],
    ['starsCanvasOpening', { count:150, kind:'dot', color:'248,246,242', speed:0.015, sizeMin:0.4, sizeMax:1.6, driftY:0, parallax:0.02 }],
    ['munichParticles',    { count:55,  kind:'dot',  color:'248,246,242', speed:0.05, sizeMin:0.8, sizeMax:2.1, driftY:0.35, parallax:0.02 }],
    ['bangaloreParticles', { count:55,  kind:'petal', color:'232,151,59', speed:0.10, sizeMin:1.4, sizeMax:2.8, driftY:-0.4, parallax:0.02 }],
    ['savedateParticles',  { count:80,  kind:'dot',  color:'212,175,55',  speed:0.03, sizeMin:0.5, sizeMax:1.6, driftY:-0.15, parallax:0.03 }],
    ['endingCanvas',           { count:110, kind:'firefly', color:'232,199,122', speed:0.05, sizeMin:0.5, sizeMax:1.3, driftY:-0.25, parallax:0.02 }],
    ['endingCanvasLanterns',   { count:14,  kind:'lantern', color:'212,175,55',  speed:0.06, sizeMin:2.2, sizeMax:4, driftY:-0.35, parallax:0.01 }]
  ];
  fields.forEach(([id, opts])=>{
    const canvas = document.getElementById(id);
    if(!canvas) return;
    const field = new ParticleField(canvas, opts);
    registerField(field, canvas);
  });

  initBirds(document.getElementById('munichBirds'), 'rgba(232,199,122,0.55)');
  initBirds(document.getElementById('bangaloreBirds'), 'rgba(255,255,255,0.4)');
  initCityClouds(document.getElementById('munichClouds'));
}

/* ============================================================
   14. GENERIC SCROLL REVEALS for every `.will-reveal` element
   (captions, eyebrows, details cards). Runs after all dynamic
   content (details) has been rendered into the DOM so nothing
   is missed.
   ============================================================ */
function setupReveals(){
  /* the schedule/venue cards are a true list (siblings on one row at the same
     scroll depth), so the generic one-el-one-trigger pass below would fire
     them all in the same instant — a flat block, not a reveal. They get their
     own staggered pass instead; everything else keeps the per-element pass. */
  gsap.utils.toArray('.will-reveal').forEach((el, i)=>{
    if(el.closest('.details-grid')) return;
    if(REDUCED_MOTION){ el.classList.add('is-revealed'); return; }
    gsap.to(el, {
      opacity:1, y:0, duration:1.1, ease:'power3.out',
      scrollTrigger:{ trigger: el, start:'top 88%', toggleActions:'play none none reverse' }
    });
  });

  const cards = gsap.utils.toArray('.details-grid .details-card');
  if(cards.length){
    if(REDUCED_MOTION){ cards.forEach(el => el.classList.add('is-revealed')); }
    else {
      gsap.to(cards, {
        opacity:1, y:0, duration:0.9, ease:'power3.out', stagger:0.12,
        scrollTrigger:{ trigger:'.details-grid', start:'top 88%', toggleActions:'play none none reverse' }
      });
    }
  }

  /* opening scene title lines + scroll cue play once, right after the loader (see initLoader) */

  /* ending — staggered lines, then names/date/calendar link. Reversible and
     replayable (not a one-time onEnter): scrolling back past the trigger
     fades everything back out, and scrolling down into it again fades it
     back in, same as every other .will-reveal on the site. */
  if(REDUCED_MOTION){
    gsap.set(['.ending-line','.ending-distance','.ending-invite','.ending-names','.ending-date','.ics-link'], { opacity:1, y:0 });
  } else {
    /* strictly top-to-bottom — the invitation sits above the names, so it has
       to arrive before them; revealing it later made the block assemble out
       of order */
    gsap.timeline({
      defaults:{ ease:'power3.out' },
      scrollTrigger:{ trigger:'#scene-ending', start:'top 60%', toggleActions:'play none none reverse' }
    })
      .to('.ending-line', { opacity:1, duration:1.1, ease:'power2.out', stagger:0.35 })
      .to('.ending-distance', { opacity:1, y:0, duration:1 }, '+=0.15')
      .to('.ending-invite', { opacity:1, y:0, duration:1 }, '+=0.2')
      .to('.ending-names', { opacity:1, y:0, duration:1 }, '+=0.25')
      .to('.ending-date', { opacity:1, y:0, duration:.8 }, '-=0.45')
      .to('.ics-link', { opacity:1, y:0, duration:.8 }, '-=0.3');
  }
}

/* ============================================================
   15. PINNED SCROLL-SCRUBBED SCENES (Earth / Connection / Poster)
   ============================================================ */
function setupPinnedScenes(){
  const pinCfg = { start:'top top', end:'bottom bottom', scrub: REDUCED_MOTION ? false : 1 };

  if(!REDUCED_MOTION){
    /* shared machinery: on first arrival at a pinned, scroll-scrubbed scene,
       gently auto-scroll through it like a short film, whenever the visitor
       isn't actively driving the scroll themselves. Pausing is instant on
       any real scroll/touch/key/tap, and it picks back up from wherever
       they left off (not from the top) once input goes idle again. It never
       fights a deliberate scroll — it only ever moves in the gaps between
       them. Used below for both the globe and the story-beats scene. */
    function setupSceneAutoplay({ target, totalDurationMs, resumeDelayMs = 1400 }){
      const rateMs = totalDurationMs / target;
      let selfRef = null, active = false, raf = null, resumeTimer = null;
      function stopRaf(){ if(raf){ cancelAnimationFrame(raf); raf = null; } }
      function clearResumeTimer(){ if(resumeTimer){ clearTimeout(resumeTimer); resumeTimer = null; } }
      function run(){
        const self = selfRef;
        if(!self || !active) return;
        const startProgress = self.progress;
        if(startProgress >= target) return;
        const startTime = performance.now();
        const step = now => {
          const p = Math.min(target, startProgress + (now - startTime) / rateMs);
          const y = self.start + (self.end - self.start) * p;
          if(lenisInstance){ lenisInstance.scrollTo(y, { immediate:true }); }
          else { window.scrollTo(0, y); }
          if(p >= target){ raf = null; return; }
          raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      }
      function pause(){
        stopRaf();
        clearResumeTimer();
        if(!active) return;
        resumeTimer = setTimeout(run, resumeDelayMs);
      }
      ['wheel','touchstart','keydown','pointerdown'].forEach(evt =>
        window.addEventListener(evt, pause, { passive:true }));
      return {
        setSelf(self){ selfRef = self; },
        onEnter(self){ selfRef = self; active = true; run(); },
        onEnterBack(self){ selfRef = self; active = true; run(); },
        onLeave(){ active = false; stopRaf(); clearResumeTimer(); },
        onLeaveBack(){ active = false; stopRaf(); clearResumeTimer(); }
      };
    }

    /* the globe is one continuous camera push-in rather than discrete dated
       beats, so its pace is picked by feel — a shorter, single sweep rather
       than a multi-beat story. Target is 1 (not 0.9, which stops short of
       the pin actually releasing) so autoplay hands off cleanly into the
       next scene instead of leaving the visitor sitting in a pinned,
       no-longer-changing frame with no obvious way to continue. */
    const earthAutoplay = setupSceneAutoplay({ target:1, totalDurationMs:11100 });
    ScrollTrigger.create(Object.assign({ trigger:'#scene-earth', pin:'#scene-earth .pin-wrap' }, pinCfg, {
      onUpdate:self => { earthAutoplay.setSelf(self); EarthScene.update(self.progress); },
      onEnter: earthAutoplay.onEnter,
      onEnterBack: earthAutoplay.onEnterBack,
      onLeave: earthAutoplay.onLeave,
      onLeaveBack: earthAutoplay.onLeaveBack
    }));

    /* once the visitor is released from the pinned story-beats scene, the
       plain scroll-reveal scenes after it (save-the-date poster, closing)
       have nothing driving them forward — the countdown appears and then
       the page just sits there. Continue the same gentle autoplay through
       ordinary document scroll, right to the very end, with the same
       pause-on-input / resume-from-where-they-left-off behaviour. */
    function setupTailAutoplay(){
      const PIXELS_PER_SECOND = 220;
      const RESUME_DELAY = 1400;
      let active = false, raf = null, resumeTimer = null;
      function maxY(){ return Math.max(0, document.documentElement.scrollHeight - window.innerHeight); }
      function stopRaf(){ if(raf){ cancelAnimationFrame(raf); raf = null; } }
      function clearResumeTimer(){ if(resumeTimer){ clearTimeout(resumeTimer); resumeTimer = null; } }
      function run(){
        if(!active) return;
        const target = maxY();
        const startY = window.scrollY;
        if(startY >= target - 2){ active = false; return; }
        const startTime = performance.now();
        const step = now => {
          const y = Math.min(target, startY + (now - startTime) * PIXELS_PER_SECOND / 1000);
          if(lenisInstance){ lenisInstance.scrollTo(y, { immediate:true }); }
          else { window.scrollTo(0, y); }
          if(y >= target){ raf = null; active = false; return; }
          raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      }
      function pause(){
        stopRaf();
        clearResumeTimer();
        if(!active) return;
        resumeTimer = setTimeout(run, RESUME_DELAY);
      }
      ['wheel','touchstart','keydown','pointerdown'].forEach(evt =>
        window.addEventListener(evt, pause, { passive:true }));
      return { start(){ active = true; run(); } };
    }
    const tailAutoplay = setupTailAutoplay();

    /* target is 1, not 0.9 — the countdown itself only starts fading in at
       progress 0.965 (see below), so stopping autoplay at 0.9 used to leave
       visitors stuck mid-pin after the last beat with nothing on screen
       changing and no cue that scrolling further would reveal the
       countdown and release them into the next scene. */
    const connectionCountdown = document.getElementById('scene-countdown');
    const connectionAutoplay = setupSceneAutoplay({ target:1, totalDurationMs:17800 });
    ScrollTrigger.create(Object.assign({ trigger:'#scene-connection', pin:'#scene-connection .pin-wrap' }, pinCfg, {
      onUpdate:self => {
        connectionAutoplay.setSelf(self);
        ConnectionScene.update(self.progress);
        if(connectionCountdown){
          const t = clamp01((self.progress - 0.965) / 0.035);
          connectionCountdown.style.opacity = String(t);
          connectionCountdown.style.pointerEvents = t > 0.5 ? 'auto' : 'none';
        }
      },
      onEnter: connectionAutoplay.onEnter,
      onEnterBack: connectionAutoplay.onEnterBack,
      onLeave: () => { connectionAutoplay.onLeave(); tailAutoplay.start(); },
      onLeaveBack: connectionAutoplay.onLeaveBack
    }));
    /* the poster now sits in the flow of the details block and reveals with
       the ordinary .will-reveal pass (see setupReveals) — it no longer needs
       a pinned scene or a scrub of its own */
  } else {
    /* reduced motion: no pin, no scrub — everything just settles into its resting state */
    EarthScene.update(0.9);
    EarthScene.updateLabels();
    ConnectionScene.update(0.90);
    document.getElementById('earthDistance').classList.add('is-visible');
    document.getElementById('connectionCaption').style.opacity = 1;
    document.getElementById('connectionCaption').style.transform = 'none';
    const connectionCountdown = document.getElementById('scene-countdown');
    if(connectionCountdown){ connectionCountdown.style.opacity = 1; connectionCountdown.style.pointerEvents = 'auto'; }
  }
}

/* ============================================================
   16. PROGRESS BAR + DOT NAVIGATION
   ============================================================ */
let lenisInstance = null;
function setupProgressAndNav(){
  const scenes = $$('main > .scene');
  const dotNav = document.getElementById('dotNav');
  scenes.forEach((sc,i)=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Go to: ' + (sc.dataset.sceneName || ('Scene '+(i+1))));
    b.addEventListener('click', ()=>{
      const y = sc.getBoundingClientRect().top + window.scrollY;
      if(lenisInstance){ lenisInstance.scrollTo(y, { duration:1.4 }); }
      else{ window.scrollTo({ top:y, behavior: REDUCED_MOTION ? 'auto' : 'smooth' }); }
    });
    dotNav.appendChild(b);
  });
  const dots = Array.from(dotNav.children);

  ScrollTrigger.create({
    trigger:'main', start:'top top', end:'bottom bottom',
    onUpdate:self => { document.getElementById('progressFill').style.width = (self.progress*100)+'%'; }
  });
  scenes.forEach((sc,i)=>{
    ScrollTrigger.create({
      trigger:sc, start:'top center', end:'bottom center',
      onToggle:self => { if(self.isActive){ dots.forEach(d=>d.classList.remove('is-active')); dots[i].classList.add('is-active'); } }
    });
  });
}

/* ============================================================
   17. LIVE CITY CLOCKS
   ============================================================ */
function tickCityTimes(){
  document.getElementById('munichTime').textContent = cityLocalTime(wedding.groomTimeZone) + ' local';
  document.getElementById('bangaloreTime').textContent = cityLocalTime(wedding.brideTimeZone) + ' local';
  const mDate = document.getElementById('munichDate');
  const bDate = document.getElementById('bangaloreDate');
  const mWeather = document.getElementById('munichWeather');
  const bWeather = document.getElementById('bangaloreWeather');
  if(mDate) mDate.textContent = cityLocalDate(wedding.groomTimeZone);
  if(bDate) bDate.textContent = cityLocalDate(wedding.brideTimeZone);
  if(mWeather) mWeather.textContent = cityWeatherFeeling(wedding.groomTimeZone);
  if(bWeather) bWeather.textContent = cityWeatherFeeling(wedding.brideTimeZone);
}

/* ============================================================
   18. AUDIO TOGGLE — hides itself gracefully if music.mp3 isn't
   present yet, rather than offering a control that can't work.
   ============================================================ */
/* manual toggle only — browsers block audio with sound from starting
   before the visitor has actually interacted with the page, and trying
   to guess at the first "interaction" (scroll, wheel, etc.) was
   unreliable. A click on the button is an unambiguous, always-valid
   gesture, so that's the one thing that starts playback. */
function initAudio(){
  const btn = document.getElementById('audioToggle');
  if(!wedding.features.musicToggle || !wedding.music){ btn.remove(); return; }
  const audio = new Audio();
  audio.loop = true; audio.volume = 0.35; audio.preload = 'auto';
  let broken = false;
  audio.addEventListener('error', ()=>{ broken = true; btn.remove(); }, { once:true });
  audio.src = wedding.music;
  audio.load();

  /* what the visitor asked for, kept separate from what the element is doing
     right now — the two diverge whenever the page is in the background */
  let wantsMusic = false;

  function setPlayingUI(on){
    btn.dataset.playing = on ? 'true' : 'false';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  btn.addEventListener('click', ()=>{
    if(broken) return;
    if(audio.paused){
      audio.play().then(()=>{ wantsMusic = true; setPlayingUI(true); }).catch(()=>{});
    } else {
      wantsMusic = false;
      audio.pause(); setPlayingUI(false);
    }
  });

  /* Phones and tablets keep a media element playing when the browser is sent to
     the background or the screen locks, and a laptop keeps it playing behind
     another tab — so music that was meant to accompany the page follows the
     visitor out of it. Stop on hide, pick up again on return: the button keeps
     showing "playing" throughout, because from the visitor's side it never
     stopped. pagehide covers closing the tab and iOS's back/forward cache,
     where visibilitychange alone isn't guaranteed to fire. */
  document.addEventListener('visibilitychange', ()=>{
    if(broken) return;
    if(document.visibilityState === 'hidden'){ audio.pause(); }
    else if(wantsMusic && audio.paused){ audio.play().catch(()=>{}); }
  });
  window.addEventListener('pagehide', ()=>{ if(!broken) audio.pause(); });
}

/* ============================================================
   18b. MUSIC GATE (scene 0) — the question asked once, up front
   ============================================================ */
/* An icon in a corner is easy to never read, and music that is never started
   is music nobody hears. So the choice is put on its own screen first, in two
   steps: the craft asks to be woken ("tap to continue"), and only once it is
   awake does it offer sound ("press for sound"). Declining is simply scrolling
   on. Whichever way it ends, the satellite flies down into the bottom-right
   corner and shrinks into the existing audio button, so the control they'll use
   for the rest of the page is introduced rather than just materialising there.

   It runs as one explicit state machine rather than a set of independent click
   handlers, because the order matters: every route through it has to arrive at
   the same resting arrangement — control docked bottom-right, satellite gone,
   the light left as the only thing asking to be followed.

       INTRO      craft wandering, plaque reads "tap to continue"
         | tap
       PROMPT     craft still wandering, plaque reads "press for sound"
         | tap (music on)  or  scroll past (music stays off)
       DISSOLVE   structure fades out, its core swells into bare light
       DOCKING    that light becomes the existing button and crosses to the corner
       READY      button resting in its own CSS position, light cue primed

   Every transition is one-way and guarded on `state`, so a second tap during an
   animation, or a scroll landing mid-dissolve, can't re-enter a stage or skip
   one. `sat.dataset.stage` is only a mirror of the first two states for the
   plaque's CSS to read. */
function initMusicGate(){
  const gate = document.getElementById('scene-gate');
  const sat  = document.getElementById('gateSat');
  const btn  = document.getElementById('audioToggle');
  if(!gate || !sat) return;
  /* no music configured, or music.mp3 missing — initAudio has already dropped
     the button, so there is nothing to gate. Drop the whole scene before the
     dot navigation is built from the section list. */
  if(!btn || !btn.isConnected){ gate.remove(); return; }

  /* hold scroll until the first tap ("tap to continue") actually happens —
     without this, scrolling past an untouched gate silently counted as a
     real answer (declining music) rather than as just not having answered
     yet. Skipped if a reload restored the visitor somewhere past the gate
     already (matches the same 0.35 threshold `onScroll` below uses to
     decide "already passed this") so a returning visitor can never get
     trapped unable to scroll a gate they're not even looking at. */
  const startsAtGate = window.scrollY < window.innerHeight * 0.35;
  if(startsAtGate) document.documentElement.classList.add('gate-scroll-locked');

  const svg    = sat.querySelector('.gate-sat-svg');
  const inner  = sat.querySelector('.gate-sat-inner');
  const craft  = sat.querySelector('.gate-craft');
  const body   = sat.querySelector('.gs-body');
  const plaque = sat.querySelector('.gate-plaque');
  const core   = sat.querySelector('.gs-core');
  const glow   = sat.querySelector('.gs-core-glow');
  const halo   = sat.querySelector('.gs-halo');
  const ripple = sat.querySelector('.gs-ripple');
  const cue    = document.getElementById('gateScrollCue');
  const cueLabel = cue ? cue.querySelector('.scroll-hint-label') : null;
  /* the cue opens by naming the quiet default, since sound is still off at that
     point — once music is actually switched on there is nothing quiet left to
     mention, so the text drops back to just the instruction */
  const cueToMusicOn = ()=>{ if(cueLabel) cueLabel.textContent = 'Scroll to continue.'; };

  const S = { INTRO:'intro', PROMPT:'prompt', DISSOLVE:'dissolve', DOCKING:'docking', READY:'ready' };
  let state = S.INTRO;
  let busy  = false;            // an acknowledgement is still playing
  const rand = (a,b)=> a + Math.random()*(b-a);

  /* ---- travel (INTRO + PROMPT) ---------------------------------------
     A fresh destination every leg rather than a looping keyframe, so the path
     genuinely wanders. The box is measured from the room the craft actually
     has: the scene's width either side of it, and the gap down to the plaque,
     so it can never wander over its own instruction or off the screen. */
  function travelBox(){
    const scene = gate.getBoundingClientRect();
    const c = craft.getBoundingClientRect();
    const p = plaque.getBoundingClientRect();
    const restX = (c.left + c.right)/2 - (scene.left + scene.right)/2;
    return {
      x: Math.max(24, Math.min(130, (scene.width - c.width)/2 - 14 - Math.abs(restX))),
      down: Math.max(10, Math.min(46, (p.top - c.bottom) - 14)),
      up: Math.max(10, Math.min(64, c.top - scene.top - 24))
    };
  }
  function travelLeg(){
    if(state !== S.INTRO && state !== S.PROMPT) return;
    const b = travelBox();
    gsap.to(inner, {
      x: rand(-b.x, b.x), y: rand(-b.up, b.down),
      duration: rand(2.8, 4.4), ease:'power1.inOut', onComplete: travelLeg
    });
    gsap.to(craft, { rotation: rand(-4.5, 4.5), duration: rand(3.6, 5.6), ease:'sine.inOut' });
  }

  /* ---- acknowledgement ------------------------------------------------
     the craft answering a touch: the core draws up, a ring of light runs out
     through the hull, and the whole thing lifts in brightness for a moment.
     `power` scales the response — the press that starts the music answers
     warmer and brighter than the one that only wakes it. */
  function pulse(power){
    return gsap.timeline()
      .to(glow, { attr:{ r: 22 + 14*power }, duration:.4, ease:'power2.out' }, 0)
      .to(core, { attr:{ r: 5.4 + 3.4*power }, duration:.4, ease:'power2.out' }, 0)
      .to(craft, { filter:'brightness(' + (1 + .45*power) + ')', duration:.28, ease:'power2.out' }, 0)
      .fromTo(ripple,
        { attr:{ r: 10 }, opacity:.85 },
        { attr:{ r: 70 }, opacity:0, duration:1.05, ease:'power2.out' }, .05)
      .to(glow, { attr:{ r: 22 + 4*power }, duration:.85, ease:'power2.inOut' }, .45)
      .to(core, { attr:{ r: 5.4 + 1*power }, duration:.85, ease:'power2.inOut' }, .45)
      .to(craft, { filter:'brightness(' + (1 + .1*power) + ')', duration:.9, ease:'power2.inOut' }, .35);
  }

  /* ---- READY ----------------------------------------------------------
     the only resting arrangement, and the one every route ends at. Written as
     a plain assignment of final values rather than the tail of an animation,
     so it is also the correct thing to jump straight to. */
  function rest(){
    state = S.READY;
    sat.style.display = 'none';
    if(btn.isConnected){
      btn.classList.remove('is-docking');
      btn.classList.add('is-visible');
      /* everything the flight wrote is handed back to the stylesheet, so what
         remains is exactly the button that was always there — including its
         idle pulse, which an inline box-shadow would otherwise suppress */
      gsap.set(btn, { clearProps:'transform,opacity,boxShadow' });
    }
    if(cue) cue.classList.add('is-primed');        // the light is the cue now
  }

  /* ---- DISSOLVE -> DOCKING -> READY -----------------------------------
     The craft is not swapped for the button. Its structure burns off first,
     leaving the core as bare light; that light contracts to the button's size
     and hands over to it in a cross-dissolve; and only then does the button
     itself make the crossing, carrying the glow it was made from. */
  function transform(withMusic){
    if(state !== S.INTRO && state !== S.PROMPT) return;
    state = S.DISSOLVE;
    sat.disabled = true;
    sat.style.cursor = 'default';
    window.removeEventListener('scroll', onScroll);
    gsap.killTweensOf([inner, craft, body, core, glow, halo, ripple]);

    /* nothing worth animating if the gate isn't on screen — a reload restores
       the previous scroll position, so a visitor coming back mid-page has
       already passed this and should just find the button where it belongs */
    const box = gate.getBoundingClientRect();
    const offScreen = box.bottom < 0 || box.top > window.innerHeight;
    if(REDUCED_MOTION || offScreen){ rest(); return; }

    /* where the light is right now, mid-wander — measured before the transforms
       are cleared, so the hand-over happens exactly where the eye last saw it */
    const c = svg.getBoundingClientRect();
    const home = btn.getBoundingClientRect();
    const lightCx = c.left + c.width/2;
    const lightCy = c.top  + c.height/2;

    gsap.timeline()
      /* structure burns off; the core swells to take its place */
      .to(plaque, { opacity:0, y:8, duration:.4, ease:'power2.in' }, 0)
      .to(body,   { opacity:0, duration:.75, ease:'power2.inOut' }, 0)
      .to(glow,   { attr:{ r: 46 }, duration:.75, ease:'power2.out' }, 0)
      .to(core,   { attr:{ r: 11 }, duration:.75, ease:'power2.out' }, 0)
      .to(halo,   { opacity:1, duration:.5 }, 0)
      .fromTo(ripple,
        { attr:{ r: 14 }, opacity:.7 },
        { attr:{ r: 96 }, opacity:0, duration:1.1, ease:'power2.out' }, .1)

      /* the light contracts to the size of the control, and the control fades
         up out of it in the same beat — the morph is this overlap */
      /* placed explicitly: the structure is gone by .75, and the ripple is
         still running out past it, so the hand-over happens inside that wash */
      .addLabel('handover', .8)
      .to(glow, { attr:{ r: 15 }, duration:.45, ease:'power2.inOut' }, 'handover')
      .to(core, { attr:{ r: 5 },  duration:.45, ease:'power2.inOut' }, 'handover')
      .add(()=>{
        state = S.DOCKING;
        /* the existing button, moved to where the light is. No second control
           is created and its resting CSS position is untouched — this is a
           transform that gets cleared again the moment it arrives. */
        gsap.set(btn, {
          x: lightCx - (home.left + home.width/2),
          y: lightCy - (home.top  + home.height/2),
          scale: .55, opacity: 0
        });
        btn.classList.add('is-visible', 'is-docking');
      }, 'handover')
      .to(btn, { opacity:1, scale:1, duration:.42, ease:'power2.out' }, 'handover+=0.05')
      .to(svg, { opacity:0, duration:.4, ease:'power2.in' }, 'handover+=0.08')

      /* ...and only now does it cross the screen */
      .to(btn, {
        x:0, y:0,
        duration: withMusic ? .95 : 1.1, ease:'power3.inOut'
      }, 'handover+=0.42')
      .to(btn, { boxShadow:'0 0 0 0 rgba(212,175,55,0)', duration:.5, ease:'power2.out' }, '-=0.5')
      .add(()=>{ rest(); });
  }

  /* ---- input ----------------------------------------------------------- */
  sat.addEventListener('click', ()=>{
    if(busy) return;
    if(state === S.INTRO){
      /* first touch only wakes it: the craft answers and the plaque rewrites
         itself, but nothing else moves on yet */
      busy = true;
      pulse(1)
        .add(()=>{
          state = S.PROMPT;
          sat.dataset.stage = 'sound';
          sat.setAttribute('aria-label', 'Turn the music on');
          /* the first tap is the only thing this lock was ever waiting for */
          document.documentElement.classList.remove('gate-scroll-locked');
          /* the cue has nothing to say until there's a choice on screen to
             react to — it only turns on once the plaque has become that choice */
          if(cue) cue.classList.add('is-visible');
        }, .3)
        .add(()=>{ busy = false; }, .55);
      return;
    }
    if(state === S.PROMPT){
      /* forwarding the real gesture, so the browser still counts this as the
         interaction that unblocks playback — then the craft flares and goes */
      btn.click();
      /* fired here, not at the end of the multi-second docking timeline below —
         music starts the instant this tap lands, so the cue needs to stop
         calling it a "quiet experience" in that same instant, not several
         seconds later once the craft has finished crossing the screen */
      cueToMusicOn();
      pulse(1.35);
      gsap.delayedCall(.3, ()=> transform(true));
    }
  });

  /* scrolling on is the "no music" answer, valid from either of the two live
     states — nothing to turn off, the craft simply becomes the control anyway
     so it's there if they change their mind.

     Armed only once the page has settled, and never while ScrollTrigger is
     refreshing: refresh scrolls the document itself to measure its pins and
     then puts it back, and those synthetic jumps were answering the gate on
     the visitor's behalf before it had even been drawn. */
  let armed = false;
  const arm = ()=>{ armed = true; };
  if(document.readyState === 'complete') setTimeout(arm, 400);
  else window.addEventListener('load', ()=> setTimeout(arm, 400), { once:true });
  setTimeout(arm, 4000);   // fallback, in case 'load' never fires
  const onScroll = ()=>{
    if(!armed || ScrollTrigger.isRefreshing) return;
    if(window.scrollY > window.innerHeight*0.35) transform(false);
  };
  window.addEventListener('scroll', onScroll, { passive:true });

  /* the cue outlives the satellite: once the choice is made this screen is just
     stars, and scrolling back up to it should still point the way forward */
  if(cue){
    /* stays off for as long as the satellite hasn't been answered yet — tap
       or scroll-past both count, since either one puts a choice on screen
       for the cue to react to; only the plain, untouched "tap to continue"
       moment has nothing yet worth following */
    const syncCue = ()=> cue.classList.toggle('is-visible',
      state !== S.INTRO && window.scrollY < window.innerHeight*0.5);
    window.addEventListener('scroll', syncCue, { passive:true });
  }

  if(!REDUCED_MOTION) travelLeg();
}

/* ============================================================
   19. ADD-TO-CALENDAR (.ics) — a small, RSVP-free convenience;
   easy to delete from the ending section if not wanted.
   ============================================================ */
function buildIcs(){
  const couple = `${wedding.groom} & ${wedding.bride}`;
  const compact = d => d.replace(/-/g,'');
  /* the day after `d`, done entirely in UTC. Going via local midnight and
     toISOString() shifts the result back a day for anyone east of UTC \u2014
     which is every guest in India and Germany \u2014 and produced an all-day
     event whose DTEND equalled its DTSTART. */
  function dayAfter(d){
    const t = Date.UTC(+d.slice(0,4), +d.slice(5,7)-1, +d.slice(8,10)) + 86400000;
    const x = new Date(t);
    return `${x.getUTCFullYear()}${String(x.getUTCMonth()+1).padStart(2,'0')}${String(x.getUTCDate()).padStart(2,'0')}`;
  }
  /* Wall-clock time in a named zone -> the absolute instant it refers to.
     Date.UTC() would treat "27 Nov 11:00" as 11:00 UTC, and a plain
     `new Date("...")` would read it in the *visitor's* zone — both give the
     wrong instant for a ceremony that happens at 11:00 in Kolkata. This asks
     Intl what the guessed instant looks like in the target zone and corrects
     by the difference, so it stays right through DST anywhere. */
  function zonedToInstant(dateStr, timeStr, tz){
    const [Y,M,D] = dateStr.split('-').map(Number);
    const [h,m] = String(timeStr).split(':').map(Number);
    const wanted = Date.UTC(Y, M-1, D, h, m);
    let guess = wanted;
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
    });
    for(let i=0;i<2;i++){
      const parts = fmt.formatToParts(new Date(guess));
      const at = t => Number(parts.find(p => p.type === t).value);
      const seen = Date.UTC(at('year'), at('month')-1, at('day'), at('hour')%24, at('minute'), at('second'));
      guess += wanted - seen;
    }
    return guess;
  }
  /* UTC stamps (the trailing Z) are what make a calendar render the event in
     whatever timezone the guest's own device is set to */
  function utcStamp(ms){
    const d = new Date(ms), p = n => String(n).padStart(2,'0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  }

  /* RFC 5545 text escaping, and 75-octet line folding */
  const esc = s => String(s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
  function fold(line){
    if(line.length <= 73) return line;
    const parts = [line.slice(0,73)];
    let rest = line.slice(73);
    while(rest.length){ parts.push(' ' + rest.slice(0,72)); rest = rest.slice(72); }
    return parts.join('\r\n');
  }

  /* every celebration in one file: the schedule entries plus the wedding
     itself, ordered by date so the calendar reads chronologically no matter
     how the config happens to be written */
  const events = (wedding.schedule || [])
    .filter(item => item && item.date && item.label)
    .map(item => ({ date:item.date, label:item.label, time:item.time,
                    hours:item.durationHours, place:item.location }));
  /* the wedding day is only added separately when the schedule doesn't
     already list it — the schedule does carry a "Wedding" row today, and
     appending unconditionally put that day in the file twice */
  if(!events.some(ev => ev.date === wedding.weddingDate)){
    events.push({ date: wedding.weddingDate, label: 'Wedding' });
  }
  events.sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

  const location = [wedding.venue, wedding.venueAddress].filter(Boolean).join(', ');
  const stamp = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';

  const lines = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Harsha & Lekhana//Wedding//EN',
    'CALSCALE:GREGORIAN','METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(couple)}`
  ];
  const tz = wedding.eventTimeZone || wedding.brideTimeZone || 'Asia/Kolkata';
  events.forEach((ev, i) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${compact(ev.date)}-${i}-harsha-lekhana@wedding.local`,
      `DTSTAMP:${stamp}`
    );
    if(ev.time){
      const start = zonedToInstant(ev.date, ev.time, tz);
      const end = start + (ev.hours || 3)*3600000;
      lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`);
    } else {
      /* no time given \u2014 keep it an all-day entry rather than inventing one */
      lines.push(`DTSTART;VALUE=DATE:${compact(ev.date)}`, `DTEND;VALUE=DATE:${dayAfter(ev.date)}`);
    }
    lines.push(
      `SUMMARY:${esc(`${ev.label} \u2014 ${couple}`)}`,
      `DESCRIPTION:${esc(`Celebrating the wedding of ${couple}.`)}`
    );
    /* an event held elsewhere carries its own place; the rest use the venue */
    const where = ev.place || location;
    if(where) lines.push(`LOCATION:${esc(where)}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.map(fold).join('\r\n') + '\r\n'], { type:'text/calendar' });
  document.getElementById('icsLink').href = URL.createObjectURL(blob);
}

/* ============================================================
   20. LOADER + OPENING SEQUENCE
   ============================================================ */
function initLoaderAndOpening(){
  const loader = document.getElementById('loader');
  const fill = document.getElementById('loaderFill');
  document.documentElement.style.overflow = 'hidden';
  const minDuration = REDUCED_MOTION ? 200 : 650;
  const start = performance.now();
  (function step(now){
    const elapsed = now - start;
    fill.style.width = Math.min(100, (elapsed/minDuration)*100) + '%';
    if(elapsed < minDuration){ requestAnimationFrame(step); } else { finish(); }
  })(start);

  function finish(){
    loader.classList.add('is-done');
    document.documentElement.style.overflow = '';
    /* the audio button is no longer revealed here — the music gate (scene 0)
       hands it over once the visitor has answered it either way. Its own
       scroll cue is likewise held back until then (see initMusicGate) —
       the very first thing on screen is the satellite alone, nothing yet
       telling them to keep scrolling. */
    document.getElementById('dotNav').classList.add('is-visible');
    playOpening();
    if(ScrollTrigger) ScrollTrigger.refresh();
  }
}
/* a personal greeting based on the VISITOR's own local time (their
   browser clock) — distinct from the Munich/Bangalore city clocks
   used elsewhere, which reflect those cities' own local time */
function getGreeting(){
  const h = new Date().getHours();
  /* every hour lands in exactly one branch. With only three, midnight to
     05:00 fell through to the final return and greeted a 4am visitor with
     "Good Evening" \u2014 so late night gets its own state and the catch-all is
     the one that is genuinely correct for whatever is left. */
  if(h >= 5  && h < 12) return { text:'Good Morning',   emoji:'\u2600\uFE0F' };          // 05:00\u201311:59
  if(h >= 12 && h < 17) return { text:'Good Afternoon', emoji:'\uD83C\uDF24\uFE0F' };    // 12:00\u201316:59
  if(h >= 17 && h < 22) return { text:'Good Evening',   emoji:'\uD83C\uDF19' };          // 17:00\u201321:59
  return { text:'Good Night', emoji:'\u2728' };                                          // 22:00\u201304:59
}

function playOpening(){
  const cue = document.getElementById('openingScrollCue');
  const greetingWrap = document.querySelector('.opening-greeting');
  const greetingEl = document.getElementById('openingGreeting');
  const g = getGreeting();
  if(greetingEl) greetingEl.textContent = g.text + ' ' + g.emoji;

  if(REDUCED_MOTION){
    if(greetingWrap) greetingWrap.style.opacity = 1;
    cue.classList.add('is-visible');
    return;
  }
  const tl = gsap.timeline({ defaults:{ ease:'power3.out' }, onComplete: ()=>{ initOpeningGreetingSync(); initScrollHintSync(); } });
  tl.to(greetingWrap, { opacity:1, duration:1.2 })
    .add(()=> cue.classList.add('is-visible'), '-=0.3');
}

/* keeps the greeting tied to actual scroll position (rather than a
   one-time fade-out on first scroll) so scrolling back up to the top
   always brings it back, instead of it vanishing for good the first
   time the visitor scrolls away from it. Only starts once the entrance
   animation above has finished, so it can't race/override it. */
function initOpeningGreetingSync(){
  const greetingWrap = document.querySelector('.opening-greeting');
  if(!greetingWrap || REDUCED_MOTION) return;
  const fadeDistance = Math.max(1, window.innerHeight * 0.6);
  /* measured from the opening scene's own top, not from the document's. The
     music gate now sits above it, so raw scrollY would have this greeting fully
     faded out before the visitor had even reached it. */
  const openingEl = document.getElementById('scene-opening');
  const openingTop = ()=> openingEl ? openingEl.getBoundingClientRect().top + window.scrollY : 0;
  let top = openingTop();
  window.addEventListener('resize', ()=>{ top = openingTop(); }, { passive:true });
  function sync(scrollY){
    const y = typeof scrollY === 'number' ? scrollY : window.scrollY;
    const t = clamp01((y - top) / fadeDistance);
    greetingWrap.style.opacity = String(1 - t);
  }
  if(lenisInstance){
    lenisInstance.on('scroll', e => sync(e.scroll));
  } else {
    window.addEventListener('scroll', () => sync(), { passive:true });
  }
  sync(window.scrollY);
}

/* same reasoning as the greeting sync above: the scroll-down cue needs to
   reappear whenever the visitor scrolls back up to the opening, not just
   show once and then stay gone forever. */
function initScrollHintSync(){
  const cue = document.getElementById('openingScrollCue');
  if(!cue || REDUCED_MOTION) return;
  const fadeDistance = Math.max(1, window.innerHeight * 0.5);
  /* likewise relative to the opening scene, and bounded on both sides so this
     cue doesn't sit switched on while the visitor is still up on the gate */
  const openingEl = document.getElementById('scene-opening');
  const openingTop = ()=> openingEl ? openingEl.getBoundingClientRect().top + window.scrollY : 0;
  let top = openingTop();
  window.addEventListener('resize', ()=>{ top = openingTop(); }, { passive:true });
  function sync(scrollY){
    const y = typeof scrollY === 'number' ? scrollY : window.scrollY;
    const rel = y - top;
    cue.classList.toggle('is-visible', rel > -fadeDistance && rel < fadeDistance);
  }
  if(lenisInstance){
    lenisInstance.on('scroll', e => sync(e.scroll));
  } else {
    window.addEventListener('scroll', () => sync(), { passive:true });
  }
  sync(window.scrollY);
}

/* first genuine scroll: a soft light wash carries the visitor from the
   opening into the rest of the story — a one-time transition flourish,
   separate from the cue's own visibility (handled by initScrollHintSync
   above), so it can't leave the cue permanently hidden. Guards against
   scrollY still being ~0 so a spurious scroll event fired during page/
   Lenis setup can't fire this before the visitor has actually scrolled. */
function initOpeningLaunch(){
  const flash = document.getElementById('openingFlash');
  if(REDUCED_MOTION) return;

  let launched = false;
  const events = ['wheel','touchstart','scroll'];
  function launch(){
    if(launched || window.scrollY < 4) return;
    launched = true;
    if(flash){
      flash.classList.add('is-active');
      setTimeout(()=> flash.classList.remove('is-active'), 1300);
    }
    events.forEach(evt => window.removeEventListener(evt, launch));
  }
  events.forEach(evt => window.addEventListener(evt, launch, { passive:true }));
}

/* ============================================================
   22. INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', function(){
  if(typeof gsap === 'undefined'){
    /* GSAP failed to load from CDN (network issue, blocked domain, etc.) —
       fail safe rather than silently halting everything else. Reveal the
       essentials so the page is still readable and usable without motion. */
    document.getElementById('loader').classList.add('is-done');
    document.documentElement.style.overflow = '';
    const greetingEl = document.getElementById('openingGreeting');
    if(greetingEl){ const g = getGreeting(); greetingEl.textContent = g.text + ' ' + g.emoji; }
    document.querySelectorAll('.will-reveal, .opening-greeting, .scroll-hint, .connection-caption, .poster-frame').forEach(el=>{
      el.style.opacity = '1'; el.style.transform = 'none'; el.style.filter = 'none';
    });
    DetailsRenderer.init();
    tickCityTimes();
    setInterval(tickCityTimes, 30000);
    buildIcs();
    return;
  }
  gsap.registerPlugin(ScrollTrigger);
  /* on phones the address bar collapsing counts as a resize, which would
     otherwise re-measure and visibly jump every pinned scene mid-scroll */
  ScrollTrigger.config({ ignoreMobileResize:true });

  EarthScene.init();
  ConnectionScene.init();
  if(wedding.features.countdown) Countdown.init();
  DetailsRenderer.init();
  PosterScene.init();
  document.getElementById('bridePhoto').src = wedding.bridePhoto;
  document.getElementById('groomPhoto').src = wedding.groomPhoto;

  initAmbientFields();
  setupReveals();
  setupPinnedScenes();
  /* both before the nav: initAudio decides whether a music button exists at
     all, and initMusicGate may drop scene 0 on the strength of that — the dot
     navigation is built from the surviving sections */
  initAudio();
  initMusicGate();
  setupProgressAndNav();
  buildIcs();
  tickCityTimes();
  setInterval(tickCityTimes, 30000);
  initLoaderAndOpening();
  initOpeningLaunch();

  if(!REDUCED_MOTION && wedding.features.smoothScroll && window.Lenis){
    lenisInstance = new Lenis({
      /* a fast trackpad flick used to keep the pinned scenes (Living Earth,
         Connection) visibly drifting for the better part of a second after
         the hand actually stopped — this curve was front-loaded enough that
         a hard flick banked most of its motion as pure momentum rather than
         tracking the gesture. Shorter duration and a gentler cubic-out keep
         the same soft, glidey feel for ordinary scrolling while cutting
         that coast down to something the eye doesn't register as separate
         from the scroll itself. */
      duration: 0.7,
      easing: t => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
      smoothTouch: false,
      touchMultiplier: 1.2
    });
    lenisInstance.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time)=>{ lenisInstance.raf(time*1000); });
    gsap.ticker.lagSmoothing(0);
  }

  window.addEventListener('load', ()=> ScrollTrigger.refresh());
  /* only a real layout change should trigger a refresh. A height-only
     change of less than ~140px on a touch device is the browser chrome
     sliding in or out, not a rotation or a window resize — refreshing on
     those made the pinned scenes stutter continuously while scrolling. */
  let resizeT, lastW = window.innerWidth, lastH = window.innerHeight;
  let replayingResize = false;
  window.addEventListener('resize', ()=>{
    if(replayingResize) return;
    const dw = Math.abs(window.innerWidth - lastW);
    const dh = Math.abs(window.innerHeight - lastH);
    if(IS_TOUCH && dw === 0 && dh < 140) return;
    lastW = window.innerWidth; lastH = window.innerHeight;
    clearTimeout(resizeT);
    resizeT = setTimeout(()=> ScrollTrigger.refresh(), 200);
  }, { passive:true });

  /* Every canvas scene sizes its drawing buffer from its own
     getBoundingClientRect(). Inside a pinned section that box belongs to
     ScrollTrigger, which only corrects it on refresh — and refresh is debounced
     200ms behind the resize event above. So on a rotation each scene measured
     itself against the *previous* orientation's pin box and then never heard
     about the correction: the buffer stayed landscape-shaped while the element
     went portrait, and the browser stretched one into the other. That's the
     squashed globe and the oval glows after turning the phone back upright.
     Replaying the resize once refresh has settled the geometry re-measures
     every scene against the real box. The guard above keeps this from looping
     back into another refresh. */
  ScrollTrigger.addEventListener('refresh', ()=>{
    replayingResize = true;
    try { window.dispatchEvent(new Event('resize')); }
    finally { replayingResize = false; }
  });
  /* iOS in particular reports the pre-rotation viewport for a beat after
     orientationchange fires, so ask for one more pass once it has settled */
  window.addEventListener('orientationchange', ()=>{
    setTimeout(()=> ScrollTrigger.refresh(), 350);
  }, { passive:true });
});

})();
