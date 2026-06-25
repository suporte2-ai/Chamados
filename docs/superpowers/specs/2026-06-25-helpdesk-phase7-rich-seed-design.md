# Fase 7 — Seed Rico (Design Spec)

Data: 2026-06-25

## 1. Visão geral

Fase 7 substitui o seed básico por um seed rico que serve dois propósitos: demonstração para stakeholders e cobertura de cenários de desenvolvimento. O ambiente resultante deve parecer um sistema em uso há ~3 meses, com dados coerentes em todas as entidades.

O arquivo `backend/prisma/seed.js` é reescrito mantendo a mesma estrutura de funções e o mesmo comando de execução (`npm run seed`). Sem novas migrations, sem novos endpoints, sem testes.

## 2. Escopo

**Incluído:**
- 5 setores (TI, RH, Financeiro, Operações, Jurídico)
- 20 usuários com papéis distribuídos realisticamente
- 200 tickets com timelines, comentários e custos
- 20 ideias cobrindo todos os 6 status com managerNote
- ~30 notificações pré-geradas para usuários demo
- Seed idempotente: `clearDatabase()` apaga tudo antes de recriar

**Excluído:**
- Testes automatizados para o seed
- Fixtures de anexos reais (attachments)
- Dados de PasswordResetToken

## 3. Estrutura de usuários e setores

### Setores

| # | Nome |
|---|------|
| 1 | TI |
| 2 | RH |
| 3 | Financeiro |
| 4 | Operações |
| 5 | Jurídico |

### Usuários (20 total, senha `Senha123!`)

| Email | Nome | Role | Setor |
|-------|------|------|-------|
| admin@helpdesk.com | Ana Souza | Administrador | TI |
| gestor1@helpdesk.com | Beatriz Lima | Gestor | TI |
| gestor2@helpdesk.com | Renato Alves | Gestor | RH |
| tecnico1@helpdesk.com | Carla Mendes | Técnico | TI |
| tecnico2@helpdesk.com | Diego Santos | Técnico | TI |
| tecnico3@helpdesk.com | Fernanda Costa | Técnico | RH |
| tecnico4@helpdesk.com | Gustavo Pereira | Técnico | Financeiro |
| tecnico5@helpdesk.com | Hugo Neves | Técnico | Operações |
| tecnico6@helpdesk.com | Isabela Moura | Técnico | RH |
| tecnico7@helpdesk.com | Jonas Barbosa | Técnico | TI |
| tecnico8@helpdesk.com | Karen Lopes | Técnico | Financeiro |
| usuario1@helpdesk.com | Helena Rocha | Usuário Final | TI |
| usuario2@helpdesk.com | Igor Martins | Usuário Final | RH |
| usuario3@helpdesk.com | Julia Ferreira | Usuário Final | Financeiro |
| usuario4@helpdesk.com | Lucas Oliveira | Usuário Final | Operações |
| usuario5@helpdesk.com | Marina Castro | Usuário Final | Jurídico |
| usuario6@helpdesk.com | Nelson Gomes | Usuário Final | TI |
| usuario7@helpdesk.com | Olivia Pinto | Usuário Final | RH |
| usuario8@helpdesk.com | Paulo Ramos | Usuário Final | Financeiro |
| usuario9@helpdesk.com | Rafaela Silva | Usuário Final | Operações |

## 4. Categorias (inalteradas)

| Categoria | Subcategorias |
|-----------|---------------|
| TI | Hardware, Software, Rede |
| RH | Admissão, Benefícios |
| Financeiro | Pagamentos, Reembolsos |
| Infraestrutura | Manutenção, Predial |

## 5. Tickets

### Volume e distribuição de status

200 tickets criados nos últimos 90 dias, com datas distribuídas linearmente. Distribuição de status:

| Status | Quantidade aproximada |
|--------|----------------------|
| ABERTO | 25 |
| EM_ANDAMENTO | 20 |
| AGUARDANDO | 15 |
| RESOLVIDO | 60 |
| FECHADO | 80 |

Implementação: pool de status ponderado. O implementador deve ajustar os pesos para produzir as quantidades aproximadas da tabela. Exemplo de partida: `['ABERTO','EM_ANDAMENTO','AGUARDANDO','RESOLVIDO','RESOLVIDO','RESOLVIDO','FECHADO','FECHADO','FECHADO','FECHADO']` (10 itens; FECHADO×4 ≈ 80, RESOLVIDO×3 ≈ 60, demais ≈ 20 cada).

### Títulos (30 variados)

```js
const TICKET_TITLES = [
  // TI - Hardware
  'Computador não liga',
  'Monitor com tela piscando',
  'Teclado com teclas travadas',
  'HD com barulho estranho',
  'Notebook superaquecendo',
  // TI - Software
  'Erro ao acessar sistema financeiro',
  'VPN não conecta no home office',
  'Outlook não sincroniza e-mails',
  'Erro de licença no pacote Office',
  'Sistema lento após atualização',
  // TI - Rede
  'Internet instável no setor',
  'Sem acesso à pasta compartilhada',
  'Impressora de rede não encontrada',
  'Wi-Fi cai frequentemente na sala de reunião',
  // RH
  'Solicitação de novo crachá',
  'Dúvida sobre benefício de saúde',
  'Férias não aprovadas no sistema',
  'Erro no controle de ponto',
  'Pedido de segunda via do holerite',
  // Financeiro
  'Pedido de reembolso de viagem',
  'NF-e rejeitada pela SEFAZ',
  'Divergência no extrato bancário',
  'Erro no fechamento de caixa',
  'Dúvida sobre adiantamento salarial',
  // Infraestrutura / Operações
  'Impressora sem tonner',
  'Manutenção do ar-condicionado',
  'Lâmpada queimada na sala 204',
  'Vazamento na copa do 3º andar',
  'Solicitação de cadeira ergonômica',
  'Cafeteira com defeito na cozinha',
];
```

### Comentários

~40% dos tickets (≈80) recebem 1 a 3 comentários. Comentários são criados com `authorId` alternando entre `assignee` e `requester`. Metade dos comentários do assignee são notas internas (`isInternal: true`).

Pool de 12 corpos de comentário:
```js
const COMMENT_BODIES = [
  'Chamado recebido. Iniciando análise.',
  'Aguardando retorno do usuário para prosseguir.',
  'Problema identificado. Aplicando correção.',
  'Necessito de acesso remoto para diagnóstico.',
  'Verificado e corrigido. Por favor, confirme se o problema persiste.',
  'Escalando para o fornecedor.',
  'Peça de reposição solicitada. Prazo: 2 dias úteis.',
  'Usuário confirmou resolução.',
  'Realizei a manutenção preventiva conforme solicitado.',
  'Documento enviado por e-mail separado.',
  'Configuração atualizada. Favor testar.',
  'Aguardando aprovação da gestão para prosseguir.',
];

const INTERNAL_NOTES = [
  'Usuário já abriu chamado similar 3x este mês.',
  'Hardware fora de garantia — avaliar substituição.',
  'Problema recorrente no setor: investigar causa raiz.',
  'Custo pode ser alto — notificar gestor antes de prosseguir.',
];
```

### Custos estimados

20% dos tickets com status RESOLVIDO ou FECHADO têm `estimatedCost` preenchido, com valores entre 50 e 2000 (reais).

## 6. Ideias (20)

```js
const IDEA_DEFINITIONS = [
  // IMPLEMENTADA (2)
  { title: 'Padronizar respostas automáticas de chamados', areaImpacted: 'TI', expectedBenefit: 'Reduz tempo de primeira resposta em 30%', status: 'IMPLEMENTADA', managerNote: 'Implementado em Jan/2026. Resultados confirmados.' },
  { title: 'Checklist de onboarding para novos colaboradores', areaImpacted: 'RH', expectedBenefit: 'Reduz erros no processo de admissão', status: 'IMPLEMENTADA', managerNote: 'Processo documentado e em uso desde Fev/2026.' },

  // EM_IMPLEMENTACAO (2)
  { title: 'Aprovação digital de reembolsos', areaImpacted: 'Financeiro', expectedBenefit: 'Agiliza reembolsos em até 2 dias', status: 'EM_IMPLEMENTACAO', managerNote: 'Em desenvolvimento com equipe de TI. Previsão: Jul/2026.' },
  { title: 'App de abertura de chamados via celular', areaImpacted: 'TI', expectedBenefit: 'Facilita abertura de chamados em campo', status: 'EM_IMPLEMENTACAO', managerNote: 'MVP em testes internos. Lançamento previsto para Ago/2026.' },

  // APROVADA (3)
  { title: 'Base de conhecimento self-service', areaImpacted: 'TI', expectedBenefit: 'Reduz volume de chamados repetitivos em 20%', status: 'APROVADA', managerNote: 'Aprovado em reunião de 10/Jun. Aguardando alocação de equipe.' },
  { title: 'Pesquisa de satisfação pós-fechamento', areaImpacted: 'TI', expectedBenefit: 'Mede qualidade do atendimento', status: 'APROVADA', managerNote: 'Aprovado. Integração com e-mail planejada.' },
  { title: 'Dashboard de gastos por setor', areaImpacted: 'Financeiro', expectedBenefit: 'Melhora visibilidade orçamentária', status: 'APROVADA', managerNote: 'Aprovado pela diretoria financeira em 05/Jun.' },

  // EM_ANALISE (4)
  { title: 'Manutenção preventiva trimestral de equipamentos', areaImpacted: 'TI', expectedBenefit: 'Reduz chamados corretivos em 40%', status: 'EM_ANALISE', managerNote: null },
  { title: 'Programa de bem-estar para colaboradores', areaImpacted: 'RH', expectedBenefit: 'Reduz absenteísmo', status: 'EM_ANALISE', managerNote: null },
  { title: 'Integração do helpdesk com WhatsApp', areaImpacted: 'TI', expectedBenefit: 'Canal adicional para abertura de chamados', status: 'EM_ANALISE', managerNote: null },
  { title: 'Política de uso consciente de impressoras', areaImpacted: 'Operações', expectedBenefit: 'Reduz custo de tonner em 25%', status: 'EM_ANALISE', managerNote: null },

  // ARQUIVADA (3)
  { title: 'Revisão do plano de benefícios', areaImpacted: 'RH', expectedBenefit: 'Aumenta satisfação dos colaboradores', status: 'ARQUIVADA', managerNote: 'Arquivado por restrição orçamentária em 2026.' },
  { title: 'Compra de tablets para técnicos de campo', areaImpacted: 'TI', expectedBenefit: 'Aumenta produtividade em atendimentos externos', status: 'ARQUIVADA', managerNote: 'Custo elevado. Revisitar em 2027.' },
  { title: 'Horário flexível para equipe de TI', areaImpacted: 'RH', expectedBenefit: 'Melhora retenção de talentos', status: 'ARQUIVADA', managerNote: 'Não alinhado com política atual da empresa.' },

  // NOVA (6)
  { title: 'Treinamento mensal de segurança da informação', areaImpacted: 'TI', expectedBenefit: 'Reduz incidentes de phishing', status: 'NOVA', managerNote: null },
  { title: 'Espaço de descompressão na empresa', areaImpacted: 'RH', expectedBenefit: 'Melhora bem-estar e produtividade', status: 'NOVA', managerNote: null },
  { title: 'Automação de relatórios mensais de TI', areaImpacted: 'TI', expectedBenefit: 'Economiza 4h/mês de trabalho manual', status: 'NOVA', managerNote: null },
  { title: 'Biblioteca de livros técnicos compartilhada', areaImpacted: 'RH', expectedBenefit: 'Incentiva desenvolvimento profissional', status: 'NOVA', managerNote: null },
  { title: 'Painel de status dos sistemas em tempo real', areaImpacted: 'TI', expectedBenefit: 'Reduz chamados de "sistema fora"', status: 'NOVA', managerNote: null },
  { title: 'Revisão do processo de compras de TI', areaImpacted: 'Financeiro', expectedBenefit: 'Reduz tempo de aprovação de 10 para 3 dias', status: 'NOVA', managerNote: null },
];
```

Votos: apenas ideias com status `EM_ANALISE` recebem votos (30-60% dos usuários votam em cada uma).

## 7. Notificações

~30 notificações criadas diretamente para os 5 primeiros usuários demo (admin, gestor1, gestor2, tecnico1, tecnico2) — mix de tipos e estados:

| Tipo | % do total |
|------|-----------|
| TICKET_ASSIGNED | 30% |
| TICKET_STATUS_CHANGED | 25% |
| TICKET_COMMENT | 25% |
| IDEA_STATUS_CHANGED | 20% |

Metade `isRead: true`, metade `isRead: false`.

## 8. Arquitetura do seed

```
backend/prisma/seed.js   (reescrito — mesma interface, novas funções)
```

### Funções

```
clearDatabase()              — apaga tudo em ordem de FK
seedRolesAndPermissions()    — 4 roles + permissões (inalterado)
seedSectors()                — 5 setores (era 3)
seedCategories()             — 4 categorias (inalterado)
seedSlaConfig()              — 4 urgências (inalterado)
seedUsers(roles, sectors)    — 20 usuários (era 10)
seedTickets(...)             — 200 tickets com timeline (era 50)
seedTicketComments(tickets, users)  — NEW: comentários em ~40% dos tickets
seedIdeas(users)             — 20 ideias com managerNote (era 9)
seedNotifications(users, tickets, ideas)  — NEW: ~30 notificações
main()                       — orquestra na ordem correta
```

### Comando de execução

```
cd backend && npm run seed
```

Tempo estimado de execução: 30-60 segundos (200 tickets × timeline individual).

## 9. Ordem de implementação

1. Reescrever `seed.js` completo
2. Rodar `npm run seed` e verificar saída no console
3. Verificar manualmente: `GET /api/tickets`, `GET /api/ideas`, `GET /api/notifications`
4. Commit
