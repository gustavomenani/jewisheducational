#!/usr/bin/env bash
echo "=== FIREBASE ==="
echo -n "Resources: "
curl --fail-with-body --silent --show-error "https://jewish-educational-resources.web.app/api/resources?limit=100" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.pagination?.total||0,'materiais');j.resources?.forEach(r=>console.log(' -',r.slug,'|',r.file_count,'arquivos'));})"
echo
echo -n "Health: "
curl --fail-with-body --silent --show-error "https://jewish-educational-resources.web.app/api/health"
echo
echo
echo "Firebase-only verification complete. Legacy VPS comparison is disabled."
