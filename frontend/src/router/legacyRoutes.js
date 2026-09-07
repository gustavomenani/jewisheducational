const staticPaths = new Map([
  ['/biblioteca', '/library'],
  ['/cadastro', '/sign-up'],
  ['/recuperar-senha', '/forgot-password'],
  ['/minha-conta', '/my-account'],
  ['/perfil', '/profile'],
  ['/minha-lista', '/my-list'],
  ['/admin/usuarios', '/admin/users'],
  ['/admin/aparencia', '/admin/appearance'],
  ['/admin/pagamentos', '/admin/payments'],
  ['/admin/planos', '/admin/plans'],
  ['/admin/integracoes', '/admin/integrations'],
  ['/admin/configuracoes', '/admin/settings'],
  ['/admin/categorys', '/admin/categories'],
]);

const dynamicPaths = [
  [/^\/biblioteca\/category\/([^/]+)$/, '/library/category/$1'],
  [/^\/material\/([^/]+)$/, '/resource/$1'],
  [/^\/material\/([^/]+)\/baixar\/([^/]+)$/, '/resource/$1/download/$2'],
  [/^\/material\/([^/]+)\/apresentar\/([^/]+)$/, '/resource/$1/present/$2'],
  [/^\/recuperar-senha\/([^/]+)$/, '/reset-password/$1'],
  [/^\/admin\/materials\/novo$/, '/admin/materials/new'],
  [/^\/admin\/categorys\/novo$/, '/admin/categories/new'],
  [/^\/admin\/categorys\/([^/]+)$/, '/admin/categories/$1'],
];

export function legacyPathRedirect(pathname) {
  if (staticPaths.has(pathname)) return staticPaths.get(pathname);

  for (const [pattern, target] of dynamicPaths) {
    if (pattern.test(pathname)) return pathname.replace(pattern, target);
  }

  return null;
}
