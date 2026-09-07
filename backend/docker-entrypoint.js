import { spawn } from 'child_process';

function run(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: true });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exit ${code}`))));
  });
}

async function main() {
  console.log('>> Aguardando MySQL...');
  await run('node', ['scripts/wait-for-db.js']);

  console.log('>> Configurando banco de dados...');
  await run('node', ['database/setup.js']);

  console.log('>> Iniciando backend...');
  const isProd = process.env.NODE_ENV === 'production';
  const args = isProd ? ['server.js'] : ['--watch', 'server.js'];
  const child = spawn('node', args, { stdio: 'inherit' });
  child.on('close', (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
