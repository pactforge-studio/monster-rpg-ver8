"""Verify published runtime/code and adopted motion bytes against pinned prepared source."""
import concurrent.futures, hashlib, json, os, pathlib, time, urllib.request
root=pathlib.Path('game'); base=os.environ['GAME_TEST_URL'].rstrip('/')+'/'
sha=pathlib.Path('deployment/source-ref.txt').read_text().strip()
manifest=json.loads((root/'docs/motion-compression-20261011/manifest.json').read_text())
paths=['index.html','url-transfer.html']+[str(p.relative_to(root)) for folder in ['js','css'] for p in sorted((root/folder).glob('*')) if p.is_file()]+[e['src'] for e in manifest['entries']]
def check(path):
 expected=hashlib.sha256((root/path).read_bytes()).hexdigest()
 req=urllib.request.Request(base+path+'?motion_release='+sha,headers={'Cache-Control':'no-cache','User-Agent':'MonsterRPG-release-verification'})
 try:
  with urllib.request.urlopen(req,timeout=60) as r:data=r.read();status=r.status
  actual=hashlib.sha256(data).hexdigest()
  return {'path':path,'status':status,'bytes':len(data),'expected':expected,'actual':actual,'match':actual==expected}
 except Exception as e:return {'path':path,'match':False,'error':str(e)}
deadline=time.monotonic()+240;attempts=0
while True:
 attempts+=1
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:rows=list(pool.map(check,paths))
 if all(r['match'] for r in rows) or time.monotonic()>deadline:break
 time.sleep(15)
out=pathlib.Path('game/artifacts/three-motion-compression');out.mkdir(parents=True,exist_ok=True)
report={'source':sha,'url':base,'attempts':attempts,'files':len(rows),'allMatch':all(r['match'] for r in rows),'results':rows}
(out/'public-hashes.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:report[k] for k in ['source','files','attempts','allMatch']}));assert report['allMatch'],[r for r in rows if not r['match']]
