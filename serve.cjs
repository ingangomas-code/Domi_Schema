const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, 'dist');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
http.createServer((req,res)=>{
  const host=(req.headers.host||'').split(':')[0];
  if(!['127.0.0.1','localhost'].includes(host)){res.writeHead(403).end();return;}
  if(req.headers.origin&&!['http://127.0.0.1:'+ (process.env.PORT||4173),'http://localhost:'+(process.env.PORT||4173)].includes(req.headers.origin)){res.writeHead(403).end();return;}
  if(req.url.split('?')[0]==='/api/ai'){req.domiLocal=true;require('./api/ai.js')(req,res);return;}
  let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
  const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end('Not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);});
}).listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+(process.env.PORT||4173)));
