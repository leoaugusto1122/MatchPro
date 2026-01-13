# Modelo de Dados Firestore - MatchPro

## Visão Geral
O banco de dados utiliza o Firestore (NoSQL). A estrutura é hierárquica baseada em **Times**.
Usuários podem pertencer a múltiplos times, mas operam em um contexto de time por vez.

---

## Collections & Documents

### 1. `users` (Global)
Armazena dados de autenticação e preferências globais do usuário.
*   **Doc ID**: `auth.uid`
*   **Campos**:
    *   `email`: string
    *   `displayName`: string
    *   `photoURL`: string
    *   `createdAt`: timestamp
    *   `lastActiveTeamId`: string (ID do último time acessado para UX)

### 2. `teams` (Root)
Representa um time de futebol.
*   **Doc ID**: Auto-generated
*   **Campos**:
    *   `name`: string
    *   `code`: string (Unique, 6 chars uppercase) - Usado para convites
    *   `ownerId`: string (Reference to `users.id`)
    *   `createdAt`: timestamp
    *   `badgeURL`: string (optional)
    *   `members`: map (Critico para Security Rules)
        *   `Key`: userId
        *   `Value`: role ('owner' | 'coach' | 'staff' | 'player')

### 3. `teams/{teamId}/players` (Subcollection)
Representa o perfil esportivo de uma pessoa no time.
*   **Estratégia "Jogadores Sem Login" (Ghost Players)**:
    *   Se `userId` estiver presente, é um usuário real conectado.
    *   Se `userId` for nulo, é um jogador "fantasma" criado pelo técnico (ex: convidado, ou alguém sem smartphone).
*   **Campos**:
    *   `name`: string
    *   `userId`: string (Nullable)
    *   `email`: string (Optional, contato)
    *   `position`: Enum ('GK', 'DEF', 'MID', 'FWD')
    *   `status`: Enum ('active', 'reserve', 'injured')
    *   `stats`: Map
        *   `goals`: number
        *   `assists`: number
        *   `matchesPlayed`: number
    *   `createdAt`: timestamp

### 4. `teams/{teamId}/matches` (Subcollection)
Partidas agendadas ou finalizadas.
*   **Campos**:
    *   `date`: timestamp
    *   `opponent`: string
    *   `location`: string
    *   `status`: Enum ('scheduled', 'ongoing', 'finished', 'canceled')
    *   `scoreHome`: number
    *   `scoreAway`: number
    *   `presence`: Map (Denormalized logic)
        *   `Key`: playerId (Document ID da collection `players`, NÃO o `userId`)
        *   `Value`: Object
            *   `status`: 'confirmed' | 'maybe' | 'out'
            *   `updatedAt`: timestamp
            *   `playerName`: string (Snapshotted for UI performance)

### 5. `teams/{teamId}/matches/{matchId}/votes` (Subcollection)
Votos individuais dos jogadores na partida.
*   **Doc ID**: `userId` (Garante um voto por usuário)
*   **Campos**:
    *   `playerId`: string (ID do perfil de jogador que votou)
    *   `ratings`: Map (playerId -> nota 1-10)
    *   `motmVote`: string (playerId do melhor em campo)
    *   `createdAt`: timestamp

### 6. `teams/{teamId}/financial` (Subcollection - Future)
Lançamentos de caixa.

---

## Relacionamentos e Integridade

1.  **User -> Team**:
    *   Um User é membro de um Team se seu ID estiver no mapa `members` do documento `teams/{teamId}`.
    *   Um User tem um perfil correspondente em `teams/{teamId}/players` onde `userId == auth.uid`.

2.  **Match Presence**:
    *   A presença é vinculada ao ID do documento `players` (perfil no time), não diretamente ao UID do Auth. Isso permite marcar presença para jogadores "fantasmas".

---

## Security Rules (Conceitos)

*   **Leitura de Time**: Permitida se `resource.data.members[request.auth.uid] != null`.
*   **Escrita em Time**: Apenas `role` 'owner' no mapa `members`.
*   **Leitura de Players/Matches**: Permitida se usuário é membro do time pai.
*   **Escrita em Matches**: 'owner' ou 'coach'.
*   **Escrita em Players**:
    *   Criar/Editar outros: 'owner' ou 'coach'.
    *   Editar o próprio perfil: O dono do perfil (`userId == auth.uid`).
