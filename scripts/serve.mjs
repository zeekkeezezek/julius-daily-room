import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const prefix='/daily-room/',port=43127,url=`http://localhost:${port}${prefix}`;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.txt':'text/plain; charset=utf-8'};
const server=http.createServer((req,res)=>{
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,url).pathname);}catch{res.writeHead(400);res.end();return;}
  if(pathname==='/' || pathname==='/daily-room'){res.writeHead(302,{Location:prefix});res.end();return;}
  if(!pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
  const file=path.resolve(root,pathname.slice(prefix.length)||'index.html');
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);});
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'DAILY ROOMの試用画面が既に開いているか、同じ接続先が使われている。開いている試用画面を閉じてから再実行してくれ。':error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{
  console.log(`DAILY ROOM: ${url}\nこの画面を閉じるとPC起動用サーバーを終了する。`);
  if(process.argv.includes('--open') && process.platform==='win32')spawn('cmd.exe',['/c','start','',url],{windowsHide:true,stdio:'ignore'});
});
