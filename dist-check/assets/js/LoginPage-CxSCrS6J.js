import{A as e,C as t,E as n,J as r,M as i,Q as a,S as o,St as s,T as c,W as l,X as u,_ as d,_t as f,bt as p,et as m,ft as h,in as g,j as _,jt as v,q as y,rn as b,tn as x,ut as S,w as C}from"./vendor-echarts-CDBckQCH.js";import{$ as w,C as T,H as E,L as D,M as O,V as k,a as A,bt as j,m as M,mt as ee,ut as N,z as P}from"./vendor-element-plus-CgHgiRWM.js";import{i as F,r as I}from"./vendor-vue-AMEr4czS.js";import{c as te,i as L,l as R,n as ne,o as z,s as re}from"./index-CHL3B694.js";import{t as B}from"./_plugin-vue_export-helper-BDNMzG2s.js";import"./constants-BPo83lxF.js";import{n as V,r as ie}from"./validation-gwo-aHAJ.js";import{t as ae}from"./logo-PehLmda_.js";import{G as oe,I as se,L as H,M as U,U as W,V as ce,W as G,Y as K,q as le,u as ue,v as de,y as q}from"./vendor-three-y1kL4XhU.js";import{i as fe,t as pe}from"./profile-CjuMyt8b.js";var me={dawn:{skyTop:[.22,.28,.5],skyHorizon:[.65,.55,.58],waterDeep:[.02,.06,.16],waterSurface:[.06,.16,.3],specular:[.9,.65,.4],sunDir:[.5,.25,.7]},noon:{skyTop:[.18,.4,.72],skyHorizon:[.55,.68,.78],waterDeep:[.02,.1,.24],waterSurface:[.05,.19,.36],specular:[1,.92,.78],sunDir:[.35,.65,.55]},dusk:{skyTop:[.15,.08,.25],skyHorizon:[.55,.28,.25],waterDeep:[.02,.04,.14],waterSurface:[.06,.09,.24],specular:[.9,.5,.28],sunDir:[.55,.2,.65]},night:{skyTop:[.03,.04,.12],skyHorizon:[.06,.07,.18],waterDeep:[.01,.03,.1],waterSurface:[.03,.06,.16],specular:[.4,.5,.75],sunDir:[-.2,.4,.7]}},he=`
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`,ge=`
  uniform vec3 uSkyTop;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSunDir;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    // 俯仰角 — 上方是天空，靠近地平线变亮
    float elevation = normalize(vWorldPos).y;
    float t = smoothstep(-0.15, 0.5, elevation);
    vec3 sky = mix(uSkyHorizon, uSkyTop, t);

    // 太阳光晕
    vec3 sunD = normalize(uSunDir);
    float sunGlow = pow(max(dot(normalize(vWorldPos), sunD), 0.0), 80.0) * 0.35;
    float sunHalo = pow(max(dot(normalize(vWorldPos), sunD), 0.0), 8.0) * 0.10;
    sky += vec3(1.0, 0.85, 0.6) * sunGlow;
    sky += vec3(0.9, 0.8, 0.7) * sunHalo;

    gl_FragColor = vec4(sky, 1.0);
  }
`,_e=`
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec2 vUv0;
  varying vec2 vUv1;
  varying float vWaveHeight;

  // ── Gerstner 波：更自然的波浪形态 ──
  float gerstner(vec2 xz, vec2 dir, float freq, float amp, float speed, float sharpness) {
    float phase = dot(xz, dir) * freq + uTime * speed;
    // sharpness > 1.0 → 波峰更尖、波谷更平
    float wave = (pow(0.5 + 0.5 * sin(phase), sharpness) * 2.0 - 1.0);
    return wave * amp;
  }

  float waveHeight(vec2 xz) {
    float h = 0.0;
    // 大型涌浪（不同方向交叉传播）
    h += gerstner(xz, normalize(vec2(0.7, 0.7)),  0.06, 0.70, 0.08, 1.6);
    h += gerstner(xz, normalize(vec2(0.3, 0.9)),  0.08, 0.55, 0.10, 1.4);
    h += gerstner(xz, normalize(vec2(-0.5, 0.85)), 0.07, 0.50, 0.07, 1.5);
    // 中型波浪
    h += gerstner(xz, normalize(vec2(0.6, -0.3)), 0.14, 0.28, 0.14, 1.3);
    h += gerstner(xz, normalize(vec2(-0.4, 0.6)), 0.16, 0.22, 0.12, 1.2);
    h += gerstner(xz, normalize(vec2(0.8, 0.2)),  0.18, 0.18, 0.16, 1.1);
    // 细碎浪花
    h += gerstner(xz, normalize(vec2(0.4, -0.7)), 0.28, 0.10, 0.20, 1.0);
    h += gerstner(xz, normalize(vec2(-0.6, -0.4)),0.32, 0.08, 0.22, 1.0);
    h += gerstner(xz, normalize(vec2(0.2, 0.5)),  0.38, 0.05, 0.25, 1.0);
    h += gerstner(xz, normalize(vec2(-0.3, 0.7)), 0.44, 0.04, 0.28, 1.0);
    return h;
  }

  void main() {
    vec3 pos = position;

    float h = waveHeight(pos.xz);
    pos.y += h;
    vWaveHeight = h;

    // 近似法线：采样周围点的高度
    float eps = 0.4;
    float hR = waveHeight(pos.xz + vec2(eps, 0.0));
    float hL = waveHeight(pos.xz + vec2(-eps, 0.0));
    float hF = waveHeight(pos.xz + vec2(0.0, eps));
    float hB = waveHeight(pos.xz + vec2(0.0, -eps));
    vec3 approxN = normalize(vec3((hL - hR) / (2.0 * eps), 1.0, (hB - hF) / (2.0 * eps)));
    vWorldNormal = normalize(mat3(modelMatrix) * approxN);

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    vUv0 = pos.xz * 0.5;
    vUv1 = pos.xz * 0.2;

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`,ve=`
  uniform sampler2D uNormalMap;
  uniform vec3 uCameraPos;
  uniform vec3 uWaterDeep;
  uniform vec3 uWaterSurface;
  uniform vec3 uSpecular;
  uniform vec3 uSunDir;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyHorizon;
  uniform float uTime;
  uniform float uNormalStrength;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec2 vUv0;
  varying vec2 vUv1;
  varying float vWaveHeight;

  void main() {
    // ── 法线贴图微扰动 ──
    vec2 flow0 = vUv0 + vec2(uTime * 0.02, uTime * 0.025);
    vec2 flow1 = vUv1 + vec2(-uTime * 0.03, uTime * 0.018);
    vec3 n0 = texture2D(uNormalMap, flow0).rgb * 2.0 - 1.0;
    vec3 n1 = texture2D(uNormalMap, flow1).rgb * 2.0 - 1.0;
    vec3 bump = normalize(mix(n0, n1, 0.4));

    // 将贴图法线叠加到顶点法线上（切线空间 → 世界）
    vec3 N_vert = normalize(vWorldNormal);
    // 避免 N_vert 与 up 平行时 cross 为零
    vec3 up = abs(N_vert.y) > 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
    vec3 T = normalize(cross(N_vert, up));
    vec3 B = cross(N_vert, T);
    vec3 N = normalize(N_vert + (T * bump.x + B * bump.y) * uNormalStrength);

    vec3 V = normalize(uCameraPos - vWorldPos);
    vec3 L = normalize(uSunDir);
    vec3 H = normalize(L + V);

    float NdotV = abs(dot(N, V));
    float NdotH = max(dot(N, H), 0.0);

    // ── 距离 ──
    float dist = length(vWorldPos.xz);
    float depthFactor = smoothstep(5.0, 45.0, dist);

    // ── 水体颜色 ──
    vec3 waterColor = mix(uWaterSurface, uWaterDeep, depthFactor);
    waterColor = mix(waterColor * 0.82, waterColor * 1.06, smoothstep(-0.3, 0.3, vWaveHeight));

    // ── Fresnel ──
    float f0 = 0.02;
    float fresnel = f0 + (1.0 - f0) * pow(1.0 - NdotV, 5.0);
    vec3 skyRefl = mix(uSkyHorizon * 0.7, uSkyTop * 0.85, smoothstep(0.0, 0.6, N.y));
    waterColor = mix(waterColor, skyRefl, fresnel * 0.65);

    // ── 镜面高光 ──
    float roughness = 0.06;
    float a2 = roughness * roughness;
    float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
    float spec = (a2 / (3.14159 * d * d)) * 0.5;
    float specWide = pow(NdotH, 80.0) * 0.12;
    waterColor += uSpecular * (spec * smoothstep(0.25, 0.55, NdotH) + specWide);
    waterColor -= uSpecular * spec * depthFactor * 0.4;

    // ── 太阳倒影 ──
    float sunRefl = pow(max(dot(reflect(-L, N), V), 0.0), 500.0) * 0.18;
    waterColor += uSpecular * sunRefl;

    // ── 泡沫 ──
    float foam = smoothstep(0.32, 0.58, vWaveHeight) * smoothstep(0.4, 0.75, NdotV);
    foam *= (1.0 - depthFactor * 0.6);
    waterColor = mix(waterColor, vec3(0.78, 0.84, 0.92), foam * 0.25);

    // ── 波谷散射 ──
    waterColor += uWaterSurface * smoothstep(-0.5, 0.0, vWaveHeight) * (1.0 - depthFactor) * 0.06;

    gl_FragColor = vec4(waterColor, 1.0);
  }
`;function ye(e){let t=s(!0),n,i,a,o,c,l,u=0,d;function f(){!i||!a||(i.aspect=window.innerWidth/window.innerHeight,i.updateProjectionMatrix(),a.setSize(window.innerWidth,window.innerHeight))}function p(){u=requestAnimationFrame(p),d.getDelta();let e=d.elapsedTime;i.position.set(0,2.2,5),i.lookAt(0,1.2,-5),o.uniforms.uTime.value=e,o.uniforms.uCameraPos.value.copy(i.position),c.uniforms.uSunDir.value.copy(o.uniforms.uSunDir.value),a.render(n,i)}function m(){let r=e.value;if(!r)return;try{let e=document.createElement(`canvas`);if(!(e.getContext(`webgl`)||e.getContext(`experimental-webgl`)))throw Error()}catch{t.value=!1;return}let s=me.noon;n=new W,i=new se(58,window.innerWidth/window.innerHeight,.5,120),i.position.set(0,2.2,5),i.lookAt(0,1.5,-3),a=new ue({antialias:!0,alpha:!1}),a.setSize(window.innerWidth,window.innerHeight),a.setPixelRatio(Math.min(window.devicePixelRatio,2)),a.toneMapping=4,a.toneMappingExposure=1.1,r.appendChild(a.domElement),l=new le().load(`/textures/Water_1_M_Normal.jpg`),l.wrapS=l.wrapT=ce,l.colorSpace=``;let u=new oe(50,64,32);c=new G({vertexShader:he,fragmentShader:ge,uniforms:{uSkyTop:{value:new q(s.skyTop[0],s.skyTop[1],s.skyTop[2])},uSkyHorizon:{value:new q(s.skyHorizon[0],s.skyHorizon[1],s.skyHorizon[2])},uSunDir:{value:new K(s.sunDir[0],s.sunDir[1],s.sunDir[2])}},side:1,depthWrite:!1});let m=new U(u,c);n.add(m);let h=new H(100,80,150,120);h.rotateX(-Math.PI/2),o=new G({vertexShader:_e,fragmentShader:ve,uniforms:{uNormalMap:{value:l},uTime:{value:0},uCameraPos:{value:new K},uWaterDeep:{value:new q(s.waterDeep[0],s.waterDeep[1],s.waterDeep[2])},uWaterSurface:{value:new q(s.waterSurface[0],s.waterSurface[1],s.waterSurface[2])},uSpecular:{value:new q(s.specular[0],s.specular[1],s.specular[2])},uSunDir:{value:new K(s.sunDir[0],s.sunDir[1],s.sunDir[2])},uSkyTop:{value:new q(s.skyTop[0],s.skyTop[1],s.skyTop[2])},uSkyHorizon:{value:new q(s.skyHorizon[0],s.skyHorizon[1],s.skyHorizon[2])},uNormalStrength:{value:.4}},transparent:!1,depthWrite:!0});let g=new U(h,o);g.position.y=-1,g.position.z=-5,n.add(g);let _=new U(new H(120,8),new G({vertexShader:`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }
      `,fragmentShader:`
        varying vec2 vUv;
        uniform vec3 uColor;
        void main() {
          float a = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
          a *= 0.35;
          gl_FragColor = vec4(uColor, a);
        }
      `,uniforms:{uColor:{value:new q(s.skyHorizon[0],s.skyHorizon[1],s.skyHorizon[2])}},transparent:!0,depthWrite:!1}));_.position.set(0,-.3,-20),n.add(_),window.addEventListener(`resize`,f),d=new de,p()}function h(){if(cancelAnimationFrame(u),window.removeEventListener(`resize`,f),a){a.dispose();let e=a.domElement;e.parentNode&&e.parentNode.removeChild(e)}l&&l.dispose(),n&&n.traverse(e=>{e instanceof U&&(e.geometry?.dispose(),Array.isArray(e.material)?e.material.forEach(e=>e.dispose()):e.material?.dispose())})}return y(()=>{window.innerWidth>=768&&m()}),r(()=>h()),{webglSupported:t}}var be=`login_fail_count:`,xe={10001:`请输入登录账号`,10002:`请输入用户名和密码`,10003:`输入格式不正确，请检查后重试`,20006:`账号已被禁用，请联系系统管理员`,20007:`账号已锁定，请稍后再试`,20008:`账号或密码错误，请重新输入`};function J(e){return e&&typeof e==`object`?e:null}function Y(e){return typeof e!=`string`||!e.trim()?``:e.trim()}function Se(e){return!!(!e||/^(AUTH_|ERR_|HTTP_)\w+/i.test(e)||/^\d{5}$/.test(e)||/network error|timeout|ECONNABORTED/i.test(e))}function Ce(e,t){if(xe[e])return xe[e];let n=Y(t);return n&&!Se(n)?n:`登录失败，请稍后重试`}function we(e){if(L(e))return{code:e.code,message:Y(e.message),data:e.data};if(z.isAxiosError(e)&&e.response?.data&&typeof e.response.data==`object`){let t=e.response.data;if(t.code!==void 0)return{code:Number(t.code),message:Y(t.msg??t.message),data:t.data??null}}return null}function Te(e,t,n){if(J(n)?.error_code===`AUTH_002`||e===20007||t===`AUTH_002`)return!0;let r=Y(t);return!!(r.includes(`锁定`)||r.includes(`冻结`))}function Ee(e){let t=J(e);if(!t)return 1800;let n=Number(t.lock_remain_seconds??t.remaining_seconds??t.lock_seconds);if(Number.isFinite(n)&&n>0)return Math.floor(n);let r=t.lock_expire_time;if(typeof r==`string`&&r){let e=Math.floor((new Date(r.replace(/-/g,`/`)).getTime()-Date.now())/1e3);if(e>0)return e}return 1800}function De(e){let t=J(e);if(!t)return null;let n=Number(t.remaining_attempts);if(Number.isFinite(n)&&n>=0)return Math.floor(n);let r=Number(t.fail_count??t.failCount);return Number.isFinite(r)&&r>=0?Math.max(0,5-Math.floor(r)):null}function X(e){return`${be}${e.trim().toLowerCase()}`}function Oe(e){if(!e.trim())return 0;let t=Number(sessionStorage.getItem(X(e)));return Number.isFinite(t)&&t>0?Math.floor(t):0}function ke(e){if(!e.trim())return 0;let t=Oe(e)+1;return sessionStorage.setItem(X(e),String(t)),t}function Z(e){e.trim()&&sessionStorage.removeItem(X(e))}function Ae(e){if(e<3||e>=5)return``;let t=5-e;return t===1?`还剩 1 次尝试机会，再次输入错误将锁定账号 30 分钟`:`还剩 ${t} 次尝试机会，连续 5 次错误将锁定账号 30 分钟`}function je(e){let t=Math.max(0,e),n=Math.floor(t/60),r=t%60;return`${n} 分 ${String(r).padStart(2,`0`)} 秒`}function Me(e){if(z.isAxiosError(e)){if(e.code===`ECONNABORTED`)return`请求超时，请稍后重试`;if(!e.response)return`网络连接失败，请检查网络或联系管理员`;let t=e.response.status;if(t===502||t===503)return`服务暂时不可用，请稍后重试`;if(t===500)return`服务器繁忙，请稍后重试`}return e instanceof Error&&e.message&&!Se(e.message)?e.message:`登录失败，请稍后重试`}function Ne(e,t=``){let n=we(e);if(n){let e=Ce(n.code,n.message);if(Te(n.code,n.message,n.data))return Z(t),{type:`locked`,remainSeconds:Ee(n.data),message:e};if(n.code===20008){let r=null,i=De(n.data);t.trim()&&(r=ke(t));let a=i==null?r??0:5-i;return a>=5?(Z(t),{type:`locked`,remainSeconds:Ee(n.data),message:`连续 5 次密码错误，账号已锁定 30 分钟`}):{type:`wrong_password`,warning:Ae(a),message:e}}return{type:`other`,message:e}}return{type:`other`,message:Me(e)}}function Pe(){let e=s(!1),t=s(!1),n=s(0),r=s(!1),i=s(``),a=s(``),c=null,u=o(()=>e.value&&!r.value),d=o(()=>je(n.value));function f(){c&&=(clearInterval(c),null)}function p(i){f(),e.value=!0,r.value=!1,t.value=!0,n.value=Math.max(0,i),c=setInterval(()=>{if(n.value<=1){n.value=0,r.value=!0,f();return}--n.value},1e3)}function m(e,t=``){a.value=``;let n=Ne(e,t);return n.type===`locked`?(i.value=``,a.value=``,p(n.remainSeconds),!0):n.type===`wrong_password`?(i.value=n.warning,a.value=n.message,!1):(i.value=``,a.value=n.message,!1)}function h(){a.value=``,i.value=``}function g(){f(),e.value=!1,r.value=!1,t.value=!1,n.value=0}function _(){g(),h()}function v(){if(r.value){_();return}t.value=!1}return l(f),{locked:e,lockDialogVisible:t,remainSeconds:n,lockReleased:r,attemptWarning:i,loginErrorMessage:a,formDisabled:u,countdownText:d,handleLoginError:m,clearLoginError:h,retryAfterLockout:_,closeDialog:v,resetLockout:g}}var Fe={class:`account-lock-dialog__body`},Ie={class:`account-lock-dialog__icon`},Le={key:0,class:`account-lock-dialog__text`},Re={key:1,class:`account-lock-dialog__text account-lock-dialog__text--success`},ze={key:2,class:`account-lock-dialog__countdown`},Be=B(i({__name:`AccountLockDialog`,props:{visible:{type:Boolean},countdownText:{},released:{type:Boolean}},emits:[`update:visible`,`retry`],setup(r,{emit:i}){let a=r,s=i,l=o({get:()=>a.visible,set:e=>s(`update:visible`,e)});return(i,a)=>{let o=m(`el-icon`);return u(),C(v(T),{modelValue:l.value,"onUpdate:modelValue":a[1]||=e=>l.value=e,title:`账号已锁定`,width:`420px`,"align-center":``,"append-to-body":``,"z-index":5e3,"close-on-click-modal":r.released,"close-on-press-escape":r.released,"show-close":r.released,class:`account-lock-dialog`},{footer:h(()=>[r.released?(u(),C(v(D),{key:0,type:`primary`,onClick:a[0]||=e=>s(`retry`)},{default:h(()=>[...a[4]||=[e(` 重新登录 `,-1)]]),_:1})):(u(),C(v(D),{key:1,disabled:``},{default:h(()=>[...a[5]||=[e(` 重新登录 `,-1)]]),_:1}))]),default:h(()=>[t(`div`,Fe,[t(`div`,Ie,[_(o,{size:40},{default:h(()=>[_(v(w))]),_:1})]),r.released?(u(),n(`p`,Re,` 锁定已解除，请重新登录 `)):(u(),n(`p`,Le,` 您的账号因连续多次密码错误已被临时锁定。 `)),r.released?c(``,!0):(u(),n(`p`,ze,[a[2]||=e(` 锁定剩余时间：`,-1),t(`strong`,null,g(r.countdownText),1)])),a[3]||=t(`p`,{class:`account-lock-dialog__hint`},` 如需紧急解锁，请联系站长或系统管理员。 `,-1)])]),_:1},8,[`modelValue`,`close-on-click-modal`,`close-on-press-escape`,`show-close`])}}}),[[`__scopeId`,`data-v-3b78229d`]]),Ve={class:`force-pwd-dialog__body`},He={class:`force-pwd-dialog__icon`},Ue={class:`pwd-strength`},We={class:`pwd-strength__bar`},Ge={class:`pwd-checklist`},Ke={class:`pwd-checklist__icon`},qe=B(i({__name:`ForcePasswordChangeDialog`,props:{visible:{type:Boolean},released:{type:Boolean}},emits:[`update:visible`,`success`],setup(r,{emit:i}){let l=ne(),f=r,y=i,w=o({get:()=>f.visible,set:e=>y(`update:visible`,e)}),O=s(),j=s(!1),N=p({new_password:``,confirm_password:``,phone:``});S(()=>f.visible,e=>{e&&(N.new_password=``,N.confirm_password=``,N.phone=``,O.value?.resetFields())});let F=o(()=>ie(N.new_password)),I=o(()=>F.value.level===`strong`?`#22c55e`:F.value.level===`medium`?`#f59e0b`:N.new_password?`#ef4444`:`#c0c4cc`),L=o(()=>F.value.score/3*100),R=/^1[3-9]\d{9}$/,z={new_password:[{required:!0,message:`请输入新密码`,trigger:`blur`},{pattern:V.pattern,message:V.message,trigger:`blur`}],confirm_password:[{required:!0,message:`请确认新密码`,trigger:`blur`}],phone:[{required:!0,message:`请输入手机号码`,trigger:`blur`},{pattern:R,message:`请输入正确的11位手机号码`,trigger:`blur`}]};async function B(){if(!N.new_password){A.warning(`请输入新密码`);return}if(N.new_password===`12345678`){A.warning(`新密码不能与默认密码相同`);return}if(N.new_password!==N.confirm_password){A.warning(`两次输入的新密码不一致`);return}if(F.value.level===`weak`){A.warning(`新密码强度太弱，请按规则设置`);return}if(!R.test(N.phone)){A.warning(`请输入正确的11位手机号码`);return}j.value=!0;try{await pe({old_password:re,new_password:N.new_password,confirm_password:N.confirm_password});let e=l.userInfo?.id;if(e)try{if(await fe(e,{phone:N.phone}),l.userInfo){let e={...l.userInfo,phone:N.phone};l.userInfo=e,localStorage.setItem(`userInfo`,JSON.stringify(e)),sessionStorage.getItem(`userInfo`)&&sessionStorage.setItem(`userInfo`,JSON.stringify(e))}}catch{}sessionStorage.removeItem(te),A.success(`密码修改成功，正在进入系统...`),y(`success`)}catch(e){let t=e&&typeof e==`object`&&`message`in e?e.message:`密码修改失败，请稍后重试`;A.error(t)}finally{j.value=!1}}return(i,o)=>{let s=m(`el-icon`);return u(),C(v(T),{modelValue:w.value,"onUpdate:modelValue":o[3]||=e=>w.value=e,title:`首次登录 - 请修改密码`,width:`500px`,"align-center":``,"append-to-body":``,"z-index":5e3,"close-on-click-modal":r.released,"close-on-press-escape":r.released,"show-close":r.released,class:`force-pwd-dialog`},{footer:h(()=>[_(v(D),{type:`primary`,loading:j.value,size:`large`,onClick:B},{default:h(()=>[...o[6]||=[e(` 确认修改 `,-1)]]),_:1},8,[`loading`])]),default:h(()=>[t(`div`,Ve,[t(`div`,He,[_(s,{size:40},{default:h(()=>[_(v(ee))]),_:1})]),o[4]||=t(`p`,{class:`force-pwd-dialog__text`},` 检测到您使用的是系统默认密码，为保障账号安全，请立即修改密码。 `,-1),o[5]||=t(`p`,{class:`force-pwd-dialog__hint`},` 密码需至少 8 位，包含字母和数字。修改完成后将自动进入系统。 `,-1)]),_(v(k),{ref_key:`formRef`,ref:O,model:N,rules:z,"label-width":`100px`,class:`force-pwd-dialog__form`},{default:h(()=>[_(v(E),{label:`新密码`,prop:`new_password`,required:``},{default:h(()=>[_(v(P),{modelValue:N.new_password,"onUpdate:modelValue":o[0]||=e=>N.new_password=e,type:`password`,"show-password":``,placeholder:`至少8位，含字母和数字`},null,8,[`modelValue`])]),_:1}),N.new_password?(u(),n(d,{key:0},[t(`div`,Ue,[t(`div`,We,[_(v(M),{percentage:L.value,color:I.value,"stroke-width":6,"show-text":!1},null,8,[`percentage`,`color`])]),t(`span`,{class:`pwd-strength__label`,style:b({color:I.value})},g(F.value.level===`strong`?`强`:F.value.level===`medium`?`中`:`弱`),5)]),t(`ul`,Ge,[(u(!0),n(d,null,a(F.value.checks,(r,i)=>(u(),n(`li`,{key:i,class:x({"is-passed":r.passed})},[t(`span`,Ke,g(r.passed?`✓`:`✕`),1),e(` `+g(r.label),1)],2))),128))])],64)):c(``,!0),_(v(E),{label:`确认新密码`,prop:`confirm_password`,required:``},{default:h(()=>[_(v(P),{modelValue:N.confirm_password,"onUpdate:modelValue":o[1]||=e=>N.confirm_password=e,type:`password`,"show-password":``,placeholder:`请再次输入新密码`,class:x({"is-error":N.confirm_password&&N.new_password!==N.confirm_password})},null,8,[`modelValue`,`class`])]),_:1}),_(v(E),{label:`手机号码`,prop:`phone`,required:``},{default:h(()=>[_(v(P),{modelValue:N.phone,"onUpdate:modelValue":o[2]||=e=>N.phone=e,placeholder:`请输入手机号码`,maxlength:`11`},null,8,[`modelValue`])]),_:1})]),_:1},8,[`model`])]),_:1},8,[`modelValue`,`close-on-click-modal`,`close-on-press-escape`,`show-close`])}}}),[[`__scopeId`,`data-v-6c8b3a59`]]),Je={class:`login-page`},Ye={class:`login-form`},Xe={class:`login-form__header`},Ze={class:`login-form__logo-wrap`},Qe=[`src`],$e={class:`login-form__brand-title`},et={class:`login-form__body`},tt={class:`login-field`},nt={class:`login-field__icon`},rt={class:`login-field`},it={class:`login-field__icon`},at={key:0,class:`login-form__error`,role:`alert`},ot={key:1,class:`login-form__attempt-warn`,role:`alert`},st={class:`login-form__options`},ct=`欢迎回来`,Q=`remembered_credentials`,$=`auto_login_flag`,lt=`input:not([type="hidden"]):not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])`,ut=B(i({__name:`LoginPage`,setup(r){let i=I(),a=F(),o=ne(),l=s(``),d=s(``),p=s(!1),b=s(!1),S=s(!1),{lockDialogVisible:C,lockReleased:T,attemptWarning:E,loginErrorMessage:k,formDisabled:M,countdownText:ee,handleLoginError:L,clearLoginError:z,retryAfterLockout:re}=Pe(),B=s(null),{webglSupported:V}=ye(B);function ie(e,t){try{localStorage.setItem(Q,JSON.stringify({u:e,p:encodeURIComponent(t),v:2}))}catch{}}function oe(){try{let e=localStorage.getItem(Q);if(!e)return null;let t=JSON.parse(e);return!t?.u||!t?.p?null:t.v===2?{u:t.u,p:decodeURIComponent(t.p)}:{u:t.u,p:atob(t.p)}}catch{}return null}function se(){localStorage.removeItem(Q),localStorage.removeItem($)}let H=s(!1);y(()=>{if(o.isLoggedIn&&sessionStorage.getItem(`force_pwd_change_needed`)===`true`){H.value=!0;return}if(o.isLoggedIn)return;let e=oe();e&&(l.value=e.u,d.value=e.p,p.value=!0),localStorage.getItem($)===`true`&&e&&(b.value=!0,W())});function U(){H.value=!1,a.push(i.query.redirect||`/dashboard/overview`)}async function W(){if(!M.value){if(!navigator.onLine){k.value=`网络连接失败，请检查网络后重试`;return}if(!l.value||!d.value){k.value=`请输入用户名和密码`;return}z(),S.value=!0;try{if(await o.login({username:l.value,password:d.value,remember:p.value}),Z(l.value),A.success(`登录成功`),b.value||(sessionStorage.setItem(`token`,o.token),sessionStorage.setItem(`userInfo`,JSON.stringify(o.userInfo)),localStorage.removeItem(`token`),localStorage.removeItem(`userInfo`)),p.value?(ie(l.value,d.value),b.value?localStorage.setItem($,`true`):localStorage.removeItem($)):se(),d.value===`12345678`){sessionStorage.setItem(te,`true`),H.value=!0;return}a.push(i.query.redirect||`/dashboard/overview`)}catch(e){L(e,l.value)}finally{S.value=!1}}}function ce(){re(),d.value=``}let G=s(null);function K(){return G.value?Array.from(G.value.querySelectorAll(lt)):[]}function le(e){if(e.key!==`Tab`)return;let t=K();if(t.length===0)return;let n=t[0],r=t[t.length-1],i=document.activeElement;e.shiftKey?(i===n||!G.value?.contains(i))&&(e.preventDefault(),r.focus()):(i===r||!G.value?.contains(i))&&(e.preventDefault(),n.focus())}return(r,i)=>{let a=m(`el-icon`);return u(),n(`div`,Je,[t(`div`,{ref_key:`sceneContainer`,ref:B,class:x([`login-bg`,{"login-bg--fallback":!v(V)}]),tabindex:`-1`,"aria-hidden":`true`},null,2),t(`div`,Ye,[t(`div`,{ref_key:`trapContainer`,ref:G,class:`login-form__card`,onKeydown:le},[t(`div`,Xe,[t(`div`,Ze,[t(`img`,{src:v(ae),alt:`logo`,class:`login-form__logo-img`},null,8,Qe)]),i[6]||=t(`p`,{class:`login-form__overline`},`HYDROPOWER INTELLIGENT SYSTEM`,-1),t(`h1`,$e,g(v(R)),1),i[7]||=t(`p`,{class:`login-form__brand-desc`},[e(` 基于深度强化学习与数字孪生的`),t(`br`),e(`水电站闸门智能调度平台 `)],-1),t(`p`,{class:`login-form__greeting`},g(ct))]),t(`div`,et,[t(`div`,tt,[t(`div`,nt,[_(a,null,{default:h(()=>[_(v(N))]),_:1})]),_(v(P),{modelValue:l.value,"onUpdate:modelValue":i[0]||=e=>l.value=e,placeholder:`请输入用户名`,size:`large`,class:`login-field__input`,readonly:v(M),onInput:v(z)},null,8,[`modelValue`,`readonly`,`onInput`])]),t(`div`,rt,[t(`div`,it,[_(a,null,{default:h(()=>[_(v(w))]),_:1})]),_(v(P),{modelValue:d.value,"onUpdate:modelValue":i[1]||=e=>d.value=e,type:`password`,placeholder:`请输入密码`,size:`large`,"show-password":``,class:`login-field__input`,readonly:v(M),onInput:v(z),onKeyup:j(W,[`enter`])},null,8,[`modelValue`,`readonly`,`onInput`])]),v(k)?(u(),n(`p`,at,g(v(k)),1)):c(``,!0),v(E)?(u(),n(`p`,ot,g(v(E)),1)):c(``,!0),t(`div`,st,[_(v(O),{modelValue:p.value,"onUpdate:modelValue":i[2]||=e=>p.value=e,class:`login-form__checkbox`},{default:h(()=>[...i[8]||=[e(` 记住密码 `,-1)]]),_:1},8,[`modelValue`]),_(v(O),{modelValue:b.value,"onUpdate:modelValue":i[3]||=e=>b.value=e,class:`login-form__checkbox`},{default:h(()=>[...i[9]||=[e(` 自动登录 `,-1)]]),_:1},8,[`modelValue`])]),_(v(D),{type:`primary`,size:`large`,class:`login-form__btn`,loading:S.value,disabled:v(M),onClick:W},{default:h(()=>[...i[10]||=[e(` 登 录 `,-1)]]),_:1},8,[`loading`,`disabled`])])],544)]),_(Be,{visible:v(C),"onUpdate:visible":i[4]||=e=>f(C)?C.value=e:null,"countdown-text":v(ee),released:v(T),onRetry:ce},null,8,[`visible`,`countdown-text`,`released`]),_(qe,{visible:H.value,"onUpdate:visible":i[5]||=e=>H.value=e,released:!1,onSuccess:U},null,8,[`visible`])])}}}),[[`__scopeId`,`data-v-a8ec8507`]]);export{ut as default};