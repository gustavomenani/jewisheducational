import * as db from '../db/index.js';

/**
 * Acesso efetivo do usuário, resolvido a partir da assinatura ativa e do
 * account_type (que o admin pode definir manualmente como concessão).
 *
 * - premium: baixa sem limite e pega arquivos premium — qualquer plano pago
 *   (padrão "Pais e professores" ou "Escola").
 * - school: pega materiais exclusivos de escola — só o plano/nível "Escola".
 *
 * A hierarquia é: grátis  <  premium (standard)  <  escola.
 *
 * @param {{ id:number, role?:string, account_type?:string } | null} user
 * @returns {Promise<{ premium:boolean, school:boolean, role:string, tier:('school'|'standard'|null) }>}
 */
export async function getUserAccess(user) {
  if (!user) return { premium: false, school: false, role: 'guest', tier: null };
  if (user.role === 'admin') return { premium: true, school: true, role: 'admin', tier: 'school' };

  const tier = await db.subscriptionActiveTier(user.id); // 'school' | 'standard' | null
  const accountType = user.account_type; // 'free' | 'paid' | 'school'

  const school = tier === 'school' || accountType === 'school';
  const premium = tier !== null || accountType === 'paid' || accountType === 'school';

  return { premium, school, role: user.role || 'user', tier };
}
