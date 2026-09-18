var e=(e,t,n)=>(r,i)=>{let a=-1;return o(0);async function o(s){if(s<=a)throw Error(`next() called multiple times`);a=s;let c,l=!1,u;if(e[s]?(u=e[s][0][0],r.req.routeIndex=s):u=s===e.length&&i||void 0,u)try{c=await u(r,()=>o(s+1))}catch(e){if(e instanceof Error&&t)r.error=e,c=await t(e,r),l=!0;else throw e}else r.finalized===!1&&n&&(c=await n(r));return c&&(r.finalized===!1||l)&&(r.res=c),r}},t=Symbol(),n=(e,t)=>new Response(e,{headers:{"Content-Type":t.replace(/^[^;]+/,e=>e.toLowerCase())}}).formData(),r=e=>`headers`in e,i=async(e,t=Object.create(null))=>{let{all:n=!1,dot:i=!1}=t,o=(r(e)?e.headers:e.raw.headers).get(`Content-Type`)?.split(`;`)[0].trim().toLowerCase();return o===`multipart/form-data`||o===`application/x-www-form-urlencoded`?a(e,{all:n,dot:i}):{}};async function a(e,t){let i=r(e)?e.headers:e.raw.headers,a=n(await e.arrayBuffer(),i.get(`Content-Type`)||``);r(e)||(e.bodyCache.formData=a);let s=await a;return s?o(s,t):{}}function o(e,t){let n=Object.create(null);return e.forEach((e,r)=>{t.all||r.endsWith(`[]`)?s(n,r,e):n[r]=e}),t.dot&&Object.entries(n).forEach(([e,t])=>{e.includes(`.`)&&(c(n,e,t),delete n[e])}),n}var s=(e,t,n)=>{e[t]===void 0?t.endsWith(`[]`)?e[t]=[n]:e[t]=n:Array.isArray(e[t])?e[t].push(n):e[t]=[e[t],n]},c=(e,t,n)=>{if(/(?:^|\.)__proto__\./.test(t))return;let r=e,i=t.split(`.`);i.forEach((e,t)=>{t===i.length-1?r[e]=n:((!r[e]||typeof r[e]!=`object`||Array.isArray(r[e])||r[e]instanceof File)&&(r[e]=Object.create(null)),r=r[e])})},l=e=>{let t=e.split(`/`);return t[0]===``&&t.shift(),t},u=e=>{let{groups:t,path:n}=d(e);return f(l(n),t)},d=e=>{let t=[];return e=e.replace(/\{[^}]+\}/g,(e,n)=>{let r=`@${n}`;return t.push([r,e]),r}),{groups:t,path:e}},f=(e,t)=>{for(let n=t.length-1;n>=0;n--){let[r]=t[n];for(let i=e.length-1;i>=0;i--)if(e[i].includes(r)){e[i]=e[i].replace(r,t[n][1]);break}}return e},p={},m=(e,t)=>{if(e===`*`)return`*`;let n=e.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);if(n){let r=`${e}#${t}`;return p[r]||(n[2]?p[r]=t&&t[0]!==`:`&&t[0]!==`*`?[r,n[1],RegExp(`^${n[2]}(?=/${t})`)]:[e,n[1],RegExp(`^${n[2]}$`)]:p[r]=[e,n[1],!0]),p[r]}return null},h=(e,t)=>{try{return t(e)}catch{return e.replace(/(?:%[0-9A-Fa-f]{2})+/g,e=>{try{return t(e)}catch{return e}})}},g=e=>h(e,decodeURI),_=e=>{let t=e.url,n=t.indexOf(`/`,t.indexOf(`:`)+4),r=n;for(;r<t.length;r++){let e=t.charCodeAt(r);if(e===37){let e=t.indexOf(`?`,r),i=t.indexOf(`#`,r),a=e===-1?i===-1?void 0:i:i===-1?e:Math.min(e,i),o=t.slice(n,a);return g(o.includes(`%25`)?o.replace(/%25/g,`%2525`):o)}else if(e===63||e===35)break}return t.slice(n,r)},v=e=>{let t=_(e);return t.length>1&&t.at(-1)===`/`?t.slice(0,-1):t},y=(e,t,...n)=>(n.length&&(t=y(t,...n)),`${e?.[0]===`/`?``:`/`}${e}${t===`/`?``:`${e?.at(-1)===`/`?``:`/`}${t?.[0]===`/`?t.slice(1):t}`}`),b=e=>{if(e.charCodeAt(e.length-1)!==63||!e.includes(`:`))return null;let t=e.split(`/`),n=[],r=``;return t.forEach(e=>{if(e!==``&&!/\:/.test(e))r+=`/`+e;else if(/\:/.test(e))if(/\?/.test(e)){n.length===0&&r===``?n.push(`/`):n.push(r);let t=e.replace(`?`,``);r+=`/`+t,n.push(r)}else r+=`/`+e}),n.filter((e,t,n)=>n.indexOf(e)===t)},x=e=>/[%+]/.test(e)?(e.indexOf(`+`)!==-1&&(e=e.replace(/\+/g,` `)),e.indexOf(`%`)===-1?e:h(e,C)):e,S=(e,t,n)=>{let r;if(!n&&t&&!/[%+]/.test(t)){let n=e.indexOf(`?`,8);if(n===-1)return;for(e.startsWith(t,n+1)||(n=e.indexOf(`&${t}`,n+1));n!==-1;){let r=e.charCodeAt(n+t.length+1);if(r===61){let r=n+t.length+2,i=e.indexOf(`&`,r);return x(e.slice(r,i===-1?void 0:i))}else if(r==38||isNaN(r))return``;n=e.indexOf(`&${t}`,n+1)}if(r=/[%+]/.test(e),!r)return}let i={};r??=/[%+]/.test(e);let a=e.indexOf(`?`,8);for(;a!==-1;){let t=e.indexOf(`&`,a+1),o=e.indexOf(`=`,a);o>t&&t!==-1&&(o=-1);let s=e.slice(a+1,o===-1?t===-1?void 0:t:o);if(r&&(s=x(s)),a=t,s===``)continue;let c;o===-1?c=``:(c=e.slice(o+1,t===-1?void 0:t),r&&(c=x(c))),n?(i[s]&&Array.isArray(i[s])||(i[s]=[]),i[s].push(c)):i[s]??=c}return t?i[t]:i},ee=S,te=(e,t)=>S(e,t,!0),C=decodeURIComponent,w=e=>h(e,C),ne=class{raw;#e;#t;routeIndex=0;path;bodyCache={};constructor(e,t=`/`,n=[[]]){this.raw=e,this.path=t,this.#t=n,this.#e={}}param(e){return e?this.#n(e):this.#r()}#n(e){let t=this.#t[0][this.routeIndex][1][e],n=this.#i(t);return n&&/\%/.test(n)?w(n):n}#r(){let e={},t=Object.keys(this.#t[0][this.routeIndex][1]);for(let n of t){let t=this.#i(this.#t[0][this.routeIndex][1][n]);t!==void 0&&(e[n]=/\%/.test(t)?w(t):t)}return e}#i(e){return this.#t[1]?this.#t[1][e]:e}query(e){return ee(this.url,e)}queries(e){return te(this.url,e)}header(e){if(e)return this.raw.headers.get(e)??void 0;let t={};return this.raw.headers.forEach((e,n)=>{t[n]=e}),t}async parseBody(e){return i(this,e)}#a=e=>{let{bodyCache:t,raw:n}=this,r=t[e];if(r)return r;let i=Object.keys(t)[0];return i?t[i].then(t=>(i===`json`&&(t=JSON.stringify(t)),new Response(t)[e]())):t[e]=n[e]()};json(){return this.#a(`text`).then(e=>JSON.parse(e))}text(){return this.#a(`text`)}arrayBuffer(){return this.#a(`arrayBuffer`)}bytes(){return this.#a(`arrayBuffer`).then(e=>new Uint8Array(e))}blob(){return this.#a(`blob`)}formData(){return this.#a(`formData`)}addValidatedData(e,t){this.#e[e]=t}valid(e){return this.#e[e]}get url(){return this.raw.url}get method(){return this.raw.method}get[t](){return this.#t}get matchedRoutes(){return this.#t[0].map(([[,e]])=>e)}get routePath(){return this.#t[0].map(([[,e]])=>e)[this.routeIndex].path}},re={Stringify:1,BeforeStream:2,Stream:3},ie=(e,t)=>{let n=new String(e);return n.isEscaped=!0,n.callbacks=t,n},T=async(e,t,n,r,i)=>{typeof e==`object`&&!(e instanceof String)&&(e instanceof Promise||(e=e.toString()),e instanceof Promise&&(e=await e));let a=e.callbacks;if(!a?.length)return Promise.resolve(e);i?i[0]+=e:i=[e];let o=Promise.all(a.map(e=>e({phase:t,buffer:i,context:r}))).then(e=>Promise.all(e.filter(Boolean).map(e=>T(e,t,!1,r,i))).then(()=>i[0]));return n?ie(await o,a):o},ae=`text/plain; charset=UTF-8`,E=(e,t)=>({"Content-Type":e,...t}),D=(e,t)=>new Response(e,t),oe=class{#e;#t;env={};#n;finalized=!1;error;#r;#i;#a;#o;#s;#c;#l;#u;#d;constructor(e,t){this.#e=e,t&&(this.#i=t.executionCtx,this.env=t.env,this.#c=t.notFoundHandler,this.#d=t.path,this.#u=t.matchResult)}get req(){return this.#t??=new ne(this.#e,this.#d,this.#u),this.#t}get event(){if(this.#i&&`respondWith`in this.#i)return this.#i;throw Error(`This context has no FetchEvent`)}get executionCtx(){if(this.#i)return this.#i;throw Error(`This context has no ExecutionContext`)}get res(){return this.#a||=D(null,{headers:this.#l??=new Headers})}set res(e){if(this.#a&&e){e=D(e.body,e);for(let[t,n]of this.#a.headers.entries())if(t!==`content-type`)if(t===`set-cookie`){let t=this.#a.headers.getSetCookie();e.headers.delete(`set-cookie`);for(let n of t)e.headers.append(`set-cookie`,n)}else e.headers.set(t,n)}this.#a=e,this.finalized=!0}render=(...e)=>(this.#s??=e=>this.html(e),this.#s(...e));setLayout=e=>this.#o=e;getLayout=()=>this.#o;setRenderer=e=>{this.#s=e};header=(e,t,n)=>{this.finalized&&(this.#a=D(this.#a.body,this.#a));let r=this.#a?this.#a.headers:this.#l??=new Headers;t===void 0?r.delete(e):n?.append?r.append(e,t):r.set(e,t)};status=e=>{this.#r=e};set=(e,t)=>{this.#n??=new Map,this.#n.set(e,t)};get=e=>this.#n?this.#n.get(e):void 0;get var(){return this.#n?Object.fromEntries(this.#n):{}}#f(e,t,n){let r=this.#a?new Headers(this.#a.headers):this.#l??new Headers;if(typeof t==`object`&&`headers`in t){let e=t.headers instanceof Headers?t.headers:new Headers(t.headers);for(let[t,n]of e)t.toLowerCase()===`set-cookie`?r.append(t,n):r.set(t,n)}if(n)for(let[e,t]of Object.entries(n))if(typeof t==`string`)r.set(e,t);else{r.delete(e);for(let n of t)r.append(e,n)}return D(e,{status:typeof t==`number`?t:t?.status??this.#r,headers:r})}newResponse=(...e)=>this.#f(...e);body=(e,t,n)=>this.#f(e,t,n);text=(e,t,n)=>!this.#l&&!this.#r&&!t&&!n&&!this.finalized?new Response(e):this.#f(e,t,E(ae,n));json=(e,t,n)=>this.#f(JSON.stringify(e),t,E(`application/json`,n));html=(e,t,n)=>{let r=e=>this.#f(e,t,E(`text/html; charset=UTF-8`,n));return typeof e==`object`?T(e,re.Stringify,!1,{}).then(r):r(e)};redirect=(e,t)=>{let n=String(e);return this.header(`Location`,/[^\x00-\xFF]/.test(n)?encodeURI(n):n),this.newResponse(null,t??302)};notFound=()=>(this.#c??=()=>D(),this.#c(this))},O=[`get`,`post`,`put`,`delete`,`options`,`patch`],k=`Can not add a route since the matcher is already built.`,A=class extends Error{},j=`__COMPOSED_HANDLER`,se=e=>e.text(`404 Not Found`,404),M=(e,t)=>{if(`getResponse`in e){let n=e.getResponse();return t.newResponse(n.body,n)}return console.error(e),t.text(`Internal Server Error`,500)},ce=class t{get;post;put;delete;options;patch;all;on;use;router;getPath;_basePath=`/`;#e=`/`;routes=[];constructor(e={}){[...O,`all`].forEach(e=>{this[e]=(t,...n)=>(typeof t==`string`?this.#e=t:this.#r(e,this.#e,t),n.forEach(t=>{this.#r(e,this.#e,t)}),this)}),this.on=(e,t,...n)=>{for(let r of[t].flat()){this.#e=r;for(let t of[e].flat())n.map(e=>{this.#r(t.toUpperCase(),this.#e,e)})}return this},this.use=(e,...t)=>(typeof e==`string`?this.#e=e:(this.#e=`*`,t.unshift(e)),t.forEach(e=>{this.#r(`ALL`,this.#e,e)}),this);let{strict:t,...n}=e;Object.assign(this,n),this.getPath=t??!0?e.getPath??_:v}#t(){let e=new t({router:this.router,getPath:this.getPath});return e.errorHandler=this.errorHandler,e.#n=this.#n,e.routes=this.routes,e}#n=se;errorHandler=M;route(t,n){let r=this.basePath(t);return n.routes.map(t=>{let i;n.errorHandler===M?i=t.handler:(i=async(r,i)=>(await e([],n.errorHandler)(r,()=>t.handler(r,i))).res,i[j]=t.handler),r.#r(t.method,t.path,i,t.basePath)}),this}basePath(e){let t=this.#t();return t._basePath=y(this._basePath,e),t}onError=e=>(this.errorHandler=e,this);notFound=e=>(this.#n=e,this);mount(e,t,n){let r,i;n&&(typeof n==`function`?i=n:(i=n.optionHandler,r=n.replaceRequest===!1?e=>e:n.replaceRequest));let a=i?e=>{let t=i(e);return Array.isArray(t)?t:[t]}:e=>{let t;try{t=e.executionCtx}catch{}return[e.env,t]};return r||=(()=>{let t=y(this._basePath,e),n=t===`/`?0:t.length;return e=>{let t=new URL(e.url);return t.pathname=this.getPath(e).slice(n)||`/`,new Request(t,e)}})(),this.#r(`ALL`,y(e,`*`),async(e,n)=>{let i=await t(r(e.req.raw),...a(e));if(i)return i;await n()}),this}#r(e,t,n,r){e=e.toUpperCase(),t=y(this._basePath,t);let i={basePath:r===void 0?this._basePath:y(this._basePath,r),path:t,method:e,handler:n};this.router.add(e,t,[n,i]),this.routes.push(i)}#i(e,t){if(e instanceof Error)return this.errorHandler(e,t);throw e}#a(t,n,r,i){if(i===`HEAD`)return(async()=>new Response(null,await this.#a(t,n,r,`GET`)))();let a=this.getPath(t,{env:r}),o=this.router.match(i,a),s=new oe(t,{path:a,matchResult:o,env:r,executionCtx:n,notFoundHandler:this.#n});if(o[0].length===1){let e;try{e=o[0][0][0][0](s,async()=>{s.res=await this.#n(s)})}catch(e){return this.#i(e,s)}return e instanceof Promise?e.then(e=>e||(s.finalized?s.res:this.#n(s))).catch(e=>this.#i(e,s)):e??this.#n(s)}let c=e(o[0],this.errorHandler,this.#n);return(async()=>{try{let e=await c(s);if(!e.finalized)throw Error("Context is not finalized. Did you forget to return a Response object or `await next()`?");return e.res}catch(e){return this.#i(e,s)}})()}fetch=(e,...t)=>this.#a(e,t[1],t[0],e.method);request=(e,t,n,r)=>e instanceof Request?this.fetch(t?new Request(e,t):e,n,r):(e=e.toString(),this.fetch(new Request(/^https?:\/\//.test(e)?e:`http://localhost${y(`/`,e)}`,t),n,r));fire=()=>{addEventListener(`fetch`,e=>{e.respondWith(this.#a(e.request,e,void 0,e.request.method))})}},N=[];function P(e,t){let n=this.buildAllMatchers(),r=((e,t)=>{let r=n[e]||n.ALL,i=r[2][t];if(i)return i;let a=t.match(r[0]);if(!a)return[[],N];let o=a.indexOf(``,1);return[r[1][o],a]});return this.match=r,r(e,t)}var F=`[^/]+`,I=`.*`,L=`(?:|/.*)`,R=Symbol(),le=new Set(`.\\+*[^]$()`);function ue(e,t){return e.length===1?t.length===1?e<t?-1:1:-1:t.length===1||e===I||e===L?1:t===I||t===L?-1:e===F?1:t===F?-1:e.length===t.length?e<t?-1:1:t.length-e.length}var de=class e{#e;#t;#n=Object.create(null);insert(t,n,r,i,a){if(t.length===0){if(this.#e!==void 0)throw R;if(a)return;this.#e=n;return}let[o,...s]=t,c=o===`*`?s.length===0?[``,``,I]:[``,``,F]:o===`/*`?[``,``,L]:o.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/),l;if(c){let t=c[1],n=c[2]||F;if(t&&c[2]&&(n===`.*`||(n=n.replace(/^\((?!\?:)(?=[^)]+\)$)/,`(?:`),/\((?!\?:)/.test(n))))throw R;if(l=this.#n[n],!l){if(Object.keys(this.#n).some(e=>e!==I&&e!==L))throw R;if(a)return;l=this.#n[n]=new e,t!==``&&(l.#t=i.varIndex++)}!a&&t!==``&&r.push([t,l.#t])}else if(l=this.#n[o],!l){if(Object.keys(this.#n).some(e=>e.length>1&&e!==I&&e!==L))throw R;if(a)return;l=this.#n[o]=new e}l.insert(s,n,r,i,a)}buildRegExpStr(){let e=Object.keys(this.#n).sort(ue).map(e=>{let t=this.#n[e];return(typeof t.#t==`number`?`(${e})@${t.#t}`:le.has(e)?`\\${e}`:e)+t.buildRegExpStr()});return typeof this.#e==`number`&&e.unshift(`#${this.#e}`),e.length===0?``:e.length===1?e[0]:`(?:`+e.join(`|`)+`)`}},fe=class{#e={varIndex:0};#t=new de;insert(e,t,n){let r=[],i=[];for(let t=0;;){let n=!1;if(e=e.replace(/\{[^}]+\}/g,e=>{let r=`@\\${t}`;return i[t]=[r,e],t++,n=!0,r}),!n)break}let a=e.match(/(?::[^\/]+)|(?:\/\*$)|./g)||[];for(let e=i.length-1;e>=0;e--){let[t]=i[e];for(let n=a.length-1;n>=0;n--)if(a[n].indexOf(t)!==-1){a[n]=a[n].replace(t,i[e][1]);break}}return this.#t.insert(a,t,r,this.#e,n),r}buildRegExp(){let e=this.#t.buildRegExpStr();if(e===``)return[/^$/,[],[]];let t=0,n=[],r=[];return e=e.replace(/#(\d+)|@(\d+)|\.\*\$/g,(e,i,a)=>i===void 0?(a===void 0||(r[Number(a)]=++t),``):(n[++t]=Number(i),`$()`)),[RegExp(`^${e}`),n,r]}},z=[/^$/,[],Object.create(null)],B=Object.create(null);function V(e){return B[e]??=RegExp(e===`*`?``:`^${e.replace(/\/\*$|([.\\+*[^\]$()])/g,(e,t)=>t?`\\${t}`:`(?:|/.*)`)}$`)}function pe(){B=Object.create(null)}function me(e){let t=new fe,n=[];if(e.length===0)return z;let r=e.map(e=>[!/\*|\/:/.test(e[0]),...e]).sort(([e,t],[n,r])=>e?1:n?-1:t.length-r.length),i=Object.create(null);for(let e=0,a=-1,o=r.length;e<o;e++){let[o,s,c]=r[e];o?i[s]=[c.map(([e])=>[e,Object.create(null)]),N]:a++;let l;try{l=t.insert(s,a,o)}catch(e){throw e===R?new A(s):e}o||(n[a]=c.map(([e,t])=>{let n=Object.create(null);for(--t;t>=0;t--){let[e,r]=l[t];n[e]=r}return[e,n]}))}let[a,o,s]=t.buildRegExp();for(let e=0,t=n.length;e<t;e++)for(let t=0,r=n[e].length;t<r;t++){let r=n[e][t]?.[1];if(!r)continue;let i=Object.keys(r);for(let e=0,t=i.length;e<t;e++)r[i[e]]=s[r[i[e]]]}let c=[];for(let e in o)c[e]=n[o[e]];return[a,c,i]}function H(e,t){if(e){for(let n of Object.keys(e).sort((e,t)=>t.length-e.length))if(V(n).test(t))return[...e[n]]}}var he=class{name=`RegExpRouter`;#e;#t;constructor(){this.#e={ALL:Object.create(null)},this.#t={ALL:Object.create(null)}}add(e,t,n){let r=this.#e,i=this.#t;if(!r||!i)throw Error(k);r[e]||[r,i].forEach(t=>{t[e]=Object.create(null),Object.keys(t.ALL).forEach(n=>{t[e][n]=[...t.ALL[n]]})}),t===`/*`&&(t=`*`);let a=(t.match(/\/:/g)||[]).length;if(/\*$/.test(t)){let o=V(t);e===`ALL`?Object.keys(r).forEach(e=>{r[e][t]||=H(r[e],t)||H(r.ALL,t)||[]}):r[e][t]||=H(r[e],t)||H(r.ALL,t)||[],Object.keys(r).forEach(t=>{(e===`ALL`||e===t)&&Object.keys(r[t]).forEach(e=>{o.test(e)&&r[t][e].push([n,a])})}),Object.keys(i).forEach(t=>{(e===`ALL`||e===t)&&Object.keys(i[t]).forEach(e=>o.test(e)&&i[t][e].push([n,a]))});return}let o=b(t)||[t];for(let t=0,s=o.length;t<s;t++){let c=o[t];Object.keys(i).forEach(o=>{(e===`ALL`||e===o)&&(i[o][c]||=[...H(r[o],c)||H(r.ALL,c)||[]],i[o][c].push([n,a-s+t+1]))})}}match=P;buildAllMatchers(){let e=Object.create(null);return Object.keys(this.#t).concat(Object.keys(this.#e)).forEach(t=>{e[t]||=this.#n(t)}),this.#e=this.#t=void 0,pe(),e}#n(e){let t=[],n=e===`ALL`;return[this.#e,this.#t].forEach(r=>{let i=r[e]?Object.keys(r[e]).map(t=>[t,r[e][t]]):[];i.length===0?e!==`ALL`&&t.push(...Object.keys(r.ALL).map(e=>[e,r.ALL[e]])):(n||=!0,t.push(...i))}),n?me(t):null}},ge=class{name=`SmartRouter`;#e=[];#t=[];constructor(e){this.#e=e.routers}add(e,t,n){if(!this.#t)throw Error(k);this.#t.push([e,t,n])}match(e,t){if(!this.#t)throw Error(`Fatal error`);let n=this.#e,r=this.#t,i=n.length,a=0,o;for(;a<i;a++){let i=n[a];try{for(let e=0,t=r.length;e<t;e++)i.add(...r[e]);o=i.match(e,t)}catch(e){if(e instanceof A)continue;throw e}this.match=i.match.bind(i),this.#e=[i],this.#t=void 0;break}if(a===i)throw Error(`Fatal error`);return this.name=`SmartRouter + ${this.activeRouter.name}`,o}get activeRouter(){if(this.#t||this.#e.length!==1)throw Error(`No active router has been determined yet.`);return this.#e[0]}},U=Object.create(null),_e=e=>{for(let t in e)return!0;return!1},ve=class e{#e;#t;#n;#r=0;#i=U;constructor(e,t,n){if(this.#t=n||Object.create(null),this.#e=[],e&&t){let n=Object.create(null);n[e]={handler:t,possibleKeys:[],score:0},this.#e=[n]}this.#n=[]}insert(t,n,r){this.#r=++this.#r;let i=this,a=u(n),o=[];for(let t=0,n=a.length;t<n;t++){let n=a[t],r=a[t+1],s=m(n,r),c=Array.isArray(s)?s[0]:n;if(c in i.#t){i=i.#t[c],s&&o.push(s[1]);continue}i.#t[c]=new e,s&&(i.#n.push(s),o.push(s[1])),i=i.#t[c]}return i.#e.push({[t]:{handler:r,possibleKeys:o.filter((e,t,n)=>n.indexOf(e)===t),score:this.#r}}),i}#a(e,t,n,r,i){for(let a=0,o=t.#e.length;a<o;a++){let o=t.#e[a],s=o[n]||o.ALL,c={};if(s!==void 0&&(s.params=Object.create(null),e.push(s),r!==U||i&&i!==U))for(let e=0,t=s.possibleKeys.length;e<t;e++){let t=s.possibleKeys[e],n=c[s.score];s.params[t]=i?.[t]&&!n?i[t]:r[t]??i?.[t],c[s.score]=!0}}}search(e,t){let n=[];this.#i=U;let r=[this],i=l(t),a=[],o=i.length,s=null;for(let c=0;c<o;c++){let l=i[c],u=c===o-1,d=[];for(let f=0,p=r.length;f<p;f++){let p=r[f],m=p.#t[l];m&&(m.#i=p.#i,u?(m.#t[`*`]&&this.#a(n,m.#t[`*`],e,p.#i),this.#a(n,m,e,p.#i)):d.push(m));for(let r=0,f=p.#n.length;r<f;r++){let f=p.#n[r],m=p.#i===U?{}:{...p.#i};if(f===`*`){let t=p.#t[`*`];t&&(this.#a(n,t,e,p.#i),t.#i=m,d.push(t));continue}let[h,g,_]=f;if(!l&&!(_ instanceof RegExp))continue;let v=p.#t[h];if(_ instanceof RegExp){if(s===null){s=Array(o);let e=+(t[0]===`/`);for(let t=0;t<o;t++)s[t]=e,e+=i[t].length+1}let r=t.substring(s[c]),l=_.exec(r);if(l){if(m[g]=l[0],this.#a(n,v,e,p.#i,m),l[0].length===r.length&&v.#t[`*`]&&this.#a(n,v.#t[`*`],e,p.#i,m),_e(v.#t)){v.#i=m;let e=l[0].match(/\//)?.length??0;(a[e]||=[]).push(v)}continue}}(_===!0||_.test(l))&&(m[g]=l,u?(this.#a(n,v,e,m,p.#i),v.#t[`*`]&&this.#a(n,v.#t[`*`],e,m,p.#i)):(v.#i=m,d.push(v)))}}let f=a.shift();r=f?d.concat(f):d}return n.length>1&&n.sort((e,t)=>e.score-t.score),[n.map(({handler:e,params:t})=>[e,t])]}},ye=class{name=`TrieRouter`;#e;constructor(){this.#e=new ve}add(e,t,n){let r=b(t);if(r){for(let t=0,i=r.length;t<i;t++)this.#e.insert(e,r[t],n);return}this.#e.insert(e,t,n)}match(e,t){return this.#e.search(e,t)}},W=class extends ce{constructor(e={}){super(e),this.router=e.router??new ge({routers:[new he,new ye]})}},be=`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>DB ERD — 인력정보 & 제안작업표</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    body { background:#0f172a; font-family:'Noto Sans KR',sans-serif; }

    /* ── 탭 ── */
    .tab-btn { transition:all .2s; border-bottom:3px solid transparent; }
    .tab-btn.active { border-bottom-color:#3b82f6; color:#fff; }
    .tab-btn:not(.active) { color:#64748b; }
    .tab-btn:not(.active):hover { color:#94a3b8; }
    .panel { display:none; }
    .panel.active { display:block; }

    /* ── ERD 카드 ── */
    .erd-table {
      background:#1e293b;
      border:1px solid #334155;
      border-radius:10px;
      overflow:hidden;
      width:220px;
      flex-shrink:0;
    }
    .erd-table .hd {
      padding:8px 12px;
      font-weight:700;
      font-size:13px;
      display:flex;
      align-items:center;
      gap:6px;
    }
    .erd-table .hd .badge {
      font-size:10px;
      font-weight:400;
      opacity:.75;
      margin-left:auto;
    }
    .erd-col {
      display:flex;
      align-items:center;
      padding:4px 12px;
      font-size:11px;
      gap:6px;
      border-top:1px solid #1e293b;
    }
    .erd-col:nth-child(odd)  { background:#0f172a33; }
    .erd-col .col-name { flex:1; color:#e2e8f0; }
    .erd-col .col-type { color:#34d399; font-size:10px; width:70px; text-align:right; }
    .pk  .col-name { color:#fbbf24; font-weight:700; }
    .fk  .col-name { color:#fb923c; }
    .fkn .col-name { color:#fdba74; }
    .gen .col-name { color:#c084fc; }

    /* ── 관계 화살표 범례 ── */
    .rel-line { display:inline-block; width:40px; height:2px; vertical-align:middle; }

    /* ── 관계도 SVG 컨테이너 ── */
    #svg-container { overflow-x:auto; }
    .rel-svg { min-width:900px; }

    /* ── 컬럼 상세 테이블 ── */
    .detail-table th { background:#1e293b; color:#94a3b8; font-weight:600; font-size:11px; padding:6px 10px; text-align:left; }
    .detail-table td { font-size:11px; padding:5px 10px; color:#cbd5e1; border-top:1px solid #1e293b33; }
    .detail-table tr:nth-child(even) td { background:#0f172a22; }
  </style>
</head>
<body class="min-h-screen p-6 text-slate-200">
<div class="max-w-screen-xl mx-auto">

  <!-- 헤더 -->
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-white">📊 DB ERD</h1>
    <p class="text-slate-400 text-sm mt-1">인력정보 DB (4 tables) &nbsp;·&nbsp; 제안작업표 DB (6 tables) &nbsp;·&nbsp; 키워드 DB (2 tables) &nbsp;·&nbsp; Cloudflare D1 (SQLite)</p>
  </div>

  <!-- 탭 -->
  <div class="flex gap-6 border-b border-slate-700 mb-6">
    <button class="tab-btn active pb-2 text-sm font-semibold" onclick="switchTab('overview',this)">🗺️ 전체 관계도</button>
    <button class="tab-btn pb-2 text-sm font-semibold" onclick="switchTab('personnel',this)">👤 인력정보 DB</button>
    <button class="tab-btn pb-2 text-sm font-semibold" onclick="switchTab('proposal',this)">📋 제안작업표 DB</button>
    <button class="tab-btn pb-2 text-sm font-semibold" onclick="switchTab('columns',this)">📑 컬럼 상세</button>
  </div>

  <!-- ══════════════════════════════════════════════════
       탭 1 : 전체 관계도 (SVG 직접 그리기)
  ══════════════════════════════════════════════════ -->
  <div id="tab-overview" class="panel active">
    <div id="svg-container" class="bg-slate-900 rounded-xl p-4">
      <svg viewBox="0 0 1080 830" class="rel-svg w-full" xmlns="http://www.w3.org/2000/svg" font-family="Noto Sans KR,sans-serif">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#64748b"/>
          </marker>
          <marker id="arrow-blue" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#3b82f6"/>
          </marker>
          <marker id="arrow-em" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#10b981"/>
          </marker>
        </defs>

        <!-- ── 그룹 배경 ── -->
        <rect x="20"  y="10"  width="460" height="650" rx="14" fill="#1e3a5f22" stroke="#3b82f630" stroke-width="1.5"/>
        <text x="40"  y="34"  fill="#3b82f6" font-size="13" font-weight="700">👤 인력정보 DB</text>

        <rect x="550" y="10"  width="510" height="780" rx="14" fill="#064e3b22" stroke="#10b98130" stroke-width="1.5"/>
        <text x="570" y="34"  fill="#10b981" font-size="13" font-weight="700">📋 제안작업표 DB</text>

        <!-- ────────────────────────────────
             인력정보 테이블들
        ──────────────────────────────── -->

        <!-- personnel (중앙 허브) -->
        <g id="g-personnel">
          <rect x="40" y="50" width="200" height="230" rx="8" fill="#1e293b" stroke="#3b82f6" stroke-width="2"/>
          <rect x="40" y="50" width="200" height="30"  rx="8" fill="#1d4ed8"/>
          <rect x="40" y="70" width="200" height="10"  fill="#1d4ed8"/>
          <text x="52" y="70" fill="#fff" font-size="12" font-weight="700">personnel</text>
          <text x="195" y="70" fill="#93c5fd" font-size="10" text-anchor="end">기본정보</text>

          <text x="52" y="100" fill="#fbbf24" font-size="11" font-weight="700">🔑 id</text>
          <text x="190" y="100" fill="#34d399" font-size="10" text-anchor="end">INT PK</text>
          <text x="52" y="118" fill="#e2e8f0" font-size="11">name</text>
          <text x="190" y="118" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="52" y="136" fill="#e2e8f0" font-size="11">position</text>
          <text x="190" y="136" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="52" y="154" fill="#e2e8f0" font-size="11">auditor_cert_no</text>
          <text x="190" y="154" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="52" y="172" fill="#e2e8f0" font-size="11">auditor_grade</text>
          <text x="190" y="172" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="52" y="190" fill="#e2e8f0" font-size="11">tech_grade</text>
          <text x="190" y="190" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="52" y="208" fill="#e2e8f0" font-size="11">email</text>
          <text x="190" y="208" fill="#34d399" font-size="10" text-anchor="end">TEXT UK</text>
          <text x="52" y="226" fill="#e2e8f0" font-size="11">phone / birthdate</text>
          <text x="190" y="226" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="52" y="244" fill="#94a3b8" font-size="10">+ 17 more columns …</text>
          <text x="190" y="264" fill="#475569" font-size="10" text-anchor="end">created/updated_at</text>
        </g>

        <!-- personnel_certifications -->
        <g id="g-certs">
          <rect x="270" y="50" width="195" height="160" rx="8" fill="#1e293b" stroke="#3b82f6" stroke-width="1.5"/>
          <rect x="270" y="50" width="195" height="30"  rx="8" fill="#1e40af"/>
          <rect x="270" y="70" width="195" height="10"  fill="#1e40af"/>
          <text x="282" y="70" fill="#fff" font-size="11" font-weight="700">personnel_certifications</text>
          <text x="458" y="70" fill="#93c5fd" font-size="10" text-anchor="end">자격증</text>
          <text x="282" y="100" fill="#fbbf24" font-size="11" font-weight="700">🔑 id</text>
          <text x="458" y="100" fill="#34d399" font-size="10" text-anchor="end">INT PK</text>
          <text x="282" y="118" fill="#fb923c" font-size="11">🔗 personnel_id</text>
          <text x="458" y="118" fill="#fb923c" font-size="10" text-anchor="end">INT FK</text>
          <text x="282" y="136" fill="#e2e8f0" font-size="11">cert_name</text>
          <text x="458" y="136" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="282" y="154" fill="#e2e8f0" font-size="11">cert_year / issuer</text>
          <text x="458" y="154" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="282" y="172" fill="#e2e8f0" font-size="11">is_national</text>
          <text x="458" y="172" fill="#34d399" font-size="10" text-anchor="end">INT</text>
          <text x="282" y="190" fill="#e2e8f0" font-size="11">related_field</text>
          <text x="458" y="190" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
        </g>

        <!-- personnel_audit_history -->
        <g id="g-audit-hist">
          <rect x="40" y="300" width="200" height="195" rx="8" fill="#1e293b" stroke="#3b82f6" stroke-width="1.5"/>
          <rect x="40" y="300" width="200" height="30"  rx="8" fill="#1e40af"/>
          <rect x="40" y="320" width="200" height="10"  fill="#1e40af"/>
          <text x="52"  y="320" fill="#fff" font-size="11" font-weight="700">personnel_audit_history</text>
          <text x="232" y="320" fill="#93c5fd" font-size="10" text-anchor="end">감리실적</text>
          <text x="52"  y="350" fill="#fbbf24" font-size="11" font-weight="700">🔑 id</text>
          <text x="232" y="350" fill="#34d399" font-size="10" text-anchor="end">INT PK</text>
          <text x="52"  y="368" fill="#fb923c" font-size="11">🔗 personnel_id</text>
          <text x="232" y="368" fill="#fb923c" font-size="10" text-anchor="end">INT FK</text>
          <text x="52"  y="386" fill="#e2e8f0" font-size="11">audit_yearmonth</text>
          <text x="232" y="386" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="52"  y="404" fill="#e2e8f0" font-size="11">project_name</text>
          <text x="232" y="404" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="52"  y="422" fill="#e2e8f0" font-size="11">client_org / sector</text>
          <text x="232" y="422" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="52"  y="440" fill="#e2e8f0" font-size="11">domain / role</text>
          <text x="232" y="440" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="52"  y="458" fill="#e2e8f0" font-size="11">phase</text>
          <text x="232" y="458" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="52"  y="476" fill="#94a3b8" font-size="10">104건 실적 저장됨</text>
        </g>

        <!-- personnel_it_career -->
        <g id="g-it-career">
          <rect x="270" y="230" width="195" height="185" rx="8" fill="#1e293b" stroke="#3b82f6" stroke-width="1.5"/>
          <rect x="270" y="230" width="195" height="30"  rx="8" fill="#1e40af"/>
          <rect x="270" y="250" width="195" height="10"  fill="#1e40af"/>
          <text x="282" y="250" fill="#fff" font-size="11" font-weight="700">personnel_it_career</text>
          <text x="458" y="250" fill="#93c5fd" font-size="10" text-anchor="end">IT경력</text>
          <text x="282" y="280" fill="#fbbf24" font-size="11" font-weight="700">🔑 id</text>
          <text x="458" y="280" fill="#34d399" font-size="10" text-anchor="end">INT PK</text>
          <text x="282" y="298" fill="#fb923c" font-size="11">🔗 personnel_id</text>
          <text x="458" y="298" fill="#fb923c" font-size="10" text-anchor="end">INT FK</text>
          <text x="282" y="316" fill="#e2e8f0" font-size="11">period_start/end</text>
          <text x="458" y="316" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="282" y="334" fill="#e2e8f0" font-size="11">project_name</text>
          <text x="458" y="334" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="282" y="352" fill="#e2e8f0" font-size="11">client_org</text>
          <text x="458" y="352" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="282" y="370" fill="#e2e8f0" font-size="11">domain / role</text>
          <text x="458" y="370" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="282" y="388" fill="#e2e8f0" font-size="11">company / remarks</text>
          <text x="458" y="388" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
        </g>

        <!-- ────────────────────────────────
             제안작업표 테이블들
        ──────────────────────────────── -->

        <!-- audit_projects -->
        <g id="g-ap">
          <rect x="570" y="50" width="220" height="260" rx="8" fill="#1e293b" stroke="#10b981" stroke-width="2"/>
          <rect x="570" y="50" width="220" height="30"  rx="8" fill="#065f46"/>
          <rect x="570" y="70" width="220" height="10"  fill="#065f46"/>
          <text x="582" y="70" fill="#fff" font-size="12" font-weight="700">audit_projects</text>
          <text x="783" y="70" fill="#6ee7b7" font-size="10" text-anchor="end">감리사업</text>
          <text x="582" y="100" fill="#fbbf24" font-size="11" font-weight="700">🔑 id</text>
          <text x="782" y="100" fill="#34d399" font-size="10" text-anchor="end">INT PK</text>
          <text x="582" y="118" fill="#e2e8f0" font-size="11">project_name</text>
          <text x="782" y="118" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="582" y="136" fill="#e2e8f0" font-size="11">bid_notice_no</text>
          <text x="782" y="136" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="582" y="154" fill="#e2e8f0" font-size="11">bid_amount / bid_rate</text>
          <text x="782" y="154" fill="#34d399" font-size="10" text-anchor="end">INT/REAL</text>
          <text x="582" y="172" fill="#e2e8f0" font-size="11">required_md</text>
          <text x="782" y="172" fill="#34d399" font-size="10" text-anchor="end">INT</text>
          <text x="582" y="190" fill="#e2e8f0" font-size="11">proposed_md</text>
          <text x="782" y="190" fill="#34d399" font-size="10" text-anchor="end">INT</text>
          <text x="582" y="208" fill="#e2e8f0" font-size="11">md_unit_price_incl</text>
          <text x="782" y="208" fill="#34d399" font-size="10" text-anchor="end">INT</text>
          <text x="582" y="226" fill="#e2e8f0" font-size="11">proposal_status</text>
          <text x="782" y="226" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="582" y="244" fill="#e2e8f0" font-size="11">writer / director</text>
          <text x="782" y="244" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="582" y="262" fill="#e2e8f0" font-size="11">eval_method</text>
          <text x="782" y="262" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="582" y="280" fill="#94a3b8" font-size="10">+ 23 more columns …</text>
        </g>

        <!-- audit_phases -->
        <g id="g-phases">
          <rect x="820" y="50" width="210" height="215" rx="8" fill="#1e293b" stroke="#10b981" stroke-width="1.5"/>
          <rect x="820" y="50" width="210" height="30"  rx="8" fill="#047857"/>
          <rect x="820" y="70" width="210" height="10"  fill="#047857"/>
          <text x="832" y="70" fill="#fff" font-size="12" font-weight="700">audit_phases</text>
          <text x="1023" y="70" fill="#6ee7b7" font-size="10" text-anchor="end">단계일정</text>
          <text x="832" y="100" fill="#fbbf24" font-size="11" font-weight="700">🔑 id</text>
          <text x="1022" y="100" fill="#34d399" font-size="10" text-anchor="end">INT PK</text>
          <text x="832" y="118" fill="#fb923c" font-size="11">🔗 project_id</text>
          <text x="1022" y="118" fill="#fb923c" font-size="10" text-anchor="end">INT FK</text>
          <text x="832" y="136" fill="#e2e8f0" font-size="11">phase_name</text>
          <text x="1022" y="136" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="832" y="154" fill="#e2e8f0" font-size="11">phase_days</text>
          <text x="1022" y="154" fill="#34d399" font-size="10" text-anchor="end">INT</text>
          <text x="832" y="172" fill="#e2e8f0" font-size="11">phase_start/end_date</text>
          <text x="1022" y="172" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="832" y="190" fill="#e2e8f0" font-size="11">pre_survey_md</text>
          <text x="1022" y="190" fill="#34d399" font-size="10" text-anchor="end">INT</text>
          <text x="832" y="208" fill="#e2e8f0" font-size="11">audit_md / proposed_md</text>
          <text x="1022" y="208" fill="#34d399" font-size="10" text-anchor="end">INT</text>
          <text x="832" y="226" fill="#94a3b8" font-size="10">7단계 저장됨</text>
        </g>

        <!-- audit_phase_assignments -->
        <g id="g-assign">
          <rect x="820" y="290" width="210" height="210" rx="8" fill="#1e293b" stroke="#10b981" stroke-width="1.5"/>
          <rect x="820" y="290" width="210" height="30"  rx="8" fill="#047857"/>
          <rect x="820" y="310" width="210" height="10"  fill="#047857"/>
          <text x="832" y="310" fill="#fff" font-size="11" font-weight="700">audit_phase_assignments</text>
          <text x="1023" y="310" fill="#6ee7b7" font-size="10" text-anchor="end">인력배정</text>
          <text x="832" y="340" fill="#fbbf24" font-size="11" font-weight="700">🔑 id</text>
          <text x="1022" y="340" fill="#34d399" font-size="10" text-anchor="end">INT PK</text>
          <text x="832" y="358" fill="#fb923c" font-size="11">🔗 phase_id</text>
          <text x="1022" y="358" fill="#fb923c" font-size="10" text-anchor="end">INT FK</text>
          <text x="832" y="376" fill="#fb923c" font-size="11">🔗 project_id</text>
          <text x="1022" y="376" fill="#fb923c" font-size="10" text-anchor="end">INT FK</text>
          <text x="832" y="394" fill="#fdba74" font-size="11">🔗? personnel_id</text>
          <text x="1022" y="394" fill="#fdba74" font-size="10" text-anchor="end">INT FK?</text>
          <text x="832" y="412" fill="#e2e8f0" font-size="11">person_name</text>
          <text x="1022" y="412" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="832" y="430" fill="#e2e8f0" font-size="11">member_type / domain</text>
          <text x="1022" y="430" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="832" y="448" fill="#e2e8f0" font-size="11">pre_survey/audit_md</text>
          <text x="1022" y="448" fill="#34d399" font-size="10" text-anchor="end">INT</text>
          <text x="832" y="466" fill="#c084fc" font-size="11">total_md</text>
          <text x="1022" y="466" fill="#c084fc" font-size="10" text-anchor="end">STORED</text>
        </g>

        <!-- proposal_members -->
        <g id="g-pmem">
          <rect x="570" y="340" width="225" height="215" rx="8" fill="#1e293b" stroke="#10b981" stroke-width="1.5"/>
          <rect x="570" y="340" width="225" height="30"  rx="8" fill="#047857"/>
          <rect x="570" y="360" width="225" height="10"  fill="#047857"/>
          <text x="582" y="360" fill="#fff" font-size="12" font-weight="700">proposal_members</text>
          <text x="788" y="360" fill="#6ee7b7" font-size="10" text-anchor="end">제안인력</text>
          <text x="582" y="390" fill="#fbbf24" font-size="11" font-weight="700">🔑 id</text>
          <text x="787" y="390" fill="#34d399" font-size="10" text-anchor="end">INT PK</text>
          <text x="582" y="408" fill="#fb923c" font-size="11">🔗 project_id</text>
          <text x="787" y="408" fill="#fb923c" font-size="10" text-anchor="end">INT FK</text>
          <text x="582" y="426" fill="#fdba74" font-size="11">🔗? personnel_id</text>
          <text x="787" y="426" fill="#fdba74" font-size="10" text-anchor="end">INT FK?</text>
          <text x="582" y="444" fill="#e2e8f0" font-size="11">person_name</text>
          <text x="787" y="444" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="582" y="462" fill="#e2e8f0" font-size="11">member_group/type</text>
          <text x="787" y="462" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="582" y="480" fill="#e2e8f0" font-size="11">regular/additional_md</text>
          <text x="787" y="480" fill="#34d399" font-size="10" text-anchor="end">INT</text>
          <text x="582" y="498" fill="#c084fc" font-size="11">total_md</text>
          <text x="787" y="498" fill="#c084fc" font-size="10" text-anchor="end">STORED</text>
          <text x="582" y="516" fill="#e2e8f0" font-size="11">auditor_grade/cert_no</text>
          <text x="787" y="516" fill="#94a3b8" font-size="10" text-anchor="end">스냅샷</text>
          <text x="582" y="534" fill="#94a3b8" font-size="10">27명 저장됨</text>
        </g>

        <!-- proposal_files -->
        <g id="g-pfiles">
          <rect x="570" y="580" width="180" height="80" rx="8" fill="#1e293b" stroke="#10b981" stroke-width="1.5"/>
          <rect x="570" y="580" width="180" height="26" rx="8" fill="#047857"/>
          <rect x="570" y="596" width="180" height="10" fill="#047857"/>
          <text x="582" y="596" fill="#fff" font-size="11" font-weight="700">proposal_files</text>
          <text x="743" y="596" fill="#6ee7b7" font-size="10" text-anchor="end">파일</text>
          <text x="582" y="620" fill="#fb923c" font-size="11">🔗 project_id</text>
          <text x="742" y="620" fill="#fb923c" font-size="10" text-anchor="end">INT FK</text>
          <text x="582" y="638" fill="#e2e8f0" font-size="11">file_name / category</text>
          <text x="742" y="638" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
        </g>

        <!-- proposal_attachments_toc -->
        <g id="g-ptoc">
          <rect x="780" y="580" width="205" height="80" rx="8" fill="#1e293b" stroke="#10b981" stroke-width="1.5"/>
          <rect x="780" y="580" width="205" height="26" rx="8" fill="#047857"/>
          <rect x="780" y="596" width="205" height="10" fill="#047857"/>
          <text x="792" y="596" fill="#fff" font-size="11" font-weight="700">proposal_attachments_toc</text>
          <text x="978" y="596" fill="#6ee7b7" font-size="10" text-anchor="end">목차</text>
          <text x="792" y="620" fill="#fb923c" font-size="11">🔗 project_id</text>
          <text x="977" y="620" fill="#fb923c" font-size="10" text-anchor="end">INT FK</text>
          <text x="792" y="638" fill="#e2e8f0" font-size="11">item_order / item_name</text>
          <text x="977" y="638" fill="#34d399" font-size="10" text-anchor="end">INT/TEXT</text>
        </g>

        <!-- keywords -->
        <g id="g-keywords">
          <rect x="570" y="690" width="180" height="100" rx="8" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
          <rect x="570" y="690" width="180" height="26" rx="8" fill="#92400e"/>
          <rect x="570" y="706" width="180" height="10" fill="#92400e"/>
          <text x="582" y="706" fill="#fff" font-size="11" font-weight="700">keywords</text>
          <text x="743" y="706" fill="#fcd34d" font-size="10" text-anchor="end">키워드</text>
          <text x="582" y="732" fill="#fbbf24" font-size="11" font-weight="700">🔑 id</text>
          <text x="742" y="732" fill="#34d399" font-size="10" text-anchor="end">INT PK</text>
          <text x="582" y="750" fill="#fb923c" font-size="11">🔗 project_id</text>
          <text x="742" y="750" fill="#fb923c" font-size="10" text-anchor="end">INT FK</text>
          <text x="582" y="768" fill="#e2e8f0" font-size="11">keyword</text>
          <text x="742" y="768" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="582" y="782" fill="#e2e8f0" font-size="11">sort_order</text>
          <text x="742" y="782" fill="#34d399" font-size="10" text-anchor="end">INT</text>
        </g>

        <!-- keyword_mappings -->
        <g id="g-kwmap">
          <rect x="780" y="690" width="205" height="115" rx="8" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
          <rect x="780" y="690" width="205" height="26" rx="8" fill="#92400e"/>
          <rect x="780" y="706" width="205" height="10" fill="#92400e"/>
          <text x="792" y="706" fill="#fff" font-size="11" font-weight="700">keyword_mappings</text>
          <text x="978" y="706" fill="#fcd34d" font-size="10" text-anchor="end">키워드수정</text>
          <text x="792" y="732" fill="#fbbf24" font-size="11" font-weight="700">🔑 id</text>
          <text x="977" y="732" fill="#34d399" font-size="10" text-anchor="end">INT PK</text>
          <text x="792" y="750" fill="#fb923c" font-size="11">🔗 project_id</text>
          <text x="977" y="750" fill="#fb923c" font-size="10" text-anchor="end">INT FK</text>
          <text x="792" y="768" fill="#fb923c" font-size="11">🔗 keyword_id</text>
          <text x="977" y="768" fill="#fb923c" font-size="10" text-anchor="end">INT FK</text>
          <text x="792" y="786" fill="#e2e8f0" font-size="11">original_keyword</text>
          <text x="977" y="786" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
          <text x="792" y="798" fill="#e2e8f0" font-size="11">mapped_keyword</text>
          <text x="977" y="798" fill="#34d399" font-size="10" text-anchor="end">TEXT</text>
        </g>

        <!-- ────────────────────────────────
             관계선
        ──────────────────────────────── -->

        <!-- personnel → certifications (1:N) -->
        <line x1="240" y1="160" x2="270" y2="130" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#arrow-blue)"/>
        <text x="248" y="148" fill="#3b82f6" font-size="9">1:N</text>

        <!-- personnel → audit_history (1:N) -->
        <line x1="140" y1="280" x2="140" y2="300" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#arrow-blue)"/>
        <text x="145" y="293" fill="#3b82f6" font-size="9">1:N</text>

        <!-- personnel → it_career (1:N) -->
        <line x1="240" y1="200" x2="270" y2="310" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#arrow-blue)"/>
        <text x="248" y="260" fill="#3b82f6" font-size="9">1:N</text>

        <!-- personnel → phase_assignments (점선, nullable) -->
        <line x1="240" y1="165" x2="820" y2="394" stroke="#64748b" stroke-width="1" stroke-dasharray="4,4" marker-end="url(#arrow)"/>
        <text x="510" y="270" fill="#64748b" font-size="9">nullable FK</text>

        <!-- personnel → proposal_members (점선, nullable) -->
        <line x1="240" y1="185" x2="570" y2="426" stroke="#64748b" stroke-width="1" stroke-dasharray="4,4" marker-end="url(#arrow)"/>

        <!-- audit_projects → phases (1:N) -->
        <line x1="790" y1="150" x2="820" y2="120" stroke="#10b981" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#arrow-em)"/>
        <text x="793" y="138" fill="#10b981" font-size="9">1:N</text>

        <!-- audit_phases → assignments (1:N) -->
        <line x1="925" y1="265" x2="925" y2="290" stroke="#10b981" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#arrow-em)"/>
        <text x="930" y="280" fill="#10b981" font-size="9">1:N</text>

        <!-- audit_projects → proposal_members (1:N) -->
        <line x1="680" y1="310" x2="680" y2="340" stroke="#10b981" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#arrow-em)"/>
        <text x="685" y="328" fill="#10b981" font-size="9">1:N</text>

        <!-- audit_projects → files (1:N) -->
        <line x1="650" y1="310" x2="640" y2="580" stroke="#10b981" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#arrow-em)"/>
        <text x="628" y="450" fill="#10b981" font-size="9">1:N</text>

        <!-- audit_projects → toc (1:N) -->
        <line x1="750" y1="310" x2="880" y2="580" stroke="#10b981" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#arrow-em)"/>
        <text x="820" y="460" fill="#10b981" font-size="9">1:N</text>

        <!-- audit_projects → keywords (1:N) -->
        <line x1="620" y1="310" x2="620" y2="690" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#arrow-em)"/>
        <text x="625" y="510" fill="#f59e0b" font-size="9">1:N</text>

        <!-- keywords → keyword_mappings (1:N) -->
        <line x1="750" y1="740" x2="780" y2="750" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#arrow-em)"/>
        <text x="752" y="735" fill="#f59e0b" font-size="9">1:N</text>

        <!-- audit_projects → phase_assignments (1:N direct) -->
        <line x1="790" y1="200" x2="820" y2="376" stroke="#10b981" stroke-width="1" stroke-dasharray="3,3" marker-end="url(#arrow-em)"/>

        <!-- 범례 -->
        <rect x="40" y="510" width="420" height="130" rx="8" fill="#0f172a" stroke="#334155" stroke-width="1"/>
        <text x="52" y="530" fill="#94a3b8" font-size="11" font-weight="700">범례</text>
        <rect x="52" y="540" width="12" height="12" fill="#1d4ed8" rx="2"/>
        <text x="68" y="550" fill="#93c5fd" font-size="10">인력정보 DB 테이블</text>
        <rect x="52" y="558" width="12" height="12" fill="#065f46" rx="2"/>
        <text x="68" y="568" fill="#6ee7b7" font-size="10">제안작업표 DB 테이블</text>
        <text x="52" y="586" fill="#fbbf24" font-size="11">🔑</text>
        <text x="68" y="586" fill="#fbbf24" font-size="10">PK (Primary Key)</text>
        <text x="170" y="586" fill="#fb923c" font-size="11">🔗</text>
        <text x="186" y="586" fill="#fb923c" font-size="10">FK (Foreign Key 필수)</text>
        <text x="52" y="602" fill="#fdba74" font-size="10">🔗?  FK nullable (미등록 인력 허용)</text>
        <text x="52" y="618" fill="#c084fc" font-size="10">STORED  자동 계산 컬럼 (total_md)</text>
        <line x1="170" y1="614" x2="200" y2="614" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="4,3"/>
        <text x="205" y="618" fill="#64748b" font-size="10">점선: nullable FK 관계</text>
        <rect x="52" y="626" width="12" height="12" fill="#92400e" rx="2"/>
        <text x="68" y="636" fill="#fcd34d" font-size="10">키워드 테이블 (keywords / keyword_mappings)</text>
      </svg>
    </div>
  </div>

  <!-- ══════════════════════════════════════════════════
       탭 2 : 인력정보 DB
  ══════════════════════════════════════════════════ -->
  <div id="tab-personnel" class="panel">
    <div class="flex flex-wrap gap-4">
      <!-- personnel -->
      <div class="erd-table">
        <div class="hd bg-blue-700 text-white">👤 personnel<span class="badge">기본정보</span></div>
        <div class="erd-col pk"><span class="col-name">🔑 id</span><span class="col-type">INT PK</span></div>
        <div class="erd-col"><span class="col-name">name</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">position</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">is_fulltime</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">company</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">email</span><span class="col-type">TEXT UK</span></div>
        <div class="erd-col"><span class="col-name">phone</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">birthdate</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">auditor_cert_no</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">auditor_grade</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">tech_grade</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">auditor_career_yrs</span><span class="col-type">REAL</span></div>
        <div class="erd-col"><span class="col-name">auditor_start_date</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">school</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">major</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">degree</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">career_summary</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">career_qualif</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">career_project</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">career_expert</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">education_name</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">education_hours</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">education_org</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">created_at</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">updated_at</span><span class="col-type">TEXT</span></div>
      </div>

      <!-- personnel_certifications -->
      <div class="erd-table">
        <div class="hd bg-blue-600 text-white">🏆 certifications<span class="badge">자격증</span></div>
        <div class="erd-col pk"><span class="col-name">🔑 id</span><span class="col-type">INT PK</span></div>
        <div class="erd-col fk"><span class="col-name">🔗 personnel_id</span><span class="col-type">INT FK</span></div>
        <div class="erd-col"><span class="col-name">cert_name</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">cert_year</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">issuer</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">is_national</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">related_field</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">created_at</span><span class="col-type">TEXT</span></div>
      </div>

      <!-- personnel_audit_history -->
      <div class="erd-table">
        <div class="hd bg-blue-600 text-white">📝 audit_history<span class="badge">감리실적</span></div>
        <div class="erd-col pk"><span class="col-name">🔑 id</span><span class="col-type">INT PK</span></div>
        <div class="erd-col fk"><span class="col-name">🔗 personnel_id</span><span class="col-type">INT FK</span></div>
        <div class="erd-col"><span class="col-name">audit_yearmonth</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">project_name</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">client_org</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">sector</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">domain</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">role</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">phase</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">participation_rate</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">created_at</span><span class="col-type">TEXT</span></div>
      </div>

      <!-- personnel_it_career -->
      <div class="erd-table">
        <div class="hd bg-blue-600 text-white">💼 it_career<span class="badge">IT경력</span></div>
        <div class="erd-col pk"><span class="col-name">🔑 id</span><span class="col-type">INT PK</span></div>
        <div class="erd-col fk"><span class="col-name">🔗 personnel_id</span><span class="col-type">INT FK</span></div>
        <div class="erd-col"><span class="col-name">period_start</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">period_end</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">project_name</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">client_org</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">domain</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">role</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">company</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">remarks</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">created_at</span><span class="col-type">TEXT</span></div>
      </div>
    </div>

    <!-- 관계 설명 -->
    <div class="mt-6 bg-slate-800 rounded-xl p-4 text-sm text-slate-300">
      <div class="font-bold text-white mb-2">🔗 관계 (Relationships)</div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div class="bg-slate-900 rounded p-2"><span class="text-blue-400 font-bold">personnel</span> 1 ──── N <span class="text-blue-400">certifications</span><br/><span class="text-slate-400">1명이 여러 자격증 보유</span></div>
        <div class="bg-slate-900 rounded p-2"><span class="text-blue-400 font-bold">personnel</span> 1 ──── N <span class="text-blue-400">audit_history</span><br/><span class="text-slate-400">1명의 감리실적 다수 (현재 104건)</span></div>
        <div class="bg-slate-900 rounded p-2"><span class="text-blue-400 font-bold">personnel</span> 1 ──── N <span class="text-blue-400">it_career</span><br/><span class="text-slate-400">1명의 IT 실무경력 다수</span></div>
      </div>
    </div>
  </div>

  <!-- ══════════════════════════════════════════════════
       탭 3 : 제안작업표 DB
  ══════════════════════════════════════════════════ -->
  <div id="tab-proposal" class="panel">
    <div class="flex flex-wrap gap-4">
      <!-- audit_projects -->
      <div class="erd-table" style="width:240px">
        <div class="hd bg-emerald-700 text-white">🏢 audit_projects<span class="badge">감리사업</span></div>
        <div class="erd-col pk"><span class="col-name">🔑 id</span><span class="col-type">INT PK</span></div>
        <div class="erd-col"><span class="col-name">project_name</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">bid_notice_no</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">client_org</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">registered_yearmonth</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">target_project_name</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">target_client_org</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">target_contractor</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">target_budget</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">target_period_start/end</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">target_keywords</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">bid_amount</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">bid_amount_excl_vat</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">bid_rate</span><span class="col-type">REAL</span></div>
        <div class="erd-col"><span class="col-name">base_budget</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">bid_deadline</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">bid_open_dt</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">eval_dt</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">travel_cost_per_md</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">required_md</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">proposed_md</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">optimal_md</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">md_unit_price_incl</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">md_unit_price_excl</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">base_unit_price</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">proposal_allowance</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">proposal_allowance_rate</span><span class="col-type">REAL</span></div>
        <div class="erd-col"><span class="col-name">required_phases</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">required_audit_days</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">eval_method</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">proposal_status</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">writer / director</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">supporters</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">references_cc</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">special_notes</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">remarks</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">proposal_template</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">created_at</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">updated_at</span><span class="col-type">TEXT</span></div>
      </div>

      <!-- audit_phases -->
      <div class="erd-table">
        <div class="hd bg-emerald-600 text-white">📅 audit_phases<span class="badge">단계일정</span></div>
        <div class="erd-col pk"><span class="col-name">🔑 id</span><span class="col-type">INT PK</span></div>
        <div class="erd-col fk"><span class="col-name">🔗 project_id</span><span class="col-type">INT FK</span></div>
        <div class="erd-col"><span class="col-name">phase_name</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">phase_days</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">phase_start_date</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">phase_end_date</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">phase_order</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">total_auditor_cnt</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">total_expert_cnt</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">pre_survey_md</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">audit_md</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">action_confirm_md</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">proposed_md</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">created_at</span><span class="col-type">TEXT</span></div>
      </div>

      <!-- audit_phase_assignments -->
      <div class="erd-table">
        <div class="hd bg-emerald-600 text-white">👥 phase_assignments<span class="badge">인력배정</span></div>
        <div class="erd-col pk"><span class="col-name">🔑 id</span><span class="col-type">INT PK</span></div>
        <div class="erd-col fk"><span class="col-name">🔗 phase_id</span><span class="col-type">INT FK</span></div>
        <div class="erd-col fk"><span class="col-name">🔗 project_id</span><span class="col-type">INT FK</span></div>
        <div class="erd-col fkn"><span class="col-name">🔗? personnel_id</span><span class="col-type">INT FK?</span></div>
        <div class="erd-col"><span class="col-name">person_name</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">member_type</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">domain</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">pre_survey_md</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">audit_md</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">action_confirm_md</span><span class="col-type">INT</span></div>
        <div class="erd-col gen"><span class="col-name">total_md</span><span class="col-type">STORED</span></div>
        <div class="erd-col"><span class="col-name">created_at</span><span class="col-type">TEXT</span></div>
      </div>

      <!-- proposal_members -->
      <div class="erd-table">
        <div class="hd bg-emerald-600 text-white">🙋 proposal_members<span class="badge">제안인력</span></div>
        <div class="erd-col pk"><span class="col-name">🔑 id</span><span class="col-type">INT PK</span></div>
        <div class="erd-col fk"><span class="col-name">🔗 project_id</span><span class="col-type">INT FK</span></div>
        <div class="erd-col fkn"><span class="col-name">🔗? personnel_id</span><span class="col-type">INT FK?</span></div>
        <div class="erd-col"><span class="col-name">person_name</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">member_group</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">member_type</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">domain</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">regular_md</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">additional_md</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">acceptance_md</span><span class="col-type">INT</span></div>
        <div class="erd-col gen"><span class="col-name">total_md</span><span class="col-type">STORED</span></div>
        <div class="erd-col"><span class="col-name">is_fulltime</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">auditor_grade</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">auditor_cert_no</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">phone</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">education_hours</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">created_at</span><span class="col-type">TEXT</span></div>
      </div>

      <!-- keywords -->
      <div class="erd-table">
        <div class="hd text-white" style="background:#92400e">🏷️ keywords<span class="badge">키워드</span></div>
        <div class="erd-col pk"><span class="col-name">🔑 id</span><span class="col-type">INT PK</span></div>
        <div class="erd-col fk"><span class="col-name">🔗 project_id</span><span class="col-type">INT FK</span></div>
        <div class="erd-col"><span class="col-name">keyword</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">sort_order</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">created_at</span><span class="col-type">TEXT</span></div>
        <div style="padding:4px 12px;font-size:10px;color:#fcd34d;background:#451a0320">UNIQUE (project_id, keyword)</div>
      </div>

      <!-- keyword_mappings -->
      <div class="erd-table">
        <div class="hd text-white" style="background:#92400e">🔄 keyword_mappings<span class="badge">키워드수정</span></div>
        <div class="erd-col pk"><span class="col-name">🔑 id</span><span class="col-type">INT PK</span></div>
        <div class="erd-col fk"><span class="col-name">🔗 project_id</span><span class="col-type">INT FK</span></div>
        <div class="erd-col fk"><span class="col-name">🔗 keyword_id</span><span class="col-type">INT FK</span></div>
        <div class="erd-col"><span class="col-name">original_keyword</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">mapped_keyword</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">created_at</span><span class="col-type">TEXT</span></div>
        <div style="padding:4px 12px;font-size:10px;color:#fcd34d;background:#451a0320">UNIQUE (keyword_id, mapped_keyword)</div>
      </div>

      <!-- proposal_files -->
      <div class="erd-table">
        <div class="hd bg-emerald-600 text-white">📁 proposal_files<span class="badge">파일</span></div>
        <div class="erd-col pk"><span class="col-name">🔑 id</span><span class="col-type">INT PK</span></div>
        <div class="erd-col fk"><span class="col-name">🔗 project_id</span><span class="col-type">INT FK</span></div>
        <div class="erd-col"><span class="col-name">file_category</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">file_name</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">file_size_kb</span><span class="col-type">REAL</span></div>
        <div class="erd-col"><span class="col-name">uploaded_at</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">file_type</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">created_at</span><span class="col-type">TEXT</span></div>
      </div>

      <!-- proposal_attachments_toc -->
      <div class="erd-table">
        <div class="hd bg-emerald-600 text-white">📋 attachments_toc<span class="badge">첨부목차</span></div>
        <div class="erd-col pk"><span class="col-name">🔑 id</span><span class="col-type">INT PK</span></div>
        <div class="erd-col fk"><span class="col-name">🔗 project_id</span><span class="col-type">INT FK</span></div>
        <div class="erd-col"><span class="col-name">item_order</span><span class="col-type">INT</span></div>
        <div class="erd-col"><span class="col-name">item_name</span><span class="col-type">TEXT</span></div>
        <div class="erd-col"><span class="col-name">created_at</span><span class="col-type">TEXT</span></div>
      </div>
    </div>

    <div class="mt-6 bg-slate-800 rounded-xl p-4 text-sm text-slate-300">
      <div class="font-bold text-white mb-2">🔗 관계 (Relationships)</div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div class="bg-slate-900 rounded p-2"><span class="text-emerald-400 font-bold">audit_projects</span> 1 ── N <span class="text-emerald-400">audit_phases</span><br/><span class="text-slate-400">1개 사업에 7단계 일정</span></div>
        <div class="bg-slate-900 rounded p-2"><span class="text-emerald-400 font-bold">audit_phases</span> 1 ── N <span class="text-emerald-400">phase_assignments</span><br/><span class="text-slate-400">각 단계별 투입 인력</span></div>
        <div class="bg-slate-900 rounded p-2"><span class="text-emerald-400 font-bold">audit_projects</span> 1 ── N <span class="text-emerald-400">proposal_members</span><br/><span class="text-slate-400">제안 인력 27명</span></div>
        <div class="bg-slate-900 rounded p-2"><span class="text-emerald-400 font-bold">audit_projects</span> 1 ── N <span class="text-emerald-400">proposal_files</span><br/><span class="text-slate-400">관련 파일 목록</span></div>
        <div class="bg-slate-900 rounded p-2"><span class="text-emerald-400 font-bold">audit_projects</span> 1 ── N <span class="text-emerald-400">attachments_toc</span><br/><span class="text-slate-400">첨부 목차 항목</span></div>
        <div class="bg-slate-900 rounded p-2"><span class="text-emerald-400 font-bold">audit_projects</span> 1 ── N <span style="color:#fcd34d">keywords</span><br/><span class="text-slate-400">사업별 키워드 태그 (32개)</span></div>
        <div class="bg-slate-900 rounded p-2"><span style="color:#fcd34d" class="font-bold">keywords</span> 1 ── N <span style="color:#fcd34d">keyword_mappings</span><br/><span class="text-slate-400">영문 약어 → 한글 매핑 (5개)</span></div>
        <div class="bg-slate-900 rounded p-2"><span class="text-purple-400 font-bold">total_md</span><br/><span class="text-slate-400">pre_survey + audit + action_confirm MD 자동 합산 (STORED)</span></div>
      </div>
    </div>
  </div>

  <!-- ══════════════════════════════════════════════════
       탭 4 : 컬럼 상세 (집계 통계)
  ══════════════════════════════════════════════════ -->
  <div id="tab-columns" class="panel">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

      <!-- 인력 DB 통계 -->
      <div class="bg-slate-800 rounded-xl p-5">
        <h3 class="text-blue-400 font-bold text-base mb-4">👤 인력정보 DB 요약</h3>
        <table class="w-full detail-table">
          <thead><tr><th>테이블</th><th>컬럼 수</th><th>현재 데이터</th><th>설명</th></tr></thead>
          <tbody>
            <tr><td class="text-blue-300 font-semibold">personnel</td><td>25</td><td>1명 (강신배)</td><td>기본정보, 감리원등급, 학력, 교육이력</td></tr>
            <tr><td class="text-blue-300 font-semibold">certifications</td><td>8</td><td>4건</td><td>수석감리원, 기술사, PMP, 정보처리기사</td></tr>
            <tr><td class="text-blue-300 font-semibold">audit_history</td><td>11</td><td>104건</td><td>2020~2026년 전체 감리 실적</td></tr>
            <tr><td class="text-blue-300 font-semibold">it_career</td><td>11</td><td>6건</td><td>코스콤 등 IT 실무 경력</td></tr>
          </tbody>
        </table>
      </div>

      <!-- 제안작업표 DB 통계 -->
      <div class="bg-slate-800 rounded-xl p-5">
        <h3 class="text-emerald-400 font-bold text-base mb-4">📋 제안작업표 DB 요약</h3>
        <table class="w-full detail-table">
          <thead><tr><th>테이블</th><th>컬럼 수</th><th>현재 데이터</th><th>설명</th></tr></thead>
          <tbody>
            <tr><td class="text-emerald-300 font-semibold">audit_projects</td><td>39</td><td>1건</td><td>글로컬 O2O 플랫폼 감리용역</td></tr>
            <tr><td class="text-emerald-300 font-semibold">audit_phases</td><td>14</td><td>7건</td><td>요구정의~상시감리 7단계</td></tr>
            <tr><td class="text-emerald-300 font-semibold">phase_assignments</td><td>12</td><td>37건</td><td>단계별 인력 MD 배정</td></tr>
            <tr><td class="text-emerald-300 font-semibold">proposal_members</td><td>17</td><td>27명</td><td>감리원6 + 전문가14 + 테스터7</td></tr>
            <tr><td class="text-emerald-300 font-semibold">proposal_files</td><td>8</td><td>7건</td><td>hwp, pdf, pptx 파일</td></tr>
            <tr><td class="text-emerald-300 font-semibold">attachments_toc</td><td>5</td><td>10건</td><td>제안서 첨부 목차</td></tr>
            <tr><td style="color:#fcd34d" class="font-semibold">keywords</td><td>5</td><td>32개</td><td>사업별 키워드 태그 (엑셀 ERD 추가)</td></tr>
            <tr><td style="color:#fcd34d" class="font-semibold">keyword_mappings</td><td>6</td><td>5개</td><td>영문↔한글 키워드 변환 (엑셀 ERD 추가)</td></tr>
          </tbody>
        </table>
      </div>

      <!-- 인덱스 -->
      <div class="bg-slate-800 rounded-xl p-5 md:col-span-2">
        <h3 class="text-slate-300 font-bold text-base mb-4">🗂️ 인덱스 목록</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div class="bg-slate-900 rounded p-2 text-slate-300">idx_personnel_name<br/><span class="text-slate-500">personnel(name)</span></div>
          <div class="bg-slate-900 rounded p-2 text-slate-300">idx_personnel_auditor_grade<br/><span class="text-slate-500">personnel(auditor_grade)</span></div>
          <div class="bg-slate-900 rounded p-2 text-slate-300">idx_audit_history_personnel<br/><span class="text-slate-500">audit_history(personnel_id)</span></div>
          <div class="bg-slate-900 rounded p-2 text-slate-300">idx_audit_history_yearmonth<br/><span class="text-slate-500">audit_history(audit_yearmonth)</span></div>
          <div class="bg-slate-900 rounded p-2 text-slate-300">idx_it_career_personnel<br/><span class="text-slate-500">it_career(personnel_id)</span></div>
          <div class="bg-slate-900 rounded p-2 text-slate-300">idx_certifications_personnel<br/><span class="text-slate-500">certifications(personnel_id)</span></div>
          <div class="bg-slate-900 rounded p-2 text-slate-300">idx_audit_projects_name<br/><span class="text-slate-500">audit_projects(project_name)</span></div>
          <div class="bg-slate-900 rounded p-2 text-slate-300">idx_audit_projects_status<br/><span class="text-slate-500">audit_projects(proposal_status)</span></div>
          <div class="bg-slate-900 rounded p-2 text-slate-300">idx_audit_phases_project<br/><span class="text-slate-500">audit_phases(project_id)</span></div>
          <div class="bg-slate-900 rounded p-2 text-slate-300">idx_phase_assignments_phase<br/><span class="text-slate-500">phase_assignments(phase_id)</span></div>
          <div class="bg-slate-900 rounded p-2 text-slate-300">idx_phase_assignments_person<br/><span class="text-slate-500">phase_assignments(personnel_id)</span></div>
          <div class="bg-slate-900 rounded p-2 text-slate-300">idx_proposal_members_project<br/><span class="text-slate-500">proposal_members(project_id)</span></div>
          <div class="bg-slate-900 rounded p-2" style="color:#fcd34d">idx_keywords_project<br/><span class="text-slate-500">keywords(project_id)</span></div>
          <div class="bg-slate-900 rounded p-2" style="color:#fcd34d">idx_keywords_keyword<br/><span class="text-slate-500">keywords(keyword)</span></div>
          <div class="bg-slate-900 rounded p-2" style="color:#fcd34d">idx_kwmap_project<br/><span class="text-slate-500">keyword_mappings(project_id)</span></div>
          <div class="bg-slate-900 rounded p-2" style="color:#fcd34d">idx_kwmap_keyword<br/><span class="text-slate-500">keyword_mappings(keyword_id)</span></div>
        </div>
      </div>
    </div>
  </div>

</div><!-- /max-w -->

<script>
  function switchTab(name, btn) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
<\/script>
</body>
</html>
`,xe=`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>파일 업로드 — 감리 DB</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
  <style>
    .drop-zone {
      border: 2px dashed #94a3b8;
      transition: border-color .2s, background .2s;
    }
    .drop-zone.dragover {
      border-color: #6366f1;
      background: #eef2ff;
    }
    .log-line { font-family: monospace; font-size: 13px; }
    .log-ok   { color: #16a34a; }
    .log-err  { color: #dc2626; }
    .log-info { color: #2563eb; }
  </style>
</head>
<body class="bg-slate-50 min-h-screen">

<!-- 상단 네비 -->
<nav class="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-6 shadow-sm">
  <span class="font-bold text-indigo-700 text-lg"><i class="fas fa-database mr-2"></i>감리 DB</span>
  <a href="/upload" class="text-indigo-600 font-medium text-sm"><i class="fas fa-upload mr-1"></i>업로드</a>
  <a href="/erd"    class="text-slate-500 hover:text-slate-700 text-sm"><i class="fas fa-project-diagram mr-1"></i>ERD</a>
</nav>

<div class="max-w-4xl mx-auto px-6 py-10">
  <h1 class="text-2xl font-bold text-slate-800 mb-2">
    <i class="fas fa-file-upload text-indigo-500 mr-2"></i>HTML 파일 업로드
  </h1>
  <p class="text-slate-500 text-sm mb-8">인력 프로파일 또는 사업 제안작업표 HTML을 업로드하면 자동으로 파싱하여 DB에 적재합니다.<br>
  <span class="text-amber-600 font-medium">동일한 이름(인력명/사업명)이 이미 존재하면 덮어씁니다.</span></p>

  <div class="grid md:grid-cols-2 gap-6">

    <!-- 인력 업로드 카드 -->
    <div class="bg-white rounded-2xl shadow border border-slate-200 p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
          <i class="fas fa-user text-blue-600"></i>
        </div>
        <div>
          <h2 class="font-bold text-slate-800">인력 프로파일</h2>
          <p class="text-xs text-slate-400">프로파일(성명).html</p>
        </div>
      </div>

      <div id="drop-personnel"
           class="drop-zone rounded-xl p-6 text-center cursor-pointer mb-4"
           onclick="document.getElementById('file-personnel').click()">
        <i class="fas fa-cloud-upload-alt text-3xl text-slate-300 mb-2"></i>
        <p class="text-sm text-slate-500">파일을 여기에 드래그하거나 클릭하여 선택</p>
        <p id="fname-personnel" class="text-xs text-indigo-600 mt-1 font-medium"></p>
      </div>
      <input type="file" id="file-personnel" accept=".html" class="hidden">

      <button id="btn-personnel"
              onclick="uploadFile('personnel')"
              class="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition disabled:opacity-40"
              disabled>
        <i class="fas fa-upload mr-2"></i>인력 DB 적재
      </button>

      <!-- 적재 결과 요약 -->
      <div id="result-personnel" class="mt-4 hidden">
        <div class="bg-slate-50 rounded-xl p-4 text-sm space-y-1" id="result-personnel-inner"></div>
      </div>
    </div>

    <!-- 사업 업로드 카드 -->
    <div class="bg-white rounded-2xl shadow border border-slate-200 p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
          <i class="fas fa-briefcase text-emerald-600"></i>
        </div>
        <div>
          <h2 class="font-bold text-slate-800">사업 제안작업표</h2>
          <p class="text-xs text-slate-400">[사업명] 감리 용역.html</p>
        </div>
      </div>

      <div id="drop-project"
           class="drop-zone rounded-xl p-6 text-center cursor-pointer mb-4"
           onclick="document.getElementById('file-project').click()">
        <i class="fas fa-cloud-upload-alt text-3xl text-slate-300 mb-2"></i>
        <p class="text-sm text-slate-500">파일을 여기에 드래그하거나 클릭하여 선택</p>
        <p id="fname-project" class="text-xs text-emerald-600 mt-1 font-medium"></p>
      </div>
      <input type="file" id="file-project" accept=".html" class="hidden">

      <button id="btn-project"
              onclick="uploadFile('project')"
              class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition disabled:opacity-40"
              disabled>
        <i class="fas fa-upload mr-2"></i>사업 DB 적재
      </button>

      <!-- 적재 결과 요약 -->
      <div id="result-project" class="mt-4 hidden">
        <div class="bg-slate-50 rounded-xl p-4 text-sm space-y-1" id="result-project-inner"></div>
      </div>
    </div>
  </div>

  <!-- 처리 로그 -->
  <div class="mt-8 bg-white rounded-2xl shadow border border-slate-200 p-6">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-bold text-slate-700 text-sm"><i class="fas fa-terminal mr-2 text-slate-400"></i>처리 로그</h3>
      <button onclick="clearLog()" class="text-xs text-slate-400 hover:text-slate-600">초기화</button>
    </div>
    <div id="log" class="min-h-16 max-h-64 overflow-y-auto space-y-0.5 bg-slate-900 rounded-xl p-4">
      <p class="log-line log-info">대기 중... HTML 파일을 선택해주세요.</p>
    </div>
  </div>
</div>

<script>
// ── 드래그 앤 드롭 & 파일 선택 ──────────────────────────────
const state = { personnel: null, project: null }

function setupDrop(type) {
  const zone = document.getElementById('drop-' + type)
  const input = document.getElementById('file-' + type)
  const nameEl = document.getElementById('fname-' + type)
  const btn = document.getElementById('btn-' + type)

  input.addEventListener('change', () => {
    const f = input.files[0]
    if (f) {
      state[type] = f
      nameEl.textContent = f.name
      btn.disabled = false
      addLog('info', '선택됨: ' + f.name + ' (' + (f.size/1024).toFixed(1) + ' KB)')
    }
  })

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover') })
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'))
  zone.addEventListener('drop', e => {
    e.preventDefault()
    zone.classList.remove('dragover')
    const f = e.dataTransfer.files[0]
    if (f && f.name.endsWith('.html')) {
      state[type] = f
      nameEl.textContent = f.name
      btn.disabled = false
      addLog('info', '드롭됨: ' + f.name + ' (' + (f.size/1024).toFixed(1) + ' KB)')
    } else {
      addLog('err', 'HTML 파일만 업로드할 수 있습니다')
    }
  })
}
setupDrop('personnel')
setupDrop('project')

// ── 업로드 처리 ──────────────────────────────────────────────
async function uploadFile(type) {
  const file = state[type]
  if (!file) return

  const btn = document.getElementById('btn-' + type)
  const resultEl = document.getElementById('result-' + type)
  const resultInner = document.getElementById('result-' + type + '-inner')

  btn.disabled = true
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>처리 중...'
  resultEl.classList.add('hidden')

  addLog('info', '[' + type + '] 업로드 시작: ' + file.name)

  const formData = new FormData()
  formData.append('file', file)

  try {
    const endpoint = type === 'personnel'
      ? '/api/upload/personnel'
      : '/api/upload/project'

    const res = await fetch(endpoint, { method: 'POST', body: formData })
    const json = await res.json()

    if (json.ok) {
      addLog('ok', '[' + type + '] ✅ ' + json.message)
      showResult(type, json.data, true)

      // 성공 후 버튼 상태 유지 (재업로드 가능)
      btn.innerHTML = '<i class="fas fa-check mr-2"></i>적재 완료 (재업로드 가능)'
      btn.disabled = false
    } else {
      addLog('err', '[' + type + '] ❌ ' + json.error)
      showResult(type, { error: json.error }, false)
      btn.innerHTML = '<i class="fas fa-upload mr-2"></i>' + (type === 'personnel' ? '인력' : '사업') + ' DB 적재'
      btn.disabled = false
    }
  } catch (e) {
    addLog('err', '[' + type + '] 네트워크 오류: ' + e.message)
    btn.innerHTML = '<i class="fas fa-upload mr-2"></i>' + (type === 'personnel' ? '인력' : '사업') + ' DB 적재'
    btn.disabled = false
  }
}

// ── 결과 요약 표시 ────────────────────────────────────────────
function showResult(type, data, ok) {
  const el = document.getElementById('result-' + type)
  const inner = document.getElementById('result-' + type + '-inner')
  el.classList.remove('hidden')

  if (!ok) {
    inner.innerHTML = '<p class="text-red-600 font-medium"><i class="fas fa-times-circle mr-1"></i>' + (data.error || '오류') + '</p>'
    return
  }

  const rows = []
  if (type === 'personnel') {
    rows.push(['<i class="fas fa-user mr-1 text-blue-500"></i>인력명', data.name])
    rows.push(['<i class="fas fa-certificate mr-1 text-yellow-500"></i>자격증', data.certifications + '건'])
    rows.push(['<i class="fas fa-history mr-1 text-indigo-500"></i>감리실적', data.audit_history + '건'])
    rows.push(['<i class="fas fa-briefcase mr-1 text-slate-500"></i>IT경력', data.it_career + '건'])
  } else {
    rows.push(['<i class="fas fa-building mr-1 text-emerald-600"></i>사업명', data.project_name])
    rows.push(['<i class="fas fa-tags mr-1 text-amber-500"></i>키워드', data.keywords + '개'])
    rows.push(['<i class="fas fa-calendar-alt mr-1 text-blue-500"></i>감리단계', data.phases + '단계'])
    rows.push(['<i class="fas fa-users mr-1 text-indigo-500"></i>단계배정', data.phase_assignments + '건'])
    rows.push(['<i class="fas fa-user-tie mr-1 text-slate-500"></i>제안인력', data.proposal_members + '명'])
    rows.push(['<i class="fas fa-file mr-1 text-red-400"></i>제안파일', data.proposal_files + '건'])
    rows.push(['<i class="fas fa-list mr-1 text-slate-400"></i>첨부목차', data.attachments_toc + '건'])
  }

  inner.innerHTML = '<p class="text-green-600 font-semibold mb-2"><i class="fas fa-check-circle mr-1"></i>적재 완료</p>'
    + rows.map(([k, v]) => \`<div class="flex justify-between text-xs"><span class="text-slate-500">\${k}</span><span class="font-medium text-slate-800">\${v}</span></div>\`).join('')
}

// ── 로그 ──────────────────────────────────────────────────────
function addLog(type, msg) {
  const log = document.getElementById('log')
  const p = document.createElement('p')
  const ts = new Date().toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit',second:'2-digit'})
  p.className = 'log-line log-' + type
  p.textContent = '[' + ts + '] ' + msg
  log.appendChild(p)
  log.scrollTop = log.scrollHeight
}

function clearLog() {
  document.getElementById('log').innerHTML = '<p class="log-line log-info">로그 초기화됨</p>'
}
<\/script>
</body>
</html>
`;function G(e){let t=[],n=0,r=[],i=null,a=null,o=!1,s=/<(\/?)(\w+)[^>]*?(?:\s*\/)?>|([^<]+)/gi,c=e=>e.replace(/&amp;/g,`&`).replace(/&lt;/g,`<`).replace(/&gt;/g,`>`).replace(/&quot;/g,`"`).replace(/&#39;/g,`'`).replace(/&nbsp;/g,` `).replace(/&#(\d+);/g,(e,t)=>String.fromCharCode(Number(t))),l;for(;(l=s.exec(e))!==null;){let[e,s,u,d]=l;if(d!==void 0){if(o&&a!==null){let e=c(d).trim();e&&(a+=(a?` `:``)+e)}continue}let f=u.toLowerCase(),p=s===`/`;f===`table`?p?(n===1&&(t.push({rows:r}),r=[]),n--):(n++,n===1&&(r=[])):f===`tr`&&n===1?p?(i&&r.push(i),i=null):i=[]:(f===`td`||f===`th`)&&n===1?p?(i!==null&&a!==null&&i.push(a.trim()),a=null,o=!1):(a=``,o=!0):(f===`br`||f===`p`)&&o&&a!==null&&(a+=`
`)}return t}function K(e){let t=e.replace(/,/g,``).match(/[\d.]+/);return t?parseFloat(t[0]):null}function Se(e){let t=e.includes(`～`)?`～`:e.includes(`~`)?`~`:`-`,n=e.split(t).map(e=>e.trim()),r=e=>{let t=e.match(/(\d{4})[년.\/\-](\d{1,2})/);if(t)return`${t[1]}.${t[2].padStart(2,`0`)}`;let n=e.match(/(\d{4})\.(\d{1,2})/);return n?`${n[1]}.${n[2].padStart(2,`0`)}`:e};return{start:r(n[0]??``),end:r(n[1]??``)}}function Ce(e){let t=G(e),n=t[3]?.rows??[],r={name:``,position:``,is_fulltime:1,company:``,email:``,phone:``,birthdate:``,auditor_cert_no:``,auditor_grade:``,tech_grade:``,school:``,major:``,degree:``,career_summary:``,career_qualif:``,career_project:``,career_expert:``,education_name:``,education_hours:0,education_org:``};for(let e=0;e<n.length;e++){let t=n[e],i=(t[0]??``).trim(),a=(t[1]??``).trim(),o=(t[2]??``).trim(),s=(t[3]??``).trim();if(i.includes(`성명`)){let t=n[e+1]??[],i=(t[0]??``).trim(),a=i.match(/^([^\(（\s]+)/);a&&(r.name=a[1]);let o=i.match(/[（(]([^,）)]+)/);o&&(r.position=o[1].trim()),r.is_fulltime=+!!i.includes(`상근`),r.company=(t[5]??``).trim()}i.includes(`감리원증`)&&(r.auditor_cert_no=a),i.includes(`감리원 등급`)&&(r.auditor_grade=a),i.includes(`기술 등급`)&&(r.tech_grade=a),o.includes(`감리원 등급`)&&(r.auditor_grade=s),o.includes(`기술 등급`)&&(r.tech_grade=s),i.includes(`이메일`)&&(r.email=a,r.phone=(t[2]??``).trim(),r.birthdate=(t[4]??``).trim()),!r.email&&a.includes(`@`)&&(r.email=a),i.includes(`최종학교`)&&(r.school=a,r.major=(t[2]??``).trim(),r.degree=(t[4]??``).trim(),r.degree||=(t[3]??``).trim()),i.includes(`주요 경력`)&&!i.includes(`자격`)&&(r.career_summary=a),i.includes(`주요 경력 및 자격`)&&(r.career_qualif=a),i.includes(`시스템 개발`)&&(r.career_project=a),i.includes(`주요 이력`)&&(r.career_expert=a)}for(let e of n){for(let t of e)!r.email&&t.includes(`@`)&&t.includes(`.`)&&(r.email=t.trim());e[0]?.includes(`이메일`)&&(r.email=(e[1]??``).trim(),r.phone=(e[2]??``).trim()||(e[3]??``).trim())}let i=t[4]?.rows??[];i.length>=2&&(r.education_name=(i[1][0]??``).trim(),r.education_hours=K(i[1][1]??``)??0,r.education_org=(i[1][2]??``).trim());let a=t[6]?.rows??[],o=[];for(let e=1;e<a.length;e++){let t=a[e];!t[0]||!t[1]||/\d{4}[.\s년]/.test(t[0])&&o.push({audit_yearmonth:t[0].trim(),project_name:t[1].trim(),client_org:(t[2]??``).trim(),sector:(t[3]??``).trim(),domain:(t[4]??``).trim(),role:(t[5]??``).trim(),phase:(t[6]??``).trim(),participation_rate:K(t[7]??``)??100})}let s=t[8]?.rows??[],c=[];for(let e=1;e<s.length;e++){let t=s[e];if(!t[0]||!t[1])continue;let n=Se(t[0]);c.push({period_start:n.start,period_end:n.end,project_name:t[1].trim(),client_org:(t[2]??``).trim(),domain:(t[3]??``).trim(),role:(t[4]??``).trim(),company:(t[5]??``).trim(),remarks:(t[6]??``).trim()})}let l=t[9]?.rows??[],u=[];for(let e=1;e<l.length;e++){let t=l[e];if(!t[0])continue;let n=t[0].trim(),r=n.match(/\((\d{4})\)/),i=n.replace(/\s*\(\d{4}\)/,``).trim();u.push({cert_name:i,cert_year:r?r[1]:``,issuer:(t[1]??``).trim(),is_national:+!!(t[2]??``).includes(`국가공인`),related_field:(t[3]??``).trim()})}return{personnel:r,certifications:u,audit_history:o,it_career:c}}var q=new W;q.post(`/`,async e=>{let t=e.env.DB,n;try{let t=(await e.req.formData()).get(`file`);if(!t)return e.json({ok:!1,error:`file 필드가 없습니다`},400);if(!t.name.toLowerCase().endsWith(`.html`))return e.json({ok:!1,error:`HTML 파일만 업로드 가능합니다`},400);n=await t.text()}catch(t){return e.json({ok:!1,error:`파일 읽기 실패: ${String(t)}`},400)}let r;try{r=Ce(n)}catch(t){return e.json({ok:!1,error:`파싱 실패: ${String(t)}`},422)}let{personnel:i,certifications:a,audit_history:o,it_career:s}=r;if(!i.name)return e.json({ok:!1,error:`성명을 파싱할 수 없습니다. 인력 프로파일 HTML인지 확인하세요`},422);try{await t.prepare(`
      INSERT INTO personnel (
        name, position, is_fulltime, company,
        email, phone, birthdate,
        auditor_cert_no, auditor_grade, tech_grade,
        school, major, degree,
        career_summary, career_qualif, career_project, career_expert,
        education_name, education_hours, education_org,
        updated_at
      ) VALUES (?,?,?,?, ?,?,?, ?,?,?, ?,?,?, ?,?,?,?, ?,?,?, datetime('now','localtime'))
      ON CONFLICT(name) DO UPDATE SET
        position        = excluded.position,
        is_fulltime     = excluded.is_fulltime,
        company         = excluded.company,
        email           = excluded.email,
        phone           = excluded.phone,
        birthdate       = excluded.birthdate,
        auditor_cert_no = excluded.auditor_cert_no,
        auditor_grade   = excluded.auditor_grade,
        tech_grade      = excluded.tech_grade,
        school          = excluded.school,
        major           = excluded.major,
        degree          = excluded.degree,
        career_summary  = excluded.career_summary,
        career_qualif   = excluded.career_qualif,
        career_project  = excluded.career_project,
        career_expert   = excluded.career_expert,
        education_name  = excluded.education_name,
        education_hours = excluded.education_hours,
        education_org   = excluded.education_org,
        updated_at      = datetime('now','localtime')
    `).bind(i.name,i.position,i.is_fulltime,i.company,i.email,i.phone,i.birthdate,i.auditor_cert_no,i.auditor_grade,i.tech_grade,i.school,i.major,i.degree,i.career_summary,i.career_qualif,i.career_project,i.career_expert,i.education_name,i.education_hours,i.education_org).run();let n=await t.prepare(`SELECT id FROM personnel WHERE name = ?`).bind(i.name).first();if(!n)throw Error(`personnel ID 조회 실패`);let r=n.id;await t.prepare(`DELETE FROM personnel_certifications WHERE personnel_id = ?`).bind(r).run(),await t.prepare(`DELETE FROM personnel_audit_history WHERE personnel_id = ?`).bind(r).run(),await t.prepare(`DELETE FROM personnel_it_career WHERE personnel_id = ?`).bind(r).run();for(let e of a)await t.prepare(`
        INSERT INTO personnel_certifications (personnel_id, cert_name, cert_year, issuer, is_national, related_field)
        VALUES (?,?,?,?,?,?)
      `).bind(r,e.cert_name,e.cert_year,e.issuer,e.is_national,e.related_field).run();for(let e=0;e<o.length;e+=50){let n=o.slice(e,e+50).map(e=>t.prepare(`
          INSERT INTO personnel_audit_history
            (personnel_id, audit_yearmonth, project_name, client_org, sector, domain, role, phase, participation_rate)
          VALUES (?,?,?,?,?,?,?,?,?)
        `).bind(r,e.audit_yearmonth,e.project_name,e.client_org,e.sector,e.domain,e.role,e.phase,e.participation_rate));await t.batch(n)}for(let e of s)await t.prepare(`
        INSERT INTO personnel_it_career
          (personnel_id, period_start, period_end, project_name, client_org, domain, role, company, remarks)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).bind(r,e.period_start,e.period_end,e.project_name,e.client_org,e.domain,e.role,e.company,e.remarks).run();return e.json({ok:!0,message:`인력 "${i.name}" 저장 완료`,data:{personnel_id:r,name:i.name,certifications:a.length,audit_history:o.length,it_career:s.length}})}catch(t){return e.json({ok:!1,error:`DB 저장 실패: ${String(t)}`},500)}});function J(e){let t=e.match(/(\d{4})[.\/](\d{1,2})[.\/](\d{1,2})/);return t?`${t[1]}-${t[2].padStart(2,`0`)}-${t[3].padStart(2,`0`)}`:e}function Y(e){let t=e.match(/(\d{4})[\/](\d{2})[\/](\d{2})\s+(\d{2}:\d{2}:\d{2})/);return t?`${t[1]}-${t[2]}-${t[3]} ${t[4]}`:J(e)}function we(e){let t=G(e),n=t[3]?.rows??[],r={project_name:``,bid_notice_no:``,client_org:``,registered_yearmonth:``,target_project_name:``,target_client_org:``,target_period_start:``,target_period_end:``,bid_amount:null,bid_amount_excl_vat:null,bid_rate:null,base_budget:null,bid_deadline:``,bid_open_dt:``,eval_dt:``,required_md:null,proposed_md:null,optimal_md:null,md_unit_price_incl:null,md_unit_price_excl:null,base_unit_price:null,proposal_allowance:null,proposal_allowance_rate:null,required_phases:null,required_audit_days:null,eval_method:``,proposal_status:``,writer:``,director:``,supporters:``,references_cc:``,special_notes:``,remarks:``,proposal_template:``};for(let e of n){let t=e.map(e=>e.trim());if(t[0]===`사업명`&&t[1]){let e=t[1];r.project_name=e.split(` - `)[0].trim();let n=e.match(/(\d{4})[.\/](\d{1,2})/);n&&(r.registered_yearmonth=`${n[1]}.${n[2].padStart(2,`0`)}`);let i=e.split(` - `);i.length>=2&&(r.client_org=i[1].replace(/등록년월.*/,``).trim())}if(t[0]===`입찰공고번호`&&t[1]&&(r.bid_notice_no=t[1].replace(/\[.*?\]/g,``).trim()),(t[0]===`입찰 마감 일시`||t[2]===`입찰 마감 일시`)&&(t[1]||t[3])&&(r.bid_deadline=Y(t[2]===`입찰 마감 일시`?t[3]:t[1])),t[2]===`입찰 마감 일시`&&(r.bid_deadline=Y(t[3])),(t[0]===`입찰 개시 일시`||t[2]===`입찰 개시 일시`)&&(r.bid_open_dt=Y(t[0]===`입찰 개시 일시`?t[1]:t[3])),t[0]===`평가 일시`&&t[1]&&(r.eval_dt=Y(t[1])),t[0]===`사업 금액`&&t[1]&&(r.base_budget=K(t[1])),(t[0]===`배정 예산`||t[2]===`배정 예산`)&&(r.base_budget=K(t[0]===`배정 예산`?t[1]:t[3])),t[0]===`입찰 금액`&&t[1]){let e=t[1].match(/투찰률?[:：]\s*([\d.]+)/);e&&(r.bid_rate=parseFloat(e[1]));let n=t[1].match(/([\d,]+)원/);n&&(r.bid_amount=K(n[0]));let i=t[1].match(/VAT\s*제외시?\s*([\d,]+)/);i&&(r.bid_amount_excl_vat=K(i[1]))}t[0].includes(`제안 투입 공수`)&&t[1]&&(r.proposed_md=K(t[1])),t[0].includes(`요구 투입 공수`)&&t[1]&&(r.required_md=K(t[1]));for(let e of t){let t=e.match(/적정\s*공수[:：]?\s*(\d+)\s*MD/);t&&(r.optimal_md=parseInt(t[1]))}t[0].includes(`1MD 단가`)&&t[1]&&(t[1].includes(`VAT 제외`)?r.md_unit_price_excl=K(t[1]):t[1].includes(`VAT 포함`)&&(r.md_unit_price_incl=K(t[1]))),t[2]&&t[2].includes(`1MD 단가`)&&t[3]&&t[3].includes(`VAT 포함`)&&(r.md_unit_price_incl=K(t[3]));for(let e of t){let t=e.match(/기준\s*단가\s*([\d,]+)/);t&&(r.base_unit_price=K(t[1]))}if(t[0].includes(`제안 수당`)&&t[1]){let e=t[1].match(/([\d.]+)%/);e&&(r.proposal_allowance_rate=parseFloat(e[1]));let n=t[1].match(/([\d,]+)/);n&&(r.proposal_allowance=K(n[0]))}if(t[0]===`요구 단계`&&t[1]&&(r.required_phases=K(t[1])),t[0]===`요구 감리 일수`&&t[1]&&(r.required_audit_days=K(t[1])),t[0]===`제안 평가 방식`&&t[1]&&(r.eval_method=t[1]),t[2]===`제안 작업 상태`&&(r.proposal_status=t[3]??``),t[0]===`제안 작업 상태`&&t[1]&&(r.proposal_status=t[1]),t[0]===`제안 관련자`&&t[1]){let e=t[1],n=e.match(/작성자[:：]\s*(\S+)/),i=e.match(/총괄[:：]\s*(\S+)/),a=e.match(/지원[:：]\s*([^\s총괄제안]+)/),o=e.match(/참조[:：]\s*(.+)/);n&&(r.writer=n[1]),i&&(r.director=i[1]),a&&(r.supporters=a[1].trim()),o&&(r.references_cc=o[1].trim())}t[0]===`특이 사항`&&t[1]&&(r.special_notes=t[1]),t[0]===`비고`&&t[1]&&(r.remarks=t[1])}let i=t[4]?.rows??[],a=[],o={};for(let e of i)if(e[0]?.includes(`파일 구분`)){let t=e[0].matchAll(/(\d+)\.\s+([^\d]+?)(?=\s+\d+\.|$)/g);for(let e of t)o[e[1]]=e[2].trim()}for(let e=1;e<i.length;e++){let t=i[e];if(!t[0]||!t[1])continue;let n=t[0].trim(),r=t[1],s=/\[(\d{4}\.\d{2}\.\d{2})\([^)]+\)\s*(\d{2}:\d{2})\]\s*([^\[]+?)(?=\s*\[|\s*$)/g,c;for(;(c=s.exec(r))!==null;){let e=c[1],t=c[2],r=c[3].trim(),i=r.match(/\(([\d.]+)\s*KB\)/),s=i?parseFloat(i[1]):null,l=r.replace(/\s*\([\d.]+\s*(?:KB|MB)\).*/,``).trim(),u=l.match(/^(\d+)\./),d=u?o[u[1]]??u[1]:``;a.push({file_category:d,file_name:l,file_size_kb:s,uploaded_at:`${e} ${t}`,file_type:n})}!r.includes(`[`)&&r.length>0&&a.push({file_category:``,file_name:r.trim(),file_size_kb:null,uploaded_at:``,file_type:n})}let s=t[5]?.rows??[],c=[],l=[];for(let e of s){let t=(e[0]??``).trim(),n=(e[1]??``).trim();if(t.includes(`주요 키워드`)||t.includes(`키워드`)&&!t.includes(`변환`)){let e=n.split(`,`).map(e=>e.trim()).filter(Boolean),t=0;for(let n of e){let e=n.split(/\s{2,}/)[0].trim();if(!(!e||e.length>50)&&(c.push({keyword:e,sort_order:t++}),t>=40))break}}if(t.includes(`변환`)){let e=n.split(`
`).map(e=>e.trim()).filter(Boolean);for(let t of e){let e=t.includes(`->`)?`->`:t.includes(`→`)?`→`:null;if(!e)continue;let n=t.split(e),r=n[0].trim(),i=n[1]?.trim()??``;if(!r||!i)continue;let a=r.split(`,`).map(e=>e.trim()).filter(Boolean);for(let e of a)l.push({original_keyword:e,mapped_keyword:i})}}if(t.includes(`대상 사업명`)&&n&&(r.target_project_name=n),t.includes(`대상 사업 기간`)&&n){let e=n.match(/(\d{4}\.\d{2})-?~?(\d{4}\.\d{2})/);e&&(r.target_period_start=e[1],r.target_period_end=e[2])}}let u=t[6]?.rows??[],d=[],f=[],p=0,m=0;for(let e=0;e<u.length;e++)if(u[e][0]?.includes(`단계 구분`)||u[e][0]?.includes(`▶`)){m=e+1;break}m<=1&&(m=2);for(let e=m;e<u.length;e++){let t=u[e];if(!t[0]||t.length<5)continue;let n=t[0].trim().match(/^(.+?)\s*\((\d+)일\)/);if(!n)continue;let r=n[1].trim(),i=parseInt(n[2]),a=(t[1]??``).trim().match(/(\d{4}\.\d{2}\.\d{2})/g)??[],o=K(t[3]??``)??0,s=K(t[4]??``)??0,c=K(t[5]??``)??0,l=K(t[6]??``)??0,m=K(t[7]??``)??0;d.push({phase_name:r,phase_days:i,phase_start_date:a[0]?J(a[0]):``,phase_end_date:a[1]?J(a[1]):``,phase_order:p++,total_auditor_cnt:o,pre_survey_md:s,audit_md:c,action_confirm_md:l,proposed_md:m});let h=(t[8]??``).trim().split(/,\s*\n?\s*/).map(e=>e.trim()).filter(Boolean);for(let e of h){let n=e.split(`:`);if(n.length<2)continue;let i=n[0].trim();!i||i.length>10||f.push({phase_name:r,person_name:i,member_type:t[2]?.trim()??`감리원`,pre_survey_md:parseInt(n[1]??`0`)||0,audit_md:parseInt(n[2]??`0`)||0,action_confirm_md:parseInt(n[3]??`0`)||0})}}let h=t[7]?.rows??[],g=[],_=0;for(let e=0;e<h.length;e++)if(h[e][0]?.includes(`구분`)||h[e][0]?.includes(`▶`)){_=e+1;break}_<=1&&(_=2);let v=``,y=`감리원`;for(let e=_;e<h.length;e++){let t=h[e].map(e=>(e??``).trim());if(t[0].includes(`감리팀`)||t[0].includes(`전문가`)||t[0].includes(`테스터`)){let e=t[0].match(/(감리팀|전문가|테스터)/);e&&(v=t[0],y=e[1]===`감리팀`?`감리원`:e[1])}if(t[0]===`소계`||t[1]===`소계`||t[2]===`소계`||t[0].includes(`총계`)||t[0].includes(`합계`))continue;let n=2,r=1,i=3,a=/^[가-힣]{2,5}(\s*\([A-Z]\))?$/;!a.test(t[n])&&a.test(t[1])&&(n=1,r=0,i=2);let o=t[n];if(!o||!a.test(o))continue;let s=o.replace(/\s*\([A-Z]\)/,``).trim();g.push({person_name:s,member_group:v,member_type:y,domain:t[r]??``,regular_md:K(t[i]??``)??0,additional_md:K(t[i+1]??``)??0,acceptance_md:K(t[i+2]??``)??0,is_fulltime:+!!(t[i+4]??``).includes(`상근`),auditor_grade:t[i+5]??``,auditor_cert_no:t[i+6]??``,phone:t[i+7]??``,education_hours:K(t[i+8]??``)??0})}let b=t[8]?.rows??[],x=[];for(let e of b){let t=(e[0]??``).trim(),n=(e[1]??``).trim();if(t.includes(`템플릿`)&&(r.proposal_template=n),t.includes(`첨부 목차`)){let e=n.split(/\s+(\d+)\.\s+/);for(let t=1;t<e.length-1;t+=2){let n=parseInt(e[t]),r=(e[t+1]??``).trim();r&&x.push({item_order:n,item_name:r})}}}return{project:r,keywords:c,keyword_mappings:l,phases:d,phase_assignments:f,proposal_members:g,proposal_files:a,attachments_toc:x}}var X=new W;X.post(`/`,async e=>{let t=e.env.DB,n;try{let t=(await e.req.formData()).get(`file`);if(!t)return e.json({ok:!1,error:`file 필드가 없습니다`},400);if(!t.name.toLowerCase().endsWith(`.html`))return e.json({ok:!1,error:`HTML 파일만 업로드 가능합니다`},400);n=await t.text()}catch(t){return e.json({ok:!1,error:`파일 읽기 실패: ${String(t)}`},400)}let r;try{r=we(n)}catch(t){return e.json({ok:!1,error:`파싱 실패: ${String(t)}`},422)}let{project:i,keywords:a,keyword_mappings:o,phases:s,phase_assignments:c,proposal_members:l,proposal_files:u,attachments_toc:d}=r;if(!i.project_name)return e.json({ok:!1,error:`사업명을 파싱할 수 없습니다. 제안작업표 HTML인지 확인하세요`},422);try{await t.prepare(`
      INSERT INTO audit_projects (
        project_name, bid_notice_no, client_org, registered_yearmonth,
        target_project_name, target_client_org,
        target_period_start, target_period_end,
        bid_amount, bid_amount_excl_vat, bid_rate, base_budget,
        bid_deadline, bid_open_dt, eval_dt,
        required_md, proposed_md, optimal_md,
        md_unit_price_incl, md_unit_price_excl, base_unit_price,
        proposal_allowance, proposal_allowance_rate,
        required_phases, required_audit_days,
        eval_method, proposal_status,
        writer, director, supporters, references_cc,
        special_notes, remarks, proposal_template,
        updated_at
      ) VALUES (
        ?,?,?,?, ?,?, ?,?, ?,?,?,?, ?,?,?, ?,?,?, ?,?,?, ?,?, ?,?, ?,?, ?,?,?,?, ?,?,?,
        datetime('now','localtime')
      )
      ON CONFLICT(project_name) DO UPDATE SET
        bid_notice_no        = excluded.bid_notice_no,
        client_org           = excluded.client_org,
        registered_yearmonth = excluded.registered_yearmonth,
        target_project_name  = excluded.target_project_name,
        target_client_org    = excluded.target_client_org,
        target_period_start  = excluded.target_period_start,
        target_period_end    = excluded.target_period_end,
        bid_amount           = excluded.bid_amount,
        bid_amount_excl_vat  = excluded.bid_amount_excl_vat,
        bid_rate             = excluded.bid_rate,
        base_budget          = excluded.base_budget,
        bid_deadline         = excluded.bid_deadline,
        bid_open_dt          = excluded.bid_open_dt,
        eval_dt              = excluded.eval_dt,
        required_md          = excluded.required_md,
        proposed_md          = excluded.proposed_md,
        optimal_md           = excluded.optimal_md,
        md_unit_price_incl   = excluded.md_unit_price_incl,
        md_unit_price_excl   = excluded.md_unit_price_excl,
        base_unit_price      = excluded.base_unit_price,
        proposal_allowance   = excluded.proposal_allowance,
        proposal_allowance_rate = excluded.proposal_allowance_rate,
        required_phases      = excluded.required_phases,
        required_audit_days  = excluded.required_audit_days,
        eval_method          = excluded.eval_method,
        proposal_status      = excluded.proposal_status,
        writer               = excluded.writer,
        director             = excluded.director,
        supporters           = excluded.supporters,
        references_cc        = excluded.references_cc,
        special_notes        = excluded.special_notes,
        remarks              = excluded.remarks,
        proposal_template    = excluded.proposal_template,
        updated_at           = datetime('now','localtime')
    `).bind(i.project_name,i.bid_notice_no,i.client_org,i.registered_yearmonth,i.target_project_name,i.target_client_org,i.target_period_start,i.target_period_end,i.bid_amount,i.bid_amount_excl_vat,i.bid_rate,i.base_budget,i.bid_deadline,i.bid_open_dt,i.eval_dt,i.required_md,i.proposed_md,i.optimal_md,i.md_unit_price_incl,i.md_unit_price_excl,i.base_unit_price,i.proposal_allowance,i.proposal_allowance_rate,i.required_phases,i.required_audit_days,i.eval_method,i.proposal_status,i.writer,i.director,i.supporters,i.references_cc,i.special_notes,i.remarks,i.proposal_template).run();let n=await t.prepare(`SELECT id FROM audit_projects WHERE project_name = ?`).bind(i.project_name).first();if(!n)throw Error(`project ID 조회 실패`);let r=n.id;if(await t.batch([t.prepare(`DELETE FROM keywords WHERE project_id = ?`).bind(r),t.prepare(`DELETE FROM keyword_mappings WHERE project_id = ?`).bind(r),t.prepare(`DELETE FROM audit_phases WHERE project_id = ?`).bind(r),t.prepare(`DELETE FROM proposal_members WHERE project_id = ?`).bind(r),t.prepare(`DELETE FROM proposal_files WHERE project_id = ?`).bind(r),t.prepare(`DELETE FROM proposal_attachments_toc WHERE project_id = ?`).bind(r)]),a.length>0){let e=a.map(e=>t.prepare(`INSERT INTO keywords (project_id, keyword, sort_order) VALUES (?,?,?)`).bind(r,e.keyword,e.sort_order));await t.batch(e)}for(let e of o){let n=await t.prepare(`SELECT id FROM keywords WHERE project_id = ? AND keyword = ?`).bind(r,e.original_keyword).first();await t.prepare(`
        INSERT INTO keyword_mappings (project_id, keyword_id, original_keyword, mapped_keyword)
        VALUES (?, ?, ?, ?)
      `).bind(r,n?.id??null,e.original_keyword,e.mapped_keyword).run()}let f={};for(let e of s){let n=await t.prepare(`
        INSERT INTO audit_phases
          (project_id, phase_name, phase_days, phase_start_date, phase_end_date, phase_order,
           total_auditor_cnt, pre_survey_md, audit_md, action_confirm_md, proposed_md)
        VALUES (?,?,?,?,?,?, ?,?,?,?,?)
      `).bind(r,e.phase_name,e.phase_days,e.phase_start_date,e.phase_end_date,e.phase_order,e.total_auditor_cnt,e.pre_survey_md,e.audit_md,e.action_confirm_md,e.proposed_md).run();f[e.phase_name]=n.meta.last_row_id}let p=c.filter(e=>f[e.phase_name]).map(e=>{let n=f[e.phase_name];return t.prepare(`
          INSERT INTO audit_phase_assignments
            (phase_id, project_id, person_name, member_type, pre_survey_md, audit_md, action_confirm_md)
          VALUES (?,?,?,?,?,?,?)
        `).bind(n,r,e.person_name,e.member_type,e.pre_survey_md,e.audit_md,e.action_confirm_md)});if(p.length>0&&await t.batch(p),l.length>0)for(let e=0;e<l.length;e+=30){let n=l.slice(e,e+30).map(e=>t.prepare(`
            INSERT INTO proposal_members
              (project_id, person_name, member_group, member_type, domain,
               regular_md, additional_md, acceptance_md,
               is_fulltime, auditor_grade, auditor_cert_no, phone, education_hours)
            VALUES (?,?,?,?,?, ?,?,?, ?,?,?,?,?)
          `).bind(r,e.person_name,e.member_group,e.member_type,e.domain,e.regular_md,e.additional_md,e.acceptance_md,e.is_fulltime,e.auditor_grade,e.auditor_cert_no,e.phone,e.education_hours));await t.batch(n)}if(u.length>0){let e=u.map(e=>t.prepare(`
          INSERT INTO proposal_files (project_id, file_category, file_name, file_size_kb, uploaded_at, file_type)
          VALUES (?,?,?,?,?,?)
        `).bind(r,e.file_category,e.file_name,e.file_size_kb,e.uploaded_at,e.file_type));await t.batch(e)}if(d.length>0){let e=d.map(e=>t.prepare(`
          INSERT INTO proposal_attachments_toc (project_id, item_order, item_name)
          VALUES (?,?,?)
        `).bind(r,e.item_order,e.item_name));await t.batch(e)}return e.json({ok:!0,message:`사업 "${i.project_name}" 저장 완료`,data:{project_id:r,project_name:i.project_name,keywords:a.length,keyword_mappings:o.length,phases:s.length,phase_assignments:c.length,proposal_members:l.length,proposal_files:u.length,attachments_toc:d.length}})}catch(t){return e.json({ok:!1,error:`DB 저장 실패: ${String(t)}`},500)}});var Z=new W;Z.get(`/`,e=>e.redirect(`/upload`)),Z.get(`/erd`,e=>e.html(be)),Z.get(`/upload`,e=>e.html(xe)),Z.route(`/api/upload/personnel`,q),Z.route(`/api/upload/project`,X);var Q=new W,Te=Object.assign({"/src/index.tsx":Z}),$=!1;for(let[,e]of Object.entries(Te))e&&(Q.all(`*`,t=>{let n;try{n=t.executionCtx}catch{}return e.fetch(t.req.raw,t.env,n)}),Q.notFound(t=>{let n;try{n=t.executionCtx}catch{}return e.fetch(t.req.raw,t.env,n)}),$=!0);if(!$)throw Error(`Can't import modules from ['/src/index.ts','/src/index.tsx','/app/server.ts']`);export{Q as default};